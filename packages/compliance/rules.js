export const COMPLIANCE_RULE_VERSION = "mock-2026-07-16-v1";

export const COMPLIANCE_RULES = Object.freeze({
  registrationChange: Object.freeze({ days: 30, label: "등록사항 변경등록", evidence: "변경등록 신청서와 증빙" }),
  insuranceRenewalEvidence: Object.freeze({ days: 10, label: "보증보험 갱신 증빙 제출", evidence: "갱신 증권과 제출 확인" }),
  insuranceReplenishment: Object.freeze({ days: 7, label: "보험금 지급 후 한도 보충", evidence: "보충 증권과 납입 증빙" }),
  closure: Object.freeze({ days: 7, label: "폐업 신고", evidence: "폐업신고서와 등록증" }),
  education: Object.freeze({ hoursPerYear: 4, label: "대표자·종사자 교육", evidence: "교육 수료증" }),
  inspection: Object.freeze({ periodsPerYear: 2, label: "반기 자체점검", evidence: "자체점검표" }),
  statutoryLedger: Object.freeze({ years: 2, label: "법정 장부 보존", evidence: "구인·구직·소개·회원·금전 장부" })
});

function toDateOnly(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) throw new TypeError("기준 날짜를 확인해 주세요.");
  return date;
}

export function addCalendarDays(value, days) {
  const date = toDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addCalendarYears(value, years) {
  const date = toDateOnly(value);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

export function makeEventDeadline(type, occurredOn) {
  const rule = COMPLIANCE_RULES[type];
  if (!rule || !Number.isInteger(rule.days)) throw new TypeError("지원하지 않는 준법 일정입니다.");
  return Object.freeze({
    type,
    title: rule.label,
    occurredOn: String(occurredOn).slice(0, 10),
    dueOn: addCalendarDays(occurredOn, rule.days),
    evidence: rule.evidence,
    status: "mock-open",
    ruleVersion: COMPLIANCE_RULE_VERSION
  });
}

export function makeAnnualComplianceCalendar(year) {
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear < 2020 || numericYear > 2100) throw new TypeError("연도를 확인해 주세요.");
  return Object.freeze([
    Object.freeze({ type: "inspection", title: "상반기 자체점검", dueOn: `${numericYear}-06-30`, evidence: COMPLIANCE_RULES.inspection.evidence, status: "mock-open" }),
    Object.freeze({ type: "education", title: "연간 교육 확인", dueOn: `${numericYear}-09-30`, evidence: COMPLIANCE_RULES.education.evidence, status: "mock-open" }),
    Object.freeze({ type: "inspection", title: "하반기 자체점검", dueOn: `${numericYear}-12-31`, evidence: COMPLIANCE_RULES.inspection.evidence, status: "mock-open" })
  ]);
}

export function statutoryRetentionExpiresOn(recordCompletedOn) {
  return addCalendarYears(recordCompletedOn, COMPLIANCE_RULES.statutoryLedger.years);
}
