export const INTAKE_CONTRACT_VERSION = "mock-2026-07-16";

export function makeDisabledIntakeResponse() {
  return {
    ok: false,
    code: "INTAKE_DISABLED",
    message: "현재 온라인 접수는 준비 중입니다. 전화로 문의해 주세요.",
    contractVersion: INTAKE_CONTRACT_VERSION
  };
}
