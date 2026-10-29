export const BUSINESS_EVIDENCE_OCR_SCHEMA_VERSION = "harmony.business-evidence-ocr-review.v1";
export const BUSINESS_EVIDENCE_REGISTER_SCHEMA_VERSION = "harmony.business-evidence-register.v1";
export const MAX_BUSINESS_EVIDENCE_OCR_CHARACTERS = 30_000;

const DOCUMENT_TYPES = new Set([
  "business-registration",
  "employment-agency-registration",
  "mutual-aid-certificate"
]);
const VERIFICATION_STATUSES = new Set(["mock-only", "pending-original-review", "verified-by-human", "expired"]);
const REFERENCE_TYPES = new Set(["minimum-wage-guide", "fee-notice", "ethics-code"]);
const REFERENCE_STATUSES = new Set(["unverified-reference", "pending-official-verification", "verified-official-source"]);
const OBSERVED_FIELD_TYPES = new Set([
  "business-name", "business-registration-number", "business-type", "business-item", "opening-date",
  "representative-name", "representative-birth-date", "detailed-address", "agency-registration-number",
  "mutual-aid-number", "issued-on", "expires-on", "insured-amount", "issuer", "official-seal"
]);
const DETECTION_CODES = new Set([
  "agency-registration-number", "business-name", "business-registration-number", "detailed-address", "email-address",
  "mutual-aid-number", "person-birth-date", "person-name", "phone-number", "resident-registration-number"
]);
const BLOCKING_DETECTION_CODES = new Set([
  "agency-registration-number", "business-registration-number", "mutual-aid-number", "resident-registration-number"
]);
const RESTRICTED_KEY_PATTERN = /(?:raw|original|source).*(?:ocr|text|image)|resident|rrn|ssn|representative(?:Name|Birth)|registrationNumber|mutualAidNumber|address|phone|email|signature|sealImage/i;
const RAW_RESIDENT_NUMBER = /(?<!\d)\d{6}\s*[-. ]?\s*[1-8]\d{6}(?!\d)/g;
const RAW_BUSINESS_NUMBER = /(?<!\d)\d{3}\s*[-. ]\s*\d{2}\s*[-. ]\s*\d{5}(?!\d)/g;
const RAW_PHONE_NUMBER = /(?<!\d)(?:(?:\+82|0082)[\s()./-]*(?:0[\s()./-]*)?10|0\d{1,2})(?:[\s()./-]*\d){7,8}(?!\d)/g;
const RAW_EMAIL_ADDRESS = /(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])/giu;

export const BUSINESS_EVIDENCE_TO_RESTAURANT_FIELD_MAP = Object.freeze({
  businessNameAlias: Object.freeze({ target: "businessName", handling: "human-confirm" }),
  businessType: Object.freeze({ target: "industry", handling: "human-confirm" }),
  businessItem: Object.freeze({ target: "industry", handling: "human-confirm" }),
  openedOn: Object.freeze({ target: null, handling: "reference-only" }),
  maskedRegistrationNumber: Object.freeze({ target: null, handling: "re-enter-after-human-review" }),
  maskedAddress: Object.freeze({ target: null, handling: "re-enter-after-human-review" })
});

export class BusinessEvidenceOcrError extends Error {
  constructor(code, message, fields = []) {
    super(message);
    this.name = "BusinessEvidenceOcrError";
    this.code = code;
    this.fields = fields;
  }
}

function assertObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BusinessEvidenceOcrError("INVALID_OBJECT", `${field} 항목을 읽을 수 없습니다.`, [field]);
  }
}

function assertAllowedKeys(value, allowed, field) {
  assertObject(value, field);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const restricted = unknown.filter((key) => RESTRICTED_KEY_PATTERN.test(key));
  if (restricted.length) {
    throw new BusinessEvidenceOcrError("RESTRICTED_OCR_FIELD", "OCR 원문·이미지 또는 직접 식별정보 필드는 저장할 수 없습니다.", restricted);
  }
  if (unknown.length) throw new BusinessEvidenceOcrError("UNKNOWN_FIELD", `${field}에 정의되지 않은 항목이 있습니다.`, unknown);
}

function text(value, field, { max = 300, required = true } = {}) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (required && !normalized) throw new BusinessEvidenceOcrError("REQUIRED_FIELD", `${field} 항목이 필요합니다.`, [field]);
  if (normalized.length > max) throw new BusinessEvidenceOcrError("FIELD_TOO_LONG", `${field} 항목이 너무 깁니다.`, [field]);
  const containsRawValue = [RAW_RESIDENT_NUMBER, RAW_BUSINESS_NUMBER, RAW_PHONE_NUMBER, RAW_EMAIL_ADDRESS].some((pattern) => {
    pattern.lastIndex = 0;
    const matched = pattern.test(normalized);
    pattern.lastIndex = 0;
    return matched;
  });
  if (containsRawValue) throw new BusinessEvidenceOcrError("UNMASKED_PERSONAL_DATA", `${field}에 마스킹되지 않은 식별정보가 있습니다.`, [field]);
  return normalized;
}

function isoDate(value, field, { required = true } = {}) {
  const normalized = text(value, field, { max: 10, required });
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new BusinessEvidenceOcrError("INVALID_DATE", `${field} 날짜를 확인해 주세요.`, [field]);
  }
  return normalized;
}

function enumValue(value, field, allowed) {
  const normalized = text(value, field, { max: 60 });
  if (!allowed.has(normalized)) throw new BusinessEvidenceOcrError("INVALID_ENUM", `${field} 값을 확인해 주세요.`, [field]);
  return normalized;
}

function textList(value, field, { max = 20, allowed } = {}) {
  if (!Array.isArray(value) || value.length > max) throw new BusinessEvidenceOcrError("INVALID_LIST", `${field} 항목 수를 확인해 주세요.`, [field]);
  const normalized = [...new Set(value.map((item) => text(item, field, { max: 100 })))];
  if (allowed && normalized.some((item) => !allowed.has(item))) {
    throw new BusinessEvidenceOcrError("INVALID_ENUM", `${field}에 허용되지 않은 값이 있습니다.`, [field]);
  }
  return Object.freeze(normalized);
}

const REDACTION_RULES = Object.freeze([
  Object.freeze({ code: "resident-registration-number", pattern: RAW_RESIDENT_NUMBER, replacement: "[주민등록번호 삭제]" }),
  Object.freeze({ code: "business-registration-number", pattern: RAW_BUSINESS_NUMBER, replacement: "[사업자등록번호 삭제]" }),
  Object.freeze({ code: "email-address", pattern: RAW_EMAIL_ADDRESS, replacement: "[이메일 삭제]" }),
  Object.freeze({ code: "phone-number", pattern: RAW_PHONE_NUMBER, replacement: "[전화번호 삭제]" }),
  Object.freeze({
    code: "agency-registration-number",
    pattern: /((?:직업소개사업\s*(?:등록|신고)?번호|등록번호)\s*[:：]?\s*)[A-Z0-9가-힣][A-Z0-9가-힣 ./-]{3,40}/giu,
    replacement: "[직업소개사업 등록번호 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "mutual-aid-number",
    pattern: /((?:공제번호|증권번호|계약번호)\s*[:：]?\s*)[A-Z0-9가-힣][A-Z0-9가-힣 ./-]{3,40}/giu,
    replacement: "[공제 식별번호 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "person-birth-date",
    pattern: /((?:대표자\s*)?(?:생년월일|생년|출생일)\s*[:：]?\s*)(?:\d{2,4}(?:[./-]|\s*년\s*)\d{1,2}(?:[./-]|\s*월\s*)\d{1,2}(?:\s*일)?)/gu,
    replacement: "[생년월일 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "person-name",
    pattern: /((?:대표자|성\s*명|성명|계약자|피공제자|확인자)\s*[:：]?\s*)[가-힣]{2,5}(?=\s|$|[,，.;；])/gmu,
    replacement: "[성명 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "business-name",
    pattern: /((?:상\s*호|사업체명|직업소개소\s*명칭|사업체\s*명칭)\s*[:：]?\s*)[^\n]{2,80}/gu,
    replacement: "[상호 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "detailed-address",
    pattern: /((?:사업장\s*소재지|사무소\s*소재지|소재지|주\s*소|주소)\s*[:：]?\s*)[^\n]{4,180}/gu,
    replacement: "[상세주소 삭제]",
    preservePrefix: true
  })
]);

export function analyzeBusinessEvidenceOcrText(source) {
  if (typeof source !== "string") throw new BusinessEvidenceOcrError("INVALID_OCR_TEXT", "OCR 입력은 문자열이어야 합니다.");
  if (source.length > MAX_BUSINESS_EVIDENCE_OCR_CHARACTERS) {
    throw new BusinessEvidenceOcrError("OCR_TEXT_TOO_LONG", `OCR 입력은 ${MAX_BUSINESS_EVIDENCE_OCR_CHARACTERS.toLocaleString("ko-KR")}자 이하여야 합니다.`);
  }

  let maskedText = source
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "");
  const detections = new Set();

  for (const rule of REDACTION_RULES) {
    maskedText = maskedText.replace(rule.pattern, (...matchArguments) => {
      detections.add(rule.code);
      const prefix = rule.preservePrefix ? matchArguments[1] : "";
      return `${prefix}${rule.replacement}`;
    });
  }

  const detectionCodes = Object.freeze([...detections].sort());
  return Object.freeze({
    schemaVersion: BUSINESS_EVIDENCE_OCR_SCHEMA_VERSION,
    maskedText: maskedText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    detectionCodes,
    blocked: detectionCodes.some((code) => BLOCKING_DETECTION_CODES.has(code)),
    canPersist: false,
    canCreateRestaurant: false,
    canVerifyRestaurant: false,
    requiresHumanReview: true
  });
}

const REVIEW_FIELDS = new Set([
  "mock", "warning", "schemaVersion", "documentType", "source", "reviewStatus", "capturedOn",
  "observedFieldTypes", "extracted", "detections", "policy"
]);
const EXTRACTED_FIELDS = new Set([
  "caseId", "businessNameAlias", "businessType", "businessItem", "openedOn",
  "maskedRegistrationNumber", "maskedAddress", "reviewNotes"
]);
const REVIEW_POLICY_FIELDS = new Set([
  "rawTextPersisted", "imagePersisted", "directRestaurantCreation", "automaticVerification", "humanReviewRequired"
]);

export function normalizeBusinessEvidenceOcrReview(input, { dataMode = "mock" } = {}) {
  assertAllowedKeys(input, REVIEW_FIELDS, "ocrReview");
  if (dataMode !== "mock" || input.mock !== true) throw new BusinessEvidenceOcrError("MOCK_MODE_REQUIRED", "합성 Mock 증빙만 검증할 수 있습니다.");
  const warning = text(input.warning, "warning", { max: 220 });
  if (!/(?:합성|연습|Mock)/i.test(warning)) throw new BusinessEvidenceOcrError("MOCK_WARNING_REQUIRED", "합성 자료 경고가 필요합니다.", ["warning"]);
  if (input.schemaVersion !== BUSINESS_EVIDENCE_OCR_SCHEMA_VERSION) throw new BusinessEvidenceOcrError("SCHEMA_VERSION_MISMATCH", "사업자 증빙 OCR 계약 버전이 다릅니다.", ["schemaVersion"]);
  const documentType = enumValue(input.documentType, "documentType", DOCUMENT_TYPES);
  if (input.source !== "synthetic-ocr" || input.reviewStatus !== "pending-human-review") {
    throw new BusinessEvidenceOcrError("INVALID_REVIEW_BOUNDARY", "합성 OCR·사람 검토 대기 경계를 유지해야 합니다.");
  }

  assertAllowedKeys(input.extracted, EXTRACTED_FIELDS, "extracted");
  const businessNameAlias = text(input.extracted.businessNameAlias, "businessNameAlias", { max: 80 });
  if (!/(?:합성|가명|Mock)/i.test(businessNameAlias)) throw new BusinessEvidenceOcrError("SYNTHETIC_ALIAS_REQUIRED", "실제 상호가 아닌 합성 별칭을 사용해야 합니다.", ["businessNameAlias"]);
  const maskedRegistrationNumber = text(input.extracted.maskedRegistrationNumber, "maskedRegistrationNumber", { max: 40 });
  if (!/^\*{3}-\*{2}-\*{5}$/.test(maskedRegistrationNumber)) {
    throw new BusinessEvidenceOcrError("MASKED_REGISTRATION_NUMBER_REQUIRED", "등록번호는 ***-**-***** 형식으로 완전히 마스킹해야 합니다.", ["maskedRegistrationNumber"]);
  }
  const maskedAddress = text(input.extracted.maskedAddress, "maskedAddress", { max: 80 });
  if (maskedAddress !== "[상세주소 삭제]") throw new BusinessEvidenceOcrError("MASKED_ADDRESS_REQUIRED", "상세주소는 보존하지 않습니다.", ["maskedAddress"]);

  assertAllowedKeys(input.policy, REVIEW_POLICY_FIELDS, "policy");
  if (input.policy.rawTextPersisted !== false || input.policy.imagePersisted !== false || input.policy.directRestaurantCreation !== false || input.policy.automaticVerification !== false || input.policy.humanReviewRequired !== true) {
    throw new BusinessEvidenceOcrError("UNSAFE_OCR_POLICY", "원문·이미지 저장과 자동 식당 생성·검증을 금지하고 사람 검토를 필수로 해야 합니다.", ["policy"]);
  }

  return Object.freeze({
    mock: true,
    warning,
    schemaVersion: BUSINESS_EVIDENCE_OCR_SCHEMA_VERSION,
    documentType,
    source: "synthetic-ocr",
    reviewStatus: "pending-human-review",
    capturedOn: isoDate(input.capturedOn, "capturedOn"),
    observedFieldTypes: textList(input.observedFieldTypes, "observedFieldTypes", { max: 20, allowed: OBSERVED_FIELD_TYPES }),
    extracted: Object.freeze({
      caseId: text(input.extracted.caseId, "caseId", { max: 50 }),
      businessNameAlias,
      businessType: text(input.extracted.businessType, "businessType", { max: 80 }),
      businessItem: text(input.extracted.businessItem, "businessItem", { max: 120 }),
      openedOn: isoDate(input.extracted.openedOn, "openedOn"),
      maskedRegistrationNumber,
      maskedAddress,
      reviewNotes: text(input.extracted.reviewNotes, "reviewNotes", { max: 300 })
    }),
    detections: textList(input.detections, "detections", { max: 20, allowed: DETECTION_CODES }),
    policy: Object.freeze({ ...input.policy })
  });
}

const REGISTER_FIELDS = new Set(["mock", "warning", "schemaVersion", "evidence", "references"]);
const EVIDENCE_FIELDS = new Set([
  "id", "documentType", "verificationStatus", "issuedOn", "expiresOn", "verifiedBy", "sourceRecord", "notes"
]);
const REFERENCE_FIELDS = new Set([
  "id", "referenceType", "reviewStatus", "sourceLabel", "officialIdentifier", "effectiveOn",
  "checkedOn", "summaryPrinciples", "notes"
]);

export function normalizeBusinessEvidenceRegister(input, { dataMode = "mock" } = {}) {
  assertAllowedKeys(input, REGISTER_FIELDS, "evidenceRegister");
  if (dataMode !== "mock" || input.mock !== true) throw new BusinessEvidenceOcrError("MOCK_MODE_REQUIRED", "합성 Mock 증빙대장만 검증할 수 있습니다.");
  const warning = text(input.warning, "warning", { max: 220 });
  if (!/(?:합성|연습|Mock)/i.test(warning)) throw new BusinessEvidenceOcrError("MOCK_WARNING_REQUIRED", "합성 자료 경고가 필요합니다.", ["warning"]);
  if (input.schemaVersion !== BUSINESS_EVIDENCE_REGISTER_SCHEMA_VERSION) throw new BusinessEvidenceOcrError("SCHEMA_VERSION_MISMATCH", "사업자 증빙대장 계약 버전이 다릅니다.", ["schemaVersion"]);
  if (!Array.isArray(input.evidence) || !input.evidence.length || input.evidence.length > 20) {
    throw new BusinessEvidenceOcrError("INVALID_LIST", "evidence 항목 수를 확인해 주세요.", ["evidence"]);
  }
  if (!Array.isArray(input.references) || input.references.length > 20) {
    throw new BusinessEvidenceOcrError("INVALID_LIST", "references 항목 수를 확인해 주세요.", ["references"]);
  }

  const evidence = input.evidence.map((item, index) => {
    assertAllowedKeys(item, EVIDENCE_FIELDS, `evidence.${index}`);
    const issuedOn = isoDate(item.issuedOn, `evidence.${index}.issuedOn`);
    const expiresOn = isoDate(item.expiresOn, `evidence.${index}.expiresOn`, { required: false });
    if (expiresOn && expiresOn < issuedOn) throw new BusinessEvidenceOcrError("INVALID_DATE_RANGE", "만료일이 발급일보다 빠릅니다.", [`evidence.${index}.expiresOn`]);
    return Object.freeze({
      id: text(item.id, `evidence.${index}.id`, { max: 50 }),
      documentType: enumValue(item.documentType, `evidence.${index}.documentType`, DOCUMENT_TYPES),
      verificationStatus: enumValue(item.verificationStatus, `evidence.${index}.verificationStatus`, VERIFICATION_STATUSES),
      issuedOn,
      expiresOn,
      verifiedBy: text(item.verifiedBy, `evidence.${index}.verifiedBy`, { max: 60 }),
      sourceRecord: text(item.sourceRecord, `evidence.${index}.sourceRecord`, { max: 100 }),
      notes: text(item.notes, `evidence.${index}.notes`, { max: 240 })
    });
  });

  const references = input.references.map((item, index) => {
    assertAllowedKeys(item, REFERENCE_FIELDS, `references.${index}`);
    const referenceType = enumValue(item.referenceType, `references.${index}.referenceType`, REFERENCE_TYPES);
    const reviewStatus = enumValue(item.reviewStatus, `references.${index}.reviewStatus`, REFERENCE_STATUSES);
    const officialIdentifier = text(item.officialIdentifier, `references.${index}.officialIdentifier`, { max: 120, required: false });
    const effectiveOn = isoDate(item.effectiveOn, `references.${index}.effectiveOn`, { required: false });
    const checkedOn = isoDate(item.checkedOn, `references.${index}.checkedOn`);
    if (referenceType !== "ethics-code" && reviewStatus !== "verified-official-source" && (officialIdentifier || effectiveOn)) {
      throw new BusinessEvidenceOcrError("UNVERIFIED_OFFICIAL_METADATA", "공식 원문 확인 전에는 고시 번호나 시행일을 확정할 수 없습니다.", [`references.${index}`]);
    }
    const summaryPrinciples = textList(item.summaryPrinciples, `references.${index}.summaryPrinciples`, { max: 10 });
    if (referenceType === "ethics-code") {
      const expected = ["법령 준수", "권익 보호", "교육", "공정성", "자율시정"];
      if (expected.some((principle) => !summaryPrinciples.includes(principle))) {
        throw new BusinessEvidenceOcrError("ETHICS_SUMMARY_REQUIRED", "행동강령은 승인된 원칙 요약만 기록합니다.", [`references.${index}.summaryPrinciples`]);
      }
    }
    return Object.freeze({
      id: text(item.id, `references.${index}.id`, { max: 50 }),
      referenceType,
      reviewStatus,
      sourceLabel: text(item.sourceLabel, `references.${index}.sourceLabel`, { max: 120 }),
      officialIdentifier,
      effectiveOn,
      checkedOn,
      summaryPrinciples,
      notes: text(item.notes, `references.${index}.notes`, { max: 300 })
    });
  });

  return Object.freeze({
    mock: true,
    warning,
    schemaVersion: BUSINESS_EVIDENCE_REGISTER_SCHEMA_VERSION,
    evidence: Object.freeze(evidence),
    references: Object.freeze(references)
  });
}