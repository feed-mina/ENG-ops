import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TemplateManifestValidationError,
  validateHarmonyTemplateManifest
} from "../packages/sdui-contracts/template-manifest.js";

async function manifestFixture() {
  return JSON.parse(await readFile(
    new URL("../sdui/harmony-ops/template.manifest.json", import.meta.url),
    "utf8"
  ));
}

function expectManifestError(callback) {
  assert.throws(callback, (error) => error instanceof TemplateManifestValidationError);
}

test("template manifest의 운영 메타데이터는 안전한 선언형 값만 허용한다", async () => {
  const manifest = await manifestFixture();
  assert.equal(validateHarmonyTemplateManifest(manifest).valid, true);

  const externalEndpoint = structuredClone(manifest);
  externalEndpoint.api.endpoints = ["https://evil.example/collect"];
  expectManifestError(() => validateHarmonyTemplateManifest(externalEndpoint));

  const secretValue = structuredClone(manifest);
  secretValue.env.secrets = ["sk-live-secret-value"];
  expectManifestError(() => validateHarmonyTemplateManifest(secretValue));

  const invalidEnv = structuredClone(manifest);
  invalidEnv.env.vars = "not-an-array";
  expectManifestError(() => validateHarmonyTemplateManifest(invalidEnv));

  const executableGate = structuredClone(manifest);
  executableGate.gating = { root: "javascript:alert(1)" };
  expectManifestError(() => validateHarmonyTemplateManifest(executableGate));

  const invalidRisks = structuredClone(manifest);
  invalidRisks.risks = {};
  expectManifestError(() => validateHarmonyTemplateManifest(invalidRisks));
});

test("template manifest의 필수 보안 메타데이터는 생략할 수 없다", async () => {
  const manifest = await manifestFixture();
  for (const key of ["api", "env", "gating", "risks", "messages"]) {
    const missing = structuredClone(manifest);
    delete missing[key];
    expectManifestError(() => validateHarmonyTemplateManifest(missing));
  }
});

test("template manifest는 runtime registry에 존재하는 component만 선언한다", async () => {
  const manifest = await manifestFixture();
  manifest.components.push("RawHtml");
  assert.throws(
    () => validateHarmonyTemplateManifest(manifest),
    (error) => error instanceof TemplateManifestValidationError && error.code === "UNKNOWN_COMPONENT"
  );
});

test("template 카탈로그 이름과 page title에는 HTML·실행 문자열을 넣을 수 없다", async () => {
  const manifest = await manifestFixture();
  manifest.name = "<img src=x onerror=alert(1)>";
  expectManifestError(() => validateHarmonyTemplateManifest(manifest));

  const pageTitle = await manifestFixture();
  pageTitle.pages[0].title = "<script>alert(1)</script>";
  expectManifestError(() => validateHarmonyTemplateManifest(pageTitle));
});
