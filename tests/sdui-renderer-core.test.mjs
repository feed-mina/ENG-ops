import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SduiRenderError,
  formatSduiValue,
  prepareSduiRender,
  serializeRenderPlan
} from "../packages/sdui-renderer-core/index.js";
import { createWebRendererCapabilities } from "../packages/sdui-renderer-web/index.js";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

const [dashboardDocument, dashboardFixture, messageDocument, theme] = await Promise.all([
  readJson("../sdui/harmony-ops/pages/dashboard.mock.document.json"),
  readJson("../sdui/harmony-ops/fixtures/dashboard.mock.data.json"),
  readJson("../sdui/harmony-ops/messages/ko.json"),
  readJson("../sdui/harmony-ops/theme/tokens.json")
]);

function prepare(overrides = {}) {
  return prepareSduiRender({
    document: dashboardDocument,
    capabilities: createWebRendererCapabilities(),
    messageDocument,
    theme,
    resources: { "dashboard.summary": dashboardFixture.data },
    role: "owner",
    ...overrides
  });
}

function flatten(node, result = []) {
  if (!node) return result;
  result.push(node);
  for (const child of node.children) flatten(child, result);
  return result;
}

test("dashboard fixture를 DOM 없는 10-node render plan으로 만든다", () => {
  const plan = prepare();
  const nodes = flatten(plan.root);

  assert.equal(plan.status, "ready");
  assert.equal(plan.documentId, "ops.dashboard");
  assert.equal(nodes.length, 10);
  assert.equal(nodes.find((node) => node.id === "dashboard.heading").messages.message, "업무 현황");
  assert.equal(nodes.find((node) => node.id === "dashboard.pending.stat").binding.value, 3);
  assert.equal(nodes.find((node) => node.id === "dashboard.pending.stat").binding.formattedValue, "3");
  assert.equal(nodes.find((node) => node.id === "dashboard.placements.stat").binding.formattedValue, "1");
  assert.equal(nodes.find((node) => node.id === "dashboard.root").style.padding, "24px");
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.root));
});

test("한국어 숫자·금액·날짜·시간·전화 마스킹 formatter가 결정적으로 동작한다", () => {
  assert.equal(formatSduiValue("number", 1234567), "1,234,567");
  assert.match(formatSduiValue("currencyKr", 27000), /27,000/);
  assert.match(formatSduiValue("dateKr", "2026-07-17"), /2026/);
  assert.equal(formatSduiValue("timeKr", "09:30:15"), "09:30");
  assert.equal(formatSduiValue("maskedPhone", "010-1234-5678"), "010-****-5678");
  assert.throws(() => formatSduiValue("number", "3"), SduiRenderError);
  assert.throws(() => formatSduiValue("dateKr", "2026-02-31"), /유효한 달력 날짜/);
  assert.throws(() => formatSduiValue("dateKr", "2026-02-31T09:30:00+09:00"), /유효한 달력 날짜/);
  assert.throws(() => formatSduiValue("dateKr", "2026-02-29T09:30:00+09:00"), /유효한 달력 날짜/);
  assert.match(formatSduiValue("dateKr", "2028-02-29T09:30:00+09:00"), /2028/);
  assert.throws(() => formatSduiValue("timeKr", "99:99"), /유효한 시각/);
});

test("loading·empty·error·forbidden·offline 상태는 data 없이 안전한 plan을 만든다", () => {
  for (const state of ["loading", "empty", "error", "forbidden", "offline"]) {
    const plan = prepare({ state, resources: {} });
    assert.equal(plan.status, state);
    assert.equal(plan.root, null);
    assert.ok(plan.state.title.length > 0);
    assert.ok(["status", "alert"].includes(plan.state.role));
  }
});

test("역할이 root allowlist에 없으면 forbidden plan으로 닫힌다", () => {
  const plan = prepare({ role: "system_admin" });
  assert.equal(plan.status, "forbidden");
  assert.equal(plan.root, null);
});

test("resource 또는 pointer가 누락되면 render plan 생성을 거부한다", () => {
  assert.throws(() => prepare({ resources: {} }), /dashboard\.summary/);
  assert.throws(() => prepare({ resources: { "dashboard.summary": { todayPlacements: 1 } } }), /pendingRequests/);
});

test("capability가 부족하거나 renderer가 오래되면 실행 대신 update-required plan을 만든다", () => {
  const capabilities = structuredClone(createWebRendererCapabilities());
  delete capabilities.components.Notice;
  const missingComponent = prepare({ capabilities });
  assert.equal(missingComponent.status, "update-required");
  assert.deepEqual(missingComponent.state.missingCapabilities, ["Notice@1"]);

  const oldRenderer = structuredClone(createWebRendererCapabilities());
  oldRenderer.rendererVersion = "0.0.1";
  assert.equal(prepare({ capabilities: oldRenderer }).status, "update-required");

  const futureDocument = structuredClone(dashboardDocument);
  futureDocument.requiredCapabilities.push("FutureWidget@1");
  futureDocument.root.children.at(-1).type = "FutureWidget";
  assert.deepEqual(prepare({ document: futureDocument }).state.missingCapabilities, ["FutureWidget@1"]);
});

test("빈 JSON Pointer는 resource 전체 값을 안전하게 binding한다", () => {
  const rootBindingDocument = structuredClone(dashboardDocument);
  rootBindingDocument.requiredCapabilities = ["Page@1", "Stat@1"];
  rootBindingDocument.root.children = [{
    id: "dashboard.total.stat",
    type: "Stat",
    props: { labelKey: "dashboard.pending-requests" },
    dataBinding: { resourceId: "dashboard.summary", pointer: "", formatter: "number" }
  }];
  const plan = prepare({ document: rootBindingDocument, resources: { "dashboard.summary": 7 } });
  assert.equal(plan.root.children[0].binding.value, 7);
  assert.equal(plan.root.children[0].binding.formattedValue, "7");
});

test("등록되지 않은 Action은 core 진입 단계에서 차단한다", () => {
  const tampered = structuredClone(dashboardDocument);
  tampered.requiredCapabilities.push("Button@1");
  tampered.root.children.push({
    id: "dashboard.tampered",
    type: "Button",
    props: { labelKey: "dashboard.title" },
    actions: { press: { actionId: "network.post", idempotency: "none" } }
  });
  const capabilities = structuredClone(createWebRendererCapabilities());
  capabilities.components.Button = 1;
  assert.throws(() => prepare({ document: tampered, capabilities }), /등록되지 않은 Action ID/);
});

test("snapshot serializer는 key 순서와 마지막 줄바꿈을 고정한다", () => {
  const first = serializeRenderPlan(prepare());
  const second = serializeRenderPlan(prepare());
  assert.equal(first, second);
  assert.match(first, /"schema": "harmony\.sdui\.render-plan\.v1"/);
  assert.ok(first.endsWith("\n"));
});
