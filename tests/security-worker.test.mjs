import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import internalWorker, { MAX_JSON_BYTES, readSmallJson } from "../apps/ops-app/src/index.js";
import { AccessError, verifyAccessJwt } from "../apps/ops-app/src/access.js";
import { createAuditEvent, sanitizeAuditDetail } from "../apps/ops-app/src/audit.js";
import { decryptPersonalField, encryptPersonalField } from "../apps/ops-app/src/crypto.js";
import { hasPermission, requirePermission } from "../apps/ops-app/src/rbac.js";
import { selectDestructionCandidates } from "../apps/ops-app/src/retention.js";
import { verifyTurnstileSubmission } from "../packages/validation/turnstile.js";

function toBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  return Buffer.from(bytes).toString("base64url");
}

async function makeAccessFixture(overrides = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  Object.assign(jwk, { kid: "mock-key", alg: "RS256", use: "sig" });
  const now = 1_784_179_200;
  const header = toBase64Url(JSON.stringify({ alg: "RS256", kid: "mock-key", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({
    iss: "https://mock.cloudflareaccess.com",
    aud: ["mock-audience"],
    sub: "mock-access-owner-subject",
    iat: now - 60,
    nbf: now - 60,
    exp: now + 300,
    ...overrides
  }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return { token: `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`, jwk, now };
}

function expectRequestError(status, code) {
  return (error) => error?.status === status && error?.code === code;
}

function jsonBodyAtByteLength(byteLength) {
  const prefix = '{"value":"';
  const suffix = '"}';
  return `${prefix}${"x".repeat(byteLength - prefix.length - suffix.length)}${suffix}`;
}

test("작은 JSON 요청은 읽고 잘못된 JSON은 400으로 거부한다", async () => {
  const valid = new Request("https://ops.example.test/api/mock", {
    method: "POST",
    body: JSON.stringify({ ok: true })
  });
  assert.deepEqual(await readSmallJson(valid), { ok: true });

  const invalid = new Request("https://ops.example.test/api/mock", { method: "POST", body: "{" });
  await assert.rejects(readSmallJson(invalid), expectRequestError(400, "INVALID_JSON"));

  const malformedUtf8 = new Request("https://ops.example.test/api/mock", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(Uint8Array.from([
          ...new TextEncoder().encode('{"value":"'),
          0x80,
          ...new TextEncoder().encode('"}')
        ]));
        controller.close();
      }
    }),
    duplex: "half"
  });
  await assert.rejects(readSmallJson(malformedUtf8), expectRequestError(400, "INVALID_JSON"));
});

test("JSON body는 실제 UTF-8 바이트 기준 16KiB 경계를 지킨다", async () => {
  const exactBody = jsonBodyAtByteLength(MAX_JSON_BYTES);
  assert.equal(new TextEncoder().encode(exactBody).byteLength, MAX_JSON_BYTES);
  const exact = new Request("https://ops.example.test/api/mock", { method: "POST", body: exactBody });
  assert.equal(exact.headers.has("content-length"), false);
  assert.equal((await readSmallJson(exact)).value.length, MAX_JSON_BYTES - 12);

  const over = new Request("https://ops.example.test/api/mock", {
    method: "POST",
    body: jsonBodyAtByteLength(MAX_JSON_BYTES + 1)
  });
  await assert.rejects(readSmallJson(over), expectRequestError(413, "REQUEST_TOO_LARGE"));

  const multibyte = new Request("https://ops.example.test/api/mock", {
    method: "POST",
    body: JSON.stringify({ value: "가".repeat(6_000) })
  });
  await assert.rejects(readSmallJson(multibyte), expectRequestError(413, "REQUEST_TOO_LARGE"));
});

test("Content-Length가 없거나 실제 길이를 작게 속여도 JSON 제한을 우회하지 못한다", async () => {
  const declaredLarge = new Request("https://ops.example.test/api/mock", {
    method: "POST",
    headers: { "content-length": String(MAX_JSON_BYTES + 1) },
    body: "{}"
  });
  await assert.rejects(readSmallJson(declaredLarge), expectRequestError(413, "REQUEST_TOO_LARGE"));

  const underreported = new Request("https://ops.example.test/api/mock", {
    method: "POST",
    headers: { "content-length": "2" },
    body: jsonBodyAtByteLength(MAX_JSON_BYTES + 1)
  });
  await assert.rejects(readSmallJson(underreported), expectRequestError(413, "REQUEST_TOO_LARGE"));

  for (const invalidLength of ["abc", "-1", "1.5", "1, 1"]) {
    const request = new Request("https://ops.example.test/api/mock", {
      method: "POST",
      headers: { "content-length": invalidLength },
      body: "{}"
    });
    await assert.rejects(readSmallJson(request), expectRequestError(400, "INVALID_CONTENT_LENGTH"));
  }
});

test("여러 stream chunk 중 제한을 넘으면 reader를 취소한다", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"'));
      controller.enqueue(new Uint8Array(MAX_JSON_BYTES).fill(120));
    },
    cancel() {
      cancelled = true;
    }
  });
  const request = new Request("https://ops.example.test/api/mock", {
    method: "POST",
    body: stream,
    duplex: "half"
  });

  await assert.rejects(readSmallJson(request), expectRequestError(413, "REQUEST_TOO_LARGE"));
  assert.equal(cancelled, true);
});

test("Access JWT 서명·발급자·대상·만료를 검증한다", async () => {
  const fixture = await makeAccessFixture();
  const claims = await verifyAccessJwt(
    fixture.token,
    { ACCESS_TEAM_DOMAIN: "mock.cloudflareaccess.com", ACCESS_AUD: "mock-audience" },
    { nowSeconds: fixture.now, fetcher: async () => Response.json({ keys: [fixture.jwk] }) }
  );
  assert.equal(claims.sub, "mock-access-owner-subject");

  await assert.rejects(
    verifyAccessJwt(
      fixture.token,
      { ACCESS_TEAM_DOMAIN: "mock.cloudflareaccess.com", ACCESS_AUD: "wrong-audience" },
      { nowSeconds: fixture.now, fetcher: async () => Response.json({ keys: [fixture.jwk] }) }
    ),
    (error) => error instanceof AccessError && error.code === "ACCESS_AUDIENCE_MISMATCH"
  );
});

test("Access 또는 D1 설정이 없으면 내부 Worker가 닫힌 상태로 실패한다", async () => {
  const noDatabase = await internalWorker.fetch(new Request("https://ops.example.test/api/session"), {});
  assert.equal(noDatabase.status, 503);
  assert.equal(noDatabase.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal((await noDatabase.json()).code, "DATABASE_NOT_CONFIGURED");

  const fakeDb = { prepare() { throw new Error("Access 검증 전에 DB 쿼리를 실행하면 안 됩니다."); } };
  const missingAccess = await internalWorker.fetch(
    new Request("https://ops.example.test/api/session", { headers: { "Cf-Access-Jwt-Assertion": "mock.invalid.token" } }),
    { DB: fakeDb }
  );
  assert.equal(missingAccess.status, 503);
  assert.equal((await missingAccess.json()).code, "ACCESS_NOT_CONFIGURED");
});

test("대표자·종사자·시스템관리자 권한이 분리된다", () => {
  assert.equal(hasPermission("owner", "records:export"), true);
  assert.equal(hasPermission("staff", "records:export"), false);
  assert.equal(hasPermission("system_admin", "records:read"), false);
  assert.equal(hasPermission("system_admin", "audit:read"), true);
  assert.throws(() => requirePermission({ active: true, role: "staff" }, "retention:destroy"), /권한/);
  assert.throws(() => requirePermission({ active: false, role: "owner" }, "dashboard:read"), /중지/);
});

test("개인정보 필드는 AES-GCM으로 암복호화하고 문맥이 다르면 열리지 않는다", async () => {
  const key = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString("base64url");
  const env = { PII_ENCRYPTION_KEY: key, PII_KEY_CURRENT_ID: "mock-key-2026-01" };
  const encrypted = await encryptPersonalField("010-0000-0001", "workers:MOCK-WORKER-A:phone", env);
  assert.doesNotMatch(encrypted, /010-0000-0001/);
  assert.equal(await decryptPersonalField(encrypted, "workers:MOCK-WORKER-A:phone", env), "010-0000-0001");
  await assert.rejects(decryptPersonalField(encrypted, "workers:MOCK-WORKER-B:phone", env));
});

test("감사로그는 허용 정보만 남기고 앞 이벤트와 서명 연결한다", async () => {
  const key = Buffer.alloc(32, 7).toString("base64url");
  const detail = sanitizeAuditDetail({ requestId: "REQ-1", route: "/api/mock/workers", phone: "010-0000-0001", name: "가상 근로자" });
  assert.deepEqual(detail, { requestId: "REQ-1", route: "/api/mock/workers" });
  const event = await createAuditEvent({
    id: "AUD-MOCK-1",
    actorId: "MOCK-PRINCIPAL-OWNER",
    action: "worker.read",
    targetType: "worker",
    targetId: "MOCK-WORKER-A",
    detail,
    occurredAt: "2026-07-16T00:00:00.000Z"
  }, "GENESIS", { AUDIT_HMAC_KEY: key, AUDIT_KEY_ID: "mock-audit-key-1" });
  assert.equal(event.previousHash, "GENESIS");
  assert.ok(event.eventHash.length >= 40);
  assert.doesNotMatch(JSON.stringify(event), /010-0000/);
});

test("만료됐어도 법적 보류 자료는 파기 후보에서 제외한다", () => {
  const records = [
    { id: "expired", status: "active", legalHold: false, expiresAt: "2026-07-01T00:00:00Z" },
    { id: "held", status: "active", legalHold: true, expiresAt: "2026-07-01T00:00:00Z" },
    { id: "future", status: "active", legalHold: false, expiresAt: "2027-07-01T00:00:00Z" },
    { id: "done", status: "destroyed", legalHold: false, expiresAt: "2026-07-01T00:00:00Z" }
  ];
  assert.deepEqual(selectDestructionCandidates(records, new Date("2026-07-16T00:00:00Z")).map((item) => item.id), ["expired"]);
});

test("Turnstile은 기본 비활성이며 활성화 시 hostname과 action을 검사한다", async () => {
  const disabled = await verifyTurnstileSubmission({ token: "unused", expectedAction: "worker-intake" }, { INTAKE_ENABLED: "false" });
  assert.equal(disabled.code, "INTAKE_DISABLED");

  const env = {
    INTAKE_ENABLED: "true",
    TURNSTILE_SECRET_KEY: "mock-secret-not-production",
    TURNSTILE_EXPECTED_HOSTNAME: "harmony-work.pages.dev"
  };
  const accepted = await verifyTurnstileSubmission(
    { token: "mock-token", expectedAction: "worker-intake", idempotencyKey: "MOCK-IDEMPOTENCY-1" },
    env,
    { fetcher: async () => Response.json({ success: true, hostname: "harmony-work.pages.dev", action: "worker-intake" }) }
  );
  assert.equal(accepted.ok, true);

  const rejected = await verifyTurnstileSubmission(
    { token: "mock-token", expectedAction: "restaurant-intake" },
    env,
    { fetcher: async () => Response.json({ success: true, hostname: "evil.example", action: "restaurant-intake" }) }
  );
  assert.equal(rejected.code, "TURNSTILE_HOSTNAME_MISMATCH");
});

test("D1 마이그레이션은 보안·감사·보존·장부 테이블과 변경 차단을 포함한다", async () => {
  const migration = await readFile(new URL("../apps/ops-app/migrations/0001_security_foundation.sql", import.meta.url), "utf8");
  for (const table of ["app_principals", "restaurants", "workers", "job_requests", "placements", "consents", "fee_transactions", "audit_events", "retention_items", "destruction_evidence", "intake_submissions"]) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(migration, /audit_events_no_update/);
  assert.match(migration, /audit_events_no_delete/);
  assert.match(migration, /RAISE\(ABORT/);
  const operationsMigration = await readFile(new URL("../apps/ops-app/migrations/0003_operations_core.sql", import.meta.url), "utf8");
  for (const table of ["placement_status_history", "ledger_entries", "compliance_events"]) {
    assert.match(operationsMigration, new RegExp(`CREATE TABLE ${table}\\b`));
  }
  assert.match(operationsMigration, /placement_status_history_no_update/);
  assert.match(operationsMigration, /placement_status_history_no_delete/);
});
