import dashboardFixtureJson from "../../../sdui/harmony-ops/fixtures/dashboard.mock.data.json" with { type: "json" };
import dashboardDocumentJson from "../../../sdui/harmony-ops/pages/dashboard.mock.document.json" with { type: "json" };
import complianceFixtureJson from "../../../sdui/harmony-ops/fixtures/compliance.mock.data.json" with { type: "json" };
import complianceDocumentJson from "../../../sdui/harmony-ops/pages/compliance.mock.document.json" with { type: "json" };
import messageDocumentJson from "../../../sdui/harmony-ops/messages/ko.json" with { type: "json" };
import themeDocumentJson from "../../../sdui/harmony-ops/theme/tokens.json" with { type: "json" };

import {
  SduiActionInputError,
  getActionDefinition,
  validateActionInput
} from "../../../packages/sdui-actions/index.js";
import {
  DATA_RESOURCE_REGISTRY,
  ROLE_VALUES,
  validateSduiDocument
} from "../../../packages/sdui-contracts/index.js";
import {
  assertDocumentBindingsResolve,
  assertDocumentMessagesDefined,
  assertDocumentThemeTokensDefined,
  validateMessageDocument,
  validateThemeDocument
} from "../../../packages/sdui-contracts/package-assets.js";
import { assertSyntheticMockFixture } from "../../../packages/sdui-testing/index.js";
import { requirePermission } from "./rbac.js";

const encoder = new TextEncoder();
const UI_QUERY_KEYS = new Set(["surface", "locale"]);
const SERVER_ACTION_HANDLERS = Object.freeze({ "resource.refresh": "resource-refresh" });

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

validateSduiDocument(dashboardDocumentJson);
validateSduiDocument(complianceDocumentJson);
validateMessageDocument(messageDocumentJson);
validateThemeDocument(themeDocumentJson);
assertDocumentMessagesDefined(dashboardDocumentJson, messageDocumentJson);
assertDocumentMessagesDefined(complianceDocumentJson, messageDocumentJson);
assertDocumentThemeTokensDefined(dashboardDocumentJson, themeDocumentJson);
assertDocumentThemeTokensDefined(complianceDocumentJson, themeDocumentJson);
assertSyntheticMockFixture(dashboardFixtureJson);
assertSyntheticMockFixture(complianceFixtureJson);
assertDocumentBindingsResolve(dashboardDocumentJson, {
  [dashboardFixtureJson.resourceId]: dashboardFixtureJson.data
});
assertDocumentBindingsResolve(complianceDocumentJson, {
  [complianceFixtureJson.resourceId]: complianceFixtureJson.data
});

const dashboardResourceDefinition = DATA_RESOURCE_REGISTRY[dashboardFixtureJson.resourceId];
if (!dashboardResourceDefinition || dashboardResourceDefinition.schema !== dashboardFixtureJson.schema) {
  throw new Error("SDUI dashboard resource contract mismatch");
}
const complianceResourceDefinition = DATA_RESOURCE_REGISTRY[complianceFixtureJson.resourceId];
if (!complianceResourceDefinition || complianceResourceDefinition.schema !== complianceFixtureJson.schema) {
  throw new Error("SDUI compliance resource contract mismatch");
}

const DASHBOARD_DOCUMENT = deepFreeze(structuredClone(dashboardDocumentJson));
const DASHBOARD_FIXTURE = deepFreeze(structuredClone(dashboardFixtureJson));
const COMPLIANCE_DOCUMENT = deepFreeze(structuredClone(complianceDocumentJson));
const COMPLIANCE_FIXTURE = deepFreeze(structuredClone(complianceFixtureJson));
const PAGE_REGISTRY = Object.freeze({
  dashboard: Object.freeze({
    permission: "dashboard:read",
    roles: DASHBOARD_DOCUMENT.root.roles,
    revisions: Object.freeze({ [DASHBOARD_DOCUMENT.revision]: DASHBOARD_DOCUMENT })
  }),
  compliance: Object.freeze({
    permission: "dashboard:read",
    roles: COMPLIANCE_DOCUMENT.root.roles,
    revisions: Object.freeze({ [COMPLIANCE_DOCUMENT.revision]: COMPLIANCE_DOCUMENT })
  })
});
const RESOURCE_LOADERS = Object.freeze({
  "dashboard.summary": Object.freeze({
    pageId: "dashboard",
    documentRevision: DASHBOARD_DOCUMENT.revision,
    fixture: DASHBOARD_FIXTURE
  }),
  "compliance.calendar": Object.freeze({
    pageId: "compliance",
    documentRevision: COMPLIANCE_DOCUMENT.revision,
    fixture: COMPLIANCE_FIXTURE
  })
});

export class SduiApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "SduiApiError";
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new SduiApiError(status, code, message);
}

function assertRuntimeEnabled(env, revision) {
  if (env.SDUI_ENABLED !== "true") {
    fail(503, "SDUI_DISABLED", "SDUI 화면 기능이 비활성화되어 있습니다.");
  }
  if (env.DATA_MODE !== "mock") {
    fail(503, "SDUI_MOCK_MODE_REQUIRED", "현재 SDUI 화면은 Mock 모드에서만 사용할 수 있습니다.");
  }
  if (env.SDUI_REVISION !== String(revision)) {
    fail(503, "SDUI_REVISION_MISMATCH", "사용 가능한 SDUI 화면 revision과 설정이 일치하지 않습니다.");
  }
}

function assertRole(principal, permission, roles) {
  requirePermission(principal, permission);
  if (!roles.includes(principal.role)) {
    fail(403, "SDUI_ROLE_FORBIDDEN", "이 SDUI 화면 또는 자료를 볼 수 있는 역할이 아닙니다.");
  }
}

function assertPageQuery(url, document) {
  for (const key of url.searchParams.keys()) {
    if (!UI_QUERY_KEYS.has(key)) fail(400, "SDUI_QUERY_INVALID", "허용되지 않은 SDUI 조회 조건이 있습니다.");
  }
  for (const key of UI_QUERY_KEYS) {
    if (url.searchParams.getAll(key).length > 1) fail(400, "SDUI_QUERY_INVALID", "SDUI 조회 조건을 중복해서 보낼 수 없습니다.");
  }
  const surface = url.searchParams.get("surface") ?? document.surface;
  const locale = url.searchParams.get("locale") ?? document.locale;
  if (surface !== document.surface) fail(400, "SDUI_SURFACE_UNSUPPORTED", "현재 지원하지 않는 SDUI 화면 유형입니다.");
  if (locale !== document.locale) fail(400, "SDUI_LOCALE_UNSUPPORTED", "현재 지원하지 않는 SDUI 언어입니다.");
}

function assertNoQuery(url) {
  if (url && !url.searchParams.keys().next().done) {
    fail(400, "SDUI_QUERY_INVALID", "이 SDUI 경로에는 조회 조건을 보낼 수 없습니다.");
  }
}

function isRoleAllowedByResource(reference, role) {
  if (!reference?.resourceId) return true;
  const definition = DATA_RESOURCE_REGISTRY[reference.resourceId];
  return Boolean(definition?.roles.includes(role));
}

function pruneNode(node, role, inheritedRoles) {
  const effectiveRoles = node.roles ?? inheritedRoles;
  if (!effectiveRoles.includes(role)) return null;
  if (!isRoleAllowedByResource(node.dataBinding, role)) return null;
  if (!isRoleAllowedByResource(node.visibility, role)) return null;

  const output = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "children" || key === "actions" || key === "roles") continue;
    output[key] = structuredClone(value);
  }
  if (node.roles) output.roles = [role];

  if (node.actions) {
    const actions = {};
    for (const [event, reference] of Object.entries(node.actions)) {
      const definition = getActionDefinition(reference.actionId);
      if (!definition) continue;
      if (definition.roles && !definition.roles.includes(role)) continue;
      if (["operations", "resource"].includes(definition.handler)
        && (!definition.roles || !definition.requiredPermission)) continue;
      actions[event] = structuredClone(reference);
    }
    if (Object.keys(actions).length > 0) output.actions = actions;
  }

  if (node.children) {
    output.children = node.children
      .map((child) => pruneNode(child, role, effectiveRoles))
      .filter((child) => child !== null);
  }
  return output;
}

export function pruneSduiDocument(document, role) {
  if (!ROLE_VALUES.includes(role)) return null;
  const root = pruneNode(document.root, role, ROLE_VALUES);
  if (!root) return null;
  return {
    ...structuredClone(document),
    root
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function makeEtag(kind, id, revision, role, body) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(canonicalJson(body))));
  const fingerprint = [...digest.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const safeId = id.replace(/[^a-z0-9-]/gi, "-");
  return `"sdui-${kind}-${safeId}-r${revision}-${role}-${fingerprint}"`;
}

export function matchesSduiEtag(ifNoneMatch, etag) {
  if (typeof ifNoneMatch !== "string") return false;
  return ifNoneMatch.split(",").some((candidate) => candidate.trim() === etag);
}

function responseHeaders(revision, etag) {
  return Object.freeze({
    ETag: etag,
    "X-SDUI-Revision": String(revision),
    Vary: "Cf-Access-Jwt-Assertion"
  });
}

function pageForRevision(page, env) {
  const revision = Number(env.SDUI_REVISION);
  if (!Number.isInteger(revision) || !page.revisions[revision]) {
    fail(503, "SDUI_REVISION_MISMATCH", "사용 가능한 SDUI 화면 revision과 설정이 일치하지 않습니다.");
  }
  return page.revisions[revision];
}

export async function getSduiPage({ pageId, url, env, principal, ifNoneMatch }) {
  requirePermission(principal, "dashboard:read");
  const page = PAGE_REGISTRY[pageId];
  if (!page) fail(404, "SDUI_PAGE_NOT_FOUND", "SDUI 화면을 찾을 수 없습니다.");

  assertRole(principal, page.permission, page.roles);
  const document = pageForRevision(page, env);
  assertRuntimeEnabled(env, document.revision);
  assertPageQuery(url, document);

  const pruned = pruneSduiDocument(document, principal.role);
  if (!pruned) fail(403, "SDUI_ROLE_FORBIDDEN", "이 SDUI 화면을 볼 수 있는 역할이 아닙니다.");
  validateSduiDocument(pruned);
  const body = {
    ok: true,
    schema: "harmony.sdui.page-response.v1",
    pageId,
    revision: document.revision,
    document: pruned
  };
  const etag = await makeEtag("page", pageId, document.revision, principal.role, body);
  return Object.freeze({
    notModified: matchesSduiEtag(ifNoneMatch, etag),
    body,
    headers: responseHeaders(document.revision, etag)
  });
}

function resourceEnvelope(resourceId) {
  const loader = RESOURCE_LOADERS[resourceId];
  const definition = DATA_RESOURCE_REGISTRY[resourceId];
  return {
    ok: true,
    schema: "harmony.sdui.data-response.v1",
    resourceId,
    revision: definition.version,
    documentRevision: loader.documentRevision,
    mock: loader.fixture.mock,
    warning: loader.fixture.warning,
    data: structuredClone(loader.fixture.data)
  };
}

async function resolveSduiResource({ resourceId, url, env, principal, ifNoneMatch }) {
  requirePermission(principal, "dashboard:read");
  const definition = DATA_RESOURCE_REGISTRY[resourceId];
  const loader = RESOURCE_LOADERS[resourceId];
  if (!definition || !loader) fail(404, "SDUI_RESOURCE_NOT_FOUND", "SDUI 자료를 찾을 수 없습니다.");
  if (!definition.requiredPermission) {
    fail(503, "SDUI_RESOURCE_CONTRACT_INVALID", "SDUI 자료 계약을 사용할 수 없습니다.");
  }
  assertRole(principal, definition.requiredPermission, definition.roles);
  assertRuntimeEnabled(env, loader.documentRevision);
  assertNoQuery(url);

  const body = resourceEnvelope(resourceId);
  const etag = await makeEtag("data", resourceId, loader.documentRevision, principal.role, body);
  return Object.freeze({
    notModified: matchesSduiEtag(ifNoneMatch, etag),
    body,
    headers: responseHeaders(loader.documentRevision, etag)
  });
}

export async function getSduiResource(options) {
  return resolveSduiResource(options);
}

export async function executeSduiAction({ actionId, input, readInput, url, env, principal, requestId, idempotencyKey }) {
  requirePermission(principal, "dashboard:read");
  const definition = getActionDefinition(actionId);
  if (!definition) fail(404, "SDUI_ACTION_NOT_FOUND", "SDUI 액션을 찾을 수 없습니다.");
  if (!Object.hasOwn(SERVER_ACTION_HANDLERS, actionId)) {
    fail(404, "SDUI_ACTION_NOT_AVAILABLE", "현재 실행할 수 없는 SDUI 액션입니다.");
  }
  if (!definition.roles || !definition.requiredPermission || !definition.input) {
    fail(503, "SDUI_ACTION_CONTRACT_INVALID", "SDUI 액션 계약을 사용할 수 없습니다.");
  }
  assertRole(principal, definition.requiredPermission, definition.roles);
  assertRuntimeEnabled(env, DASHBOARD_DOCUMENT.revision);
  assertNoQuery(url);
  if (definition.idempotency === "none" && idempotencyKey) {
    fail(400, "ACTION_IDEMPOTENCY_NOT_ALLOWED", "이 읽기 전용 액션에는 Idempotency-Key를 사용할 수 없습니다.");
  }

  let validatedInput;
  try {
    const rawInput = readInput ? await readInput() : input;
    validatedInput = validateActionInput(actionId, rawInput);
  } catch (error) {
    if (!(error instanceof SduiActionInputError)) throw error;
    fail(400, error.code, "SDUI 액션 입력을 확인해 주세요.");
  }
  if (validatedInput.revision !== DASHBOARD_DOCUMENT.revision) {
    fail(409, "SDUI_ACTION_REVISION_MISMATCH", "SDUI 액션 revision이 현재 화면과 일치하지 않습니다.");
  }
  if (validatedInput.pageId !== "dashboard" || validatedInput.resourceId !== "dashboard.summary") {
    fail(400, "SDUI_ACTION_TARGET_INVALID", "SDUI 액션 대상이 현재 화면 계약과 일치하지 않습니다.");
  }

  const resource = resourceEnvelope(validatedInput.resourceId);
  const body = {
    ok: true,
    schema: "harmony.sdui.action-response.v1",
    action: {
      id: definition.id,
      version: definition.version,
      idempotency: definition.idempotency
    },
    requestId,
    status: "succeeded",
    result: { resource }
  };
  const etag = await makeEtag("data", validatedInput.resourceId, validatedInput.revision, principal.role, resource);
  return Object.freeze({
    body,
    headers: responseHeaders(validatedInput.revision, etag)
  });
}
