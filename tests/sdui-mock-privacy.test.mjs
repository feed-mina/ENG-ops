import assert from "node:assert/strict";
import test from "node:test";

import {
  MockFixtureValidationError,
  assertSyntheticMockFixture
} from "../packages/sdui-testing/index.js";

function fixture(data = {}) {
  return {
    schema: "harmony.mock.privacy-gate.v1",
    mock: true,
    warning: "합성된 연습용 Mock 자료이며 실제 개인정보가 아닙니다.",
    data
  };
}

function rejectsPrivacy(value) {
  assert.throws(
    () => assertSyntheticMockFixture(value),
    (error) => error instanceof MockFixtureValidationError
  );
}

test("안전한 집계값, 일반 문자열과 명시적인 전화번호 placeholder를 허용한다", () => {
  const safe = fixture({
    pendingRequests: 12,
    todayPlacements: 3,
    summary: "오늘 배정 현황을 보여주는 합성 자료입니다.",
    contactPlaceholder: "010-0000-XXXX",
    syntheticContact: "010-0000-0001",
    compactSyntheticContact: "01000000001",
    residentCount: 20,
    businessRegistrationNumber: "MOCK-BIZ-001",
    healthCertificateVerifiedCount: 7,
    nested: [{ region: "사당동", available: true }]
  });

  assert.deepEqual(assertSyntheticMockFixture(safe), {
    valid: true,
    schema: "harmony.mock.privacy-gate.v1"
  });
});

test("하이픈 없는 번호와 국제번호 등 실제처럼 보이는 휴대전화 형식을 차단한다", () => {
  const phones = [
    "01091242537",
    "010 9124 2537",
    "010.9124.2537",
    "+82 10 9124 2537",
    "+82-10-9124-2537",
    "0082 (0)10 9124 2537"
  ];

  for (const phone of phones) {
    rejectsPrivacy(fixture({ nested: [{ note: `연락처 ${phone}` }] }));
  }
});

test("합성 번호와 실제형 번호가 같은 문자열에 섞이면 실제형 번호를 차단한다", () => {
  rejectsPrivacy(fixture({ note: "연습 010-0000-0001, 실제형 010-9124-2537" }));
});

test("주민등록번호와 사회보장번호처럼 보이는 값을 중첩 위치에서도 차단한다", () => {
  const identifiers = [
    "900101-1234567",
    "9001011234567",
    "900101 1234567",
    "123-45-6789"
  ];

  for (const identifier of identifiers) {
    rejectsPrivacy(fixture({ rows: [{ details: { value: identifier } }] }));
  }
});

test("표기법을 바꾼 개인정보 제한 키를 객체와 배열 깊이에 관계없이 차단한다", () => {
  const restrictedKeys = [
    "residentRegistrationNumber",
    "resident_registration_number",
    "rrn",
    "SSN",
    "idCard",
    "identityDocument",
    "healthResult",
    "health_result",
    "diagnosis",
    "name",
    "emailAddress",
    "phoneNumber",
    "bankAccountNumber",
    "homeAddress",
    "주민등록번호",
    "건강검진결과",
    "성명",
    "이메일",
    "전화번호",
    "계좌번호",
    "주소"
  ];

  for (const key of restrictedKeys) {
    rejectsPrivacy(fixture({ groups: [{ records: [{ [key]: "마스킹됨" }] }] }));
  }
});

test("일반 키에 숨긴 이메일·일반전화·계좌·주소 형태도 차단한다", () => {
  const values = [
    "worker@example.com",
    "02-1234-5678",
    "031 123 4567",
    "437601-01-368775",
    "43760101368775",
    "서울특별시 동작구 남부순환로 2069",
    "사당동 1044-13"
  ];
  for (const value of values) rejectsPrivacy(fixture({ note: value }));
});
