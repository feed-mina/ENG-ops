import {
  ACTION_EVENTS,
  ACTION_REGISTRY,
  isRegisteredAction
} from "../sdui-actions/index.js";

/**
 * @typedef {object} SduiActionRef
 * @property {string} actionId Registered action ID; never a URL or HTTP method.
 * @property {"none"|"required"} idempotency Must match the action registry.
 * @property {string} [inputRef] Existing formId in the same document.
 * @property {string} [confirmationKey] Korean message key.
 */

/**
 * @typedef {object} SduiNode
 * @property {string} id Unique node ID in the document.
 * @property {keyof typeof COMPONENT_REGISTRY} type Registered component name.
 * @property {Record<string, unknown>} props Strict component-specific props.
 * @property {SduiNode[]} [children] Child nodes for non-leaf components.
 * @property {Record<string, SduiActionRef>} [actions] Registered event/action references.
 */

/** @typedef {SduiNode & {type: "Page"}} SduiPage */

/**
 * @typedef {object} SduiDocument
 * @property {"harmony.sdui.document.v1"} schema
 * @property {string} documentId
 * @property {number} revision
 * @property {"web"|"mobile"} surface
 * @property {string[]} requiredCapabilities Component@version declarations.
 * @property {SduiPage} root
 */

export const SDUI_DOCUMENT_SCHEMA = "harmony.sdui.document.v1";
export const SDUI_CAPABILITIES_SCHEMA = "harmony.sdui.capabilities.v1";
export const SDUI_CONTRACT_VERSION = "0.1.0";

export const SDUI_LIMITS = Object.freeze({
  maxDocumentBytes: 256 * 1024,
  maxNodes: 500,
  maxDepth: 20,
  maxChildrenPerNode: 100,
  maxArrayItems: 100,
  maxStringLength: 2_000
});

const component = (props = [], { leaf = false, required = [], allowedEvents = [] } = {}) => Object.freeze({
  version: 1,
  leaf,
  props: Object.freeze(props),
  required: Object.freeze(required),
  allowedEvents: Object.freeze(allowedEvents)
});

export const COMPONENT_REGISTRY = Object.freeze({
  Page: component(["titleKey", "descriptionKey"]),
  Section: component(["titleKey", "descriptionKey"]),
  Stack: component(["direction", "gapToken", "align"]),
  Inline: component(["gapToken", "align", "wrap"]),
  Grid: component(["columns", "gapToken", "minColumnWidthToken"]),
  Card: component(["titleKey", "tone"]),
  Divider: component([], { leaf: true }),
  Spacer: component(["sizeToken"], { leaf: true }),
  ScrollArea: component(["maxHeightToken"]),

  Heading: component(["messageKey", "level"], { leaf: true, required: ["messageKey", "level"] }),
  Text: component(["messageKey", "tone"], { leaf: true, required: ["messageKey"] }),
  Label: component(["messageKey", "forNodeId"], { leaf: true, required: ["messageKey", "forNodeId"] }),
  Badge: component(["messageKey", "tone"], { leaf: true, required: ["messageKey"] }),
  Icon: component(["name", "decorative"], { leaf: true, required: ["name", "decorative"] }),
  Image: component(["assetRef", "altKey", "aspectRatio"], { leaf: true, required: ["assetRef", "altKey"] }),
  KeyValueList: component(["items", "emptyMessageKey"], { leaf: true, required: ["items"] }),
  Notice: component(["titleKey", "messageKey", "tone"], { leaf: true, required: ["titleKey", "messageKey"] }),

  Form: component(["formId"], { required: ["formId"], allowedEvents: ["submit"] }),
  TextField: component(["field", "labelKey", "required", "autocomplete"], { leaf: true, required: ["field", "labelKey", "required"], allowedEvents: ["change"] }),
  NumberField: component(["field", "labelKey", "required", "min", "max"], { leaf: true, required: ["field", "labelKey", "required"], allowedEvents: ["change"] }),
  DateField: component(["field", "labelKey", "required"], { leaf: true, required: ["field", "labelKey", "required"], allowedEvents: ["change"] }),
  TimeField: component(["field", "labelKey", "required"], { leaf: true, required: ["field", "labelKey", "required"], allowedEvents: ["change"] }),
  SelectField: component(["field", "labelKey", "required", "options"], { leaf: true, required: ["field", "labelKey", "required", "options"], allowedEvents: ["change"] }),
  CheckboxField: component(["field", "labelKey", "required"], { leaf: true, required: ["field", "labelKey", "required"], allowedEvents: ["change"] }),
  RadioField: component(["field", "labelKey", "required", "options"], { leaf: true, required: ["field", "labelKey", "required", "options"], allowedEvents: ["change"] }),
  TextareaField: component(["field", "labelKey", "required", "maxLength"], { leaf: true, required: ["field", "labelKey", "required"], allowedEvents: ["change"] }),
  ConsentField: component(["field", "labelKey", "required", "purpose"], { leaf: true, required: ["field", "labelKey", "required", "purpose"], allowedEvents: ["change"] }),

  DataTable: component(["columns", "emptyMessageKey"], { leaf: true, required: ["columns"] }),
  List: component(["emptyMessageKey"], { leaf: true }),
  Stat: component(["labelKey", "hintKey"], { leaf: true, required: ["labelKey"] }),
  Timeline: component(["emptyMessageKey"], { leaf: true }),
  StatusChip: component(["labelKey", "tone"], { leaf: true, required: ["labelKey"] }),
  EmptyState: component(["titleKey", "messageKey"], { leaf: true, required: ["titleKey", "messageKey"] }),
  Pagination: component(["pageSize"], { leaf: true, required: ["pageSize"], allowedEvents: ["change"] }),

  Button: component(["labelKey", "tone", "disabled"], { leaf: true, required: ["labelKey"], allowedEvents: ["press"] }),
  LinkButton: component(["labelKey", "tone"], { leaf: true, required: ["labelKey"], allowedEvents: ["press"] }),
  Tabs: component(["items", "selectedId"], { required: ["items"], allowedEvents: ["change"] }),
  Dialog: component(["titleKey", "open"], { leaf: true, required: ["titleKey", "open"] }),
  ConfirmDialog: component(["titleKey", "messageKey", "tone"], { leaf: true, required: ["titleKey", "messageKey"] }),
  ToastRegion: component(["position"], { leaf: true, required: ["position"] }),
  NavigationItem: component(["labelKey", "pageId", "icon"], { leaf: true, required: ["labelKey", "pageId"], allowedEvents: ["press"] })
});

export const DATA_RESOURCE_REGISTRY = Object.freeze({
  "dashboard.summary": Object.freeze({
    version: 1,
    roles: Object.freeze(["owner", "staff"]),
    requiredPermission: "dashboard:read",
    schema: "harmony.mock.dashboard-summary.v1"
  }),
  "compliance.calendar": Object.freeze({
    version: 1,
    roles: Object.freeze(["owner", "staff"]),
    requiredPermission: "dashboard:read",
    schema: "harmony.mock.compliance-calendar.v1"
  }),
  "field-audit.summary": Object.freeze({ version: 1, roles: Object.freeze(["owner"]) }),
  "restaurant.intake": Object.freeze({ version: 1, roles: Object.freeze(["owner", "staff"]) }),
  "worker.intake": Object.freeze({ version: 1, roles: Object.freeze(["owner", "staff"]) }),
  "matching.candidates": Object.freeze({ version: 1, roles: Object.freeze(["owner", "staff"]) }),
  "ledger.entries": Object.freeze({ version: 1, roles: Object.freeze(["owner"]) }),
  "documents.list": Object.freeze({ version: 1, roles: Object.freeze(["owner"]) }),
  "audit.events": Object.freeze({ version: 1, roles: Object.freeze(["owner", "system_admin"]) })
});

export const FORMATTER_REGISTRY = Object.freeze({
  number: Object.freeze({ version: 1 }),
  currencyKr: Object.freeze({ version: 1 }),
  dateKr: Object.freeze({ version: 1 }),
  timeKr: Object.freeze({ version: 1 }),
  maskedPhone: Object.freeze({ version: 1 }),
  status: Object.freeze({ version: 1 })
});

export const ROLE_VALUES = Object.freeze(["owner", "staff", "system_admin"]);

const DOCUMENT_KEYS = new Set([
  "schema", "documentId", "revision", "pageId", "locale", "surface",
  "minRendererVersion", "themeRef", "requiredCapabilities", "root"
]);
const NODE_KEYS = new Set([
  "id", "type", "props", "children", "style", "roles", "visibility",
  "dataBinding", "actions", "accessibility", "extensions"
]);
const STYLE_TOKEN_GROUPS = Object.freeze({
  gap: "space",
  padding: "space",
  paddingX: "space",
  paddingY: "space",
  marginTop: "space",
  width: "space",
  maxWidth: "space",
  minHeight: "space",
  background: "color",
  borderRadius: "radius",
  color: "color"
});
const STYLE_KEYS = new Set(Object.keys(STYLE_TOKEN_GROUPS));
const ACTION_REF_KEYS = new Set(["actionId", "inputRef", "confirmationKey", "idempotency"]);
const BINDING_KEYS = new Set(["resourceId", "pointer", "formatter"]);
const VISIBILITY_KEYS = new Set(["kind", "resourceId", "pointer", "value"]);
const ACCESSIBILITY_KEYS = new Set(["labelKey", "descriptionKey", "role", "live"]);
const EXTENSION_KEYS = new Set(["web", "mobile"]);
const CAPABILITIES_KEYS = new Set(["schema", "rendererVersion", "surface", "schemas", "components", "actions", "formatters"]);

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const FORMATTER_ID_PATTERN = /^[a-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
const MESSAGE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const POINTER_PATTERN = /^(?:|\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*))$/;
const TOKEN_PATTERN = /^(?:space|radius|color)\.[a-z0-9.-]+$/;
const ASSET_REF_PATTERN = /^[a-z0-9][a-z0-9._/-]*$/;
const BANNED_KEY_PATTERN = /^(?:__proto__|prototype|constructor|html|innerhtml|dangerouslysetinnerhtml|script|scripts|javascript|css|sql|query|url|href|src|endpoint|method|headers|fetch|onclick|on[a-z]+)$/i;
const UNSAFE_STRING_PATTERN = /<\/?[a-z][^>]*>|javascript:|data:text\/html|https?:\/\//i;
const MESSAGE_PROP_NAMES = new Set([
  "titleKey", "descriptionKey", "messageKey", "altKey", "emptyMessageKey", "labelKey", "hintKey"
]);
const TOKEN_PROP_GROUPS = Object.freeze({
  gapToken: "space",
  minColumnWidthToken: "space",
  sizeToken: "space",
  maxHeightToken: "space"
});
const BOOLEAN_PROP_NAMES = new Set(["wrap", "decorative", "required", "disabled", "open"]);
const IDENTIFIER_PROP_NAMES = new Set(["forNodeId", "formId", "field", "purpose", "selectedId", "pageId", "icon", "name"]);
const TONE_VALUES = new Set(["neutral", "muted", "important", "accent", "info", "success", "warning", "danger"]);
const ALIGN_VALUES = new Set(["start", "center", "end", "stretch", "space-between"]);
const AUTOCOMPLETE_VALUES = new Set(["off", "name", "tel", "email", "organization", "street-address", "postal-code", "bday"]);
const ASPECT_RATIO_VALUES = new Set(["auto", "1:1", "4:3", "16:9"]);
const TOAST_POSITION_VALUES = new Set(["top", "bottom", "top-start", "top-end", "bottom-start", "bottom-end"]);
const OPTION_KEYS = new Set(["value", "labelKey"]);
const KEY_VALUE_ITEM_KEYS = new Set(["labelKey", "pointer", "formatter"]);
const TAB_ITEM_KEYS = new Set(["id", "labelKey"]);
const TABLE_COLUMN_KEYS = new Set(["id", "labelKey", "pointer", "formatter"]);
const INPUT_COMPONENT_TYPES = new Set([
  "TextField", "NumberField", "DateField", "TimeField", "SelectField",
  "CheckboxField", "RadioField", "TextareaField", "ConsentField"
]);

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export class SduiValidationError extends Error {
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = "SduiValidationError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new SduiValidationError(code, path, message);
}

function assertRecord(value, path) {
  if (!isRecord(value)) fail("INVALID_OBJECT", path, "객체여야 합니다.");
}

function assertAllowedKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (BANNED_KEY_PATTERN.test(key)) fail("FORBIDDEN_KEY", `${path}.${key}`, "실행 코드·URL·query 관련 키는 허용되지 않습니다.");
    if (!allowed.has(key)) fail("UNKNOWN_FIELD", `${path}.${key}`, "등록되지 않은 필드입니다.");
  }
}

function assertString(value, path, { pattern, max = SDUI_LIMITS.maxStringLength } = {}) {
  if (typeof value !== "string" || value.length === 0) fail("INVALID_STRING", path, "빈 문자열이 아닌 문자열이어야 합니다.");
  if (value.length > max) fail("STRING_TOO_LONG", path, `문자열은 ${max}자를 넘을 수 없습니다.`);
  if (UNSAFE_STRING_PATTERN.test(value)) fail("UNSAFE_STRING", path, "HTML 또는 외부 URL 문자열은 허용되지 않습니다.");
  if (pattern && !pattern.test(value)) fail("INVALID_FORMAT", path, "허용된 형식이 아닙니다.");
  return value;
}

function validateJsonValue(value, path, depth = 0) {
  if (depth > 10) fail("VALUE_TOO_DEEP", path, "속성 값의 중첩이 너무 깊습니다.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("INVALID_NUMBER", path, "유한한 숫자여야 합니다.");
    return;
  }
  if (typeof value === "string") {
    assertString(value, path);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > SDUI_LIMITS.maxArrayItems) fail("ARRAY_TOO_LARGE", path, "배열 항목이 너무 많습니다.");
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, depth + 1));
    return;
  }
  assertRecord(value, path);
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_KEY_PATTERN.test(key)) fail("FORBIDDEN_KEY", `${path}.${key}`, "실행 코드·URL·query 관련 키는 허용되지 않습니다.");
    validateJsonValue(child, `${path}.${key}`, depth + 1);
  }
}

function assertPropString(value, path, options = {}) {
  if (typeof value !== "string") fail("INVALID_PROP_TYPE", path, "prop must be a string.");
  assertString(value, path, options);
}

function assertPropBoolean(value, path) {
  if (typeof value !== "boolean") fail("INVALID_PROP_TYPE", path, "prop must be a boolean.");
}

function assertPropNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail("INVALID_PROP_TYPE", path, "prop must be a finite number.");
}

function assertPropInteger(value, path, minimum, maximum) {
  if (!Number.isInteger(value)) fail("INVALID_PROP_TYPE", path, "prop must be an integer.");
  if (value < minimum || value > maximum) fail("INVALID_PROP", path, `prop must be between ${minimum} and ${maximum}.`);
}

function assertPropEnum(value, path, values) {
  assertPropString(value, path, { max: 80 });
  if (!values.has(value)) fail("INVALID_PROP", path, "prop is not an allowed enum value.");
}

function assertPropArray(value, path) {
  if (!Array.isArray(value)) fail("INVALID_PROP_TYPE", path, "prop must be an array.");
  if (value.length === 0) fail("INVALID_PROP", path, "prop array must not be empty.");
  if (value.length > SDUI_LIMITS.maxArrayItems) fail("ARRAY_TOO_LARGE", path, "prop array has too many items.");
}

function assertRequiredObjectKeys(value, required, path) {
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail("MISSING_PROP", `${path}.${key}`, "required nested prop is missing.");
  }
}

function validatePointerProp(value, path) {
  if (typeof value !== "string") fail("INVALID_PROP_TYPE", path, "prop must be a string.");
  if (value.length > 200) fail("STRING_TOO_LONG", path, "JSON Pointer는 200자를 넘을 수 없습니다.");
  if (!POINTER_PATTERN.test(value)) fail("INVALID_FORMAT", path, "허용된 JSON Pointer 형식이 아닙니다.");
  if (/(?:^|\/)(?:__proto__|prototype|constructor)(?:\/|$)/i.test(value)) {
    fail("UNSAFE_POINTER", path, "unsafe JSON pointer segment is not allowed.");
  }
}

function validateFormatterProp(value, path) {
  assertPropString(value, path, { pattern: FORMATTER_ID_PATTERN, max: 80 });
  if (!Object.hasOwn(FORMATTER_REGISTRY, value)) fail("UNKNOWN_FORMATTER", path, "formatter is not registered.");
}

function collectPropFormatters(value, result) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPropFormatters(item, result));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "formatter" && typeof child === "string" && Object.hasOwn(FORMATTER_REGISTRY, child)) {
      result.add(`${child}@${FORMATTER_REGISTRY[child].version}`);
    }
    collectPropFormatters(child, result);
  }
}

function validateOptions(value, path) {
  assertPropArray(value, path);
  const seenValues = new Set();
  value.forEach((option, index) => {
    const optionPath = `${path}[${index}]`;
    assertRecord(option, optionPath);
    assertAllowedKeys(option, OPTION_KEYS, optionPath);
    assertRequiredObjectKeys(option, OPTION_KEYS, optionPath);
    assertPropString(option.value, `${optionPath}.value`, { pattern: ID_PATTERN, max: 80 });
    assertPropString(option.labelKey, `${optionPath}.labelKey`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
    if (seenValues.has(option.value)) fail("INVALID_PROP", `${optionPath}.value`, "option values must be unique.");
    seenValues.add(option.value);
  });
}

function validateKeyValueItems(value, path) {
  assertPropArray(value, path);
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    assertRecord(item, itemPath);
    assertAllowedKeys(item, KEY_VALUE_ITEM_KEYS, itemPath);
    assertRequiredObjectKeys(item, new Set(["labelKey", "pointer"]), itemPath);
    assertPropString(item.labelKey, `${itemPath}.labelKey`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
    validatePointerProp(item.pointer, `${itemPath}.pointer`);
    if (item.formatter !== undefined) validateFormatterProp(item.formatter, `${itemPath}.formatter`);
  });
}

function validateTabItems(value, path) {
  assertPropArray(value, path);
  const seenIds = new Set();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    assertRecord(item, itemPath);
    assertAllowedKeys(item, TAB_ITEM_KEYS, itemPath);
    assertRequiredObjectKeys(item, TAB_ITEM_KEYS, itemPath);
    assertPropString(item.id, `${itemPath}.id`, { pattern: ID_PATTERN, max: 80 });
    assertPropString(item.labelKey, `${itemPath}.labelKey`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
    if (seenIds.has(item.id)) fail("INVALID_PROP", `${itemPath}.id`, "tab ids must be unique.");
    seenIds.add(item.id);
  });
}

function validateTableColumns(value, path) {
  assertPropArray(value, path);
  const seenIds = new Set();
  value.forEach((column, index) => {
    const columnPath = `${path}[${index}]`;
    assertRecord(column, columnPath);
    assertAllowedKeys(column, TABLE_COLUMN_KEYS, columnPath);
    assertRequiredObjectKeys(column, new Set(["id", "labelKey", "pointer"]), columnPath);
    assertPropString(column.id, `${columnPath}.id`, { pattern: ID_PATTERN, max: 80 });
    assertPropString(column.labelKey, `${columnPath}.labelKey`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
    validatePointerProp(column.pointer, `${columnPath}.pointer`);
    if (column.formatter !== undefined) validateFormatterProp(column.formatter, `${columnPath}.formatter`);
    if (seenIds.has(column.id)) fail("INVALID_PROP", `${columnPath}.id`, "column ids must be unique.");
    seenIds.add(column.id);
  });
}

function validateComponentProp(node, key, value, path) {
  if (MESSAGE_PROP_NAMES.has(key)) {
    assertPropString(value, path, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
    return;
  }
  if (Object.hasOwn(TOKEN_PROP_GROUPS, key)) {
    assertPropString(value, path, { pattern: TOKEN_PATTERN, max: 80 });
    if (!value.startsWith(`${TOKEN_PROP_GROUPS[key]}.`)) {
      fail("INVALID_TOKEN_GROUP", path, `${key}에는 ${TOKEN_PROP_GROUPS[key]} token만 허용됩니다.`);
    }
    return;
  }
  if (BOOLEAN_PROP_NAMES.has(key)) {
    assertPropBoolean(value, path);
    return;
  }
  if (IDENTIFIER_PROP_NAMES.has(key)) {
    assertPropString(value, path, { pattern: ID_PATTERN, max: 100 });
    return;
  }

  switch (key) {
    case "direction":
      assertPropEnum(value, path, new Set(["vertical", "horizontal"]));
      return;
    case "align":
      assertPropEnum(value, path, ALIGN_VALUES);
      return;
    case "tone":
      assertPropEnum(value, path, TONE_VALUES);
      return;
    case "level":
      assertPropInteger(value, path, 1, 6);
      return;
    case "columns":
      if (node.type === "Grid") assertPropInteger(value, path, 1, 4);
      else if (node.type === "DataTable") validateTableColumns(value, path);
      else fail("UNVALIDATED_PROP", path, `columns is not defined for ${node.type}.`);
      return;
    case "assetRef":
      assertPropString(value, path, { pattern: ASSET_REF_PATTERN, max: 200 });
      if (value.split("/").some((segment) => segment === "." || segment === "..")) {
        fail("INVALID_FORMAT", path, "assetRef must not contain dot path segments.");
      }
      return;
    case "aspectRatio":
      assertPropEnum(value, path, ASPECT_RATIO_VALUES);
      return;
    case "items":
      if (node.type === "KeyValueList") validateKeyValueItems(value, path);
      else if (node.type === "Tabs") validateTabItems(value, path);
      else fail("UNVALIDATED_PROP", path, `items is not defined for ${node.type}.`);
      return;
    case "autocomplete":
      assertPropEnum(value, path, AUTOCOMPLETE_VALUES);
      return;
    case "min":
    case "max":
      assertPropNumber(value, path);
      return;
    case "options":
      validateOptions(value, path);
      return;
    case "maxLength":
      assertPropInteger(value, path, 1, SDUI_LIMITS.maxStringLength);
      return;
    case "pageSize":
      assertPropInteger(value, path, 1, 100);
      return;
    case "position":
      assertPropEnum(value, path, TOAST_POSITION_VALUES);
      return;
    default:
      fail("UNVALIDATED_PROP", path, `${node.type}.${key} has no strict prop validator.`);
  }
}

function validateStrictProps(node, definition, path) {
  const propsPath = `${path}.props`;
  assertRecord(node.props, propsPath);
  const allowed = new Set(definition.props);
  for (const requiredProp of definition.required) {
    if (!Object.hasOwn(node.props, requiredProp)) fail("MISSING_PROP", `${propsPath}.${requiredProp}`, `${node.type} requires this prop.`);
  }
  for (const [key, value] of Object.entries(node.props)) {
    const propPath = `${propsPath}.${key}`;
    if (BANNED_KEY_PATTERN.test(key)) fail("FORBIDDEN_KEY", propPath, "executable, URL, query, and raw markup props are forbidden.");
    if (!allowed.has(key)) fail("UNKNOWN_PROP", propPath, `${node.type} does not register this prop.`);
    validateComponentProp(node, key, value, propPath);
  }

  if (node.type === "NumberField" && node.props.min !== undefined && node.props.max !== undefined && node.props.min > node.props.max) {
    fail("INVALID_PROP", `${propsPath}.max`, "max must be greater than or equal to min.");
  }
  if (node.type === "Tabs" && node.props.selectedId !== undefined) {
    const itemIds = new Set(node.props.items.map((item) => item.id));
    if (!itemIds.has(node.props.selectedId)) fail("INVALID_PROP", `${propsPath}.selectedId`, "selectedId must reference a tab item.");
  }
}

function validateStyle(style, path) {
  assertRecord(style, path);
  for (const [key, value] of Object.entries(style)) {
    if (!STYLE_KEYS.has(key)) fail("UNKNOWN_STYLE", `${path}.${key}`, "등록되지 않은 style 속성입니다.");
    assertString(value, `${path}.${key}`, { pattern: TOKEN_PATTERN, max: 80 });
    if (!value.startsWith(`${STYLE_TOKEN_GROUPS[key]}.`)) {
      fail("INVALID_TOKEN_GROUP", `${path}.${key}`, `${key}에는 ${STYLE_TOKEN_GROUPS[key]} token만 허용됩니다.`);
    }
  }
}

function validateRoles(roles, path) {
  if (!Array.isArray(roles) || roles.length === 0) fail("INVALID_ROLES", path, "roles는 하나 이상의 역할 배열이어야 합니다.");
  if (new Set(roles).size !== roles.length) fail("DUPLICATE_ROLE", path, "역할이 중복되었습니다.");
  roles.forEach((role, index) => {
    if (!ROLE_VALUES.includes(role)) fail("UNKNOWN_ROLE", `${path}[${index}]`, "등록되지 않은 역할입니다.");
  });
}

function validateDataBinding(binding, path, effectiveRoles, state) {
  assertRecord(binding, path);
  assertAllowedKeys(binding, BINDING_KEYS, path);
  assertString(binding.resourceId, `${path}.resourceId`, { pattern: ID_PATTERN, max: 100 });
  if (!Object.hasOwn(DATA_RESOURCE_REGISTRY, binding.resourceId)) fail("UNKNOWN_RESOURCE", `${path}.resourceId`, "등록되지 않은 data resource입니다.");
  const resourceRoles = DATA_RESOURCE_REGISTRY[binding.resourceId].roles;
  for (const role of effectiveRoles) {
    if (!resourceRoles.includes(role)) {
      fail("RESOURCE_ROLE_MISMATCH", `${path}.resourceId`, `${binding.resourceId} does not allow effective role ${role}.`);
    }
  }
  validatePointerProp(binding.pointer, `${path}.pointer`);
  if (binding.formatter !== undefined) {
    assertString(binding.formatter, `${path}.formatter`, { pattern: FORMATTER_ID_PATTERN, max: 80 });
    if (!Object.hasOwn(FORMATTER_REGISTRY, binding.formatter)) fail("UNKNOWN_FORMATTER", `${path}.formatter`, "등록되지 않은 formatter입니다.");
    state.usedFormatters.add(`${binding.formatter}@${FORMATTER_REGISTRY[binding.formatter].version}`);
  }
}

function validateActions(actions, path, state, allowedEvents) {
  assertRecord(actions, path);
  for (const [event, reference] of Object.entries(actions)) {
    if (!ACTION_EVENTS.includes(event)) fail("UNKNOWN_ACTION_EVENT", `${path}.${event}`, "등록되지 않은 Action event입니다.");
    if (!allowedEvents.includes(event)) fail("INVALID_COMPONENT_ACTION_EVENT", `${path}.${event}`, "이 component에서 허용되지 않은 Action event입니다.");
    assertRecord(reference, `${path}.${event}`);
    assertAllowedKeys(reference, ACTION_REF_KEYS, `${path}.${event}`);
    assertString(reference.actionId, `${path}.${event}.actionId`, { pattern: ID_PATTERN, max: 100 });
    if (!isRegisteredAction(reference.actionId)) fail("UNKNOWN_ACTION", `${path}.${event}.actionId`, "등록되지 않은 Action ID입니다.");
    state.usedActions.add(`${reference.actionId}@${ACTION_REGISTRY[reference.actionId].version}`);
    if (!Object.hasOwn(reference, "idempotency")) {
      fail("MISSING_IDEMPOTENCY", `${path}.${event}.idempotency`, "Action idempotency must be explicit and match the registry.");
    }
    if (reference.inputRef !== undefined) {
      assertString(reference.inputRef, `${path}.${event}.inputRef`, { pattern: ID_PATTERN, max: 100 });
      state.formRefs.push(Object.freeze({ path: `${path}.${event}.inputRef`, value: reference.inputRef }));
    }
    if (reference.confirmationKey !== undefined) assertString(reference.confirmationKey, `${path}.${event}.confirmationKey`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
    if (!new Set(["none", "required"]).has(reference.idempotency)) fail("INVALID_IDEMPOTENCY", `${path}.${event}.idempotency`, "none 또는 required만 허용됩니다.");
    if (reference.idempotency !== ACTION_REGISTRY[reference.actionId].idempotency) {
      fail("IDEMPOTENCY_MISMATCH", `${path}.${event}.idempotency`, "Action registry의 idempotency와 일치해야 합니다.");
    }
  }
}

function validateVisibility(visibility, path, effectiveRoles, state) {
  assertRecord(visibility, path);
  assertAllowedKeys(visibility, VISIBILITY_KEYS, path);
  if (!new Set(["data-present", "equals", "not-equals"]).has(visibility.kind)) fail("INVALID_VISIBILITY", `${path}.kind`, "등록되지 않은 표시 조건입니다.");
  validateDataBinding({
    resourceId: visibility.resourceId,
    pointer: visibility.pointer,
    ...(visibility.formatter ? { formatter: visibility.formatter } : {})
  }, path, effectiveRoles, state);
  if (visibility.value !== undefined) validateJsonValue(visibility.value, `${path}.value`);
}

function validateAccessibility(accessibility, path) {
  assertRecord(accessibility, path);
  assertAllowedKeys(accessibility, ACCESSIBILITY_KEYS, path);
  if (accessibility.labelKey !== undefined) assertString(accessibility.labelKey, `${path}.labelKey`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
  if (accessibility.descriptionKey !== undefined) assertString(accessibility.descriptionKey, `${path}.descriptionKey`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
  if (accessibility.role !== undefined && !new Set(["none", "region", "navigation", "status", "alert"]).has(accessibility.role)) {
    fail("INVALID_ACCESSIBILITY_ROLE", `${path}.role`, "허용되지 않은 접근성 role입니다.");
  }
  if (accessibility.live !== undefined && !new Set(["off", "polite", "assertive"]).has(accessibility.live)) {
    fail("INVALID_LIVE_REGION", `${path}.live`, "허용되지 않은 live 값입니다.");
  }
}

function validateExtensions(extensions, path) {
  assertRecord(extensions, path);
  assertAllowedKeys(extensions, EXTENSION_KEYS, path);
  for (const [surface, value] of Object.entries(extensions)) validateJsonValue(value, `${path}.${surface}`);
}

function validateNode(node, path, depth, state, ancestors, parentRoles) {
  if (depth > SDUI_LIMITS.maxDepth) fail("TREE_TOO_DEEP", path, `트리 깊이는 ${SDUI_LIMITS.maxDepth}를 넘을 수 없습니다.`);
  assertRecord(node, path);
  if (ancestors.has(node)) fail("CYCLIC_STRUCTURE", path, "순환 node 구조는 허용되지 않습니다.");
  ancestors.add(node);
  assertAllowedKeys(node, NODE_KEYS, path);

  assertString(node.id, `${path}.id`, { pattern: ID_PATTERN, max: 80 });
  if (state.ids.has(node.id)) fail("DUPLICATE_NODE_ID", `${path}.id`, `중복 node ID: ${node.id}`);
  state.ids.add(node.id);
  state.nodeTypes.set(node.id, node.type);
  state.nodeCount += 1;
  if (state.nodeCount > SDUI_LIMITS.maxNodes) fail("TOO_MANY_NODES", path, `node는 ${SDUI_LIMITS.maxNodes}개를 넘을 수 없습니다.`);

  assertString(node.type, `${path}.type`, { max: 80 });
  const definition = COMPONENT_REGISTRY[node.type];
  if (!definition) fail("UNKNOWN_COMPONENT", `${path}.type`, `등록되지 않은 component: ${node.type}`);
  state.usedCapabilities.add(`${node.type}@${definition.version}`);
  validateStrictProps(node, definition, path);
  collectPropFormatters(node.props, state.usedFormatters);

  if (node.type === "Label") {
    state.labelRefs.push(Object.freeze({ path: `${path}.props.forNodeId`, value: node.props.forNodeId }));
  }
  if (node.type === "Form") {
    if (state.formIds.has(node.props.formId)) fail("DUPLICATE_FORM_ID", `${path}.props.formId`, "formId가 중복되었습니다.");
    state.formIds.add(node.props.formId);
  }
  if (INPUT_COMPONENT_TYPES.has(node.type)) {
    if (state.fieldIds.has(node.props.field)) fail("DUPLICATE_FIELD_ID", `${path}.props.field`, "field가 중복되었습니다.");
    state.fieldIds.add(node.props.field);
  }
  if (node.type === "NavigationItem") state.navigationPageRefs.add(node.props.pageId);

  const children = node.children ?? [];
  if (!Array.isArray(children)) fail("INVALID_CHILDREN", `${path}.children`, "children은 배열이어야 합니다.");
  if (children.length > SDUI_LIMITS.maxChildrenPerNode) fail("TOO_MANY_CHILDREN", `${path}.children`, "한 node의 children이 너무 많습니다.");
  if (definition.leaf && children.length > 0) fail("LEAF_WITH_CHILDREN", `${path}.children`, `${node.type}은 children을 가질 수 없습니다.`);

  if (node.style !== undefined) validateStyle(node.style, `${path}.style`);
  let effectiveRoles = parentRoles;
  if (node.roles !== undefined) {
    validateRoles(node.roles, `${path}.roles`);
    for (const role of node.roles) {
      if (!parentRoles.includes(role)) {
        fail("ROLE_WIDENING", `${path}.roles`, `child role ${role} is not allowed by its parent.`);
      }
    }
    effectiveRoles = node.roles;
  }
  if (node.dataBinding !== undefined) validateDataBinding(node.dataBinding, `${path}.dataBinding`, effectiveRoles, state);
  if (node.actions !== undefined) validateActions(node.actions, `${path}.actions`, state, definition.allowedEvents);
  if (node.visibility !== undefined) validateVisibility(node.visibility, `${path}.visibility`, effectiveRoles, state);
  if (node.accessibility !== undefined) validateAccessibility(node.accessibility, `${path}.accessibility`);
  if (node.extensions !== undefined) validateExtensions(node.extensions, `${path}.extensions`);

  children.forEach((child, index) => validateNode(child, `${path}.children[${index}]`, depth + 1, state, ancestors, effectiveRoles));
  ancestors.delete(node);
}

export function validateSduiDocument(input) {
  assertRecord(input, "$" );
  assertAllowedKeys(input, DOCUMENT_KEYS, "$" );
  if (input.schema !== SDUI_DOCUMENT_SCHEMA) fail("UNSUPPORTED_SCHEMA", "$.schema", `schema는 ${SDUI_DOCUMENT_SCHEMA}여야 합니다.`);
  assertString(input.documentId, "$.documentId", { pattern: ID_PATTERN, max: 100 });
  if (!Number.isInteger(input.revision) || input.revision < 1) fail("INVALID_REVISION", "$.revision", "revision은 1 이상의 정수여야 합니다.");
  assertString(input.pageId, "$.pageId", { pattern: ID_PATTERN, max: 80 });
  if (input.locale !== "ko") fail("UNSUPPORTED_LOCALE", "$.locale", "초기 버전은 ko locale만 지원합니다.");
  if (!new Set(["web", "mobile"]).has(input.surface)) fail("UNSUPPORTED_SURFACE", "$.surface", "surface는 web 또는 mobile이어야 합니다.");
  assertString(input.minRendererVersion, "$.minRendererVersion", { pattern: SEMVER_PATTERN, max: 40 });
  assertString(input.themeRef, "$.themeRef", { pattern: ID_PATTERN, max: 100 });

  if (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.length === 0) {
    fail("INVALID_CAPABILITIES", "$.requiredCapabilities", "필수 capability 배열이 필요합니다.");
  }
  const required = new Set();
  input.requiredCapabilities.forEach((capability, index) => {
    assertString(capability, `$.requiredCapabilities[${index}]`, { max: 100 });
    if (!/^[A-Za-z][A-Za-z0-9]+@\d+$/.test(capability)) fail("INVALID_CAPABILITY", `$.requiredCapabilities[${index}]`, "Component@version 형식이어야 합니다.");
    const [type, version] = capability.split("@");
    if (!COMPONENT_REGISTRY[type] || COMPONENT_REGISTRY[type].version !== Number(version)) {
      fail("UNKNOWN_CAPABILITY", `$.requiredCapabilities[${index}]`, "renderer registry에 없는 capability입니다.");
    }
    if (required.has(capability)) fail("DUPLICATE_CAPABILITY", `$.requiredCapabilities[${index}]`, "capability가 중복되었습니다.");
    required.add(capability);
  });

  const state = {
    ids: new Set(),
    nodeTypes: new Map(),
    formIds: new Set(),
    fieldIds: new Set(),
    labelRefs: [],
    formRefs: [],
    navigationPageRefs: new Set(),
    usedCapabilities: new Set(),
    usedActions: new Set(),
    usedFormatters: new Set(),
    nodeCount: 0
  };
  validateNode(input.root, "$.root", 1, state, new Set(), ROLE_VALUES);
  if (input.root.type !== "Page") fail("ROOT_MUST_BE_PAGE", "$.root.type", "root component는 Page여야 합니다.");
  for (const reference of state.labelRefs) {
    if (!INPUT_COMPONENT_TYPES.has(state.nodeTypes.get(reference.value))) {
      fail("UNRESOLVED_LABEL_TARGET", reference.path, "Label은 존재하는 입력 component node를 가리켜야 합니다.");
    }
  }
  for (const reference of state.formRefs) {
    if (!state.formIds.has(reference.value)) fail("UNRESOLVED_FORM_REF", reference.path, "inputRef는 존재하는 formId를 가리켜야 합니다.");
  }
  for (const capability of state.usedCapabilities) {
    if (!required.has(capability)) fail("MISSING_CAPABILITY", "$.requiredCapabilities", `사용한 ${capability}가 선언되지 않았습니다.`);
  }

  let serialized;
  try {
    serialized = JSON.stringify(input);
  } catch {
    fail("NOT_SERIALIZABLE", "$", "JSON으로 직렬화할 수 없는 문서입니다.");
  }
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > SDUI_LIMITS.maxDocumentBytes) fail("DOCUMENT_TOO_LARGE", "$", `문서는 ${SDUI_LIMITS.maxDocumentBytes} bytes를 넘을 수 없습니다.`);

  return Object.freeze({
    valid: true,
    schema: input.schema,
    documentId: input.documentId,
    revision: input.revision,
    nodeCount: state.nodeCount,
    byteLength,
    usedCapabilities: Object.freeze([...state.usedCapabilities].sort()),
    usedActions: Object.freeze([...state.usedActions].sort()),
    usedFormatters: Object.freeze([...state.usedFormatters].sort()),
    navigationPageRefs: Object.freeze([...state.navigationPageRefs].sort())
  });
}

export function checkSduiDocument(input) {
  try {
    return validateSduiDocument(input);
  } catch (error) {
    if (!(error instanceof SduiValidationError)) throw error;
    return Object.freeze({
      valid: false,
      issues: Object.freeze([{ code: error.code, path: error.path, message: error.message }])
    });
  }
}

export function validateRendererCapabilities(input) {
  assertRecord(input, "$" );
  assertAllowedKeys(input, CAPABILITIES_KEYS, "$" );
  if (input.schema !== SDUI_CAPABILITIES_SCHEMA) {
    fail("UNSUPPORTED_CAPABILITIES_SCHEMA", "$.schema", `schema는 ${SDUI_CAPABILITIES_SCHEMA}여야 합니다.`);
  }
  assertString(input.rendererVersion, "$.rendererVersion", { pattern: SEMVER_PATTERN, max: 40 });
  if (!new Set(["web", "mobile"]).has(input.surface)) fail("UNSUPPORTED_SURFACE", "$.surface", "surface는 web 또는 mobile이어야 합니다.");
  if (!Array.isArray(input.schemas) || input.schemas.length === 0) fail("INVALID_SCHEMAS", "$.schemas", "지원 schema 배열이 필요합니다.");
  input.schemas.forEach((schema, index) => {
    assertString(schema, `$.schemas[${index}]`, { pattern: ID_PATTERN, max: 100 });
  });
  if (new Set(input.schemas).size !== input.schemas.length) fail("DUPLICATE_SCHEMA", "$.schemas", "schema가 중복되었습니다.");

  assertRecord(input.components, "$.components");
  if (Object.keys(input.components).length === 0) fail("INVALID_COMPONENTS", "$.components", "하나 이상의 component capability가 필요합니다.");
  for (const [type, version] of Object.entries(input.components)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(type)) fail("INVALID_CAPABILITY_NAME", `$.components.${type}`, "안전한 component capability 이름이 아닙니다.");
    if (!Number.isInteger(version) || version < 1) fail("INVALID_CAPABILITY_VERSION", `$.components.${type}`, "지원 version은 1 이상의 정수여야 합니다.");
  }

  assertRecord(input.actions, "$.actions");
  for (const [actionId, version] of Object.entries(input.actions)) {
    if (!ID_PATTERN.test(actionId)) fail("INVALID_CAPABILITY_NAME", `$.actions.${actionId}`, "안전한 Action capability 이름이 아닙니다.");
    if (!Number.isInteger(version) || version < 1) fail("INVALID_CAPABILITY_VERSION", `$.actions.${actionId}`, "지원 version은 1 이상의 정수여야 합니다.");
  }

  assertRecord(input.formatters, "$.formatters");
  for (const [formatterId, version] of Object.entries(input.formatters)) {
    if (!FORMATTER_ID_PATTERN.test(formatterId)) fail("INVALID_CAPABILITY_NAME", `$.formatters.${formatterId}`, "안전한 formatter capability 이름이 아닙니다.");
    if (!Number.isInteger(version) || version < 1) fail("INVALID_CAPABILITY_VERSION", `$.formatters.${formatterId}`, "지원 version은 1 이상의 정수여야 합니다.");
  }

  return Object.freeze({
    valid: true,
    rendererVersion: input.rendererVersion,
    surface: input.surface,
    componentCount: Object.keys(input.components).length,
    actionCount: Object.keys(input.actions).length,
    formatterCount: Object.keys(input.formatters).length
  });
}

function compareSemver(left, right) {
  const leftSeparator = left.indexOf("-");
  const rightSeparator = right.indexOf("-");
  const leftCore = leftSeparator === -1 ? left : left.slice(0, leftSeparator);
  const rightCore = rightSeparator === -1 ? right : right.slice(0, rightSeparator);
  const leftPrerelease = leftSeparator === -1 ? undefined : left.slice(leftSeparator + 1);
  const rightPrerelease = rightSeparator === -1 ? undefined : right.slice(rightSeparator + 1);
  const leftParts = leftCore.split(".").map(Number);
  const rightParts = rightCore.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  if (leftPrerelease === undefined && rightPrerelease === undefined) return 0;
  if (leftPrerelease === undefined) return 1;
  if (rightPrerelease === undefined) return -1;

  const leftIdentifiers = leftPrerelease.split(".");
  const rightIdentifiers = rightPrerelease.split(".");
  const identifierCount = Math.max(leftIdentifiers.length, rightIdentifiers.length);
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) return Number(leftIdentifier) - Number(rightIdentifier);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier.localeCompare(rightIdentifier, "en");
  }
  return 0;
}

export function negotiateSduiCapabilities(document, capabilities) {
  const documentSummary = validateSduiDocument(document);
  validateRendererCapabilities(capabilities);
  const missingCapabilities = document.requiredCapabilities.filter((capability) => {
    const [type, rawVersion] = capability.split("@");
    return (capabilities.components[type] ?? 0) < Number(rawVersion);
  });
  const schemaSupported = capabilities.schemas.includes(document.schema);
  const surfaceSupported = capabilities.surface === document.surface;
  const updateRequired = compareSemver(capabilities.rendererVersion, document.minRendererVersion) < 0;
  const missingActions = documentSummary.usedActions.filter((capability) => {
    const separator = capability.lastIndexOf("@");
    const actionId = capability.slice(0, separator);
    const version = Number(capability.slice(separator + 1));
    return (capabilities.actions[actionId] ?? 0) < version;
  });
  const missingFormatters = documentSummary.usedFormatters.filter((capability) => {
    const separator = capability.lastIndexOf("@");
    const formatterId = capability.slice(0, separator);
    const version = Number(capability.slice(separator + 1));
    return (capabilities.formatters[formatterId] ?? 0) < version;
  });
  return Object.freeze({
    compatible: schemaSupported && surfaceSupported && !updateRequired && missingCapabilities.length === 0 && missingActions.length === 0 && missingFormatters.length === 0,
    schemaSupported,
    surfaceSupported,
    updateRequired,
    missingCapabilities: Object.freeze(missingCapabilities),
    missingActions: Object.freeze(missingActions),
    missingFormatters: Object.freeze(missingFormatters)
  });
}
