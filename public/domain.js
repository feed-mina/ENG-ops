export const MOCK_FEE_RULES = Object.freeze({
  employerRate: 0.3,
  workerRate: 0.01,
  dailyMemberMonthlyFee: 40000,
  effectiveLabel: "Mock 설정값 — 운영 전 최신 고시 확인 필수"
});

export const CONTRACT_CONFIRMED_STATES = new Set(["contract_confirmed", "employed"]);

export function canChargeFee(placementState) {
  return CONTRACT_CONFIRMED_STATES.has(placementState);
}

export function calculateFee({ placementState, payer, wage, requestedFee, membership = false }) {
  const numericWage = Number(wage);
  const numericFee = Number(requestedFee);
  if (!canChargeFee(placementState)) {
    return { ok: false, code: "CONTRACT_REQUIRED", message: "근로계약 체결 확인 전에는 소개요금을 청구할 수 없습니다." };
  }
  if (!Number.isFinite(numericWage) || numericWage <= 0 || !Number.isFinite(numericFee) || numericFee < 0) {
    return { ok: false, code: "INVALID_AMOUNT", message: "임금과 소개요금을 다시 확인해 주세요." };
  }
  const cap = membership
    ? MOCK_FEE_RULES.dailyMemberMonthlyFee
    : Math.floor(numericWage * (payer === "worker" ? MOCK_FEE_RULES.workerRate : MOCK_FEE_RULES.employerRate));
  if (numericFee > cap) {
    return { ok: false, code: "FEE_CAP_EXCEEDED", cap, message: `Mock 상한 ${cap.toLocaleString("ko-KR")}원을 초과했습니다.` };
  }
  return { ok: true, cap, fee: numericFee, message: "Mock 요금 규칙을 통과했습니다." };
}

export function validateJobRequest(job, settings) {
  const blockers = [];
  if (!job.businessVerified) blockers.push("사업자 확인 필요");
  if (!job.wageVerified) blockers.push("임금조건 확인 필요");
  if (job.hourlyRate && job.hourlyRate < settings.mockMinimumHourlyWage) blockers.push("Mock 최저임금 설정 미달");
  if (job.arrearsCheck !== "clear") blockers.push("체불 검증 미완료");
  if (!job.workplaceAddress) blockers.push("근무지 누락");
  return { ok: blockers.length === 0, blockers };
}

export function containsRestrictedPersonalData(value) {
  const text = String(value ?? "");
  return /\b\d{6}-?\d{7}\b/.test(text) || /(주민등록번호|신분증\s*(원본|사본)|건강진단\s*상세)/i.test(text);
}

export function rankWorkers(job, workers) {
  return workers
    .map((worker) => {
      const reasons = [];
      const blockers = [];
      let score = 0;
      if (!worker.availableDates.includes(job.workDate)) blockers.push("해당 날짜 근무 불가");
      else { score += 35; reasons.push("근무일 가능"); }
      if (worker.roles.includes(job.role)) { score += 25; reasons.push("직종 경험 일치"); }
      else blockers.push("직종 불일치");
      if (worker.preferredAreas.includes(job.area)) { score += 20; reasons.push("선호지역 일치"); }
      if (worker.minimumDailyWage <= job.dailyWage) { score += 10; reasons.push("희망임금 충족"); }
      else blockers.push("희망임금 미달");
      if (job.foodHandling) {
        if (worker.healthCertificateStatus === "valid") { score += 10; reasons.push("보건증 확인 유효"); }
        else blockers.push("보건증 확인 필요");
      }
      return { ...worker, score, reasons, blockers, eligible: blockers.length === 0 };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.id.localeCompare(b.id));
}

export function daysUntil(asOf, dueDate) {
  const start = new Date(`${asOf}T00:00:00Z`);
  const end = new Date(`${dueDate}T00:00:00Z`);
  return Math.ceil((end - start) / 86400000);
}

export function complianceTone(days) {
  if (days < 0) return "danger";
  if (days <= 7) return "warning";
  if (days <= 30) return "attention";
  return "safe";
}
