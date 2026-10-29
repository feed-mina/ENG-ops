import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_WORKER_RESUME_OCR_CHARACTERS,
  WORKER_RESUME_TO_INTAKE_FIELD_MAP,
  WorkerResumeOcrError,
  analyzeWorkerResumeOcrText,
  normalizeWorkerResumeReview
} from "../packages/contracts/worker-resume.js";

const fixture = JSON.parse(await readFile(new URL("../mock-documents/mock-worker-resume-ocr-review.json", import.meta.url), "utf8"));

test("합성 이력서 OCR fixture는 원문·이미지 없이 사람 검토 대기 상태로 정규화된다", () => {
  const review = normalizeWorkerResumeReview(fixture);

  assert.equal(review.mock, true);
  assert.equal(review.reviewStatus, "pending-human-review");
  assert.equal(review.extracted.contactMask, "010-****-0001");
  assert.equal(review.policy.rawTextPersisted, false);
  assert.equal(review.policy.imagePersisted, false);
  assert.equal(review.policy.directIntakeCreation, false);
  assert.equal(review.policy.humanReviewRequired, true);
  assert.equal(Object.hasOwn(review, "rawOcrText"), false);
});

test("이력서 필드는 현재 근로자 접수 계약에 자동 복사되지 않고 항목별 처리방식을 고정한다", () => {
  assert.deepEqual(WORKER_RESUME_TO_INTAKE_FIELD_MAP.contactMask, {
    target: null,
    handling: "re-enter-after-consent"
  });
  assert.deepEqual(WORKER_RESUME_TO_INTAKE_FIELD_MAP.workHistory, {
    target: "experience",
    handling: "human-merge"
  });
  assert.deepEqual(WORKER_RESUME_TO_INTAKE_FIELD_MAP.educationSummary, {
    target: null,
    handling: "not-collected"
  });
});

test("OCR 텍스트에서 직접 식별정보·금융정보·인증정보·건강 상세를 결정적으로 마스킹한다", () => {
  const source = [
    "성명: 홍길동",
    "주민등록번호 900101-1234567",
    "생년월일: 1990-01-01",
    "전화 010-1234-5678",
    "이메일 worker@example.com",
    "주소: 서울시 테스트로 12 테스트아파트 101동 101호",
    "계좌 123-456-789012",
    "OTP: 654321",
    "신분증 사본: 첨부됨",
    "건강진단 상세결과: 검사 내용"
  ].join("\n");
  const analysis = analyzeWorkerResumeOcrText(source);

  for (const secret of [
    "홍길동", "900101-1234567", "1990-01-01", "010-1234-5678", "worker@example.com",
    "테스트아파트", "123-456-789012", "654321", "첨부됨", "검사 내용"
  ]) {
    assert.equal(analysis.maskedText.includes(secret), false);
  }
  assert.deepEqual(analysis.detectionCodes, [
    "account-or-card-number",
    "authentication-secret",
    "birth-date",
    "email-address",
    "full-address",
    "full-name-or-signature",
    "health-detail",
    "identity-document",
    "phone-number",
    "resident-registration-number"
  ]);
  assert.equal(analysis.blocked, true);
  assert.equal(analysis.canPersist, false);
  assert.equal(analysis.canCreateWorkerIntake, false);
  assert.equal(analysis.requiresHumanReview, true);
});

test("연락처·주소·성명만 있어도 마스킹하며 OCR 결과로 직접 접수하지 않는다", () => {
  const analysis = analyzeWorkerResumeOcrText("성명 김가상\n전화 010-2222-3333\n주소 서울시 연습로 10");

  assert.equal(analysis.blocked, false);
  assert.equal(analysis.maskedText.includes("김가상"), false);
  assert.equal(analysis.maskedText.includes("010-2222-3333"), false);
  assert.equal(analysis.maskedText.includes("연습로"), false);
  assert.equal(analysis.canCreateWorkerIntake, false);
});

test("OCR 원문·이미지·직접 식별정보 필드와 마스킹되지 않은 fixture 값을 거부한다", () => {
  for (const unsafeFixture of [
    { ...fixture, rawOcrText: "원문" },
    { ...fixture, photoData: "base64" },
    { ...fixture, extracted: { ...fixture.extracted, residentRegistrationNumber: "가상값" } }
  ]) {
    assert.throws(
      () => normalizeWorkerResumeReview(unsafeFixture),
      (error) => error instanceof WorkerResumeOcrError && error.code === "RESTRICTED_OCR_FIELD"
    );
  }

  assert.throws(
    () => normalizeWorkerResumeReview({
      ...fixture,
      extracted: { ...fixture.extracted, experienceSummary: "연락처 010-1234-5678" }
    }),
    (error) => error.code === "UNMASKED_PERSONAL_DATA"
  );
});

test("OCR 입력 타입과 최대 길이를 제한한다", () => {
  assert.throws(
    () => analyzeWorkerResumeOcrText(null),
    (error) => error.code === "INVALID_OCR_TEXT"
  );
  assert.throws(
    () => analyzeWorkerResumeOcrText("가".repeat(MAX_WORKER_RESUME_OCR_CHARACTERS + 1)),
    (error) => error.code === "OCR_TEXT_TOO_LONG"
  );
});