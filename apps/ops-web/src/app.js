import messageDocument from "../../../sdui/harmony-ops/messages/ko.json" with { type: "json" };
import theme from "../../../sdui/harmony-ops/theme/tokens.json" with { type: "json" };

import { prepareSduiRender } from "../../../packages/sdui-renderer-core/index.js";
import {
  createWebRendererCapabilities,
  mountSduiPlan
} from "../../../packages/sdui-renderer-web/index.js";
import { mountConsultationAssistant } from "./consultation.js";

const BUILD_SDUI_ENABLED = typeof __OPS_WEB_SDUI_ENABLED__ !== "undefined"
  && __OPS_WEB_SDUI_ENABLED__ === true;

const SESSION_PATH = "/api/session";
const FALLBACK_PATH = "/admin#dashboard";
const MAX_RESPONSE_BYTES = 524_288;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const ALLOWED_ROLES = new Set(["owner", "staff"]);
const LOCAL_SCREEN_IDS = new Set(["consultation"]);
const SCREEN_CONFIGS = Object.freeze({
  dashboard: Object.freeze({
    pagePath: "/api/ui/pages/dashboard?surface=web&locale=ko",
    resourceId: "dashboard.summary",
    dataPath: "/api/ui/data/dashboard.summary"
  }),
  compliance: Object.freeze({
    pagePath: "/api/ui/pages/compliance?surface=web&locale=ko",
    resourceId: "compliance.calendar",
    dataPath: "/api/ui/data/compliance.calendar"
  })
});

const STATE_COPY = Object.freeze({
  off: Object.freeze({
    title: "새 내부 화면은 꺼져 있습니다.",
    message: "현재 운영 기본값은 기존 내부 화면입니다.",
    role: "status"
  }),
  loading: Object.freeze({
    title: "업무 화면을 불러오고 있습니다.",
    message: "잠시만 기다려 주세요.",
    role: "status"
  }),
  forbidden: Object.freeze({
    title: "이 화면을 볼 권한이 없습니다.",
    message: "로그인 상태와 계정 권한을 확인해 주세요.",
    role: "alert"
  }),
  offline: Object.freeze({
    title: "서버에 연결할 수 없습니다.",
    message: "연결을 확인한 뒤 다시 시도해 주세요.",
    role: "status"
  }),
  error: Object.freeze({
    title: "업무 화면을 불러오지 못했습니다.",
    message: "기존 화면을 사용하고 관리자에게 알려 주세요.",
    role: "alert"
  }),
  "update-required": Object.freeze({
    title: "화면 업데이트가 필요합니다.",
    message: "현재 브라우저 화면이 서버 문서를 안전하게 표시할 수 없습니다.",
    role: "alert"
  })
});

export const DEFAULT_OPS_WEB_CONFIG = Object.freeze({
  enabled: BUILD_SDUI_ENABLED,
  fallbackPath: FALLBACK_PATH
});

export class OpsWebError extends Error {
  constructor(state, code, message, options) {
    super(message, options);
    this.name = "OpsWebError";
    this.state = state;
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(state, code, message, options) {
  throw new OpsWebError(state, code, message, options);
}

function classifyStatus(status, path) {
  if (status === 401 || status === 403 || (path === SESSION_PATH && status >= 300 && status < 400)) return "forbidden";
  return "error";
}

async function fetchJson(fetcher, path, requestTimeoutMs) {
  let response;
  const controller = new AbortController();
  let timeoutId;
  try {
    const request = fetcher(path, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      mode: "same-origin",
      redirect: "manual",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new OpsWebError("offline", "REQUEST_TIMEOUT", "same-origin API request timed out"));
      }, requestTimeoutMs);
    });
    response = await Promise.race([request, timeout]);
  } catch (cause) {
    if (cause instanceof OpsWebError) throw cause;
    fail("offline", "NETWORK_UNAVAILABLE", "same-origin API request failed", { cause });
  } finally {
    clearTimeout(timeoutId);
  }

  if (response?.type === "opaqueredirect" || response?.status === 0 || response?.redirected === true) {
    fail(path === SESSION_PATH ? "forbidden" : "error", "REDIRECT_REJECTED", "API redirect was rejected");
  }
  if (!response || typeof response.text !== "function") {
    fail("error", "INVALID_RESPONSE", "API response is not readable");
  }
  if (!response.ok) {
    fail(classifyStatus(response.status, path), `HTTP_${response.status}`, "API request was rejected");
  }

  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    fail(path === SESSION_PATH ? "forbidden" : "error", "NON_JSON_RESPONSE", "API did not return JSON");
  }
  const declaredLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    fail("error", "RESPONSE_TOO_LARGE", "API response exceeded the size limit");
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    fail("error", "RESPONSE_TOO_LARGE", "API response exceeded the size limit");
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    fail("error", "INVALID_JSON", "API returned invalid JSON", { cause });
  }
}

function assertSessionEnvelope(value) {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.principal)) {
    fail("forbidden", "SESSION_CONTRACT_INVALID", "Session contract is invalid");
  }
  if (!ALLOWED_ROLES.has(value.principal.role)) {
    fail("forbidden", "ROLE_FORBIDDEN", "Session role is not allowed for this page");
  }
  if (value.dataMode !== "mock") {
    fail("error", "MOCK_MODE_REQUIRED", "The dashboard PoC only accepts mock mode");
  }
  return value.principal.role;
}

function assertPageEnvelope(value, pageId) {
  if (!isRecord(value)
    || value.ok !== true
    || value.schema !== "harmony.sdui.page-response.v1"
    || value.pageId !== pageId
    || !Number.isInteger(value.revision)
    || !isRecord(value.document)
    || value.document.pageId !== pageId
    || value.document.surface !== "web"
    || value.document.locale !== "ko"
    || value.document.revision !== value.revision) {
    fail("error", "PAGE_CONTRACT_INVALID", "Page contract is invalid");
  }
  return value;
}

function assertDataEnvelope(value, documentRevision, resourceId) {
  if (!isRecord(value)
    || value.ok !== true
    || value.schema !== "harmony.sdui.data-response.v1"
    || value.resourceId !== resourceId
    || value.documentRevision !== documentRevision
    || value.mock !== true
    || !isRecord(value.data)) {
    fail("error", "DATA_CONTRACT_INVALID", "Data contract is invalid");
  }
  return value;
}

function prepare(document, role, capabilities, resources, state) {
  try {
    return prepareSduiRender({
      document,
      capabilities,
      messageDocument,
      theme,
      resources,
      role,
      state
    });
  } catch (cause) {
    fail("error", "RENDER_CONTRACT_INVALID", "SDUI document could not be rendered safely", { cause });
  }
}

export async function loadOpsPageModel({
  pageId = "dashboard",
  fetcher = globalThis.fetch,
  capabilities = createWebRendererCapabilities(),
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
} = {}) {
  const screen = SCREEN_CONFIGS[pageId];
  if (!screen) fail("error", "PAGE_NOT_ALLOWED", "Requested page is not allowed");
  if (typeof fetcher !== "function") fail("offline", "FETCH_UNAVAILABLE", "Fetch is unavailable");
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    fail("error", "INVALID_TIMEOUT", "Request timeout must be positive");
  }

  const session = await fetchJson(fetcher, SESSION_PATH, requestTimeoutMs);
  const role = assertSessionEnvelope(session);
  const page = assertPageEnvelope(await fetchJson(fetcher, screen.pagePath, requestTimeoutMs), pageId);

  const preflight = prepare(page.document, role, capabilities, {}, "loading");
  if (preflight.status === "update-required") {
    return Object.freeze({ state: "update-required", role, plan: preflight });
  }

  const resource = assertDataEnvelope(
    await fetchJson(fetcher, screen.dataPath, requestTimeoutMs),
    page.revision,
    screen.resourceId
  );
  const plan = prepare(
    page.document,
    role,
    capabilities,
    { [resource.resourceId]: resource.data },
    "ready"
  );
  if (plan.status !== "ready") fail("error", "READY_PLAN_REQUIRED", "Renderer did not produce a ready plan");
  return Object.freeze({ state: "ready", role, plan });
}

export function loadDashboardModel(options = {}) {
  return loadOpsPageModel({ ...options, pageId: "dashboard" });
}

export async function loadConsultationSession({
  fetcher = globalThis.fetch,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
} = {}) {
  if (typeof fetcher !== "function") fail("offline", "FETCH_UNAVAILABLE", "Fetch is unavailable");
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    fail("error", "INVALID_TIMEOUT", "Request timeout must be positive");
  }
  const session = await fetchJson(fetcher, SESSION_PATH, requestTimeoutMs);
  return Object.freeze({ role: assertSessionEnvelope(session) });
}

function selectedPageId(locationHash = "") {
  const candidate = String(locationHash).replace(/^#/, "");
  return Object.hasOwn(SCREEN_CONFIGS, candidate) || LOCAL_SCREEN_IDS.has(candidate)
    ? candidate
    : "dashboard";
}

function markCurrentNavigation(domDocument, pageId) {
  for (const link of domDocument?.querySelectorAll?.(".app-nav a") ?? []) {
    if (link.getAttribute("href") === `#${pageId}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function appendText(domDocument, parent, tagName, text) {
  const element = domDocument.createElement(tagName);
  element.textContent = text;
  parent.append(element);
  return element;
}

export function renderOpsWebState(container, state, {
  focus = false,
  fallbackPath = FALLBACK_PATH
} = {}) {
  const copy = STATE_COPY[state] ?? STATE_COPY.error;
  const domDocument = container.ownerDocument;
  const section = domDocument.createElement("section");
  section.setAttribute("class", `ops-web-state ops-web-state-${state}`);
  section.setAttribute("data-state", state);
  section.setAttribute("role", copy.role);
  section.setAttribute("aria-live", copy.role === "alert" ? "assertive" : "polite");
  section.setAttribute("tabindex", "-1");
  appendText(domDocument, section, "h1", copy.title);
  appendText(domDocument, section, "p", copy.message);

  if (state !== "loading") {
    const link = domDocument.createElement("a");
    link.setAttribute("href", fallbackPath);
    link.textContent = "기존 화면으로 이동";
    section.append(link);
  }

  container.replaceChildren(section);
  if (focus && typeof section.focus === "function") section.focus({ preventScroll: true });
  return section;
}

export async function bootstrapOpsWeb({
  domDocument = globalThis.document,
  container = domDocument?.getElementById?.("ops-web-root"),
  fetcher = globalThis.fetch,
  enabled = DEFAULT_OPS_WEB_CONFIG.enabled,
  capabilities = createWebRendererCapabilities(),
  fallbackPath = DEFAULT_OPS_WEB_CONFIG.fallbackPath,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
} = {}) {
  if (!container?.ownerDocument) throw new TypeError("ops-web root container is required");
  const generation = ++bootstrapGeneration;
  activeScreenCleanup?.();
  activeScreenCleanup = null;
  if (enabled !== true) {
    return Object.freeze({ state: "off", element: renderOpsWebState(container, "off", { fallbackPath }) });
  }

  renderOpsWebState(container, "loading", { fallbackPath });
  try {
    const pageId = selectedPageId(domDocument?.defaultView?.location?.hash);
    markCurrentNavigation(domDocument, pageId);
    if (pageId === "consultation") {
      const { role } = await loadConsultationSession({ fetcher, requestTimeoutMs });
      if (generation !== bootstrapGeneration) return Object.freeze({ state: "superseded" });
      const mounted = mountConsultationAssistant(container);
      activeScreenCleanup = mounted.cleanup;
      domDocument.title = "통화 업무 도우미 | 하모니 내부 업무 화면";
      return Object.freeze({ state: "ready", role, element: mounted.element });
    }
    const result = await loadOpsPageModel({ pageId, fetcher, capabilities, requestTimeoutMs });
    if (generation !== bootstrapGeneration) return Object.freeze({ state: "superseded" });
    if (result.state === "update-required") {
      mountSduiPlan(container, result.plan, { focus: true });
      const link = domDocument.createElement("a");
      link.setAttribute("href", fallbackPath);
      link.textContent = "기존 화면으로 이동";
      container.append(link);
      return Object.freeze({ ...result, element: container.children?.[0] });
    }
    const element = mountSduiPlan(container, result.plan, { focus: true });
    domDocument.title = element.getAttribute?.("data-page-title") || domDocument.title;
    return Object.freeze({ ...result, element });
  } catch (error) {
    if (generation !== bootstrapGeneration) return Object.freeze({ state: "superseded" });
    const state = error instanceof OpsWebError ? error.state : "error";
    return Object.freeze({
      state,
      errorCode: error instanceof OpsWebError ? error.code : "UNEXPECTED_ERROR",
      element: renderOpsWebState(container, state, { focus: true, fallbackPath })
    });
  }
}

let activeScreenCleanup = null;
let bootstrapGeneration = 0;

if (typeof window !== "undefined" && typeof document !== "undefined") {
  void bootstrapOpsWeb();
  window.addEventListener("hashchange", () => { void bootstrapOpsWeb(); });
}
