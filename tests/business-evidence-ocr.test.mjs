import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BUSINESS_EVIDENCE_TO_RESTAURANT_FIELD_MAP,
  BusinessEvidenceOcrError,
  MAX_BUSINESS_EVIDENCE_OCR_CHARACTERS,
  analyzeBusinessEvidenceOcrText,
  normalizeBusinessEvidenceOcrReview,
  normalizeBusinessEvidenceRegister
} from "../packages/contracts/business-evidence.js";
import { MOCK_FEE_RULES, calculateFee } from "../public/domain.js";

const ocrFixture = JSON.parse(await readFile(new URL("../mock-documents/mock-business-evidence-ocr-review.json", import.meta.url), "utf8"));
const registerFixture = JSON.parse(await readFile(new URL("../mock-documents/mock-business-evidence-register.json", import.meta.url), "utf8"));

test("합성 사업자 증빙 OCR fixture는 원문·이미지 없이 사람 검토 대기 상태로 정규화된다", () => {
  const review = normalizeBusinessEvidenceOcrReview(ocrFixture);

  assert.equal(review.documentType, "business-registration");
  assert.equal(review.extracted.maskedRegistrationNumber, "***-**-*****");
  assert.equal(review.extracted.maskedAddress, "[상세주소 삭제]");
  assert.equal(review.policy.rawTextPersisted, false);
  assert.equal(review.policy.imagePersisted, false);
  assert.equal(review.policy.directRestaurantCreation, false);
  assert.equal(review.policy.automaticVerification, false);
  assert.equal(review.policy.humanReviewRequired, true);
});

test("사업자 OCR 후보는 식당 접수에 자동 복사하거나 검증 완료 처리하지 않는다", () => {
  assert.deepEqual(BUSINESS_EVIDENCE_TO_RESTAURANT_FIELD_MAP.businessNameAlias, {
    target: "businessName",
    handling: "human-confirm"
  });
  assert.deepEqual(BUSINESS_EVIDENCE_TO_RESTAURANT_FIELD_MAP.maskedRegistrationNumber, {
    target: null,
    handling: "re-enter-after-human-review"
  });
  const analysis = analyzeBusinessEvidenceOcrText("상호: 합성상사");
  assert.equal(analysis.canCreateRestaurant, false);
  assert.equal(analysis.canVerifyRestaurant, false);
});

test("등록번호·성명·생년월일·상호·상세주소·연락처를 결정적으로 마스킹한다", () => {
  const source = [
    "사업자등록번호: 123-45-67890",
    "직업소개사업 등록번호: MOCK-AGENCY-1234",
    "공제번호: MOCK-MUTUAL-5678",
    "대표자: 홍길동",
    "대표자 생년월일: 1970-01-01",
    "상호: 합성상사",
    "사업장 소재지: 서울시 연습로 10 연습빌딩 3층",
    "전화: 010-1234-5678",
    "이메일: owner@example.com"
  ].join("\n");
  const analysis = analyzeBusinessEvidenceOcrText(source);

  for (const secret of [
    "123-45-67890", "MOCK-AGENCY-1234", "MOCK-MUTUAL-5678", "홍길동", "1970-01-01",
    "합성상사", "연습빌딩", "010-1234-5678", "owner@example.com"
  ]) {
    assert.equal(analysis.maskedText.includes(secret), false);
  }
  assert.deepEqual(analysis.detectionCodes, [
    "agency-registration-number",
    "business-name",
    "business-registration-number",
    "detailed-address",
    "email-address",
    "mutual-aid-number",
    "person-birth-date",
    "person-name",
    "phone-number"
  ]);
  assert.equal(analysis.blocked, true);
  assert.equal(analysis.canPersist, false);
  assert.equal(analysis.requiresHumanReview, true);
});

test("세 증빙 문서의 종류·확인 상태·발급일·만료일·확인자를 합성 대장으로 검증한다", () => {
  const register = normalizeBusinessEvidenceRegister(registerFixture);

  assert.deepEqual(register.evidence.map((item) => item.documentType), [
    "business-registration",
    "employment-agency-registration",
    "mutual-aid-certificate"
  ]);
  assert.equal(register.evidence[0].expiresOn, null);
  assert.equal(register.evidence[2].expiresOn, "2026-12-31");
  assert.ok(register.evidence.every((item) => item.verificationStatus === "pending-original-review"));
  assert.ok(register.evidence.every((item) => item.verifiedBy === "mock-reviewer"));
});

test("최저임금·소개요금은 공식 확인 전 미확정 참고자료이고 행동강령은 원칙만 요약한다", () => {
  const register = normalizeBusinessEvidenceRegister(registerFixture);
  const wage = register.references.find((item) => item.referenceType === "minimum-wage-guide");
  const fee = register.references.find((item) => item.referenceType === "fee-notice");
  const ethics = register.references.find((item) => item.referenceType === "ethics-code");

  assert.equal(wage.reviewStatus, "unverified-reference");
  assert.equal(wage.effectiveOn, null);
  assert.equal(fee.reviewStatus, "pending-official-verification");
  assert.equal(fee.officialIdentifier, "");
  assert.deepEqual(ethics.summaryPrinciples, ["법령 준수", "권익 보호", "교육", "공정성", "자율시정"]);
});

test("공식 원문 확인 전 고시 번호·시행일 확정을 거부하고 Mock 요금 규칙을 유지한다", () => {
  const feeIndex = registerFixture.references.findIndex((item) => item.referenceType === "fee-notice");
  const references = structuredClone(registerFixture.references);
  references[feeIndex].officialIdentifier = "UNVERIFIED-NOTICE";
  references[feeIndex].effectiveOn = "2026-01-01";

  assert.throws(
    () => normalizeBusinessEvidenceRegister({ ...registerFixture, references }),
    (error) => error instanceof BusinessEvidenceOcrError && error.code === "UNVERIFIED_OFFICIAL_METADATA"
  );
  assert.equal(MOCK_FEE_RULES.effectiveLabel, "Mock 설정값 — 운영 전 최신 고시 확인 필수");
  assert.deepEqual(
    calculateFee({ placementState: "contract_confirmed", payer: "worker", wage: 100000, requestedFee: 1000 }),
    { ok: true, cap: 1000, fee: 1000, message: "Mock 요금 규칙을 통과했습니다." }
  );
});

test("OCR 원문·이미지·직접 식별정보 필드와 안전하지 않은 자동화 정책을 거부한다", () => {
  for (const unsafeFixture of [
    { ...ocrFixture, rawOcrText: "원문" },
    { ...ocrFixture, originalImage: "base64" },
    { ...ocrFixture, representativeName: "가상값" },
    { ...ocrFixture, policy: { ...ocrFixture.policy, automaticVerification: true } }
  ]) {
    assert.throws(
      () => normalizeBusinessEvidenceOcrReview(unsafeFixture),
      (error) => error instanceof BusinessEvidenceOcrError && ["RESTRICTED_OCR_FIELD", "UNSAFE_OCR_POLICY"].includes(error.code)
    );
  }
});

test("OCR 입력 타입과 최대 길이를 제한한다", () => {
  assert.throws(
    () => analyzeBusinessEvidenceOcrText(null),
    (error) => error.code === "INVALID_OCR_TEXT"
  );
  assert.throws(
    () => analyzeBusinessEvidenceOcrText("가".repeat(MAX_BUSINESS_EVIDENCE_OCR_CHARACTERS + 1)),
    (error) => error.code === "OCR_TEXT_TOO_LONG"
  );
});