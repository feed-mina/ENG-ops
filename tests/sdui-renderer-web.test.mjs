import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { prepareSduiRender } from "../packages/sdui-renderer-core/index.js";
import {
  createWebRendererCapabilities,
  mountSduiPlan,
  renderSduiPlan,
  renderWebNode
} from "../packages/sdui-renderer-web/index.js";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

const [dashboardDocument, dashboardFixture, messageDocument, theme, webSource, webStyles] = await Promise.all([
  readJson("../sdui/harmony-ops/pages/dashboard.mock.document.json"),
  readJson("../sdui/harmony-ops/fixtures/dashboard.mock.data.json"),
  readJson("../sdui/harmony-ops/messages/ko.json"),
  readJson("../sdui/harmony-ops/theme/tokens.json"),
  readFile(new URL("../packages/sdui-renderer-web/index.js", import.meta.url), "utf8"),
  readFile(new URL("../packages/sdui-renderer-web/styles.css", import.meta.url), "utf8")
]);

class FakeStyle {
  values = new Map();

  setProperty(name, value) {
    this.values.set(name, String(value));
  }
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.style = new FakeStyle();
    this.value = "";
    this.focusOptions = null;
  }

  set innerHTML(_value) {
    throw new Error("innerHTML must not be used");
  }

  set textContent(value) {
    this.value = String(value);
    this.children = [];
  }

  get textContent() {
    return `${this.value}${this.children.map((child) => child.textContent).join("")}`;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.value = "";
    this.children = [...children];
  }

  focus(options) {
    this.focusOptions = options;
    this.ownerDocument.activeElement = this;
  }
}

class FakeDocument {
  activeElement = null;

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }
}

function prepare(state = "ready") {
  return prepareSduiRender({
    document: dashboardDocument,
    capabilities: createWebRendererCapabilities(),
    messageDocument,
    theme,
    resources: { "dashboard.summary": dashboardFixture.data },
    role: "owner",
    state
  });
}

function walk(element, result = []) {
  result.push(element);
  for (const child of element.children) walk(child, result);
  return result;
}

function byId(root, id) {
  return walk(root, []).find((element) => element.getAttribute("id") === id);
}

function snapshotElement(element) {
  return {
    tag: element.tagName,
    attributes: Object.fromEntries([...element.attributes].sort(([left], [right]) => left.localeCompare(right))),
    style: Object.fromEntries([...element.style.values].sort(([left], [right]) => left.localeCompare(right))),
    ...(element.value ? { text: element.value } : {}),
    children: element.children.map(snapshotElement)
  };
}

test("dashboard plan을 의미 있는 DOM과 접근성 속성으로 렌더링한다", () => {
  const domDocument = new FakeDocument();
  const root = renderSduiPlan(domDocument, prepare());

  assert.equal(root.tagName, "MAIN");
  assert.match(root.getAttribute("class"), /sdui-root/);
  assert.equal(root.getAttribute("data-document-id"), "ops.dashboard");
  assert.equal(byId(root, "dashboard.summary").tagName, "SECTION");
  assert.equal(byId(root, "dashboard.summary").getAttribute("aria-label"), "오늘의 업무");
  assert.equal(byId(root, "dashboard.heading").tagName, "H1");
  assert.equal(byId(root, "dashboard.pending.stat").tagName, "DL");
  assert.equal(byId(root, "dashboard.pending.stat").textContent, "확인할 접수3");
  assert.equal(byId(root, "dashboard.placements.stat").textContent, "오늘 소개1");
  assert.equal(byId(root, "dashboard.mock.notice").getAttribute("role"), "status");
  assert.equal(byId(root, "dashboard.mock.notice").getAttribute("aria-live"), "polite");
});

test("mount는 기존 내용을 교체해 재렌더 중복을 만들지 않는다", () => {
  const domDocument = new FakeDocument();
  const container = domDocument.createElement("div");
  const stale = domDocument.createElement("p");
  stale.textContent = "old";
  container.append(stale);

  mountSduiPlan(container, prepare());
  assert.equal(container.children.length, 1);
  assert.equal(domDocument.activeElement, null);
  assert.equal(container.children[0].tagName, "MAIN");
  const focused = mountSduiPlan(container, prepare("error"), { focus: true });
  assert.equal(container.children.length, 1);
  assert.equal(domDocument.activeElement, focused);
  assert.deepEqual(focused.focusOptions, { preventScroll: true });
});

test("dashboard summary Web snapshot을 고정한다", () => {
  const root = renderSduiPlan(new FakeDocument(), prepare());
  assert.deepEqual(snapshotElement(byId(root, "dashboard.summary")), {
    tag: "SECTION",
    attributes: {
      "aria-label": "오늘의 업무",
      class: "sdui-node sdui-section",
      id: "dashboard.summary"
    },
    style: {},
    children: [{
      tag: "DIV",
      attributes: { class: "sdui-node sdui-grid", id: "dashboard.summary.grid" },
      style: { "--sdui-grid-columns": "2", "--sdui-grid-gap": "16px" },
      children: [
        {
          tag: "ARTICLE",
          attributes: { class: "sdui-node sdui-card", id: "dashboard.pending.card" },
          style: {},
          children: [{
            tag: "DL",
            attributes: { class: "sdui-node sdui-stat", id: "dashboard.pending.stat" },
            style: {},
            children: [{
              tag: "DIV", attributes: {}, style: {}, children: [
                { tag: "DT", attributes: { class: "sdui-stat-label" }, style: {}, text: "확인할 접수", children: [] },
                { tag: "DD", attributes: { class: "sdui-stat-value" }, style: {}, text: "3", children: [] }
              ]
            }]
          }]
        },
        {
          tag: "ARTICLE",
          attributes: { class: "sdui-node sdui-card", id: "dashboard.placements.card" },
          style: {},
          children: [{
            tag: "DL",
            attributes: { class: "sdui-node sdui-stat", id: "dashboard.placements.stat" },
            style: {},
            children: [{
              tag: "DIV", attributes: {}, style: {}, children: [
                { tag: "DT", attributes: { class: "sdui-stat-label" }, style: {}, text: "오늘 소개", children: [] },
                { tag: "DD", attributes: { class: "sdui-stat-value" }, style: {}, text: "1", children: [] }
              ]
            }]
          }]
        }
      ]
    }]
  });
});

test("미지원 component는 props나 Action을 실행하지 않고 고정 안내로 대체한다", () => {
  const domDocument = new FakeDocument();
  const element = renderWebNode(domDocument, {
    id: "unsafe",
    type: "Button",
    props: { labelKey: "<script>alert(1)</script>" },
    messages: { label: "실행하면 안 됨" },
    style: {},
    accessibility: {},
    actions: { press: { actionId: "network.post" } },
    children: []
  });

  assert.equal(element.getAttribute("data-component"), "Button");
  assert.equal(element.getAttribute("role"), "status");
  assert.equal(element.textContent, "지원하지 않는 화면 요소입니다.");
  assert.doesNotMatch(element.textContent, /script|실행하면 안 됨|network\.post/);

  for (const prototypeName of ["constructor", "toString", "__proto__"]) {
    const fallback = renderWebNode(domDocument, { type: prototypeName });
    assert.equal(fallback.textContent, "지원하지 않는 화면 요소입니다.");
  }
});

test("비정상 상태는 focus 가능한 status/alert 영역으로 렌더링한다", () => {
  const domDocument = new FakeDocument();
  for (const state of ["loading", "empty", "error", "forbidden", "offline"]) {
    const root = renderSduiPlan(domDocument, prepare(state));
    assert.equal(root.getAttribute("data-state"), state);
    assert.equal(root.getAttribute("tabindex"), "-1");
    assert.ok(["status", "alert"].includes(root.getAttribute("role")));
    assert.ok(root.textContent.length > 0);
  }
});

test("Web adapter는 raw HTML을 사용하지 않고 360px·큰 글씨 대응 규칙을 포함한다", () => {
  assert.doesNotMatch(webSource, /innerHTML|insertAdjacentHTML|dangerouslySetInnerHTML/);
  assert.match(webSource, /createElement/);
  assert.match(webSource, /textContent/);
  assert.match(webStyles, /@media \(max-width: 360px\)/);
  assert.match(webStyles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(webStyles, /font-size: clamp\(/);
  assert.match(webStyles, /:focus-visible/);
});
