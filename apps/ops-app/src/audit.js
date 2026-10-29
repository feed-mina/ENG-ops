const encoder = new TextEncoder();
const ALLOWED_DETAIL_KEYS = new Set([
  "requestId", "route", "resultCode", "changedFields", "recordCount",
  "exportFormat", "reasonCode", "retentionCategory"
]);

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(`${normalized}${padding}`), (character) => character.charCodeAt(0));
}

export function sanitizeAuditDetail(detail = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(detail)) {
    if (!ALLOWED_DETAIL_KEYS.has(key)) continue;
    if (Array.isArray(value)) safe[key] = value.slice(0, 20).map((item) => String(item).slice(0, 80));
    else if (["string", "number", "boolean"].includes(typeof value)) safe[key] = typeof value === "string" ? value.slice(0, 160) : value;
  }
  return safe;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function hmac(value, encodedKey) {
  if (!encodedKey) throw new Error("감사로그 서명키가 없어 작업을 중단했습니다.");
  const keyBytes = fromBase64Url(encodedKey);
  if (keyBytes.byteLength < 32) throw new Error("감사로그 서명키는 32바이트 이상이어야 합니다.");
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function createAuditEvent(input, previousHash, env) {
  const event = {
    id: input.id ?? `AUD-${crypto.randomUUID()}`,
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    detail: sanitizeAuditDetail(input.detail),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    previousHash: previousHash ?? "GENESIS",
    keyId: String(env.AUDIT_KEY_ID ?? "")
  };
  if (!event.keyId) throw new Error("감사로그 키 식별자가 없습니다.");
  return { ...event, eventHash: await hmac(canonicalJson(event), env.AUDIT_HMAC_KEY) };
}

export async function appendAuditEvent(db, input, env) {
  const latest = await db.prepare("SELECT event_hash AS eventHash FROM audit_events ORDER BY sequence_no DESC LIMIT 1").first();
  const event = await createAuditEvent(input, latest?.eventHash, env);
  await db.prepare(
    `INSERT INTO audit_events
      (id, actor_id, action, target_type, target_id, detail_json, occurred_at, previous_hash, event_hash, key_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.id, event.actorId, event.action, event.targetType, event.targetId,
    JSON.stringify(event.detail), event.occurredAt, event.previousHash, event.eventHash, event.keyId
  ).run();
  return event;
}
