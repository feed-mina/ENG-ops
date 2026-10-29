import { COMPONENT_REGISTRY } from "./index.js";

export const TEMPLATE_MANIFEST_SCHEMA = "feedmina.sdui.template.v1";

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "schema", "id", "name", "version", "recommendedTier", "runtimeAdapters",
  "defaultLocale", "locales", "messages", "pages", "metadata", "components",
  "api", "env", "gating", "risks"
]);
const ALLOWED_PAGE_KEYS = new Set(["id", "sourceKind", "title", "route", "metadataRef"]);
const REQUIRED_TOP_LEVEL_KEYS = new Set([
  "schema", "id", "name", "version", "recommendedTier", "runtimeAdapters",
  "defaultLocale", "locales", "messages", "pages", "metadata", "components",
  "api", "env", "gating", "risks"
]);
const API_KEYS = new Set(["endpoints"]);
const ENV_KEYS = new Set(["vars", "secrets", "bindings"]);
const GATING_KEYS = new Set(["free"]);
const SAFE_RELATIVE_PATH = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const MESSAGE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const COMPONENT_PATTERN = /^[A-Z][A-Za-z0-9]{0,79}$/;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;
const GATE_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const UNSAFE_CONFIG_VALUE = /<\/?[a-z][^>]*>|javascript:|data:text\/html|https?:\/\/|(?:^|\s)(?:sk|pk|api)[_-](?:live|test)[_-][A-Za-z0-9_-]{8,}/i;

export class TemplateManifestValidationError extends Error {
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = "TemplateManifestValidationError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new TemplateManifestValidationError(code, path, message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, path, pattern) {
  if (typeof value !== "string" || !value.trim()) fail("INVALID_STRING", path, "빈 문자열이 아닌 문자열이어야 합니다.");
  if (pattern && !pattern.test(value)) fail("INVALID_FORMAT", path, "허용된 형식이 아닙니다.");
}

function assertRecord(value, path) {
  if (!isRecord(value)) fail("INVALID_OBJECT", path, "객체여야 합니다.");
}

function assertAllowedKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      fail("FORBIDDEN_KEY", `${path}.${key}`, "prototype 관련 키는 허용되지 않습니다.");
    }
    if (!allowed.has(key)) fail("UNKNOWN_FIELD", `${path}.${key}`, "등록되지 않은 필드입니다.");
  }
}

function assertSafeText(value, path, { pattern, max = 500 } = {}) {
  assertString(value, path, pattern);
  if (value.length > max) fail("STRING_TOO_LONG", path, `문자열은 ${max}자를 넘을 수 없습니다.`);
  if (UNSAFE_CONFIG_VALUE.test(value)) {
    fail("UNSAFE_VALUE", path, "URL, 실행 가능한 마크업, 비밀값 형태는 허용되지 않습니다.");
  }
}

function assertUniqueStringArray(value, path, { pattern, maxItems = 100, allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maxItems) {
    fail("INVALID_ARRAY", path, `${maxItems}개 이하의 문자열 배열이어야 합니다.`);
  }
  const seen = new Set();
  value.forEach((item, index) => {
    assertSafeText(item, `${path}[${index}]`, { pattern, max: 500 });
    if (seen.has(item)) fail("DUPLICATE_VALUE", `${path}[${index}]`, "값이 중복되었습니다.");
    seen.add(item);
  });
}

function validateMessages(messages, locales) {
  assertRecord(messages, "$.messages");
  assertAllowedKeys(messages, new Set(locales), "$.messages");
  for (const locale of locales) {
    const dictionary = messages[locale];
    assertRecord(dictionary, `$.messages.${locale}`);
    for (const [key, value] of Object.entries(dictionary)) {
      assertSafeText(key, `$.messages.${locale}.${key}`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
      assertSafeText(value, `$.messages.${locale}.${key}`, { max: 500 });
    }
  }
}

function validateOperationalMetadata(manifest) {
  assertRecord(manifest.api, "$.api");
  assertAllowedKeys(manifest.api, API_KEYS, "$.api");
  assertUniqueStringArray(manifest.api.endpoints, "$.api.endpoints", { pattern: ID_PATTERN });

  assertRecord(manifest.env, "$.env");
  assertAllowedKeys(manifest.env, ENV_KEYS, "$.env");
  for (const key of ENV_KEYS) {
    assertUniqueStringArray(manifest.env[key], `$.env.${key}`, { pattern: ENV_NAME_PATTERN });
  }

  assertRecord(manifest.gating, "$.gating");
  assertAllowedKeys(manifest.gating, GATING_KEYS, "$.gating");
  assertUniqueStringArray(manifest.gating.free, "$.gating.free", { pattern: GATE_PATTERN, allowEmpty: false });

  assertUniqueStringArray(manifest.risks, "$.risks", { maxItems: 50, allowEmpty: false });
}

export function assertSafeTemplatePath(value, path = "path") {
  assertString(value, path, SAFE_RELATIVE_PATH);
  if (value.includes("\\") || value.split("/").some((part) => part === ".." || part === ".")) {
    fail("UNSAFE_PATH", path, "template 내부의 안전한 상대경로만 허용됩니다.");
  }
  return value;
}

export function validateHarmonyTemplateManifest(manifest) {
  if (!isRecord(manifest)) fail("INVALID_MANIFEST", "$", "manifest는 객체여야 합니다.");
  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) fail("UNKNOWN_FIELD", `$.${key}`, "등록되지 않은 manifest 필드입니다.");
  }
  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!Object.hasOwn(manifest, key)) fail("MISSING_FIELD", `$.${key}`, "필수 manifest 필드가 없습니다.");
  }
  if (manifest.schema !== TEMPLATE_MANIFEST_SCHEMA) fail("UNSUPPORTED_SCHEMA", "$.schema", `schema는 ${TEMPLATE_MANIFEST_SCHEMA}여야 합니다.`);
  assertString(manifest.id, "$.id", /^[a-z0-9][a-z0-9-]*$/);
  assertSafeText(manifest.name, "$.name", { max: 120 });
  assertString(manifest.version, "$.version", /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i);
  if (manifest.recommendedTier !== "free") fail("UNSUPPORTED_TIER", "$.recommendedTier", "현재 Harmony Mock package는 free tier만 허용합니다.");
  if (!Array.isArray(manifest.runtimeAdapters) || manifest.runtimeAdapters.length !== 1 || manifest.runtimeAdapters[0] !== "cloudflare-worker-static") {
    fail("UNSUPPORTED_ADAPTER", "$.runtimeAdapters", "현재는 cloudflare-worker-static adapter만 선언할 수 있습니다.");
  }
  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) fail("MISSING_PAGES", "$.pages", "한 개 이상의 page가 필요합니다.");

  const pageIds = new Set();
  const references = [];
  manifest.pages.forEach((page, index) => {
    const path = `$.pages[${index}]`;
    if (!isRecord(page)) fail("INVALID_PAGE", path, "page는 객체여야 합니다.");
    for (const key of Object.keys(page)) {
      if (!ALLOWED_PAGE_KEYS.has(key)) fail("UNKNOWN_FIELD", `${path}.${key}`, "등록되지 않은 page 필드입니다.");
    }
    assertString(page.id, `${path}.id`, ID_PATTERN);
    if (pageIds.has(page.id)) fail("DUPLICATE_PAGE", `${path}.id`, "page ID가 중복되었습니다.");
    pageIds.add(page.id);
    if (page.sourceKind !== "page_key") fail("UNSUPPORTED_SOURCE", `${path}.sourceKind`, "page_key만 허용됩니다.");
    assertSafeText(page.title, `${path}.title`, { max: 120 });
    assertString(page.route, `${path}.route`, /^\/(?!\/)[a-z0-9/_-]*$/);
    references.push(assertSafeTemplatePath(page.metadataRef, `${path}.metadataRef`));
  });

  if (!isRecord(manifest.metadata)) fail("INVALID_METADATA", "$.metadata", "Harmony schema·theme·message 참조가 필요합니다.");
  const metadataKeys = new Set(["harmonyDocumentSchema", "themeRef", "messagesRef"]);
  for (const key of Object.keys(manifest.metadata)) {
    if (!metadataKeys.has(key)) fail("UNKNOWN_FIELD", `$.metadata.${key}`, "등록되지 않은 metadata 필드입니다.");
  }
  if (manifest.metadata.harmonyDocumentSchema !== "harmony.sdui.document.v1") {
    fail("UNSUPPORTED_DOCUMENT_SCHEMA", "$.metadata.harmonyDocumentSchema", "Harmony runtime schema ID가 일치하지 않습니다.");
  }
  for (const key of ["themeRef", "messagesRef"]) {
    references.push(assertSafeTemplatePath(manifest.metadata[key], `$.metadata.${key}`));
  }
  assertUniqueStringArray(manifest.components, "$.components", { pattern: COMPONENT_PATTERN, allowEmpty: false });
  manifest.components.forEach((name, index) => {
    if (!Object.hasOwn(COMPONENT_REGISTRY, name)) {
      fail("UNKNOWN_COMPONENT", `$.components[${index}]`, "runtime registry에 없는 component입니다.");
    }
  });
  if (manifest.defaultLocale !== "ko" || !Array.isArray(manifest.locales) || manifest.locales.length !== 1 || manifest.locales[0] !== "ko") {
    fail("INVALID_LOCALE", "$.locales", "초기 package는 ko locale만 지원합니다.");
  }
  validateMessages(manifest.messages, manifest.locales);
  validateOperationalMetadata(manifest);

  return Object.freeze({
    valid: true,
    id: manifest.id,
    version: manifest.version,
    pageIds: Object.freeze([...pageIds]),
    references: Object.freeze([...new Set(references)])
  });
}
