import { makeDisabledIntakeResponse } from "../contracts/intake.js";

export async function verifyTurnstileSubmission({ token, remoteIp, idempotencyKey, expectedAction }, env, options = {}) {
  if (String(env.INTAKE_ENABLED ?? "false") !== "true") return makeDisabledIntakeResponse();
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_EXPECTED_HOSTNAME) {
    return { ok: false, code: "TURNSTILE_NOT_CONFIGURED", message: "보안 확인 설정이 없어 접수를 중단했습니다." };
  }
  if (!token) return { ok: false, code: "TURNSTILE_TOKEN_REQUIRED", message: "보안 확인을 다시 해주세요." };

  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);
  if (idempotencyKey) form.set("idempotency_key", idempotencyKey);

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  if (!response.ok) return { ok: false, code: "TURNSTILE_UNAVAILABLE", message: "보안 확인 서비스에 연결할 수 없습니다." };
  const result = await response.json();
  if (!result.success) return { ok: false, code: "TURNSTILE_REJECTED", message: "보안 확인이 만료되었거나 올바르지 않습니다." };
  if (result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME) {
    return { ok: false, code: "TURNSTILE_HOSTNAME_MISMATCH", message: "허용되지 않은 홈페이지에서 온 요청입니다." };
  }
  if (result.action !== expectedAction) {
    return { ok: false, code: "TURNSTILE_ACTION_MISMATCH", message: "접수 종류가 일치하지 않습니다." };
  }
  return { ok: true, code: "TURNSTILE_VERIFIED" };
}
