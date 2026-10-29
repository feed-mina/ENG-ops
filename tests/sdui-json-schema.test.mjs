import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import {
  SduiValidationError,
  validateRendererCapabilities,
  validateSduiDocument
} from "../packages/sdui-contracts/index.js";

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
}

async function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const documentSchema = await readJson("../packages/sdui-contracts/harmony.sdui.document.v1.schema.json");
  const capabilitiesSchema = await readJson("../packages/sdui-contracts/harmony.sdui.capabilities.v1.schema.json");
  return {
    document: ajv.compile(documentSchema),
    capabilities: ajv.compile(capabilitiesSchema)
  };
}

test("Mock 문서는 JSON Schema 구조 검증과 runtime 의미 검증을 모두 통과한다", async () => {
  const validate = await validators();
  const document = await readJson("../sdui/harmony-ops/pages/dashboard.mock.document.json");
  assert.equal(validate.document(document), true, JSON.stringify(validate.document.errors));
  assert.equal(validateSduiDocument(document).valid, true);

  const camelCaseFormatter = structuredClone(document);
  camelCaseFormatter.root.children[2].children[0].children[0].children[0].dataBinding.formatter = "currencyKr";
  assert.equal(validate.document(camelCaseFormatter), true, JSON.stringify(validate.document.errors));
  assert.equal(validateSduiDocument(camelCaseFormatter).valid, true);

  const unknown = { ...structuredClone(document), unexpected: true };
  assert.equal(validate.document(unknown), false);
  assert.throws(() => validateSduiDocument(unknown), SduiValidationError);
});

test("renderer capability schema와 runtime은 미래 capability를 허용하고 필수 필드를 함께 검사한다", async () => {
  const validate = await validators();
  const capabilities = {
    schema: "harmony.sdui.capabilities.v1",
    rendererVersion: "1.0.0",
    surface: "mobile",
    schemas: ["harmony.sdui.document.v1", "harmony.sdui.document.v2"],
    components: { Page: 2, FutureCard: 1 },
    actions: { "resource.refresh": 2, "future.action": 1 },
    formatters: { number: 2, futureFormatter: 1 }
  };
  assert.equal(validate.capabilities(capabilities), true, JSON.stringify(validate.capabilities.errors));
  assert.equal(validateRendererCapabilities(capabilities).valid, true);

  const missingFormatters = structuredClone(capabilities);
  delete missingFormatters.formatters;
  assert.equal(validate.capabilities(missingFormatters), false);
  assert.throws(() => validateRendererCapabilities(missingFormatters), SduiValidationError);
});
