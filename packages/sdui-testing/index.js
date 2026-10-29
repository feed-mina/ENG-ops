const RESTRICTED_KEY = /^(?:resident(?:registration(?:number|no)?|number|no)|rrn|ssn|socialsecurity(?:number)?|idcard|identitydocument|identitynumber|nationalid|healthdetail|healthresult|medicalrecord|diagnosis|name|fullname|personname|workername|contactname|email|emailaddress|phone|phonenumber|telephone|mobile|mobilephone|account|accountnumber|bankaccount|bankaccountnumber|address|homeaddress|streetaddress|postaladdress|주민등록번호|주민번호|신분증(?:원본)?|건강검진(?:상세)?결과|건강상세결과|진단(?:명|결과)|성명|이름|담당자명|이메일|전자우편|전화|전화번호|휴대전화|핸드폰|계좌|계좌번호|은행계좌|주소|거주지|상세주소)$/i;
const RESIDENT_NUMBER = /(?:^|[^\d])\d{6}[\s.\-‐‑‒–—]*\d{7}(?!\d)/u;
const SOCIAL_SECURITY_NUMBER = /(?:^|[^\d])\d{3}[\s-]+\d{2}[\s-]+\d{4}(?!\d)/u;
const MOCK_KOREAN_MOBILE_PHONE = /(^|[^\d])010[\s().\/-]*0000[\s().\/-]*\d{4}(?!\d)/gu;
const KOREAN_MOBILE_PHONE = /(?:^|[^\d])(?:(?:(?:\+82|0082)[\s().\/-]*(?:0[\s().\/-]*)?10)|010)(?:[\s().\/-]*\d){8}(?!\d)/u;
const EMAIL_ADDRESS = /(?:^|[^A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.-])/u;
const KOREAN_LANDLINE_PHONE = /(?:^|[^\d])(?:0(?:2|[3-6][1-5]|70))(?:[\s().\/-]*\d){7,8}(?!\d)/u;
const BANK_ACCOUNT_NUMBER = /(?:^|[^\d])(?:\d[\s-]*){10,14}(?!\d)/u;
const KOREAN_ADDRESS = /(?:[가-힣]{1,20}(?:로|길)\s*\d{1,5}|[가-힣]{1,20}(?:동|읍|면)\s*\d{1,5}(?:-\d{1,5})?)/u;

function normalizeKey(key) {
  return key.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function isRestrictedKey(key) {
  return RESTRICTED_KEY.test(normalizeKey(key));
}

export class MockFixtureValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "MockFixtureValidationError";
    this.path = path;
  }
}

function walk(value, path, seen) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    const normalized = value.normalize("NFKC");
    if (RESIDENT_NUMBER.test(normalized) || SOCIAL_SECURITY_NUMBER.test(normalized)) {
      throw new MockFixtureValidationError(path, "주민등록번호나 사회보장번호 형태의 값은 Mock fixture에 넣을 수 없습니다.");
    }
    const withoutSyntheticPhones = normalized.replace(MOCK_KOREAN_MOBILE_PHONE, "$1[MOCK_PHONE]");
    if (KOREAN_MOBILE_PHONE.test(withoutSyntheticPhones)) {
      throw new MockFixtureValidationError(path, "010-0000-XXXX 형식이 아닌 전화번호는 Mock fixture에 넣을 수 없습니다.");
    }
    if (EMAIL_ADDRESS.test(normalized)) throw new MockFixtureValidationError(path, "이메일 주소는 Mock fixture에 넣을 수 없습니다.");
    if (KOREAN_LANDLINE_PHONE.test(normalized)) throw new MockFixtureValidationError(path, "실제 일반전화 형태는 Mock fixture에 넣을 수 없습니다.");
    if (BANK_ACCOUNT_NUMBER.test(withoutSyntheticPhones)) throw new MockFixtureValidationError(path, "실제 계좌번호 형태는 Mock fixture에 넣을 수 없습니다.");
    if (KOREAN_ADDRESS.test(normalized)) throw new MockFixtureValidationError(path, "실제 주소 형태는 Mock fixture에 넣을 수 없습니다.");
    return;
  }
  if (typeof value !== "object") throw new MockFixtureValidationError(path, "JSON 값만 허용됩니다.");
  if (seen.has(value)) throw new MockFixtureValidationError(path, "순환 구조는 허용되지 않습니다.");
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (isRestrictedKey(key)) throw new MockFixtureValidationError(`${path}.${key}`, "제한된 개인정보 필드입니다.");
      walk(child, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function assertSyntheticMockFixture(fixture) {
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new MockFixtureValidationError("$", "fixture는 객체여야 합니다.");
  }
  if (fixture.mock !== true) throw new MockFixtureValidationError("$.mock", "Mock fixture에는 mock: true가 필요합니다.");
  if (typeof fixture.warning !== "string" || !/(합성|연습|Mock)/i.test(fixture.warning)) {
    throw new MockFixtureValidationError("$.warning", "합성·연습용 자료라는 경고가 필요합니다.");
  }
  walk(fixture, "$", new Set());
  return Object.freeze({ valid: true, schema: fixture.schema ?? null });
}
