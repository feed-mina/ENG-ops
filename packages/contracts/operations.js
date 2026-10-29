export const OPERATIONS_CONTRACT_VERSION = "mock-2026-07-16-v1";

export class ContractValidationError extends Error {
  constructor(code, message, fields = []) {
    super(message);
    this.name = "ContractValidationError";
    this.status = 400;
    this.code = code;
    this.fields = fields;
  }
}

const CHANNELS = new Set(["phone", "visit"]);
const HEALTH_STATUSES = new Set(["not-checked", "valid", "expired", "not-required"]);
const CONSENT_PURPOSES = Object.freeze(["collection-use", "restaurant-provision", "optional-information"]);
const RESTRICTED_KEY_PATTERN = /(resident|registration|rrn|idCard|identityDocument|healthDetail|diagnosis)/i;
const RESTRICTED_TEXT_PATTERN = /\b\d{6}-?\d{7}\b|주민등록번호|신분증\s*(원본|사본)|건강(진단|검진)\s*(상세|결과)/i;

function text(value, field, { max = 120, required = true } = {}) {
  const normalized = String(value ?? "").trim();
  if (required && !normalized) throw new ContractValidationError("REQUIRED_FIELD", `${field} 항목을 확인해 주세요.`, [field]);
  if (normalized.length > max) throw new ContractValidationError("FIELD_TOO_LONG", `${field} 항목이 너무 깁니다.`, [field]);
  if (RESTRICTED_TEXT_PATTERN.test(normalized)) throw new ContractValidationError("RESTRICTED_PERSONAL_DATA", "받지 않는 개인정보가 포함되어 있습니다.", [field]);
  return normalized;
}

function date(value, field, { required = true } = {}) {
  const normalized = text(value, field, { max: 10, required });
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new ContractValidationError("INVALID_DATE", `${field} 날짜를 다시 확인해 주세요.`, [field]);
  }
  return normalized;
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    throw new ContractValidationError("INVALID_NUMBER", `${field} 숫자를 다시 확인해 주세요.`, [field]);
  }
  return normalized;
}

function stringList(value, field, { min = 0, max = 20 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ContractValidationError("INVALID_LIST", `${field} 항목 수를 다시 확인해 주세요.`, [field]);
  }
  return [...new Set(value.map((item) => text(item, field, { max: 60 })))];
}

function assertAllowedKeys(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ContractValidationError("INVALID_INPUT", "접수 내용을 읽을 수 없습니다.");
  }
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  const restricted = unknown.filter((key) => RESTRICTED_KEY_PATTERN.test(key));
  if (restricted.length) throw new ContractValidationError("RESTRICTED_PERSONAL_DATA", "받지 않는 개인정보 항목이 포함되어 있습니다.", restricted);
  if (unknown.length) throw new ContractValidationError("UNKNOWN_FIELD", "정해진 접수표에 없는 항목이 포함되어 있습니다.", unknown);
}

function assertMockIdentity(id, kind) {
  const pattern = kind === "restaurant" ? /^MOCK-RESTAURANT-[A-Z0-9-]{1,30}$/ : /^MOCK-WORKER-[A-Z0-9-]{1,30}$/;
  const normalized = text(id, "id", { max: 50 });
  if (!pattern.test(normalized)) throw new ContractValidationError("MOCK_ID_REQUIRED", "Mock 전용 번호를 사용해 주세요.", ["id"]);
  return normalized;
}

function assertMockPhone(value) {
  const normalized = text(value, "phone", { max: 13 });
  if (!/^010-0000-\d{4}$/.test(normalized)) throw new ContractValidationError("MOCK_PHONE_REQUIRED", "010-0000-XXXX 형식의 가상 전화번호만 사용할 수 있습니다.", ["phone"]);
  return normalized;
}

function normalizeChannel(value) {
  const normalized = text(value, "channel", { max: 10 });
  if (!CHANNELS.has(normalized)) throw new ContractValidationError("INVALID_CHANNEL", "전화 또는 방문 접수만 선택해 주세요.", ["channel"]);
  return normalized;
}

const RESTAURANT_FIELDS = new Set([
  "id", "jobRequestId", "channel", "receivedOn", "businessName", "representativeName", "phone", "contactName",
  "businessNumber", "permitNumber", "industry", "businessAddress", "workplaceAddress", "role", "headcount",
  "workStartDate", "workEndDate", "startsAt", "endsAt", "breakMinutes", "wageAmount", "wageUnit",
  "payDate", "payMethod", "duties", "meals", "transport", "uniform", "safetyNotes", "businessVerified",
  "permitVerified", "arrearsCheck", "minimumWageVerified", "operatorNotes"
]);

export function normalizeRestaurantIntake(input, { dataMode = "mock" } = {}) {
  assertAllowedKeys(input, RESTAURANT_FIELDS);
  if (dataMode !== "mock") throw new ContractValidationError("MOCK_MODE_REQUIRED", "현재 버전은 Mock 자료만 처리합니다.");
  const startsAt = text(input.startsAt, "startsAt", { max: 5 });
  const endsAt = text(input.endsAt, "endsAt", { max: 5 });
  if (!/^\d{2}:\d{2}$/.test(startsAt) || !/^\d{2}:\d{2}$/.test(endsAt)) {
    throw new ContractValidationError("INVALID_TIME", "근무 시작·종료 시간을 다시 확인해 주세요.", ["startsAt", "endsAt"]);
  }
  const verificationBlockers = [];
  if (input.businessVerified !== true) verificationBlockers.push("business-unverified");
  if (input.permitVerified !== true) verificationBlockers.push("permit-unverified");
  if (input.arrearsCheck !== "clear") verificationBlockers.push("arrears-check-incomplete");
  if (input.minimumWageVerified !== true) verificationBlockers.push("minimum-wage-unverified");
  const workStartDate = date(input.workStartDate, "workStartDate");
  const workEndDate = date(input.workEndDate, "workEndDate");
  if (workEndDate < workStartDate) throw new ContractValidationError("INVALID_WORK_PERIOD", "근무 종료일이 시작일보다 빠릅니다.", ["workStartDate", "workEndDate"]);
  return Object.freeze({
    contractVersion: OPERATIONS_CONTRACT_VERSION,
    id: assertMockIdentity(input.id, "restaurant"),
    jobRequestId: (() => {
      const value = text(input.jobRequestId, "jobRequestId", { max: 50 });
      if (!/^MOCK-JOB-[A-Z0-9-]{1,30}$/.test(value)) throw new ContractValidationError("MOCK_ID_REQUIRED", "Mock 구인 번호를 확인해 주세요.", ["jobRequestId"]);
      return value;
    })(),
    channel: normalizeChannel(input.channel),
    receivedOn: date(input.receivedOn, "receivedOn"),
    businessName: text(input.businessName, "businessName", { max: 80 }),
    representativeName: text(input.representativeName, "representativeName", { max: 40 }),
    phone: assertMockPhone(input.phone),
    contactName: text(input.contactName, "contactName", { max: 40 }),
    businessNumber: text(input.businessNumber, "businessNumber", { max: 20 }),
    permitNumber: text(input.permitNumber, "permitNumber", { max: 30 }),
    industry: text(input.industry, "industry", { max: 50 }),
    businessAddress: text(input.businessAddress, "businessAddress", { max: 160 }),
    workplaceAddress: text(input.workplaceAddress, "workplaceAddress", { max: 160 }),
    role: text(input.role, "role", { max: 60 }),
    headcount: integer(input.headcount, "headcount", { min: 1, max: 100 }),
    workStartDate,
    workEndDate,
    startsAt,
    endsAt,
    breakMinutes: integer(input.breakMinutes, "breakMinutes", { min: 0, max: 1440 }),
    wageAmount: integer(input.wageAmount, "wageAmount", { min: 1, max: 100_000_000 }),
    wageUnit: text(input.wageUnit, "wageUnit", { max: 10 }),
    payDate: text(input.payDate, "payDate", { max: 40 }),
    payMethod: text(input.payMethod, "payMethod", { max: 40 }),
    duties: text(input.duties, "duties", { max: 500 }),
    meals: text(input.meals, "meals", { max: 80, required: false }),
    transport: text(input.transport, "transport", { max: 80, required: false }),
    uniform: text(input.uniform, "uniform", { max: 80, required: false }),
    safetyNotes: text(input.safetyNotes, "safetyNotes", { max: 300, required: false }),
    operatorNotes: text(input.operatorNotes, "operatorNotes", { max: 300, required: false }),
    verification: Object.freeze({
      businessVerified: input.businessVerified === true,
      permitVerified: input.permitVerified === true,
      arrearsCheck: text(input.arrearsCheck, "arrearsCheck", { max: 20 }),
      minimumWageVerified: input.minimumWageVerified === true,
      blockers: Object.freeze(verificationBlockers)
    })
  });
}

const WORKER_FIELDS = new Set([
  "id", "channel", "receivedOn", "displayAlias", "phone", "birthDate", "desiredRoles", "availableDates",
  "availableTime", "preferredAreas", "experience", "transport", "desiredWage", "stayQualification",
  "healthCertificateStatus", "healthCertificateCheckedOn", "healthCertificateExpiresOn", "guardianConsent",
  "emergencyContact", "consents", "operatorNotes"
]);

function normalizeConsents(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContractValidationError("CONSENT_REQUIRED", "개인정보 동의 여부를 목적별로 확인해 주세요.", ["consents"]);
  }
  const unknown = Object.keys(value).filter((key) => !CONSENT_PURPOSES.includes(key));
  if (unknown.length) throw new ContractValidationError("UNKNOWN_CONSENT", "정해진 동의 항목이 아닙니다.", unknown);
  const normalized = Object.fromEntries(CONSENT_PURPOSES.map((purpose) => [purpose, value[purpose] === true]));
  if (!normalized["collection-use"] || !normalized["restaurant-provision"]) {
    throw new ContractValidationError("REQUIRED_CONSENT_MISSING", "기본 상담과 식당 전달에 필요한 동의를 확인해 주세요.", ["consents"]);
  }
  return Object.freeze(normalized);
}

export function normalizeWorkerIntake(input, { dataMode = "mock", asOf = new Date().toISOString().slice(0, 10) } = {}) {
  assertAllowedKeys(input, WORKER_FIELDS);
  if (dataMode !== "mock") throw new ContractValidationError("MOCK_MODE_REQUIRED", "현재 버전은 Mock 자료만 처리합니다.");
  const birthDate = date(input.birthDate, "birthDate");
  const asOfDate = date(asOf, "asOf");
  const [asOfYear, asOfMonth, asOfDay] = asOfDate.split("-").map(Number);
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  let age = asOfYear - birthYear;
  if (asOfMonth < birthMonth || (asOfMonth === birthMonth && asOfDay < birthDay)) age -= 1;
  if (age < 18 && input.guardianConsent !== true) {
    throw new ContractValidationError("GUARDIAN_CONSENT_REQUIRED", "18세 미만은 친권자·후견인 취업동의를 확인해야 합니다.", ["guardianConsent"]);
  }
  const healthCertificateStatus = text(input.healthCertificateStatus, "healthCertificateStatus", { max: 20 });
  if (!HEALTH_STATUSES.has(healthCertificateStatus)) {
    throw new ContractValidationError("INVALID_HEALTH_STATUS", "보건증 확인 상태를 다시 선택해 주세요.", ["healthCertificateStatus"]);
  }
  return Object.freeze({
    contractVersion: OPERATIONS_CONTRACT_VERSION,
    id: assertMockIdentity(input.id, "worker"),
    channel: normalizeChannel(input.channel),
    receivedOn: date(input.receivedOn, "receivedOn"),
    displayAlias: text(input.displayAlias, "displayAlias", { max: 40 }),
    phone: assertMockPhone(input.phone),
    birthDate,
    desiredRoles: Object.freeze(stringList(input.desiredRoles, "desiredRoles", { min: 1, max: 10 })),
    availableDates: Object.freeze(stringList(input.availableDates, "availableDates", { min: 1, max: 31 }).map((item) => date(item, "availableDates"))),
    availableTime: text(input.availableTime, "availableTime", { max: 80 }),
    preferredAreas: Object.freeze(stringList(input.preferredAreas, "preferredAreas", { min: 1, max: 10 })),
    experience: text(input.experience, "experience", { max: 500 }),
    transport: text(input.transport, "transport", { max: 80, required: false }),
    desiredWage: integer(input.desiredWage, "desiredWage", { min: 1, max: 100_000_000 }),
    stayQualification: text(input.stayQualification, "stayQualification", { max: 60, required: false }),
    healthCertificateStatus,
    healthCertificateCheckedOn: date(input.healthCertificateCheckedOn, "healthCertificateCheckedOn", { required: false }),
    healthCertificateExpiresOn: date(input.healthCertificateExpiresOn, "healthCertificateExpiresOn", { required: false }),
    guardianConsent: input.guardianConsent === true,
    emergencyContact: text(input.emergencyContact, "emergencyContact", { max: 80, required: false }),
    consents: normalizeConsents(input.consents),
    operatorNotes: text(input.operatorNotes, "operatorNotes", { max: 300, required: false })
  });
}

export function makeWorkerConditionSummary(restaurant) {
  return Object.freeze({
    workplace: restaurant.businessName,
    workplaceAddress: restaurant.workplaceAddress,
    role: restaurant.role,
    period: `${restaurant.workStartDate} ~ ${restaurant.workEndDate}`,
    hours: `${restaurant.startsAt} ~ ${restaurant.endsAt} (휴게 ${restaurant.breakMinutes}분)`,
    wage: `${restaurant.wageAmount.toLocaleString("ko-KR")}원 / ${restaurant.wageUnit}`,
    pay: `${restaurant.payDate} · ${restaurant.payMethod}`,
    duties: restaurant.duties,
    support: [restaurant.meals, restaurant.transport, restaurant.uniform].filter(Boolean),
    safetyNotes: restaurant.safetyNotes,
    verificationBlockers: restaurant.verification.blockers
  });
}

export { CONSENT_PURPOSES };
