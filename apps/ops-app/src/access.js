const encoder = new TextEncoder();

function decodeBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(`${normalized}${padding}`), (character) => character.charCodeAt(0));
  return bytes;
}

function parseJsonPart(value, label) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  } catch {
    throw new AccessError(401, "ACCESS_TOKEN_INVALID", `${label} 형식이 올바르지 않습니다.`);
  }
}

export class AccessError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AccessError";
    this.status = status;
    this.code = code;
  }
}

export function normalizeTeamDomain(value) {
  const raw = String(value ?? "").trim().replace(/\/$/, "");
  if (!raw) return "";
  const url = raw.startsWith("https://") ? new URL(raw) : new URL(`https://${raw}`);
  if (url.protocol !== "https:") throw new AccessError(503, "ACCESS_CONFIG_INVALID", "Access 팀 도메인은 HTTPS여야 합니다.");
  return url.origin;
}

export function assertAccessConfiguration(env) {
  const issuer = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = String(env.ACCESS_AUD ?? "").trim();
  if (!issuer || !audience) {
    throw new AccessError(503, "ACCESS_NOT_CONFIGURED", "Cloudflare Access 설정이 없어 접근을 차단했습니다.");
  }
  return { issuer, audience };
}

async function importVerificationKey(jwk) {
  if (!jwk || jwk.kty !== "RSA") throw new AccessError(401, "ACCESS_KEY_INVALID", "Access 공개키를 사용할 수 없습니다.");
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

function validateClaims(payload, { issuer, audience, nowSeconds }) {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== issuer) throw new AccessError(401, "ACCESS_ISSUER_MISMATCH", "Access 발급자가 일치하지 않습니다.");
  if (!audiences.includes(audience)) throw new AccessError(401, "ACCESS_AUDIENCE_MISMATCH", "Access 대상 애플리케이션이 일치하지 않습니다.");
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new AccessError(401, "ACCESS_TOKEN_EXPIRED", "Access 로그인이 만료되었습니다.");
  if (Number.isFinite(payload.nbf) && payload.nbf > now + 30) throw new AccessError(401, "ACCESS_TOKEN_NOT_ACTIVE", "아직 사용할 수 없는 Access 토큰입니다.");
  if (typeof payload.sub !== "string" || payload.sub.length < 1) throw new AccessError(401, "ACCESS_SUBJECT_MISSING", "Access 사용자 식별자가 없습니다.");
  return payload;
}

export async function verifyAccessJwt(token, env, options = {}) {
  const { issuer, audience } = assertAccessConfiguration(env);
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) throw new AccessError(401, "ACCESS_TOKEN_MISSING", "Cloudflare Access 로그인이 필요합니다.");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseJsonPart(encodedHeader, "Access 토큰 헤더");
  const payload = parseJsonPart(encodedPayload, "Access 토큰 본문");
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new AccessError(401, "ACCESS_ALGORITHM_REJECTED", "허용되지 않은 Access 서명 방식입니다.");
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new AccessError(503, "ACCESS_KEYS_UNAVAILABLE", "Access 공개키를 확인할 수 없어 접근을 차단했습니다.");
  const keySet = await response.json();
  const jwk = Array.isArray(keySet.keys) ? keySet.keys.find((key) => key.kid === header.kid) : undefined;
  if (!jwk) throw new AccessError(401, "ACCESS_KEY_NOT_FOUND", "Access 서명키를 찾을 수 없습니다.");

  const key = await importVerificationKey(jwk);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeBase64Url(encodedSignature),
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!valid) throw new AccessError(401, "ACCESS_SIGNATURE_INVALID", "Access 토큰 서명이 올바르지 않습니다.");
  return validateClaims(payload, { issuer, audience, nowSeconds: options.nowSeconds });
}

export async function authenticateRequest(request, env, options = {}) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AccessError(401, "ACCESS_TOKEN_MISSING", "Cloudflare Access 로그인이 필요합니다.");
  return verifyAccessJwt(token, env, options);
}
