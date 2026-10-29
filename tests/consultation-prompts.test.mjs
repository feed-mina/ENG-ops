import assert from "node:assert/strict";
import test from "node:test";

import {
  CONSULTATION_MODES,
  MAX_CONSULTATION_TRANSCRIPT_CHARACTERS,
  SUPPORTED_CONSULTATION_MODES,
  buildConsultationTitle,
  buildConsultationPrompt,
  parseTranscriptFile,
  redactSensitiveText,
  sanitizeConsultationTranscript
} from "../packages/consultation-prompts/index.js";

test("상담 모드는 구직자와 식당 사장님 두 값으로 고정된다", () => {
  assert.deepEqual(CONSULTATION_MODES, {
    JOB_SEEKER: "job_seeker",
    RESTAURANT_OWNER: "restaurant_owner"
  });
  assert.deepEqual(SUPPORTED_CONSULTATION_MODES, ["job_seeker", "restaurant_owner"]);
  assert.equal(Object.isFrozen(CONSULTATION_MODES), true);
  assert.equal(Object.isFrozen(SUPPORTED_CONSULTATION_MODES), true);
});

test("구직자 프롬프트는 안전 경고와 고정 구직 상담 섹션을 포함한다", () => {
  const prompt = buildConsultationPrompt({
    mode: "job_seeker",
    recordDate: "2026-07-19",
    transcript: "주방 보조를 희망하고 월요일부터 금요일 오전에 일할 수 있습니다."
  });

  for (const section of [
    "[AI 초안 주의]",
    "[외부 제공자 주의]",
    "1. 상담 기본 정보",
    "2. 희망 일자리 조건",
    "3. 확인된 경력 및 자격",
    "4. 구직자 질문 및 우려",
    "5. 합의된 후속 조치",
    "6. 확인 필요 사항",
    "7. 개인정보 제거 확인",
    "8. 구직자에게 보낼 안내문 초안",
    "희망 지역(시·구 단위): 확인 필요",
    "다시 물어볼 질문: 확인 필요"
  ]) {
    assert.match(prompt, new RegExp(section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(prompt, /확인 필요/);
  assert.match(prompt, /점수화·순위화/);
  assert.match(prompt, /채용 또는 거절 여부를 판단하지 마세요/);
  assert.match(prompt, /상담 날짜: 2026-07-19/);
  assert.match(prompt, /기록 제목: 2026-07-19 구직자 상담/);
});

test("식당 사장님 프롬프트는 구인·근무조건·운영지원 섹션을 포함한다", () => {
  const prompt = buildConsultationPrompt({
    mode: "restaurant_owner",
    recordDate: "2026-07-19",
    transcript: "홀 서빙 한 명이 필요하고 다음 주부터 저녁 근무를 요청했습니다."
  });

  for (const section of [
    "상담 유형: 식당 사장님 구인 상담",
    "2. 구인 요청",
    "3. 제시된 근무 조건",
    "4. 객관적으로 필요한 경력 및 자격",
    "5. 운영 지원 요청",
    "6. 약속 및 후속 조치",
    "8. 개인정보 제거 확인",
    "9. 사장님에게 보낼 확인 메시지 초안",
    "지급일·지급방법: 확인 필요",
    "최저임금·사업장 조건 별도 확인 항목: 확인 필요"
  ]) {
    assert.ok(prompt.includes(section));
  }
});

test("VTT의 헤더·시간·화자 태그를 제거하고 발화만 남긴다", () => {
  const source = `WEBVTT

NOTE 자동 생성 자막
이 줄도 메타데이터입니다.

cue-1
00:00:01.000 --> 00:00:03.000 align:start
<v 구직자>안녕하세요.</v>

00:00:04.000 --> 00:00:06.000
오전 근무를 원합니다.`;

  assert.equal(parseTranscriptFile(source, "상담.VTT"), "안녕하세요.\n\n오전 근무를 원합니다.");
});

test("SRT의 순번과 시간을 제거하고 자막 본문을 유지한다", () => {
  const source = `1
00:00:01,000 --> 00:00:02,500
설거지 업무를 구합니다.

2
00:00:03,000 --> 00:00:05,000
주 3일 가능합니다.`;

  assert.equal(parseTranscriptFile(source, "restaurant-call.srt"), "설거지 업무를 구합니다.\n\n주 3일 가능합니다.");
  assert.equal(parseTranscriptFile("첫 줄\n둘째 줄", "memo.txt"), "첫 줄\n둘째 줄");
});

test("명백한 주민번호·전화·이메일·계좌·카드·인증정보를 마스킹한다", () => {
  const source = [
    "주민번호 900101-1234567",
    "전화 010-1234-5678",
    "이메일 worker@example.com",
    "계좌 123-456-789012",
    "카드 1234 5678 9012 3456",
    "OTP: 654321",
    "비밀번호: s3cret!"
  ].join("\n");
  const redacted = redactSensitiveText(source);

  for (const secret of [
    "900101-1234567",
    "010-1234-5678",
    "worker@example.com",
    "123-456-789012",
    "1234 5678 9012 3456",
    "654321",
    "s3cret!"
  ]) {
    assert.equal(redacted.includes(secret), false);
  }
  for (const marker of [
    "[주민등록번호 삭제]",
    "[전화번호 삭제]",
    "[이메일 삭제]",
    "[계좌·카드번호 삭제]",
    "[인증정보 삭제]"
  ]) {
    assert.ok(redacted.includes(marker));
  }
});

test("이름·주소·생년월일·건강·가족 정보는 자동 마스킹 범위가 아니므로 사람 검토 대상으로 남긴다", () => {
  const manualReviewText = "홍길동은 1990년 1월 1일생이고 서울시 테스트로 12에 살며 가족과 건강 이야기를 했습니다.";
  assert.equal(redactSensitiveText(manualReviewText), manualReviewText);
});

test("프롬프트에는 자막 제어문자와 원래 개인정보가 들어가지 않는다", () => {
  const source = `WEBVTT

00:00:00.000 --> 00:00:02.000
연락처는 010-9876-5432입니다.`;
  const sanitized = sanitizeConsultationTranscript(source);
  const prompt = buildConsultationPrompt({ mode: "job_seeker", recordDate: "2026-07-19", transcript: source });

  assert.equal(sanitized, "연락처는 [전화번호 삭제]입니다.");
  assert.equal(prompt.includes("WEBVTT"), false);
  assert.equal(prompt.includes("00:00:00.000"), false);
  assert.equal(prompt.includes("010-9876-5432"), false);
  assert.ok(prompt.includes("[전화번호 삭제]"));
});

test("날짜와 선택 제목으로 엄마 업무 기록 제목을 고정한다", () => {
  assert.equal(
    buildConsultationTitle({ mode: "job_seeker", recordDate: "2026-07-19" }),
    "2026-07-19 구직자 상담"
  );
  assert.equal(
    buildConsultationTitle({ mode: "restaurant_owner", recordDate: "2026-07-19", title: "  저녁  홀   구인  " }),
    "저녁 홀 구인"
  );
  assert.throws(
    () => buildConsultationTitle({ mode: "job_seeker", recordDate: "19-07-2026" }),
    (error) => error.code === "INVALID_RECORD_DATE"
  );
});

test("빈 원문, 잘못된 원문 타입과 지원하지 않는 모드를 거부한다", () => {
  assert.throws(
    () => buildConsultationPrompt({ mode: "job_seeker", transcript: "  \n  " }),
    (error) => error.code === "EMPTY_TRANSCRIPT"
  );
  assert.throws(
    () => buildConsultationPrompt({ mode: "candidate_score", transcript: "상담 내용" }),
    (error) => error.code === "UNSUPPORTED_MODE"
  );
  assert.throws(
    () => buildConsultationPrompt({ mode: "restaurant_owner", transcript: null }),
    (error) => error.code === "INVALID_TRANSCRIPT"
  );
  assert.throws(
    () => parseTranscriptFile("상담 내용", "recording.docx"),
    (error) => error.code === "UNSUPPORTED_TRANSCRIPT_FORMAT"
  );
  assert.throws(
    () => buildConsultationPrompt({
      mode: "job_seeker",
      transcript: "가".repeat(MAX_CONSULTATION_TRANSCRIPT_CHARACTERS + 1)
    }),
    (error) => error.code === "TRANSCRIPT_TOO_LONG"
  );
});
