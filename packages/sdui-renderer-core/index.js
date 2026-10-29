import {
  FORMATTER_REGISTRY,
  ROLE_VALUES,
  SDUI_CAPABILITIES_SCHEMA,
  SDUI_DOCUMENT_SCHEMA,
  negotiateSduiCapabilities,
  validateRendererCapabilities,
  validateSduiDocument
} from "../sdui-contracts/index.js";
import {
  assertDocumentBindingsResolve,
  assertDocumentMessagesDefined,
  assertDocumentThemeTokensDefined,
  validateMessageDocument,
  validateThemeDocument
} from "../sdui-contracts/package-assets.js";

export const SDUI_RENDERER_VERSION = "0.1.0";
export const SDUI_RENDER_PLAN_SCHEMA = "harmony.sdui.render-plan.v1";
export const SDUI_RENDER_STATES = Object.freeze([
  "ready", "loading", "empty", "error", "forbidden", "offline", "update-required"
]);

const STATE_CONTENT = Object.freeze({
  loading: Object.freeze({ title: "화면을 불러오는 중입니다", message: "잠시만 기다려 주세요.", role: "status", live: "polite" }),
  empty: Object.freeze({ title: "표시할 내용이 없습니다", message: "새로운 내용이 생기면 이곳에 표시됩니다.", role: "status", live: "polite" }),
  error: Object.freeze({ title: "화면을 불러오지 못했습니다", message: "잠시 후 다시 시도해 주세요.", role: "alert", live: "assertive" }),
  forbidden: Object.freeze({ title: "이 화면을 볼 권한이 없습니다", message: "필요한 경우 관리자에게 권한을 요청해 주세요.", role: "alert", live: "assertive" }),
  offline: Object.freeze({ title: "현재 오프라인입니다", message: "연결을 확인한 뒤 다시 시도해 주세요.", role: "status", live: "polite" }),
  "update-required": Object.freeze({ title: "화면 업데이트가 필요합니다", message: "안전한 최신 화면을 사용하려면 앱을 새로고침하거나 업데이트해 주세요.", role: "alert", live: "assertive" })
});

const FORBIDDEN_POINTER_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

export class SduiRenderError extends Error {
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = "SduiRenderError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new SduiRenderError(code, path, message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function resolveToken(theme, reference, path) {
  const segments = reference.split(".");
  let current = theme.tokens;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      fail("UNKNOWN_THEME_TOKEN", path, `등록되지 않은 theme token입니다: ${reference}`);
    }
    current = current[segment];
  }
  if (typeof current !== "string") fail("INVALID_THEME_TOKEN", path, `문자열 theme token이 아닙니다: ${reference}`);
  return current;
}

function resolvePointer(resource, pointer, path) {
  if (pointer === "") return resource;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) fail("INVALID_POINTER", path, "JSON Pointer 형식이 아닙니다.");
  let current = resource;
  for (const encodedSegment of pointer.slice(1).split("/")) {
    const segment = encodedSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (FORBIDDEN_POINTER_SEGMENTS.has(segment)) fail("UNSAFE_POINTER", path, "안전하지 않은 binding 경로입니다.");
    if ((current === null || typeof current !== "object") || !Object.hasOwn(current, segment)) {
      fail("MISSING_POINTER", path, `resource에 pointer가 없습니다: ${pointer}`);
    }
    current = current[segment];
  }
  return current;
}

function parseDate(value, path) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value !== "string") fail("INVALID_FORMAT_VALUE", path, "날짜 formatter에는 문자열 또는 Date가 필요합니다.");
  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
  if (calendarDate) {
    const [, rawYear, rawMonth, rawDay] = calendarDate;
    const year = Number(rawYear);
    const month = Number(rawMonth);
    const day = Number(rawDay);
    const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
    if (day < 1 || day > daysInMonth) fail("INVALID_FORMAT_VALUE", path, "유효한 달력 날짜가 아닙니다.");
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00+09:00` : value);
  if (Number.isNaN(parsed.valueOf())) fail("INVALID_FORMAT_VALUE", path, "유효한 날짜가 아닙니다.");
  return parsed;
}

function formatMaskedPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010")) return `010-****-${digits.slice(-4)}`;
  if (digits.length >= 8) return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  return "••••";
}

export function formatSduiValue(formatter, value, locale = "ko-KR") {
  if (!Object.hasOwn(FORMATTER_REGISTRY, formatter)) fail("UNKNOWN_FORMATTER", "$formatter", `등록되지 않은 formatter입니다: ${formatter}`);
  if (value === null || value === undefined) return "";
  switch (formatter) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) fail("INVALID_FORMAT_VALUE", "$value", "number formatter에는 유한한 숫자가 필요합니다.");
      return new Intl.NumberFormat(locale).format(value);
    case "currencyKr":
      if (typeof value !== "number" || !Number.isFinite(value)) fail("INVALID_FORMAT_VALUE", "$value", "currencyKr formatter에는 유한한 숫자가 필요합니다.");
      return new Intl.NumberFormat(locale, { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value);
    case "dateKr":
      return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).format(parseDate(value, "$value"));
    case "timeKr":
      if (/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(value))) return String(value).slice(0, 5);
      if (/^\d{2}:\d{2}(?::\d{2})?$/.test(String(value))) fail("INVALID_FORMAT_VALUE", "$value", "유효한 시각이 아닙니다.");
      return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(parseDate(value, "$value"));
    case "maskedPhone":
      return formatMaskedPhone(value);
    case "status":
      return String(value);
    default:
      fail("UNKNOWN_FORMATTER", "$formatter", `지원하지 않는 formatter입니다: ${formatter}`);
  }
}

export function createRendererCapabilities({
  surface,
  components,
  actions = {},
  formatters = FORMATTER_REGISTRY,
  rendererVersion = SDUI_RENDERER_VERSION
}) {
  const capabilities = {
    schema: SDUI_CAPABILITIES_SCHEMA,
    rendererVersion,
    surface,
    schemas: [SDUI_DOCUMENT_SCHEMA],
    components: Object.fromEntries(Object.entries(components).map(([id, definition]) => [id, typeof definition === "number" ? definition : definition.version])),
    actions: Object.fromEntries(Object.entries(actions).map(([id, definition]) => [id, typeof definition === "number" ? definition : definition.version])),
    formatters: Object.fromEntries(Object.entries(formatters).map(([id, definition]) => [id, typeof definition === "number" ? definition : definition.version]))
  };
  validateRendererCapabilities(capabilities);
  return deepFreeze(capabilities);
}

function statePlan({ state, sduiDocument, detail = {} }) {
  const content = STATE_CONTENT[state];
  if (!content) fail("INVALID_RENDER_STATE", "$state", `등록되지 않은 render state입니다: ${state}`);
  return deepFreeze({
    schema: SDUI_RENDER_PLAN_SCHEMA,
    rendererVersion: SDUI_RENDERER_VERSION,
    documentId: sduiDocument.documentId,
    revision: sduiDocument.revision,
    pageId: sduiDocument.pageId,
    locale: sduiDocument.locale,
    status: state,
    state: { ...content, ...cloneJson(detail) },
    root: null
  });
}

function compareSemver(left, right) {
  const leftParts = String(left).split("-")[0].split(".").map(Number);
  const rightParts = String(right).split("-")[0].split(".").map(Number);
  if (leftParts.length !== 3 || rightParts.length !== 3 || [...leftParts, ...rightParts].some(Number.isNaN)) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function preflightCapabilityMismatch(sduiDocument, capabilities) {
  if (!isRecord(sduiDocument) || !Array.isArray(sduiDocument.requiredCapabilities)) return null;
  const missingCapabilities = sduiDocument.requiredCapabilities.filter((capability) => {
    const match = /^([A-Za-z][A-Za-z0-9]+)@(\d+)$/.exec(capability);
    return match ? (capabilities.components[match[1]] ?? 0) < Number(match[2]) : false;
  });
  const schemaSupported = typeof sduiDocument.schema === "string" && capabilities.schemas.includes(sduiDocument.schema);
  const surfaceSupported = typeof sduiDocument.surface === "string" && capabilities.surface === sduiDocument.surface;
  const updateRequired = typeof sduiDocument.minRendererVersion === "string"
    && compareSemver(capabilities.rendererVersion, sduiDocument.minRendererVersion) < 0;
  if (schemaSupported && surfaceSupported && !updateRequired && missingCapabilities.length === 0) return null;
  return {
    missingCapabilities,
    missingActions: [],
    missingFormatters: []
  };
}

function resolvedMessages(props, messages, path) {
  const result = {};
  for (const [key, messageKey] of Object.entries(props)) {
    if (!key.endsWith("Key") || typeof messageKey !== "string") continue;
    if (!Object.hasOwn(messages, messageKey)) fail("MISSING_MESSAGE", `${path}.${key}`, `message key가 없습니다: ${messageKey}`);
    result[key.slice(0, -3)] = messages[messageKey];
  }
  return result;
}

function resolvedPropTokens(props, theme, path) {
  const result = {};
  for (const [key, reference] of Object.entries(props)) {
    if (!key.endsWith("Token") || typeof reference !== "string") continue;
    result[key.slice(0, -5)] = resolveToken(theme, reference, `${path}.${key}`);
  }
  return result;
}

function resolveAccessibility(node, messages, path) {
  if (!node.accessibility) return {};
  const result = {};
  if (node.accessibility.role) result.role = node.accessibility.role;
  if (node.accessibility.live) result.live = node.accessibility.live;
  if (node.accessibility.labelKey) result.label = messages[node.accessibility.labelKey];
  if (node.accessibility.descriptionKey) result.description = messages[node.accessibility.descriptionKey];
  if (node.accessibility.labelKey && result.label === undefined) fail("MISSING_MESSAGE", `${path}.labelKey`, "접근성 label message가 없습니다.");
  if (node.accessibility.descriptionKey && result.description === undefined) fail("MISSING_MESSAGE", `${path}.descriptionKey`, "접근성 description message가 없습니다.");
  return result;
}

function isPresent(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function visibleForResources(visibility, resources, path) {
  if (!visibility) return true;
  const resource = resources[visibility.resourceId];
  const value = resolvePointer(resource, visibility.pointer, path);
  if (visibility.kind === "data-present") return isPresent(value);
  if (visibility.kind === "equals") return Object.is(value, visibility.value);
  if (visibility.kind === "not-equals") return !Object.is(value, visibility.value);
  fail("INVALID_VISIBILITY", path, `등록되지 않은 표시 조건입니다: ${visibility.kind}`);
}

function buildNodePlan(node, context, path) {
  if (node.roles && !node.roles.includes(context.role)) return null;
  if (!visibleForResources(node.visibility, context.resources, `${path}.visibility`)) return null;

  const messages = resolvedMessages(node.props, context.messages, `${path}.props`);
  const tokens = resolvedPropTokens(node.props, context.theme, `${path}.props`);
  const style = Object.fromEntries(Object.entries(node.style ?? {}).map(([key, reference]) => [
    key,
    resolveToken(context.theme, reference, `${path}.style.${key}`)
  ]));

  let binding;
  if (node.dataBinding) {
    const rawValue = resolvePointer(
      context.resources[node.dataBinding.resourceId],
      node.dataBinding.pointer,
      `${path}.dataBinding.pointer`
    );
    binding = {
      resourceId: node.dataBinding.resourceId,
      pointer: node.dataBinding.pointer,
      value: cloneJson(rawValue),
      formattedValue: node.dataBinding.formatter
        ? formatSduiValue(node.dataBinding.formatter, rawValue, context.locale)
        : String(rawValue ?? "")
    };
  }

  const children = (node.children ?? [])
    .map((child, index) => buildNodePlan(child, context, `${path}.children[${index}]`))
    .filter(Boolean);

  return {
    id: node.id,
    type: node.type,
    props: cloneJson(node.props),
    messages,
    tokens,
    style,
    accessibility: resolveAccessibility(node, context.messages, `${path}.accessibility`),
    ...(binding ? { binding } : {}),
    ...(node.actions ? { actions: cloneJson(node.actions) } : {}),
    children
  };
}

export function prepareSduiRender({
  document: sduiDocument,
  capabilities,
  messageDocument,
  theme,
  resources = {},
  role,
  state = "ready"
}) {
  if (!SDUI_RENDER_STATES.includes(state)) fail("INVALID_RENDER_STATE", "$state", `등록되지 않은 render state입니다: ${state}`);
  validateRendererCapabilities(capabilities);
  const preflightMismatch = preflightCapabilityMismatch(sduiDocument, capabilities);
  if (preflightMismatch) return statePlan({ state: "update-required", sduiDocument, detail: preflightMismatch });
  validateSduiDocument(sduiDocument);
  validateMessageDocument(messageDocument);
  validateThemeDocument(theme);
  assertDocumentMessagesDefined(sduiDocument, messageDocument);
  assertDocumentThemeTokensDefined(sduiDocument, theme);
  if (theme.id !== sduiDocument.themeRef) fail("THEME_MISMATCH", "$theme.id", "문서의 themeRef와 theme ID가 다릅니다.");
  if (!ROLE_VALUES.includes(role)) fail("UNKNOWN_ROLE", "$role", "등록되지 않은 역할입니다.");

  const negotiation = negotiateSduiCapabilities(sduiDocument, capabilities);
  if (!negotiation.compatible) return statePlan({
    state: "update-required",
    sduiDocument,
    detail: {
      missingCapabilities: [...negotiation.missingCapabilities],
      missingActions: [...negotiation.missingActions],
      missingFormatters: [...negotiation.missingFormatters]
    }
  });
  if (state !== "ready") return statePlan({ state, sduiDocument });
  if (!isRecord(resources)) fail("INVALID_RESOURCES", "$resources", "resource map 객체가 필요합니다.");
  assertDocumentBindingsResolve(sduiDocument, resources);

  const root = buildNodePlan(sduiDocument.root, {
    role,
    resources,
    messages: messageDocument.messages,
    theme,
    locale: sduiDocument.locale === "ko" ? "ko-KR" : sduiDocument.locale
  }, "$document.root");
  if (!root) return statePlan({ state: "forbidden", sduiDocument });

  return deepFreeze({
    schema: SDUI_RENDER_PLAN_SCHEMA,
    rendererVersion: SDUI_RENDERER_VERSION,
    documentId: sduiDocument.documentId,
    revision: sduiDocument.revision,
    pageId: sduiDocument.pageId,
    locale: sduiDocument.locale,
    status: "ready",
    state: null,
    root
  });
}

function sortForSnapshot(value) {
  if (Array.isArray(value)) return value.map(sortForSnapshot);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortForSnapshot(value[key])]));
}

export function serializeRenderPlan(plan) {
  if (!isRecord(plan) || plan.schema !== SDUI_RENDER_PLAN_SCHEMA) fail("INVALID_RENDER_PLAN", "$plan", "renderer plan이 아닙니다.");
  return `${JSON.stringify(sortForSnapshot(plan), null, 2)}\n`;
}
