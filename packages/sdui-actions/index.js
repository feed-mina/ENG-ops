export const SDUI_ACTION_CONTRACT_VERSION = "harmony.sdui.actions.v1";

const ACTION_INPUT_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const RESOURCE_REFRESH_INPUT_KEYS = Object.freeze(["pageId", "resourceId", "revision"]);

const registry = {
  "navigation.open-page": {
    version: 1,
    handler: "navigation",
    idempotency: "none",
    description: "등록된 내부 pageId로 이동한다."
  },
  "resource.refresh": {
    version: 1,
    handler: "resource",
    idempotency: "none",
    roles: Object.freeze(["owner", "staff"]),
    requiredPermission: "dashboard:read",
    input: Object.freeze({
      schema: "harmony.sdui.resource-refresh-input.v1",
      required: RESOURCE_REFRESH_INPUT_KEYS,
      allowed: RESOURCE_REFRESH_INPUT_KEYS
    }),
    description: "현재 화면이 허용한 resource를 다시 조회한다."
  },
  "intake.save-draft": {
    version: 1,
    handler: "operations",
    idempotency: "required",
    description: "Mock 접수 초안을 저장한다."
  },
  "placement.confirm-contract": {
    version: 1,
    handler: "operations",
    idempotency: "required",
    description: "서버 검증 후 소개 상태를 계약 확인으로 바꾼다."
  },
  "ui.dismiss-dialog": {
    version: 1,
    handler: "renderer",
    idempotency: "none",
    description: "로컬 확인창을 닫는다."
  }
};

export const ACTION_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(registry).map(([id, definition]) => [id, Object.freeze({ id, ...definition })])
  )
);

export const ACTION_EVENTS = Object.freeze(["press", "submit", "change"]);

export function isRegisteredAction(actionId) {
  return Object.hasOwn(ACTION_REGISTRY, actionId);
}

export class SduiActionInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SduiActionInputError";
    this.code = code;
  }
}

export function getActionDefinition(actionId) {
  return ACTION_REGISTRY[actionId] ?? null;
}

function failInput(code, message) {
  throw new SduiActionInputError(code, message);
}

function assertActionInputId(value, field) {
  if (typeof value !== "string" || value.length > 100 || !ACTION_INPUT_ID_PATTERN.test(value)) {
    failInput("ACTION_INPUT_INVALID", `${field} 값이 올바르지 않습니다.`);
  }
}

export function validateActionInput(actionId, input) {
  const definition = getActionDefinition(actionId);
  if (!definition) failInput("ACTION_NOT_REGISTERED", "등록되지 않은 액션입니다.");
  if (!definition.input) failInput("ACTION_INPUT_CONTRACT_MISSING", "액션 입력 계약이 없습니다.");
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    failInput("ACTION_INPUT_INVALID", "액션 입력은 객체여야 합니다.");
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    failInput("ACTION_INPUT_INVALID", "액션 입력은 일반 객체여야 합니다.");
  }

  const inputKeys = Object.keys(input);
  for (const key of inputKeys) {
    if (!definition.input.allowed.includes(key)) {
      failInput("ACTION_INPUT_UNKNOWN_FIELD", "허용되지 않은 액션 입력 필드가 있습니다.");
    }
  }
  for (const key of definition.input.required) {
    if (!Object.hasOwn(input, key)) failInput("ACTION_INPUT_MISSING_FIELD", "필수 액션 입력 필드가 없습니다.");
  }

  assertActionInputId(input.pageId, "pageId");
  assertActionInputId(input.resourceId, "resourceId");
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    failInput("ACTION_INPUT_INVALID", "revision 값이 올바르지 않습니다.");
  }

  return Object.freeze({
    pageId: input.pageId,
    resourceId: input.resourceId,
    revision: input.revision
  });
}

