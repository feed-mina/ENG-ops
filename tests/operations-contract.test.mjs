import assert from "node:assert/strict";
import test from "node:test";

import {
  ContractValidationError,
  makeWorkerConditionSummary,
  normalizeRestaurantIntake,
  normalizeWorkerIntake
} from "../packages/contracts/operations.js";
import {
  makeAnnualComplianceCalendar,
  makeEventDeadline,
  statutoryRetentionExpiresOn
} from "../packages/compliance/rules.js";
import { calculateFee } from "../public/domain.js";

const restaurantFixture = {
  id: "MOCK-RESTAURANT-B",
  jobRequestId: "MOCK-JOB-B",
  channel: "phone",
  receivedOn: "2026-07-16",
  businessName: "가상 사당식당",
  representativeName: "가상 대표",
  phone: "010-0000-1001",
  contactName: "가상 담당자",
  businessNumber: "MOCK-BIZ-1001",
  permitNumber: "MOCK-PERMIT-1001",
  industry: "한식",
  businessAddress: "서울 동작구 MOCK 사업장",
  workplaceAddress: "서울 동작구 MOCK 근무지",
  role: "주방보조",
  headcount: 1,
  workStartDate: "2026-07-18",
  workEndDate: "2026-07-18",
  startsAt: "10:00",
  endsAt: "16:00",
  breakMinutes: 30,
  wageAmount: 90000,
  wageUnit: "daily",
  payDate: "근무 종료 후",
  payMethod: "계좌이체 (모의)",
  duties: "재료 손질과 설거지",
  meals: "식사 제공",
  transport: "없음",
  uniform: "앞치마 제공",
  safetyNotes: "미끄럼 주의",
  businessVerified: true,
  permitVerified: true,
  arrearsCheck: "clear",
  minimumWageVerified: true,
  operatorNotes: "양측 전화 재확인"
};

const workerFixture = {
  id: "MOCK-WORKER-B",
  channel: "visit",
  receivedOn: "2026-07-16",
  displayAlias: "가상 근로자 B",
  phone: "010-0000-2001",
  birthDate: "1970-01-01",
  desiredRoles: ["주방보조", "설거지"],
  availableDates: ["2026-07-18"],
  availableTime: "09:00~18:00",
  preferredAreas: ["사당", "이수"],
  experience: "가상 식당 경험 3년",
  transport: "대중교통",
  desiredWage: 90000,
  stayQualification: "",
  healthCertificateStatus: "valid",
  healthCertificateCheckedOn: "2026-07-16",
  healthCertificateExpiresOn: "2026-12-31",
  guardianConsent: false,
  emergencyContact: "선택정보 미제공",
  consents: {
    "collection-use": true,
    "restaurant-provision": true,
    "optional-information": false
  },
  operatorNotes: "전화 가능 시간 확인"
};

test("식당 전화 접수표를 정규화하고 근로조건 요약을 만든다", () => {
  const record = normalizeRestaurantIntake(restaurantFixture);
  assert.equal(record.channel, "phone");
  assert.deepEqual(record.verification.blockers, []);
  const summary = makeWorkerConditionSummary(record);
  assert.equal(summary.role, "주방보조");
  assert.match(summary.hours, /휴게 30분/);
  assert.deepEqual(summary.verificationBlockers, []);
});

test("근로자 방문 접수에서 목적별 동의와 보건증 확인 상태만 받는다", () => {
  const record = normalizeWorkerIntake(workerFixture);
  assert.equal(record.channel, "visit");
  assert.equal(record.consents["collection-use"], true);
  assert.equal(record.consents["optional-information"], false);
  assert.equal(record.healthCertificateStatus, "valid");
  assert.equal(Object.hasOwn(record, "healthDetail"), false);
});

test("주민등록번호·신분증·건강 상세결과 입력을 차단한다", () => {
  for (const extra of [
    { residentRegistrationNumber: "가상값" },
    { idCardCopy: "첨부" },
    { healthDetail: "검사 상세" }
  ]) {
    assert.throws(
      () => normalizeWorkerIntake({ ...workerFixture, ...extra }),
      (error) => error instanceof ContractValidationError && error.code === "RESTRICTED_PERSONAL_DATA"
    );
  }
  assert.throws(
    () => normalizeWorkerIntake({ ...workerFixture, operatorNotes: "주민등록번호 900101-1234567" }),
    (error) => error.code === "RESTRICTED_PERSONAL_DATA"
  );
});

test("18세 미만은 친권자·후견인 취업동의 없이는 접수하지 않는다", () => {
  assert.throws(
    () => normalizeWorkerIntake({ ...workerFixture, birthDate: "2010-01-01", guardianConsent: false }),
    (error) => error.code === "GUARDIAN_CONSENT_REQUIRED"
  );
});

test("필수 동의와 선택 동의를 한 번에 뭉치지 않는다", () => {
  assert.throws(
    () => normalizeWorkerIntake({ ...workerFixture, consents: { ...workerFixture.consents, "restaurant-provision": false } }),
    (error) => error.code === "REQUIRED_CONSENT_MISSING"
  );
  const accepted = normalizeWorkerIntake(workerFixture);
  assert.equal(accepted.consents["optional-information"], false);
});

test("변경·보험·폐업 기한과 2년 보존 만료일을 계산한다", () => {
  assert.equal(makeEventDeadline("registrationChange", "2026-07-01").dueOn, "2026-07-31");
  assert.equal(makeEventDeadline("insuranceRenewalEvidence", "2026-07-01").dueOn, "2026-07-11");
  assert.equal(makeEventDeadline("insuranceReplenishment", "2026-07-01").dueOn, "2026-07-08");
  assert.equal(makeEventDeadline("closure", "2026-07-01").dueOn, "2026-07-08");
  assert.equal(statutoryRetentionExpiresOn("2026-07-16"), "2028-07-16");
  assert.deepEqual(makeAnnualComplianceCalendar(2026).map((item) => item.dueOn), ["2026-06-30", "2026-09-30", "2026-12-31"]);
});

test("하루 근무 시나리오는 같은 날·일급·휴게시간을 보존한다", () => {
  const record = normalizeRestaurantIntake(restaurantFixture);
  assert.equal(record.workStartDate, record.workEndDate);
  assert.equal(record.wageUnit, "daily");
  assert.equal(record.breakMinutes, 30);
});

test("1개월 근무 시나리오는 기간·월임금·지급일을 보존한다", () => {
  const record = normalizeRestaurantIntake({
    ...restaurantFixture,
    jobRequestId: "MOCK-JOB-MONTH",
    workStartDate: "2026-08-01",
    workEndDate: "2026-08-31",
    wageAmount: 2400000,
    wageUnit: "monthly",
    payDate: "다음 달 10일"
  });
  assert.equal(record.workEndDate, "2026-08-31");
  assert.equal(record.wageUnit, "monthly");
  assert.equal(record.payDate, "다음 달 10일");
});

test("회원제 일용근로자 시나리오는 계약 확인과 Mock 회비 상한을 함께 검사한다", () => {
  const beforeContract = calculateFee({ placementState: "introduced", payer: "worker", wage: 90000, requestedFee: 40000, membership: true });
  const accepted = calculateFee({ placementState: "contract_confirmed", payer: "worker", wage: 90000, requestedFee: 40000, membership: true });
  const exceeded = calculateFee({ placementState: "contract_confirmed", payer: "worker", wage: 90000, requestedFee: 40001, membership: true });
  assert.equal(beforeContract.code, "CONTRACT_REQUIRED");
  assert.deepEqual({ ok: accepted.ok, cap: accepted.cap }, { ok: true, cap: 40000 });
  assert.equal(exceeded.code, "FEE_CAP_EXCEEDED");
});
