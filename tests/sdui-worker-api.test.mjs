import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACTION_REGISTRY,
  SduiActionInputError,
  validateActionInput
} from "../packages/sdui-actions/index.js";
import { validateSduiDocument } from "../packages/sdui-contracts/index.js";
import { routeRequest } from "../apps/ops-app/src/index.js";
import { AuthorizationError } from "../apps/ops-app/src/rbac.js";
import { SduiApiError, pruneSduiDocument } from "../apps/ops-app/src/sdui.js";

const auditKey = Buffer.alloc(32, 9).toString("base64url");

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
}

function principal(role = "owner", overrides = {}) {
  return { id: `MOCK-${role.toUpperCase()}`, role, active: true, ...overrides };
}

function makeAuditDb() {
  const calls = [];
  const events = [];
  return {
    calls,
    events,
    prepare(sql) {
      const statement = {
        params: [],
        bind(...params) {
          statement.params = params;
          return statement;
        },
        async first() {
          calls.push({ method: "first", sql, params: statement.params });
          if (sql.includes("SELECT event_hash AS eventHash")) {
            const latest = events.at(-1);
            return latest ? { eventHash: latest.eventHash } : null;
          }
          throw new Error(`Unexpected first SQL: ${sql}`);
        },
        async run() {
          calls.push({ method: "run", sql, params: statement.params });
          if (!sql.includes("INSERT INTO audit_events")) throw new Error(`Unexpected run SQL: ${sql}`);
          events.push({
            action: statement.params[2],
            targetType: statement.params[3],
            targetId: statement.params[4],
            detail: JSON.parse(statement.params[5]),
            eventHash: statement.params[8]
          });
          return { success: true };
        }
      };
      return statement;
    }
  };
}

function makeEnv(overrides = {}) {
  return {
    DB: makeAuditDb(),
    DATA_MODE: "mock",
    SDUI_ENABLED: "true",
    SDUI_REVISION: "1",
    AUDIT_HMAC_KEY: auditKey,
    AUDIT_KEY_ID: "mock-audit-key-1",
    ...overrides
  };
}

function expectApiError(status, code) {
  return (error) => error instanceof SduiApiError && error.status === status && error.code === code;
}

function expectAuthorization(code) {
  return (error) => error instanceof AuthorizationError && error.code === code;
}

function postAction(actionId, body, headers = {}) {
  return new Request(`https://ops.example.test/api/ui/actions/${actionId}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

test("resource.refresh registry metadata and input contract are immutable and strict", () => {
  const definition = ACTION_REGISTRY["resource.refresh"];
  assert.equal(definition.requiredPermission, "dashboard:read");
  assert.deepEqual(definition.roles, ["owner", "staff"]);
  assert.equal(Object.isFrozen(definition), true);
  assert.equal(Object.isFrozen(definition.roles), true);
  assert.equal(Object.isFrozen(definition.input), true);
  assert.equal(Object.isFrozen(definition.input.required), true);

  const valid = validateActionInput("resource.refresh", {
    pageId: "dashboard",
    resourceId: "dashboard.summary",
    revision: 1
  });
  assert.deepEqual(valid, { pageId: "dashboard", resourceId: "dashboard.summary", revision: 1 });
  assert.equal(Object.isFrozen(valid), true);

  const invalidInputs = [
    null,
    [],
    new Date(),
    { pageId: "dashboard", resourceId: "dashboard.summary" },
    { pageId: "dashboard", resourceId: "dashboard.summary", revision: "1" },
    { pageId: "dashboard", resourceId: "dashboard.summary", revision: 0 },
    { pageId: "dashboard", resourceId: "dashboard.summary", revision: 1.5 },
    { pageId: "Dashboard", resourceId: "dashboard.summary", revision: 1 },
    { pageId: "dashboard", resourceId: "dashboard.summary", revision: 1, role: "owner" },
    { pageId: "dashboard", resourceId: "dashboard.summary", revision: 1, method: "GET" }
  ];
  for (const input of invalidInputs) {
    assert.throws(
      () => validateActionInput("resource.refresh", input),
      (error) => error instanceof SduiActionInputError
    );
  }
  assert.throws(
    () => validateActionInput("unknown.action", {}),
    (error) => error instanceof SduiActionInputError && error.code === "ACTION_NOT_REGISTERED"
  );
});

test("server pruning removes disallowed nodes and uncontracted server actions", async () => {
  const document = await readJson("../sdui/harmony-ops/pages/dashboard.mock.document.json");
  document.requiredCapabilities.push("Button@1");
  document.root.children.push(
    {
      id: "dashboard.owner-only",
      type: "Text",
      props: { messageKey: "dashboard.description" },
      roles: ["owner"]
    },
    {
      id: "dashboard.staff-only",
      type: "Text",
      props: { messageKey: "dashboard.description" },
      roles: ["staff"]
    },
    {
      id: "dashboard.staff-operation",
      type: "Button",
      props: { labelKey: "dashboard.title" },
      roles: ["staff"],
      actions: { press: { actionId: "intake.save-draft", idempotency: "required" } }
    }
  );
  validateSduiDocument(document);

  const owner = pruneSduiDocument(document, "owner");
  const staff = pruneSduiDocument(document, "staff");
  assert.equal(validateSduiDocument(owner).valid, true);
  assert.equal(validateSduiDocument(staff).valid, true);
  assert.equal(owner.root.roles[0], "owner");
  assert.equal(staff.root.roles[0], "staff");
  assert.equal(owner.root.children.some((node) => node.id === "dashboard.staff-only"), false);
  assert.equal(staff.root.children.some((node) => node.id === "dashboard.owner-only"), false);
  const staffOperation = staff.root.children.find((node) => node.id === "dashboard.staff-operation");
  assert.equal(staffOperation.actions, undefined);
  assert.equal(pruneSduiDocument(document, "system_admin"), null);
});

test("owner and staff receive role-pruned page responses with private headers", async () => {
  const ownerEnv = makeEnv();
  const staffEnv = makeEnv();
  const ownerResponse = await routeRequest(
    new Request("https://ops.example.test/api/ui/pages/dashboard?surface=web&locale=ko"),
    ownerEnv,
    principal("owner"),
    "REQ-PAGE-OWNER"
  );
  const staffResponse = await routeRequest(
    new Request("https://ops.example.test/api/ui/pages/dashboard"),
    staffEnv,
    principal("staff"),
    "REQ-PAGE-STAFF"
  );
  assert.equal(ownerResponse.status, 200);
  assert.equal(staffResponse.status, 200);
  assert.equal(ownerResponse.headers.get("cache-control"), "no-store");
  assert.equal(ownerResponse.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(ownerResponse.headers.get("x-sdui-revision"), "1");
  assert.equal(ownerResponse.headers.get("vary"), "Cf-Access-Jwt-Assertion");
  assert.notEqual(ownerResponse.headers.get("etag"), staffResponse.headers.get("etag"));

  const ownerBody = await ownerResponse.json();
  const staffBody = await staffResponse.json();
  assert.equal(ownerBody.schema, "harmony.sdui.page-response.v1");
  assert.equal(ownerBody.document.root.roles[0], "owner");
  assert.equal(staffBody.document.root.roles[0], "staff");
  assert.equal(validateSduiDocument(ownerBody.document).valid, true);
  assert.equal(validateSduiDocument(staffBody.document).valid, true);
  assert.deepEqual(ownerEnv.DB.events[0].detail, {
    requestId: "REQ-PAGE-OWNER",
    route: "/api/ui/pages/:pageId",
    resultCode: "ok"
  });
  assert.doesNotMatch(JSON.stringify(ownerEnv.DB.events[0].detail), /document|payload|roles/);
});

test("compliance page and calendar resource are available to owner and staff in mock mode", async () => {
  const env = makeEnv();
  const pageResponse = await routeRequest(
    new Request("https://ops.example.test/api/ui/pages/compliance?surface=web&locale=ko"),
    env,
    principal("staff"),
    "REQ-COMPLIANCE-PAGE"
  );
  assert.equal(pageResponse.status, 200);
  const pageBody = await pageResponse.json();
  assert.equal(pageBody.pageId, "compliance");
  assert.equal(pageBody.document.documentId, "ops.compliance");

  const dataResponse = await routeRequest(
    new Request("https://ops.example.test/api/ui/data/compliance.calendar"),
    env,
    principal("staff"),
    "REQ-COMPLIANCE-DATA"
  );
  assert.equal(dataResponse.status, 200);
  assert.equal(dataResponse.headers.get("cache-control"), "no-store");
  const dataBody = await dataResponse.json();
  assert.equal(dataBody.resourceId, "compliance.calendar");
  assert.equal(dataBody.mock, true);
  assert.deepEqual(dataBody.data, {
    overdueCount: 0,
    dueWithin30Days: 2,
    evidenceMissing: 1,
    nextDueDate: "2026-08-14"
  });
});

test("page authorization happens before ETag and blocks disabled or disallowed principals", async () => {
  const ownerEnv = makeEnv();
  const ownerResponse = await routeRequest(
    new Request("https://ops.example.test/api/ui/pages/dashboard"),
    ownerEnv,
    principal("owner"),
    "REQ-ETAG-OWNER"
  );
  const stolenEtag = ownerResponse.headers.get("etag");

  const adminEnv = makeEnv();
  await assert.rejects(
    routeRequest(
      new Request("https://ops.example.test/api/ui/pages/dashboard", { headers: { "If-None-Match": stolenEtag } }),
      adminEnv,
      principal("system_admin"),
      "REQ-STOLEN-ETAG"
    ),
    expectApiError(403, "SDUI_ROLE_FORBIDDEN")
  );
  assert.equal(adminEnv.DB.calls.length, 0);

  await assert.rejects(
    routeRequest(
      new Request("https://ops.example.test/api/ui/pages/dashboard"),
      makeEnv(),
      principal("owner", { active: false }),
      "REQ-DISABLED"
    ),
    expectAuthorization("ACCOUNT_DISABLED")
  );
});

test("page ETag is stable and only an exact current tag returns 304", async () => {
  const env = makeEnv();
  const first = await routeRequest(
    new Request("https://ops.example.test/api/ui/pages/dashboard"), env, principal(), "REQ-ETAG-1"
  );
  const etag = first.headers.get("etag");
  assert.match(etag, /^"sdui-page-dashboard-r1-owner-[0-9a-f]{24}"$/);
  assert.equal(env.DB.events.length, 1);

  const notModified = await routeRequest(
    new Request("https://ops.example.test/api/ui/pages/dashboard", { headers: { "If-None-Match": etag } }),
    env,
    principal(),
    "REQ-ETAG-2"
  );
  assert.equal(notModified.status, 304);
  assert.equal(await notModified.text(), "");
  assert.equal(notModified.headers.get("etag"), etag);
  assert.equal(notModified.headers.get("cache-control"), "no-store");
  assert.equal(env.DB.events.length, 1);

  const stale = await routeRequest(
    new Request("https://ops.example.test/api/ui/pages/dashboard", { headers: { "If-None-Match": `W/${etag}` } }),
    env,
    principal(),
    "REQ-ETAG-3"
  );
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get("etag"), etag);
  assert.equal(env.DB.events.length, 2);
});

test("page feature flags, revision and query values fail closed", async () => {
  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/pages/dashboard"), makeEnv({ SDUI_ENABLED: "false" }), principal(), "REQ-FLAG"),
    expectApiError(503, "SDUI_DISABLED")
  );
  for (const revision of [undefined, "2", "latest"]) {
    const env = makeEnv();
    if (revision === undefined) delete env.SDUI_REVISION;
    else env.SDUI_REVISION = revision;
    await assert.rejects(
      routeRequest(new Request("https://ops.example.test/api/ui/pages/dashboard"), env, principal(), "REQ-REVISION"),
      expectApiError(503, "SDUI_REVISION_MISMATCH")
    );
  }
  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/pages/dashboard"), makeEnv({ DATA_MODE: "production" }), principal(), "REQ-MODE"),
    expectApiError(503, "SDUI_MOCK_MODE_REQUIRED")
  );
  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/pages/dashboard?role=owner"), makeEnv(), principal("staff"), "REQ-ROLE-TAMPER"),
    expectApiError(400, "SDUI_QUERY_INVALID")
  );
  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/pages/dashboard?surface=mobile"), makeEnv(), principal(), "REQ-MOBILE"),
    expectApiError(400, "SDUI_SURFACE_UNSUPPORTED")
  );
  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/pages/unknown"), makeEnv(), principal(), "REQ-UNKNOWN-PAGE"),
    expectApiError(404, "SDUI_PAGE_NOT_FOUND")
  );
});

test("summary resource enforces roles, rejects query tampering and supports ETag", async () => {
  const env = makeEnv();
  const response = await routeRequest(
    new Request("https://ops.example.test/api/ui/data/dashboard.summary"),
    env,
    principal("staff"),
    "REQ-DATA-1"
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  const body = await response.json();
  assert.equal(body.schema, "harmony.sdui.data-response.v1");
  assert.equal(body.resourceId, "dashboard.summary");
  assert.equal(body.mock, true);
  assert.deepEqual(body.data, {
    pendingRequests: 3,
    todayPlacements: 1,
    upcomingCompliance: 2,
    asOf: "2026-07-16"
  });
  assert.deepEqual(env.DB.events[0].detail, {
    requestId: "REQ-DATA-1",
    route: "/api/ui/data/:resourceId",
    resultCode: "ok"
  });

  const etag = response.headers.get("etag");
  const notModified = await routeRequest(
    new Request("https://ops.example.test/api/ui/data/dashboard.summary", { headers: { "If-None-Match": etag } }),
    env,
    principal("staff"),
    "REQ-DATA-2"
  );
  assert.equal(notModified.status, 304);
  assert.equal(env.DB.events.length, 1);

  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/data/dashboard.summary"), makeEnv(), principal("system_admin"), "REQ-DATA-ADMIN"),
    expectApiError(403, "SDUI_ROLE_FORBIDDEN")
  );
  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/data/dashboard.summary?role=owner"), makeEnv(), principal("staff"), "REQ-DATA-TAMPER"),
    expectApiError(400, "SDUI_QUERY_INVALID")
  );
  await assert.rejects(
    routeRequest(new Request("https://ops.example.test/api/ui/data/audit.events"), makeEnv(), principal("owner"), "REQ-DATA-UNKNOWN"),
    expectApiError(404, "SDUI_RESOURCE_NOT_FOUND")
  );
});

test("resource.refresh is the only exposed server action and repeated calls do not mutate business data", async () => {
  const env = makeEnv();
  const input = { pageId: "dashboard", resourceId: "dashboard.summary", revision: 1 };
  const first = await routeRequest(postAction("resource.refresh", input), env, principal("owner"), "REQ-ACTION-1");
  const second = await routeRequest(postAction("resource.refresh", input), env, principal("owner"), "REQ-ACTION-2");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(first.headers.get("x-robots-tag"), "noindex, nofollow");
  const body = await first.json();
  assert.equal(body.schema, "harmony.sdui.action-response.v1");
  assert.deepEqual(body.action, { id: "resource.refresh", version: 1, idempotency: "none" });
  assert.equal(body.requestId, "REQ-ACTION-1");
  assert.equal(body.result.resource.resourceId, "dashboard.summary");
  assert.equal(env.DB.events.length, 2);
  assert.equal(env.DB.calls.every((call) => call.sql.includes("audit_events")), true);
  for (const event of env.DB.events) {
    assert.deepEqual(Object.keys(event.detail).sort(), ["requestId", "resultCode", "route"]);
    assert.doesNotMatch(JSON.stringify(event.detail), /dashboard\.summary|pendingRequests|payload/);
  }

  await assert.rejects(
    routeRequest(postAction("intake.save-draft", input), makeEnv(), principal(), "REQ-ACTION-HIDDEN"),
    expectApiError(404, "SDUI_ACTION_NOT_AVAILABLE")
  );
  await assert.rejects(
    routeRequest(postAction("unknown.action", input), makeEnv(), principal(), "REQ-ACTION-UNKNOWN"),
    expectApiError(404, "SDUI_ACTION_NOT_FOUND")
  );
});

test("action authorization and runtime gates run before body parsing", async () => {
  const invalidBody = "{";
  await assert.rejects(
    routeRequest(postAction("resource.refresh", invalidBody), makeEnv(), principal("system_admin"), "REQ-ACTION-ADMIN"),
    expectApiError(403, "SDUI_ROLE_FORBIDDEN")
  );
  await assert.rejects(
    routeRequest(postAction("resource.refresh", invalidBody), makeEnv({ SDUI_ENABLED: "false" }), principal("owner"), "REQ-ACTION-FLAG"),
    expectApiError(503, "SDUI_DISABLED")
  );
  await assert.rejects(
    routeRequest(postAction("resource.refresh", invalidBody), makeEnv(), principal("owner", { active: false }), "REQ-ACTION-DISABLED"),
    expectAuthorization("ACCOUNT_DISABLED")
  );
});

test("action target, revision, idempotency and payload tampering are rejected safely", async () => {
  await assert.rejects(
    routeRequest(
      postAction("resource.refresh", { pageId: "dashboard", resourceId: "dashboard.summary", revision: 1 }, { "Idempotency-Key": "ATTACK-1" }),
      makeEnv(), principal(), "REQ-ACTION-IDEMPOTENCY"
    ),
    expectApiError(400, "ACTION_IDEMPOTENCY_NOT_ALLOWED")
  );
  await assert.rejects(
    routeRequest(
      postAction("resource.refresh", { pageId: "dashboard", resourceId: "dashboard.summary", revision: 2 }),
      makeEnv(), principal(), "REQ-ACTION-REVISION"
    ),
    expectApiError(409, "SDUI_ACTION_REVISION_MISMATCH")
  );
  await assert.rejects(
    routeRequest(
      postAction("resource.refresh", { pageId: "dashboard", resourceId: "audit.events", revision: 1 }),
      makeEnv(), principal(), "REQ-ACTION-TARGET"
    ),
    expectApiError(400, "SDUI_ACTION_TARGET_INVALID")
  );

  const secret = "010-1234-5678";
  await assert.rejects(
    routeRequest(
      postAction("resource.refresh", {
        pageId: "dashboard",
        resourceId: "dashboard.summary",
        revision: 1,
        role: "owner",
        payload: secret
      }),
      makeEnv(), principal("staff"), "REQ-ACTION-PAYLOAD"
    ),
    (error) => {
      assert.equal(error instanceof SduiApiError, true);
      assert.equal(error.status, 400);
      assert.equal(error.code, "ACTION_INPUT_UNKNOWN_FIELD");
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.doesNotMatch(error.message, /payload|role/i);
      return true;
    }
  );
  await assert.rejects(
    routeRequest(
      new Request("https://ops.example.test/api/ui/actions/resource.refresh?role=owner", {
        method: "POST",
        body: JSON.stringify({ pageId: "dashboard", resourceId: "dashboard.summary", revision: 1 })
      }),
      makeEnv(), principal("staff"), "REQ-ACTION-QUERY"
    ),
    expectApiError(400, "SDUI_QUERY_INVALID")
  );
});
