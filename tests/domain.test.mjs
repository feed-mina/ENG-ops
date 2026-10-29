import assert from "node:assert/strict";
import test from "node:test";
import { calculateFee, complianceTone, containsRestrictedPersonalData, daysUntil, rankWorkers, validateJobRequest } from "../public/domain.js";
import { mockData } from "../public/mock-data.js";

test("계약 확인 전 소개요금을 차단한다", () => {
  const result = calculateFee({ placementState: "introduced", payer: "employer", wage: 90000, requestedFee: 27000 });
  assert.equal(result.ok, false);
  assert.equal(result.code, "CONTRACT_REQUIRED");
});

test("Mock 소개요금 상한을 검증한다", () => {
  const accepted = calculateFee({ placementState: "contract_confirmed", payer: "employer", wage: 90000, requestedFee: 27000 });
  const rejected = calculateFee({ placementState: "contract_confirmed", payer: "worker", wage: 90000, requestedFee: 1000 });
  assert.deepEqual({ ok: accepted.ok, cap: accepted.cap }, { ok: true, cap: 27000 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.cap, 900);
});

test("검증되지 않은 저임금 구인을 차단한다", () => {
  const blocked = mockData.jobRequests.find((job) => job.id === "J-MOCK-BLOCKED");
  const result = validateJobRequest(blocked, mockData.meta);
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes("사업자 확인 필요"));
  assert.ok(result.blockers.includes("Mock 최저임금 설정 미달"));
  assert.ok(result.blockers.includes("체불 검증 미완료"));
});

test("민감정보 형태와 금지 문구를 탐지한다", () => {
  assert.equal(containsRestrictedPersonalData("900101-1234567"), true);
  assert.equal(containsRestrictedPersonalData("신분증 사본을 첨부"), true);
  assert.equal(containsRestrictedPersonalData("보건증 확인일 2026-07-15"), false);
});

test("후보 추천은 이유와 차단 사유를 함께 제공한다", () => {
  const job = mockData.jobRequests[0];
  const ranked = rankWorkers(job, mockData.workers);
  assert.equal(ranked[0].id, "W-MOCK-001");
  assert.equal(ranked[0].eligible, true);
  const expired = ranked.find((worker) => worker.id === "W-MOCK-003");
  assert.equal(expired.eligible, false);
  assert.ok(expired.blockers.includes("보건증 확인 필요"));
});

test("준법 D-day와 위험도를 계산한다", () => {
  assert.equal(daysUntil("2026-07-15", "2026-07-22"), 7);
  assert.equal(complianceTone(7), "warning");
  assert.equal(complianceTone(45), "safe");
});
