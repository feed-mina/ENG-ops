import { AccessError, authenticateRequest } from "./access.js";
import { appendAuditEvent } from "./audit.js";
import { makeAnnualComplianceCalendar, makeEventDeadline } from "../../../packages/compliance/rules.js";
import { ContractValidationError, makeWorkerConditionSummary, normalizeRestaurantIntake } from "../../../packages/contracts/operations.js";
import { decryptPersonalField, encryptPersonalField } from "./crypto.js";
import { changeMockPlacementState, createMockPlacement, recordMockFee, saveMockIntake } from "./operations.js";
import { AuthorizationError, loadPrincipal, requirePermission } from "./rbac.js";
import { destroyExpiredMockRecords } from "./retention.js";
import {
  SduiApiError,
  executeSduiAction,
  getSduiPage,
  getSduiResource
} from "./sdui.js";

const securityHeaders = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
});

export const MAX_JSON_BYTES = 16_384;

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...securityHeaders, ...headers } });
}

function empty(status, headers = {}) {
  return new Response(null, { status, headers: { ...securityHeaders, ...headers } });
}

function requestId(request) {
  return request.headers.get("Cf-Ray")?.slice(0, 64) || crypto.randomUUID();
}

function assertDatabase(env) {
  if (!env.DB) throw new AccessError(503, "DATABASE_NOT_CONFIGURED", "내부 데이터베이스 설정이 없어 접근을 차단했습니다.");
  return env.DB;
}

export async function readSmallJson(request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && !/^\d+$/.test(declaredLength)) {
    throw new RequestError(400, "INVALID_CONTENT_LENGTH", "Content-Length 형식이 올바르지 않습니다.");
  }
  if (declaredLength !== null && Number(declaredLength) > MAX_JSON_BYTES) {
    throw new RequestError(413, "REQUEST_TOO_LARGE", "요청 내용은 16KiB를 넘을 수 없습니다.");
  }
  if (!request.body) throw new RequestError(400, "INVALID_JSON", "입력 내용을 읽을 수 없습니다.");

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_BYTES) {
        try {
          await reader.cancel("request-too-large");
        } catch {
          // 크기 초과 응답을 유지하며 스트림 취소 오류는 외부에 노출하지 않는다.
        }
        throw new RequestError(413, "REQUEST_TOO_LARGE", "요청 내용은 16KiB를 넘을 수 없습니다.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "INVALID_JSON", "입력 내용을 읽을 수 없습니다.");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestError(400, "INVALID_JSON", "입력 내용을 읽을 수 없습니다.");
  }
}

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.code = code;
  }
}

function assertMockWorker(input, env) {
  if (env.DATA_MODE !== "mock") throw new RequestError(503, "MOCK_MODE_REQUIRED", "이 버전은 Mock 데이터만 처리합니다.");
  const id = String(input.id ?? "");
  const displayAlias = String(input.displayAlias ?? "");
  const phone = String(input.phone ?? "");
  if (!/^MOCK-WORKER-[A-Z0-9-]{1,30}$/.test(id)) throw new RequestError(400, "MOCK_ID_REQUIRED", "Mock 근로자 번호를 확인해 주세요.");
  if (!/^(가상 |MOCK-)/.test(displayAlias) || displayAlias.length > 40) throw new RequestError(400, "MOCK_ALIAS_REQUIRED", "실명이 아닌 가상 이름만 사용할 수 있습니다.");
  if (!/^010-0000-\d{4}$/.test(phone)) throw new RequestError(400, "MOCK_PHONE_REQUIRED", "010-0000-XXXX 형식의 가상 전화번호만 사용할 수 있습니다.");
  return { id, displayAlias, phone };
}

async function audit(db, principal, action, targetType, targetId, detail, env) {
  return appendAuditEvent(db, { actorId: principal.id, action, targetType, targetId, detail }, env);
}

export async function routeRequest(request, env, principal, id) {
  const db = env.DB;
  const url = new URL(request.url);

  const pageMatch = url.pathname.match(/^\/api\/ui\/pages\/([a-z][a-z0-9._-]*)$/);
  if (request.method === "GET" && pageMatch) {
    const result = await getSduiPage({
      pageId: pageMatch[1],
      url,
      env,
      principal,
      ifNoneMatch: request.headers.get("If-None-Match")
    });
    if (result.notModified) return empty(304, result.headers);
    await audit(db, principal, "sdui.page.read", "sdui-page", pageMatch[1], {
      requestId: id, route: "/api/ui/pages/:pageId", resultCode: "ok"
    }, env);
    return json(result.body, 200, result.headers);
  }

  const resourceMatch = url.pathname.match(/^\/api\/ui\/data\/([a-z][a-z0-9._-]*)$/);
  if (request.method === "GET" && resourceMatch) {
    const result = await getSduiResource({
      resourceId: resourceMatch[1],
      url,
      env,
      principal,
      ifNoneMatch: request.headers.get("If-None-Match")
    });
    if (result.notModified) return empty(304, result.headers);
    await audit(db, principal, "sdui.data.read", "sdui-resource", resourceMatch[1], {
      requestId: id, route: "/api/ui/data/:resourceId", resultCode: "ok"
    }, env);
    return json(result.body, 200, result.headers);
  }

  const actionMatch = url.pathname.match(/^\/api\/ui\/actions\/([a-z][a-z0-9._-]*)$/);
  if (request.method === "POST" && actionMatch) {
    const result = await executeSduiAction({
      actionId: actionMatch[1],
      readInput: () => readSmallJson(request),
      url,
      env,
      principal,
      requestId: id,
      idempotencyKey: request.headers.get("Idempotency-Key")
    });
    await audit(db, principal, "sdui.action.execute", "sdui-action", actionMatch[1], {
      requestId: id, route: "/api/ui/actions/:actionId", resultCode: "ok"
    }, env);
    return json(result.body, 200, result.headers);
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    requirePermission(principal, "dashboard:read");
    await audit(db, principal, "session.read", "session", principal.id, { requestId: id, route: url.pathname, resultCode: "ok" }, env);
    return json({ ok: true, principal: { id: principal.id, role: principal.role }, dataMode: env.DATA_MODE });
  }

  if (request.method === "GET" && url.pathname === "/api/compliance/calendar") {
    requirePermission(principal, "dashboard:read");
    const year = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());
    const scheduled = makeAnnualComplianceCalendar(year);
    const stored = await db.prepare(
      `SELECT id, event_type AS type, occurred_on AS occurredOn, due_on AS dueOn, status, evidence_label AS evidence,
              completed_at AS completedAt, rule_version AS ruleVersion
         FROM compliance_events WHERE substr(due_on, 1, 4) = ? ORDER BY due_on ASC`
    ).bind(String(year)).all();
    await audit(db, principal, "compliance.list", "compliance", String(year), {
      requestId: id, route: url.pathname, recordCount: (stored.results?.length ?? 0) + scheduled.length
    }, env);
    return json({ ok: true, year, scheduled, eventDriven: stored.results ?? [], mock: true });
  }

  if (request.method === "POST" && url.pathname === "/api/compliance/events") {
    requirePermission(principal, "records:write");
    if (env.DATA_MODE !== "mock") throw new RequestError(503, "MOCK_MODE_REQUIRED", "현재 버전은 Mock 자료만 처리합니다.");
    const input = await readSmallJson(request);
    const eventId = String(input.id ?? "");
    if (!/^MOCK-COMPLIANCE-[A-Z0-9-]{1,40}$/.test(eventId)) throw new RequestError(400, "MOCK_ID_REQUIRED", "Mock 준법 일정 번호를 확인해 주세요.");
    let deadline;
    try {
      deadline = makeEventDeadline(input.type, input.occurredOn);
    } catch {
      throw new RequestError(400, "INVALID_COMPLIANCE_EVENT", "준법 일정 종류와 발생일을 확인해 주세요.");
    }
    await db.prepare(
      `INSERT INTO compliance_events
        (id, event_type, occurred_on, due_on, status, evidence_label, rule_version)
       VALUES (?, ?, ?, ?, 'mock-open', ?, ?)`
    ).bind(eventId, deadline.type, deadline.occurredOn, deadline.dueOn, deadline.evidence, deadline.ruleVersion).run();
    await audit(db, principal, "compliance.create", "compliance", eventId, {
      requestId: id, route: url.pathname, changedFields: ["type", "occurredOn", "dueOn", "evidence"]
    }, env);
    return json({ ok: true, record: { id: eventId, ...deadline }, mock: true }, 201);
  }

  const intakeListMatch = url.pathname.match(/^\/api\/mock\/intake\/(restaurant|worker)$/);
  if (request.method === "GET" && intakeListMatch) {
    requirePermission(principal, "records:list");
    const result = await db.prepare(
      `SELECT id, intake_type AS intakeType, status, intake_channel AS channel, contract_version AS contractVersion,
              submitted_at AS submittedAt, reviewed_at AS reviewedAt
         FROM intake_submissions WHERE intake_type = ? ORDER BY submitted_at DESC LIMIT 50`
    ).bind(intakeListMatch[1]).all();
    await audit(db, principal, "intake.list", "intake", intakeListMatch[1], {
      requestId: id, route: "/api/mock/intake/:type", recordCount: result.results?.length ?? 0
    }, env);
    return json({ ok: true, records: result.results ?? [], mock: true });
  }

  if (request.method === "POST" && intakeListMatch) {
    requirePermission(principal, "records:write");
    const input = await readSmallJson(request);
    const result = await saveMockIntake(db, intakeListMatch[1], input, principal, env);
    await audit(db, principal, "intake.create", "intake", result.id, {
      requestId: id, route: "/api/mock/intake/:type", changedFields: ["encryptedPayload", "retentionExpiresAt", "consentVersion"],
      resultCode: result.idempotent ? "idempotent" : "created"
    }, env);
    const response = { ok: true, id: result.id, status: result.status, idempotent: result.idempotent, mock: true };
    if (intakeListMatch[1] === "restaurant") response.workerConditionSummary = makeWorkerConditionSummary(result.record);
    return json(response, result.idempotent ? 200 : 201);
  }

  if (request.method === "POST" && url.pathname === "/api/mock/intake/restaurant/preview") {
    requirePermission(principal, "records:write");
    const record = normalizeRestaurantIntake(await readSmallJson(request), { dataMode: env.DATA_MODE });
    return json({ ok: true, summary: makeWorkerConditionSummary(record), mock: true });
  }

  if (request.method === "POST" && url.pathname === "/api/mock/placements") {
    requirePermission(principal, "records:write");
    const result = await createMockPlacement(db, await readSmallJson(request), principal);
    await audit(db, principal, "placement.create", "placement", result.id, {
      requestId: id, route: url.pathname, changedFields: ["jobRequestId", "workerId", "state"]
    }, env);
    return json({ ok: true, record: result, mock: true }, 201);
  }

  const placementStateMatch = url.pathname.match(/^\/api\/mock\/placements\/(MOCK-PLACEMENT-[A-Z0-9-]+)\/state$/);
  if (request.method === "POST" && placementStateMatch) {
    requirePermission(principal, "records:write");
    const input = await readSmallJson(request);
    const result = await changeMockPlacementState(db, placementStateMatch[1], input.state, principal);
    await audit(db, principal, "placement.state.change", "placement", result.id, {
      requestId: id, route: "/api/mock/placements/:id/state", changedFields: ["state"]
    }, env);
    return json({ ok: true, record: result, mock: true });
  }

  if (request.method === "POST" && url.pathname === "/api/mock/fees") {
    requirePermission(principal, "records:write");
    const result = await recordMockFee(db, await readSmallJson(request), principal);
    await audit(db, principal, "fee.create", "fee", result.id, {
      requestId: id, route: url.pathname, changedFields: ["placementId", "payerType", "amount", "capAmount"]
    }, env);
    return json({ ok: true, record: result, mock: true }, 201);
  }

  if (request.method === "GET" && url.pathname === "/api/mock/workers") {
    requirePermission(principal, "records:list");
    const result = await db.prepare(
      "SELECT id, display_alias AS displayAlias, status, created_at AS createdAt FROM workers ORDER BY created_at DESC LIMIT 50"
    ).all();
    await audit(db, principal, "worker.list", "worker", "collection", { requestId: id, route: url.pathname, recordCount: result.results?.length ?? 0 }, env);
    return json({ ok: true, records: result.results ?? [] });
  }

  if (request.method === "POST" && url.pathname === "/api/mock/workers") {
    requirePermission(principal, "records:write");
    const worker = assertMockWorker(await readSmallJson(request), env);
    const encryptedPhone = await encryptPersonalField(worker.phone, `workers:${worker.id}:phone`, env);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        `INSERT INTO workers (id, display_alias, phone_cipher, status, retention_category, retention_expires_at, created_at)
         VALUES (?, ?, ?, 'active', 'general-operational', ?, ?)`
      ).bind(worker.id, worker.displayAlias, encryptedPhone, new Date(Date.now() + 365 * 86_400_000).toISOString(), now),
      db.prepare(
        `INSERT INTO retention_items
          (id, record_type, record_id, retention_category, expires_at, legal_hold, status, created_at)
         VALUES (?, 'worker', ?, 'general-operational', ?, 0, 'active', ?)`
      ).bind(`RET-${worker.id}`, worker.id, new Date(Date.now() + 365 * 86_400_000).toISOString(), now)
    ]);
    await audit(db, principal, "worker.create", "worker", worker.id, {
      requestId: id, route: url.pathname, changedFields: ["displayAlias", "phoneCipher", "retentionExpiresAt"]
    }, env);
    return json({ ok: true, id: worker.id, message: "가상 근로자 자료를 저장했습니다." }, 201);
  }

  const workerDetailMatch = url.pathname.match(/^\/api\/mock\/workers\/(MOCK-WORKER-[A-Z0-9-]+)$/);
  if (request.method === "GET" && workerDetailMatch) {
    requirePermission(principal, "records:read");
    const worker = await db.prepare(
      "SELECT id, display_alias AS displayAlias, phone_cipher AS phoneCipher, status, created_at AS createdAt FROM workers WHERE id = ? LIMIT 1"
    ).bind(workerDetailMatch[1]).first();
    if (!worker) throw new RequestError(404, "RECORD_NOT_FOUND", "자료를 찾을 수 없습니다.");
    const phone = worker.phoneCipher ? await decryptPersonalField(worker.phoneCipher, `workers:${worker.id}:phone`, env) : null;
    await audit(db, principal, "worker.read", "worker", worker.id, { requestId: id, route: "/api/mock/workers/:id", resultCode: "ok" }, env);
    return json({ ok: true, record: { id: worker.id, displayAlias: worker.displayAlias, phone, status: worker.status, createdAt: worker.createdAt } });
  }

  if (request.method === "GET" && url.pathname === "/api/audit") {
    requirePermission(principal, "audit:read");
    const result = await db.prepare(
      `SELECT sequence_no AS sequenceNo, id, actor_id AS actorId, action, target_type AS targetType,
              target_id AS targetId, detail_json AS detailJson, occurred_at AS occurredAt, event_hash AS eventHash
         FROM audit_events ORDER BY sequence_no DESC LIMIT 100`
    ).all();
    await audit(db, principal, "audit.list", "audit", "collection", { requestId: id, route: url.pathname, recordCount: result.results?.length ?? 0 }, env);
    return json({ ok: true, events: result.results ?? [] });
  }

  if (request.method === "POST" && url.pathname === "/api/maintenance/retention") {
    requirePermission(principal, "retention:destroy");
    const destroyed = await destroyExpiredMockRecords(db, { actorId: principal.id });
    await audit(db, principal, "retention.destroy", "retention", "batch", {
      requestId: id, route: url.pathname, recordCount: destroyed.length, retentionCategory: "due-records"
    }, env);
    return json({ ok: true, destroyedCount: destroyed.length, mock: true });
  }

  if (request.method === "GET" && url.pathname === "/api/export/mock-summary") {
    requirePermission(principal, "records:export");
    const workerCount = await db.prepare("SELECT COUNT(*) AS count FROM workers").first("count");
    await audit(db, principal, "records.export", "worker", "summary", {
      requestId: id, route: url.pathname, recordCount: Number(workerCount ?? 0), exportFormat: "json-summary"
    }, env);
    return json({ ok: true, mock: true, totals: { workers: Number(workerCount ?? 0) } });
  }

  throw new RequestError(404, "ROUTE_NOT_FOUND", "내부 업무 경로를 찾을 수 없습니다.");
}

export default {
  async fetch(request, env) {
    const id = requestId(request);
    let db;
    try {
      db = assertDatabase(env);
      const claims = await authenticateRequest(request, env);
      const principal = await loadPrincipal(db, claims.sub);
      return await routeRequest(request, env, principal, id);
    } catch (error) {
      if (error instanceof AccessError || error instanceof AuthorizationError || error instanceof RequestError || error instanceof ContractValidationError || error instanceof SduiApiError) {
        if (db && error instanceof AccessError && env.AUDIT_HMAC_KEY && env.AUDIT_KEY_ID) {
          try {
            await appendAuditEvent(db, {
              actorId: "ACCESS-GATEWAY",
              action: "access.denied",
              targetType: "session",
              targetId: "unknown",
              detail: { requestId: id, route: new URL(request.url).pathname, resultCode: error.code }
            }, env);
          } catch {
            // 인증 실패 응답에는 감사 저장소의 내부 오류를 노출하지 않는다.
          }
        }
        return json({ ok: false, code: error.code, message: error.message, fields: error.fields ?? [], requestId: id }, error.status);
      }
      return json({ ok: false, code: "INTERNAL_ERROR", message: "내부 업무 시스템에서 처리하지 못했습니다.", requestId: id }, 500);
    }
  }
};
