const THEME_KEYS = new Set(["schema", "id", "tokens"]);
const TOKEN_GROUPS = new Set(["color", "space", "radius"]);
const MESSAGE_KEYS = new Set(["schema", "locale", "messages"]);
const ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const TOKEN_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const MESSAGE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
const PIXEL_PATTERN = /^(?:0|[1-9]\d{0,2})px$/;
const UNSAFE_TEXT_PATTERN = /<\/?(?:script|style|iframe|[a-z][a-z0-9-]*)\b|javascript:|data:text\/html|https?:\/\/|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/i;

export class PackageAssetValidationError extends Error {
  constructor(code, path, message) {
    super(`${path}: ${message}`);
    this.name = "PackageAssetValidationError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message) {
  throw new PackageAssetValidationError(code, path, message);
}

function isRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRecord(value, path) {
  if (!isRecord(value)) fail("INVALID_OBJECT", path, "객체여야 합니다.");
}

function assertExactKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("UNKNOWN_FIELD", `${path}.${key}`, "등록되지 않은 필드입니다.");
  }
}

function assertPlainText(value, path, { pattern, max = 500 } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    fail("INVALID_STRING", path, `1자 이상 ${max}자 이하의 문자열이어야 합니다.`);
  }
  if (pattern && !pattern.test(value)) fail("INVALID_FORMAT", path, "허용된 형식이 아닙니다.");
  if (UNSAFE_TEXT_PATTERN.test(value)) fail("UNSAFE_TEXT", path, "HTML, 외부 URL, 실행 문자열은 허용되지 않습니다.");
}

export function validateThemeDocument(theme) {
  assertRecord(theme, "$theme");
  assertExactKeys(theme, THEME_KEYS, "$theme");
  if (theme.schema !== "harmony.sdui.theme.v1") fail("UNSUPPORTED_SCHEMA", "$theme.schema", "지원하지 않는 theme schema입니다.");
  assertPlainText(theme.id, "$theme.id", { pattern: ID_PATTERN, max: 100 });
  assertRecord(theme.tokens, "$theme.tokens");
  assertExactKeys(theme.tokens, TOKEN_GROUPS, "$theme.tokens");

  for (const group of TOKEN_GROUPS) {
    const values = theme.tokens[group];
    assertRecord(values, `$theme.tokens.${group}`);
    const entries = Object.entries(values);
    if (entries.length === 0 || entries.length > 100) fail("INVALID_TOKENS", `$theme.tokens.${group}`, "1개 이상 100개 이하의 token이 필요합니다.");
    for (const [name, value] of entries) {
      if (!TOKEN_NAME_PATTERN.test(name)) fail("INVALID_TOKEN_NAME", `$theme.tokens.${group}.${name}`, "안전한 token 이름이 아닙니다.");
      const pattern = group === "color" ? HEX_COLOR_PATTERN : PIXEL_PATTERN;
      assertPlainText(value, `$theme.tokens.${group}.${name}`, { pattern, max: 16 });
      if (group !== "color" && Number.parseInt(value, 10) > 128) {
        fail("TOKEN_OUT_OF_RANGE", `$theme.tokens.${group}.${name}`, "크기 token은 0px부터 128px까지만 허용됩니다.");
      }
    }
  }

  return Object.freeze({ valid: true, id: theme.id });
}

export function validateMessageDocument(document) {
  assertRecord(document, "$messages");
  assertExactKeys(document, MESSAGE_KEYS, "$messages");
  if (document.schema !== "harmony.sdui.messages.v1") fail("UNSUPPORTED_SCHEMA", "$messages.schema", "지원하지 않는 message schema입니다.");
  if (document.locale !== "ko") fail("UNSUPPORTED_LOCALE", "$messages.locale", "초기 package는 ko locale만 지원합니다.");
  assertRecord(document.messages, "$messages.messages");
  const entries = Object.entries(document.messages);
  if (entries.length === 0 || entries.length > 1_000) fail("INVALID_MESSAGES", "$messages.messages", "1개 이상 1,000개 이하의 message가 필요합니다.");
  for (const [key, value] of entries) {
    assertPlainText(key, `$messages.messages.${key}`, { pattern: MESSAGE_KEY_PATTERN, max: 160 });
    assertPlainText(value, `$messages.messages.${key}`, { max: 500 });
  }
  return Object.freeze({ valid: true, locale: document.locale, count: entries.length });
}

function collectNestedMessageKeys(value, result) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedMessageKeys(item, result));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if ((key.endsWith("Key") || key === "messageKey") && typeof child === "string") result.add(child);
    collectNestedMessageKeys(child, result);
  }
}

export function collectDocumentMessageKeys(node, result = new Set()) {
  collectNestedMessageKeys(node.props ?? {}, result);
  collectNestedMessageKeys(node.accessibility ?? {}, result);
  collectNestedMessageKeys(node.actions ?? {}, result);
  for (const child of node.children ?? []) collectDocumentMessageKeys(child, result);
  return result;
}

export function assertDocumentMessagesDefined(document, messageDocument) {
  validateMessageDocument(messageDocument);
  const keys = [...collectDocumentMessageKeys(document.root)].sort();
  for (const key of keys) {
    if (!Object.hasOwn(messageDocument.messages, key)) {
      fail("MISSING_MESSAGE", `$document.${document.documentId}`, `message가 없습니다: ${key}`);
    }
  }
  return Object.freeze(keys);
}

export function collectDocumentTokenRefs(node, result = new Set()) {
  for (const value of Object.values(node.style ?? {})) {
    if (typeof value === "string") result.add(value);
  }
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (key.endsWith("Token") && typeof value === "string") result.add(value);
  }
  for (const child of node.children ?? []) collectDocumentTokenRefs(child, result);
  return result;
}

export function assertDocumentThemeTokensDefined(document, theme) {
  validateThemeDocument(theme);
  const refs = [...collectDocumentTokenRefs(document.root)].sort();
  for (const ref of refs) {
    const separator = ref.indexOf(".");
    const group = ref.slice(0, separator);
    const name = ref.slice(separator + 1);
    if (separator < 1 || !Object.hasOwn(theme.tokens[group] ?? {}, name)) {
      fail("MISSING_THEME_TOKEN", `$document.${document.documentId}`, `theme token이 없습니다: ${ref}`);
    }
  }
  return Object.freeze(refs);
}

export function collectDocumentBindings(node, result = []) {
  if (node.dataBinding) {
    const relativePointers = node.type === "DataTable"
      ? (node.props?.columns ?? []).map((column) => column.pointer)
      : node.type === "KeyValueList"
        ? (node.props?.items ?? []).map((item) => item.pointer)
        : [];
    result.push(Object.freeze({
      nodeId: node.id,
      nodeType: node.type,
      kind: "data",
      relativePointers: Object.freeze(relativePointers),
      ...node.dataBinding
    }));
  }
  if (node.visibility) {
    result.push(Object.freeze({
      nodeId: node.id,
      nodeType: node.type,
      kind: "visibility",
      relativePointers: Object.freeze([]),
      resourceId: node.visibility.resourceId,
      pointer: node.visibility.pointer
    }));
  }
  for (const child of node.children ?? []) collectDocumentBindings(child, result);
  return result;
}

function resolveSimplePointer(value, pointer) {
  if (pointer === "") return { found: true, value };
  let current = value;
  for (const segment of pointer.slice(1).split("/")) {
    if ((current === null || typeof current !== "object") || !Object.hasOwn(current, segment)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

export function assertDocumentBindingsResolve(document, resources) {
  assertRecord(resources, "$resources");
  const bindings = collectDocumentBindings(document.root);
  for (const binding of bindings) {
    if (!Object.hasOwn(resources, binding.resourceId)) {
      fail("MISSING_MOCK_RESOURCE", `$document.${document.documentId}.${binding.nodeId}`, `Mock resource가 없습니다: ${binding.resourceId}`);
    }
    const resolved = resolveSimplePointer(resources[binding.resourceId], binding.pointer);
    if (!resolved.found) {
      fail("MISSING_MOCK_POINTER", `$document.${document.documentId}.${binding.nodeId}`, `Mock pointer가 없습니다: ${binding.pointer}`);
    }
    if (binding.nodeType === "DataTable") {
      if (!Array.isArray(resolved.value)) {
        fail("INVALID_MOCK_BINDING_TYPE", `$document.${document.documentId}.${binding.nodeId}`, "DataTable binding은 배열이어야 합니다.");
      }
      resolved.value.forEach((row, rowIndex) => {
        for (const pointer of binding.relativePointers) {
          if (!resolveSimplePointer(row, pointer).found) {
            fail("MISSING_MOCK_RELATIVE_POINTER", `$document.${document.documentId}.${binding.nodeId}[${rowIndex}]`, `column pointer가 없습니다: ${pointer}`);
          }
        }
      });
    }
    if (binding.nodeType === "KeyValueList") {
      if (!isRecord(resolved.value)) {
        fail("INVALID_MOCK_BINDING_TYPE", `$document.${document.documentId}.${binding.nodeId}`, "KeyValueList binding은 객체여야 합니다.");
      }
      for (const pointer of binding.relativePointers) {
        if (!resolveSimplePointer(resolved.value, pointer).found) {
          fail("MISSING_MOCK_RELATIVE_POINTER", `$document.${document.documentId}.${binding.nodeId}`, `item pointer가 없습니다: ${pointer}`);
        }
      }
    }
  }
  return Object.freeze(bindings);
}
