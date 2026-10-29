export const WORKER_RESUME_OCR_SCHEMA_VERSION = "harmony.worker-resume-ocr-review.v1";
export const MAX_WORKER_RESUME_OCR_CHARACTERS = 30_000;

const REVIEW_STATUS = "pending-human-review";
const DOCUMENT_TYPE = "worker-resume";
const SOURCE_TYPE = "synthetic-ocr";
const DETECTION_CODES = new Set([
  "account-or-card-number", "authentication-secret", "birth-date", "email-address", "face-photo",
  "full-address", "full-name-or-signature", "health-detail", "identity-document", "phone-number",
  "resident-registration-number"
]);
const BLOCKING_DETECTION_CODES = new Set([
  "account-or-card-number", "authentication-secret", "health-detail", "identity-document",
  "resident-registration-number"
]);
const OBSERVED_FIELD_TYPES = new Set([
  "photo", "name", "resident-number", "phone", "address", "education", "work-history",
  "qualification", "award", "signature"
]);
const RESTRICTED_KEY_PATTERN = /(?:raw|original|source).*(?:ocr|text|image)|resident|registration|rrn|ssn|photo|signature|address|phone|email|account|card|healthDetail|diagnosis/i;
const RAW_RESIDENT_NUMBER = /(?<!\d)\d{6}\s*[-. ]?\s*[1-8]\d{6}(?!\d)/g;
const RAW_PHONE_NUMBER = /(?<!\d)(?:(?:\+82|0082)[\s()./-]*(?:0[\s()./-]*)?10|0\d{1,2})(?:[\s()./-]*\d){7,8}(?!\d)/g;
const RAW_EMAIL_ADDRESS = /(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])/giu;
const RAW_LONG_NUMBER = /(?<!\d)(?:\d[\s-]*){10,16}(?!\d)/g;

export const WORKER_RESUME_TO_INTAKE_FIELD_MAP = Object.freeze({
  displayAlias: Object.freeze({ target: "displayAlias", handling: "human-confirm" }),
  contactMask: Object.freeze({ target: null, handling: "re-enter-after-consent" }),
  desiredRoles: Object.freeze({ target: "desiredRoles", handling: "human-confirm" }),
  experienceSummary: Object.freeze({ target: "experience", handling: "human-merge" }),
  workHistory: Object.freeze({ target: "experience", handling: "human-merge" }),
  qualifications: Object.freeze({ target: "experience", handling: "human-merge" }),
  educationSummary: Object.freeze({ target: null, handling: "not-collected" }),
  awardSummary: Object.freeze({ target: null, handling: "not-collected" })
});

export class WorkerResumeOcrError extends Error {
  constructor(code, message, fields = []) {
    super(message);
    this.name = "WorkerResumeOcrError";
    this.code = code;
    this.fields = fields;
  }
}

function assertObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkerResumeOcrError("INVALID_OBJECT", `${field} 항목을 읽을 수 없습니다.`, [field]);
  }
}

function assertAllowedKeys(value, allowed, field) {
  assertObject(value, field);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  const restricted = unknown.filter((key) => RESTRICTED_KEY_PATTERN.test(key));
  if (restricted.length) {
    throw new WorkerResumeOcrError("RESTRICTED_OCR_FIELD", "OCR 원문·이미지 또는 직접 식별정보 필드는 저장할 수 없습니다.", restricted);
  }
  if (unknown.length) throw new WorkerResumeOcrError("UNKNOWN_FIELD", `${field}에 정의되지 않은 항목이 있습니다.`, unknown);
}

function text(value, field, { max = 500, required = true } = {}) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (required && !normalized) throw new WorkerResumeOcrError("REQUIRED_FIELD", `${field} 항목이 필요합니다.`, [field]);
  if (normalized.length > max) throw new WorkerResumeOcrError("FIELD_TOO_LONG", `${field} 항목이 너무 깁니다.`, [field]);
  const containsRawValue = [RAW_RESIDENT_NUMBER, RAW_PHONE_NUMBER, RAW_EMAIL_ADDRESS, RAW_LONG_NUMBER].some((pattern) => {
    pattern.lastIndex = 0;
    const matched = pattern.test(normalized);
    pattern.lastIndex = 0;
    return matched;
  });
  if (containsRawValue) {
    throw new WorkerResumeOcrError("UNMASKED_PERSONAL_DATA", `${field}에 마스킹되지 않은 개인정보가 있습니다.`, [field]);
  }
  return normalized;
}

function textList(value, field, { max = 20, allowed } = {}) {
  if (!Array.isArray(value) || value.length > max) {
    throw new WorkerResumeOcrError("INVALID_LIST", `${field} 항목 수를 확인해 주세요.`, [field]);
  }
  const normalized = [...new Set(value.map((item) => text(item, field, { max: 80 })))];
  if (allowed) {
    const unknown = normalized.filter((item) => !allowed.has(item));
    if (unknown.length) throw new WorkerResumeOcrError("INVALID_ENUM", `${field}에 허용되지 않은 값이 있습니다.`, [field]);
  }
  return Object.freeze(normalized);
}

function isoDate(value, field) {
  const normalized = text(value, field, { max: 10 });
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new WorkerResumeOcrError("INVALID_DATE", `${field} 날짜를 확인해 주세요.`, [field]);
  }
  return normalized;
}

const REDACTION_RULES = Object.freeze([
  Object.freeze({
    code: "authentication-secret",
    blocking: true,
    pattern: /(?:일회용\s*비밀번호|비밀번호|패스워드|인증번호|보안코드|OTP|password|passcode|PIN)\s*(?:(?:은|는)\s*)?(?:[:：=]\s*)?["']?[^\s,，.;；\n"']{4,}["']?/giu,
    replacement: "[인증정보 삭제]"
  }),
  Object.freeze({ code: "resident-registration-number", blocking: true, pattern: RAW_RESIDENT_NUMBER, replacement: "[주민등록번호 삭제]" }),
  Object.freeze({ code: "email-address", blocking: false, pattern: RAW_EMAIL_ADDRESS, replacement: "[이메일 삭제]" }),
  Object.freeze({ code: "phone-number", blocking: false, pattern: RAW_PHONE_NUMBER, replacement: "[전화번호 삭제]" }),
  Object.freeze({
    code: "birth-date",
    blocking: false,
    pattern: /((?:생년월일|생년|출생일)\s*[:：]?\s*)(?:\d{2,4}(?:[./-]|\s*년\s*)\d{1,2}(?:[./-]|\s*월\s*)\d{1,2}(?:\s*일)?)/gu,
    replacement: "[생년월일 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "full-name-or-signature",
    blocking: false,
    pattern: /((?:성\s*명|이름|작성자|서명)\s*[:：]?\s*)[가-힣]{2,5}(?=\s|$|[,，.;；])/gmu,
    replacement: "[성명·서명 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "identity-document",
    blocking: true,
    pattern: /((?:신분증|주민등록증|운전면허증|외국인등록증)(?:\s*(?:번호|사본|원본))?\s*[:：]?\s*)[^\n]{0,120}/gu,
    replacement: "[신분증 정보 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "health-detail",
    blocking: true,
    pattern: /((?:건강진단|건강검진|질병명|진단명)(?:\s*(?:상세|결과|내용))?\s*[:：]?\s*)[^\n]{0,160}/gu,
    replacement: "[건강 상세정보 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "full-address",
    blocking: false,
    pattern: /((?:주\s*소|주소)\s*[:：]?\s*)[^\n]{4,160}/gu,
    replacement: "[상세주소 삭제]",
    preservePrefix: true
  }),
  Object.freeze({
    code: "account-or-card-number",
    blocking: true,
    pattern: RAW_LONG_NUMBER,
    replacement: "[계좌·카드번호 삭제]"
  })
]);

export function analyzeWorkerResumeOcrText(source) {
  if (typeof source !== "string") throw new WorkerResumeOcrError("INVALID_OCR_TEXT", "OCR 입력은 문자열이어야 합니다.");
  if (source.length > MAX_WORKER_RESUME_OCR_CHARACTERS) {
    throw new WorkerResumeOcrError("OCR_TEXT_TOO_LONG", `OCR 입력은 ${MAX_WORKER_RESUME_OCR_CHARACTERS.toLocaleString("ko-KR")}자 이하여야 합니다.`);
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
    schemaVersion: WORKER_RESUME_OCR_SCHEMA_VERSION,
    maskedText: maskedText.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    detectionCodes,
    blocked: detectionCodes.some((code) => BLOCKING_DETECTION_CODES.has(code)),
    canPersist: false,
    canCreateWorkerIntake: false,
    requiresHumanReview: true
  });
}

const REVIEW_FIELDS = new Set([
  "mock", "warning", "schemaVersion", "documentType", "source", "reviewStatus", "capturedOn",
  "observedFieldTypes", "extracted", "detections", "policy"
]);
const EXTRACTED_FIELDS = new Set([
  "caseId", "displayAlias", "contactMask", "desiredRoles", "experienceSummary", "workHistory",
  "qualifications", "educationSummary", "awardSummary", "reviewNotes"
]);
const WORK_HISTORY_FIELDS = new Set(["organizationAlias", "periodLabel", "dutySummary"]);
const QUALIFICATION_FIELDS = new Set(["title", "acquiredOn", "issuerAlias"]);
const POLICY_FIELDS = new Set(["rawTextPersisted", "imagePersisted", "directIntakeCreation", "humanReviewRequired"]);

export function normalizeWorkerResumeReview(input, { dataMode = "mock" } = {}) {
  assertAllowedKeys(input, REVIEW_FIELDS, "resumeReview");
  if (dataMode !== "mock" || input.mock !== true) throw new WorkerResumeOcrError("MOCK_MODE_REQUIRED", "합성 Mock 이력서만 검증할 수 있습니다.");
  const warning = text(input.warning, "warning", { max: 200 });
  if (!/(?:합성|연습|Mock)/i.test(warning)) throw new WorkerResumeOcrError("MOCK_WARNING_REQUIRED", "합성 자료 경고가 필요합니다.", ["warning"]);
  if (input.schemaVersion !== WORKER_RESUME_OCR_SCHEMA_VERSION) throw new WorkerResumeOcrError("SCHEMA_VERSION_MISMATCH", "이력서 OCR 검토 계약 버전이 다릅니다.", ["schemaVersion"]);
  if (input.documentType !== DOCUMENT_TYPE || input.source !== SOURCE_TYPE || input.reviewStatus !== REVIEW_STATUS) {
    throw new WorkerResumeOcrError("INVALID_REVIEW_BOUNDARY", "합성 OCR·사람 검토 대기 경계를 유지해야 합니다.");
  }

  assertAllowedKeys(input.extracted, EXTRACTED_FIELDS, "extracted");
  const contactMask = text(input.extracted.contactMask, "contactMask", { max: 13 });
  if (!/^010-\*{4}-\d{4}$/.test(contactMask)) throw new WorkerResumeOcrError("MASKED_PHONE_REQUIRED", "연락처는 010-****-XXXX 형식만 허용합니다.", ["contactMask"]);
  const displayAlias = text(input.extracted.displayAlias, "displayAlias", { max: 40 });
  if (!/(?:가명|합성)/.test(displayAlias)) throw new WorkerResumeOcrError("SYNTHETIC_ALIAS_REQUIRED", "실명이 아닌 합성 별칭을 사용해야 합니다.", ["displayAlias"]);

  const workHistory = input.extracted.workHistory;
  if (!Array.isArray(workHistory) || workHistory.length > 10) throw new WorkerResumeOcrError("INVALID_LIST", "workHistory 항목 수를 확인해 주세요.", ["workHistory"]);
  const normalizedWorkHistory = workHistory.map((item, index) => {
    assertAllowedKeys(item, WORK_HISTORY_FIELDS, `workHistory.${index}`);
    return Object.freeze({
      organizationAlias: text(item.organizationAlias, `workHistory.${index}.organizationAlias`, { max: 80 }),
      periodLabel: text(item.periodLabel, `workHistory.${index}.periodLabel`, { max: 40 }),
      dutySummary: text(item.dutySummary, `workHistory.${index}.dutySummary`, { max: 160 })
    });
  });

  const qualifications = input.extracted.qualifications;
  if (!Array.isArray(qualifications) || qualifications.length > 10) throw new WorkerResumeOcrError("INVALID_LIST", "qualifications 항목 수를 확인해 주세요.", ["qualifications"]);
  const normalizedQualifications = qualifications.map((item, index) => {
    assertAllowedKeys(item, QUALIFICATION_FIELDS, `qualifications.${index}`);
    return Object.freeze({
      title: text(item.title, `qualifications.${index}.title`, { max: 80 }),
      acquiredOn: isoDate(item.acquiredOn, `qualifications.${index}.acquiredOn`),
      issuerAlias: text(item.issuerAlias, `qualifications.${index}.issuerAlias`, { max: 80 })
    });
  });

  assertAllowedKeys(input.policy, POLICY_FIELDS, "policy");
  if (input.policy.rawTextPersisted !== false || input.policy.imagePersisted !== false || input.policy.directIntakeCreation !== false || input.policy.humanReviewRequired !== true) {
    throw new WorkerResumeOcrError("UNSAFE_OCR_POLICY", "원문·이미지 저장과 자동 접수를 금지하고 사람 검토를 필수로 해야 합니다.", ["policy"]);
  }

  return Object.freeze({
    mock: true,
    warning,
    schemaVersion: WORKER_RESUME_OCR_SCHEMA_VERSION,
    documentType: DOCUMENT_TYPE,
    source: SOURCE_TYPE,
    reviewStatus: REVIEW_STATUS,
    capturedOn: isoDate(input.capturedOn, "capturedOn"),
    observedFieldTypes: textList(input.observedFieldTypes, "observedFieldTypes", { max: 20, allowed: OBSERVED_FIELD_TYPES }),
    extracted: Object.freeze({
      caseId: text(input.extracted.caseId, "caseId", { max: 50 }),
      displayAlias,
      contactMask,
      desiredRoles: textList(input.extracted.desiredRoles, "desiredRoles", { max: 10 }),
      experienceSummary: text(input.extracted.experienceSummary, "experienceSummary", { max: 500 }),
      workHistory: Object.freeze(normalizedWorkHistory),
      qualifications: Object.freeze(normalizedQualifications),
      educationSummary: text(input.extracted.educationSummary, "educationSummary", { max: 160 }),
      awardSummary: text(input.extracted.awardSummary, "awardSummary", { max: 160 }),
      reviewNotes: text(input.extracted.reviewNotes, "reviewNotes", { max: 300 })
    }),
    detections: textList(input.detections, "detections", { max: 20, allowed: DETECTION_CODES }),
    policy: Object.freeze({ ...input.policy })
  });
}