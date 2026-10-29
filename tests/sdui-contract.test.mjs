import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SDUI_LIMITS,
  SduiValidationError,
  negotiateSduiCapabilities,
  validateRendererCapabilities,
  validateSduiDocument
} from "../packages/sdui-contracts/index.js";
import {
  TemplateManifestValidationError,
  assertSafeTemplatePath,
  validateHarmonyTemplateManifest
} from "../packages/sdui-contracts/template-manifest.js";
import {
  MockFixtureValidationError,
  assertSyntheticMockFixture
} from "../packages/sdui-testing/index.js";

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
}

async function dashboardDocument() {
  return readJson("../sdui/harmony-ops/pages/dashboard.mock.document.json");
}

function expectSduiCode(code, callback) {
  assert.throws(callback, (error) => error instanceof SduiValidationError && error.code === code);
}

test("Mock dashboard SDUI 문서가 Web과 Mobile surface에서 같은 계약으로 검증된다", async () => {
  const document = await dashboardDocument();
  const web = validateSduiDocument(document);
  const mobile = validateSduiDocument({ ...structuredClone(document), surface: "mobile" });

  assert.equal(web.valid, true);
  assert.equal(web.nodeCount, 10);
  assert.equal(mobile.nodeCount, web.nodeCount);
  assert.ok(web.usedCapabilities.includes("Page@1"));
  assert.ok(web.usedCapabilities.includes("Stat@1"));
});

test("등록되지 않은 문서 필드, component와 prop을 차단한다", async () => {
  const document = await dashboardDocument();
  expectSduiCode("UNKNOWN_FIELD", () => validateSduiDocument({ ...structuredClone(document), unexpected: true }));

  const unknownComponent = structuredClone(document);
  unknownComponent.root.children[0].type = "RawHtml";
  expectSduiCode("UNKNOWN_COMPONENT", () => validateSduiDocument(unknownComponent));

  const unknownProp = structuredClone(document);
  unknownProp.root.children[0].props.className = "admin-only";
  expectSduiCode("UNKNOWN_PROP", () => validateSduiDocument(unknownProp));
});

test("중복 ID와 leaf component의 children을 차단한다", async () => {
  const document = await dashboardDocument();
  const duplicate = structuredClone(document);
  duplicate.root.children[1].id = duplicate.root.children[0].id;
  expectSduiCode("DUPLICATE_NODE_ID", () => validateSduiDocument(duplicate));

  const leafWithChild = structuredClone(document);
  leafWithChild.root.children[0].children = [{
    id: "dashboard.illegal.child",
    type: "Text",
    props: { messageKey: "dashboard.description" }
  }];
  expectSduiCode("LEAF_WITH_CHILDREN", () => validateSduiDocument(leafWithChild));
});

test("raw HTML, 외부 URL과 raw CSS를 차단한다", async () => {
  const document = await dashboardDocument();

  const html = structuredClone(document);
  html.root.children[0].props.html = "<strong>관리자</strong>";
  expectSduiCode("FORBIDDEN_KEY", () => validateSduiDocument(html));

  const url = structuredClone(document);
  url.root.children[1].props.messageKey = "https://evil.example/collect";
  expectSduiCode("UNSAFE_STRING", () => validateSduiDocument(url));

  const css = structuredClone(document);
  css.root.style.padding = "24px";
  expectSduiCode("INVALID_FORMAT", () => validateSduiDocument(css));

  const extensionHtml = structuredClone(document);
  extensionHtml.root.extensions = { web: { content: "<img src=x onerror=alert(1)>" } };
  expectSduiCode("UNSAFE_STRING", () => validateSduiDocument(extensionHtml));
});

test("component prop 타입, enum, token과 required prop을 엄격히 검증한다", async () => {
  const document = await dashboardDocument();

  const disabled = structuredClone(document);
  disabled.requiredCapabilities.push("Button@1");
  const disabledNode = disabled.root.children.at(-1);
  disabledNode.type = "Button";
  disabledNode.props = { labelKey: "dashboard.mock.title", disabled: "false" };
  delete disabledNode.accessibility;
  expectSduiCode("INVALID_PROP_TYPE", () => validateSduiDocument(disabled));

  const token = structuredClone(document);
  token.root.children[2].children[0].props.gapToken = "24px";
  expectSduiCode("INVALID_FORMAT", () => validateSduiDocument(token));

  const wrongPropTokenGroup = structuredClone(document);
  wrongPropTokenGroup.root.children[2].children[0].props.gapToken = "color.primary";
  expectSduiCode("INVALID_TOKEN_GROUP", () => validateSduiDocument(wrongPropTokenGroup));

  const wrongStyleTokenGroup = structuredClone(document);
  wrongStyleTokenGroup.root.style.background = "space.md";
  expectSduiCode("INVALID_TOKEN_GROUP", () => validateSduiDocument(wrongStyleTokenGroup));

  const enumValue = structuredClone(document);
  enumValue.root.children[1].props.tone = "purple";
  expectSduiCode("INVALID_PROP", () => validateSduiDocument(enumValue));

  const missing = structuredClone(document);
  delete missing.root.children[0].props.level;
  expectSduiCode("MISSING_PROP", () => validateSduiDocument(missing));
});

test("options, items와 table columns의 내부 key와 타입도 허용목록으로 제한한다", async () => {
  const document = await dashboardDocument();
  const replaceNotice = (type, props) => {
    const candidate = structuredClone(document);
    candidate.requiredCapabilities.push(`${type}@1`);
    const node = candidate.root.children.at(-1);
    node.type = type;
    node.props = props;
    delete node.accessibility;
    return candidate;
  };

  const options = replaceNotice("SelectField", {
    field: "worker.job",
    labelKey: "dashboard.mock.title",
    required: true,
    options: [{ value: "cook", labelKey: "dashboard.mock.message", extra: "arbitrary" }]
  });
  expectSduiCode("UNKNOWN_FIELD", () => validateSduiDocument(options));

  const items = replaceNotice("Tabs", { items: ["arbitrary"] });
  expectSduiCode("INVALID_OBJECT", () => validateSduiDocument(items));

  const columns = replaceNotice("DataTable", {
    columns: [{
      id: "worker",
      labelKey: "dashboard.mock.title",
      pointer: "/worker",
      width: "100px"
    }]
  });
  expectSduiCode("UNKNOWN_FIELD", () => validateSduiDocument(columns));
});

test("등록되지 않은 Action과 임의 HTTP 정보를 차단한다", async () => {
  const document = await dashboardDocument();
  const button = structuredClone(document);
  button.requiredCapabilities.push("Button@1");
  const notice = button.root.children.at(-1);
  notice.type = "Button";
  notice.props = { labelKey: "dashboard.mock.title" };
  notice.actions = { press: { actionId: "network.post" } };
  delete notice.accessibility;
  expectSduiCode("UNKNOWN_ACTION", () => validateSduiDocument(button));

  const http = structuredClone(button);
  http.root.children.at(-1).actions = {
    press: {
      actionId: "resource.refresh",
      method: "POST"
    }
  };
  expectSduiCode("FORBIDDEN_KEY", () => validateSduiDocument(http));
});

test("Action idempotency는 필수이며 registry 값과 일치해야 한다", async () => {
  const document = await dashboardDocument();
  document.requiredCapabilities.push("Button@1");
  const node = document.root.children.at(-1);
  node.type = "Button";
  node.props = { labelKey: "dashboard.mock.title" };
  node.actions = { press: { actionId: "resource.refresh" } };
  delete node.accessibility;
  expectSduiCode("MISSING_IDEMPOTENCY", () => validateSduiDocument(document));

  node.actions.press.idempotency = "required";
  expectSduiCode("IDEMPOTENCY_MISMATCH", () => validateSduiDocument(document));

  node.actions.press.idempotency = "none";
  assert.ok(validateSduiDocument(document).usedActions.includes("resource.refresh@1"));
});

test("Action event는 component가 명시적으로 지원하는 조합만 허용한다", async () => {
  const document = await dashboardDocument();
  document.root.children[1].actions = {
    submit: { actionId: "resource.refresh", idempotency: "none" }
  };
  expectSduiCode("INVALID_COMPONENT_ACTION_EVENT", () => validateSduiDocument(document));
});

test("Label·Form·field 참조는 문서 안에서 유일하고 실제 대상으로 해석된다", async () => {
  const document = await dashboardDocument();
  document.requiredCapabilities.push("Form@1", "TextField@1", "Label@1", "Button@1");
  document.root.children[document.root.children.length - 1] = {
    id: "intake.form-node",
    type: "Form",
    props: { formId: "intake.form" },
    actions: {
      submit: { actionId: "resource.refresh", inputRef: "intake.form", idempotency: "none" }
    },
    children: [
      {
        id: "intake.name-field",
        type: "TextField",
        props: { field: "worker.name", labelKey: "dashboard.title", required: true }
      },
      {
        id: "intake.name-label",
        type: "Label",
        props: { messageKey: "dashboard.title", forNodeId: "intake.name-field" }
      },
      {
        id: "intake.submit",
        type: "Button",
        props: { labelKey: "dashboard.title" },
        actions: { press: { actionId: "resource.refresh", idempotency: "none" } }
      }
    ]
  };
  assert.equal(validateSduiDocument(document).valid, true);

  const missingLabelTarget = structuredClone(document);
  missingLabelTarget.root.children.at(-1).children[1].props.forNodeId = "intake.missing-field";
  expectSduiCode("UNRESOLVED_LABEL_TARGET", () => validateSduiDocument(missingLabelTarget));

  const missingForm = structuredClone(document);
  missingForm.root.children.at(-1).actions.submit.inputRef = "intake.missing-form";
  expectSduiCode("UNRESOLVED_FORM_REF", () => validateSduiDocument(missingForm));

  const duplicateField = structuredClone(document);
  duplicateField.root.children.at(-1).children.push({
    id: "intake.name-field-copy",
    type: "TextField",
    props: { field: "worker.name", labelKey: "dashboard.title", required: false }
  });
  expectSduiCode("DUPLICATE_FIELD_ID", () => validateSduiDocument(duplicateField));
});

test("resource, JSON Pointer와 formatter 허용목록을 적용한다", async () => {
  const document = await dashboardDocument();
  const stat = document.root.children[2].children[0].children[0].children[0];

  const resource = structuredClone(document);
  resource.root.children[2].children[0].children[0].children[0].dataBinding.resourceId = "private.people";
  expectSduiCode("UNKNOWN_RESOURCE", () => validateSduiDocument(resource));

  const pointer = structuredClone(document);
  pointer.root.children[2].children[0].children[0].children[0].dataBinding.pointer = "/__proto__/token";
  expectSduiCode("UNSAFE_POINTER", () => validateSduiDocument(pointer));

  const formatter = structuredClone(document);
  formatter.root.children[2].children[0].children[0].children[0].dataBinding.formatter = "eval";
  expectSduiCode("UNKNOWN_FORMATTER", () => validateSduiDocument(formatter));
  assert.equal(stat.dataBinding.resourceId, "dashboard.summary");
});

test("node roles는 상속 또는 축소만 허용하고 resource roles와 일치해야 한다", async () => {
  const document = await dashboardDocument();
  const statAt = (candidate) => candidate.root.children[2].children[0].children[0].children[0];

  const narrowed = structuredClone(document);
  statAt(narrowed).roles = ["owner"];
  statAt(narrowed).dataBinding.resourceId = "field-audit.summary";
  assert.equal(validateSduiDocument(narrowed).valid, true);

  const widened = structuredClone(document);
  widened.root.children[2].children[0].children[0].roles = ["owner"];
  statAt(widened).roles = ["owner", "staff"];
  expectSduiCode("ROLE_WIDENING", () => validateSduiDocument(widened));

  const bindingMismatch = structuredClone(document);
  statAt(bindingMismatch).dataBinding.resourceId = "field-audit.summary";
  expectSduiCode("RESOURCE_ROLE_MISMATCH", () => validateSduiDocument(bindingMismatch));

  const visibilityMismatch = structuredClone(document);
  visibilityMismatch.root.children[1].visibility = {
    kind: "data-present",
    resourceId: "field-audit.summary",
    pointer: "/lastCheckedAt"
  };
  expectSduiCode("RESOURCE_ROLE_MISMATCH", () => validateSduiDocument(visibilityMismatch));
});

test("트리 깊이와 전체 문서 크기를 제한한다", async () => {
  const deep = {
    schema: "harmony.sdui.document.v1",
    documentId: "ops.deep",
    revision: 1,
    pageId: "deep",
    locale: "ko",
    surface: "web",
    minRendererVersion: "0.1.0",
    themeRef: "harmony.berry.v1",
    requiredCapabilities: ["Page@1", "Section@1"],
    root: { id: "deep.root", type: "Page", props: {}, children: [] }
  };
  let cursor = deep.root;
  for (let index = 0; index <= SDUI_LIMITS.maxDepth; index += 1) {
    const child = { id: `deep.section-${index}`, type: "Section", props: {}, children: [] };
    cursor.children.push(child);
    cursor = child;
  }
  expectSduiCode("TREE_TOO_DEEP", () => validateSduiDocument(deep));

  const huge = {
    schema: "harmony.sdui.document.v1",
    documentId: "ops.huge",
    revision: 1,
    pageId: "huge",
    locale: "ko",
    surface: "web",
    minRendererVersion: "0.1.0",
    themeRef: "harmony.berry.v1",
    requiredCapabilities: ["Page@1", "Tabs@1"],
    root: {
      id: "huge.root",
      type: "Page",
      props: {},
      extensions: {
        web: { chunks: Array.from({ length: 100 }, () => "x".repeat(2_000)) },
        mobile: { chunks: Array.from({ length: 100 }, () => "x".repeat(2_000)) }
      },
      children: [0, 1].map((index) => ({
        id: `huge.tabs-${index}`,
        type: "Tabs",
        props: {
          items: Array.from({ length: 100 }, (_, itemIndex) => ({
            id: `tab-${index}-${itemIndex}`,
            labelKey: `huge.tab-${index}-${itemIndex}`
          }))
        }
      }))
    }
  };
  expectSduiCode("DOCUMENT_TOO_LARGE", () => validateSduiDocument(huge));
});

test("template manifest를 runtime 문서와 분리하고 안전한 상대경로만 허용한다", async () => {
  const manifest = await readJson("../sdui/harmony-ops/template.manifest.json");
  const summary = validateHarmonyTemplateManifest(manifest);
  assert.equal(summary.valid, true);
  assert.deepEqual(summary.pageIds, ["dashboard", "compliance"]);
  assert.ok(summary.references.includes("pages/dashboard.mock.document.json"));
  assert.ok(summary.references.includes("pages/compliance.mock.document.json"));

  assert.throws(
    () => assertSafeTemplatePath("../secrets.json"),
    (error) => error instanceof TemplateManifestValidationError
  );
  const escaped = structuredClone(manifest);
  escaped.metadata.themeRef = "../theme.json";
  assert.throws(
    () => validateHarmonyTemplateManifest(escaped),
    (error) => error instanceof TemplateManifestValidationError && error.code === "INVALID_FORMAT"
  );
});

test("합성 Mock fixture만 허용하고 제한 개인정보를 거부한다", async () => {
  const fixture = await readJson("../sdui/harmony-ops/fixtures/dashboard.mock.data.json");
  assert.equal(assertSyntheticMockFixture(fixture).valid, true);

  assert.throws(
    () => assertSyntheticMockFixture({ ...fixture, workerPhone: "010-9124-2537" }),
    (error) => error instanceof MockFixtureValidationError
  );
  assert.throws(
    () => assertSyntheticMockFixture({ ...fixture, residentRegistrationNumber: "900101-1234567" }),
    (error) => error instanceof MockFixtureValidationError
  );
});

test("JSON Schema 파일이 runtime schema ID를 고정한다", async () => {
  const schema = await readJson("../packages/sdui-contracts/harmony.sdui.document.v1.schema.json");
  assert.equal(schema.properties.schema.const, "harmony.sdui.document.v1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.$defs.node.additionalProperties, false);
  assert.deepEqual(schema.$defs.actionRef.required, ["actionId", "idempotency"]);
});

test("Web·Mobile renderer capability handshake와 업데이트 필요 상태를 판정한다", async () => {
  const document = await dashboardDocument();
  const components = Object.fromEntries(document.requiredCapabilities.map((capability) => {
    const [type, version] = capability.split("@");
    return [type, Number(version)];
  }));
  const web = {
    schema: "harmony.sdui.capabilities.v1",
    rendererVersion: "0.1.0",
    surface: "web",
    schemas: ["harmony.sdui.document.v1"],
    components,
    actions: { "resource.refresh": 1 },
    formatters: { number: 1 }
  };
  assert.equal(validateRendererCapabilities(web).valid, true);
  assert.equal(negotiateSduiCapabilities(document, web).compatible, true);

  const oldRenderer = { ...structuredClone(web), rendererVersion: "0.0.9" };
  const oldResult = negotiateSduiCapabilities(document, oldRenderer);
  assert.equal(oldResult.compatible, false);
  assert.equal(oldResult.updateRequired, true);

  const stableDocument = { ...structuredClone(document), minRendererVersion: "1.0.0" };
  const prereleaseRenderer = { ...structuredClone(web), rendererVersion: "1.0.0-alpha.1" };
  const prereleaseResult = negotiateSduiCapabilities(stableDocument, prereleaseRenderer);
  assert.equal(prereleaseResult.compatible, false);
  assert.equal(prereleaseResult.updateRequired, true);

  const stableRenderer = { ...structuredClone(web), rendererVersion: "1.0.0" };
  assert.equal(negotiateSduiCapabilities(stableDocument, stableRenderer).updateRequired, false);

  const missingComponent = structuredClone(web);
  delete missingComponent.components.Stat;
  const missingResult = negotiateSduiCapabilities(document, missingComponent);
  assert.equal(missingResult.compatible, false);
  assert.deepEqual(missingResult.missingCapabilities, ["Stat@1"]);

  const missingFormatter = structuredClone(web);
  delete missingFormatter.formatters.number;
  const formatterResult = negotiateSduiCapabilities(document, missingFormatter);
  assert.equal(formatterResult.compatible, false);
  assert.deepEqual(formatterResult.missingFormatters, ["number@1"]);

  const futureRenderer = structuredClone(web);
  futureRenderer.schemas.push("harmony.sdui.document.v2");
  futureRenderer.components.Page = 2;
  futureRenderer.components.FutureCard = 1;
  futureRenderer.actions["future.action"] = 1;
  futureRenderer.formatters.futureFormatter = 1;
  assert.equal(validateRendererCapabilities(futureRenderer).valid, true);
  assert.equal(negotiateSduiCapabilities(document, futureRenderer).compatible, true);

  const mobileDocument = { ...structuredClone(document), surface: "mobile" };
  const mobile = { ...structuredClone(web), surface: "mobile" };
  assert.equal(negotiateSduiCapabilities(mobileDocument, mobile).compatible, true);

  const actionDocument = structuredClone(document);
  actionDocument.requiredCapabilities.push("Button@1");
  const actionNode = actionDocument.root.children.at(-1);
  actionNode.type = "Button";
  actionNode.props = { labelKey: "dashboard.mock.title" };
  actionNode.actions = { press: { actionId: "resource.refresh", idempotency: "none" } };
  delete actionNode.accessibility;
  const actionMissing = { ...structuredClone(web), actions: {} };
  assert.deepEqual(negotiateSduiCapabilities(actionDocument, actionMissing).missingActions, ["resource.refresh@1"]);
  assert.equal(negotiateSduiCapabilities(actionDocument, actionMissing).compatible, false);
});
