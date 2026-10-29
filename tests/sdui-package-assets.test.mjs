import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PackageAssetValidationError,
  assertDocumentBindingsResolve,
  assertDocumentMessagesDefined,
  assertDocumentThemeTokensDefined,
  collectDocumentMessageKeys,
  collectDocumentTokenRefs,
  validateMessageDocument,
  validateThemeDocument
} from "../packages/sdui-contracts/package-assets.js";

async function readJson(relative) {
  return JSON.parse(await readFile(new URL(relative, import.meta.url), "utf8"));
}

test("theme token은 허용된 색상과 제한된 px 값만 사용한다", async () => {
  const theme = await readJson("../sdui/harmony-ops/theme/tokens.json");
  assert.equal(validateThemeDocument(theme).valid, true);

  const remoteCss = structuredClone(theme);
  remoteCss.tokens.color.primary = "url(https://evil.example/pixel)";
  assert.throws(() => validateThemeDocument(remoteCss), PackageAssetValidationError);

  const expression = structuredClone(theme);
  expression.tokens.space.md = "expression(alert(1))";
  assert.throws(() => validateThemeDocument(expression), PackageAssetValidationError);

  const excessive = structuredClone(theme);
  excessive.tokens.radius.lg = "999px";
  assert.throws(() => validateThemeDocument(excessive), PackageAssetValidationError);
});

test("message는 plain text만 허용한다", async () => {
  const messages = await readJson("../sdui/harmony-ops/messages/ko.json");
  assert.equal(validateMessageDocument(messages).valid, true);

  for (const unsafe of ["<strong>관리자</strong>", "https://evil.example/collect", "javascript:alert(1)"]) {
    const changed = structuredClone(messages);
    changed.messages["dashboard.title"] = unsafe;
    assert.throws(() => validateMessageDocument(changed), PackageAssetValidationError);
  }
});

test("중첩 선택지·표·탭과 action 확인 문구의 message key도 수집한다", () => {
  const document = {
    documentId: "ops.message-test",
    root: {
      props: {
        options: [{ value: "one", labelKey: "option.one" }],
        items: [{ id: "tab", labelKey: "tab.title" }],
        columns: [{ id: "name", labelKey: "column.name", pointer: "/name" }]
      },
      actions: {
        submit: { actionId: "placement.confirm-contract", confirmationKey: "confirm.placement" }
      },
      children: []
    }
  };
  assert.deepEqual([...collectDocumentMessageKeys(document.root)].sort(), [
    "column.name", "confirm.placement", "option.one", "tab.title"
  ]);

  const incomplete = {
    schema: "harmony.sdui.messages.v1",
    locale: "ko",
    messages: { "option.one": "첫 번째" }
  };
  assert.throws(
    () => assertDocumentMessagesDefined(document, incomplete),
    (error) => error instanceof PackageAssetValidationError && error.code === "MISSING_MESSAGE"
  );
});

test("문서의 style과 token prop은 package theme에 실제로 존재해야 한다", async () => {
  const theme = await readJson("../sdui/harmony-ops/theme/tokens.json");
  const document = {
    documentId: "ops.token-test",
    root: {
      props: { gapToken: "space.md" },
      style: { background: "color.background" },
      children: []
    }
  };
  assert.deepEqual([...collectDocumentTokenRefs(document.root)].sort(), ["color.background", "space.md"]);
  assert.deepEqual([...assertDocumentThemeTokensDefined(document, theme)], ["color.background", "space.md"]);

  const missingStyle = structuredClone(document);
  missingStyle.root.style.background = "color.missing";
  assert.throws(() => assertDocumentThemeTokensDefined(missingStyle, theme), PackageAssetValidationError);

  const unsupportedGroup = structuredClone(document);
  unsupportedGroup.root.props.gapToken = "shadow.card";
  assert.throws(() => assertDocumentThemeTokensDefined(unsupportedGroup, theme), PackageAssetValidationError);
});

test("문서 binding은 resource fixture의 data payload에서 실제 값으로 해석되어야 한다", () => {
  const document = {
    documentId: "ops.binding-test",
    root: {
      id: "root",
      props: {},
      dataBinding: { resourceId: "dashboard.summary", pointer: "/pendingRequests" },
      children: []
    }
  };
  const resources = { "dashboard.summary": { pendingRequests: 3 } };
  assert.equal(assertDocumentBindingsResolve(document, resources).length, 1);

  const missingPointer = structuredClone(document);
  missingPointer.root.dataBinding.pointer = "/data/pendingRequests";
  assert.throws(() => assertDocumentBindingsResolve(missingPointer, resources), PackageAssetValidationError);

  assert.throws(() => assertDocumentBindingsResolve(document, {}), PackageAssetValidationError);
});

test("DataTable과 KeyValueList의 상대 pointer도 Mock payload 자료형과 함께 검증한다", () => {
  const table = {
    documentId: "ops.table-binding",
    root: {
      id: "table",
      type: "DataTable",
      props: { columns: [{ id: "name", labelKey: "column.name", pointer: "/name" }] },
      dataBinding: { resourceId: "table.rows", pointer: "/rows" },
      children: []
    }
  };
  assert.equal(assertDocumentBindingsResolve(table, { "table.rows": { rows: [{ name: "연습 식당" }] } }).length, 1);
  assert.throws(
    () => assertDocumentBindingsResolve(table, { "table.rows": { rows: 3 } }),
    (error) => error instanceof PackageAssetValidationError && error.code === "INVALID_MOCK_BINDING_TYPE"
  );
  assert.throws(
    () => assertDocumentBindingsResolve(table, { "table.rows": { rows: [{ missing: true }] } }),
    (error) => error instanceof PackageAssetValidationError && error.code === "MISSING_MOCK_RELATIVE_POINTER"
  );

  const details = {
    documentId: "ops.detail-binding",
    root: {
      id: "details",
      type: "KeyValueList",
      props: { items: [{ labelKey: "detail.status", pointer: "/status" }] },
      dataBinding: { resourceId: "detail.item", pointer: "/item" },
      children: []
    }
  };
  assert.equal(assertDocumentBindingsResolve(details, { "detail.item": { item: { status: "mock" } } }).length, 1);
  assert.throws(
    () => assertDocumentBindingsResolve(details, { "detail.item": { item: [] } }),
    (error) => error instanceof PackageAssetValidationError && error.code === "INVALID_MOCK_BINDING_TYPE"
  );
});
