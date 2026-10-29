import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { calculateFee, complianceTone, daysUntil, rankWorkers, validateJobRequest } from "../public/domain.js";
import { mockData as sourceMockData } from "../public/mock-data.js";

const appSource = (await readFile(new URL("../public/app.js", import.meta.url), "utf8"))
  .replace(/^import .*;\s*$/gm, "");

class FakeClassList {
  #values = new Set();

  add(name) {
    this.#values.add(name);
  }

  remove(name) {
    this.#values.delete(name);
  }

  contains(name) {
    return this.#values.has(name);
  }
}

class FakeRoot {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  async dispatch(type, target) {
    await this.listeners.get(type)?.({ target });
  }
}

function clickTarget(selector, dataset = {}) {
  const target = { dataset };
  target.closest = (candidate) => candidate === selector ? target : null;
  return target;
}

function createHarness(initialHash = "") {
  const main = new FakeRoot();
  const toast = {
    classList: new FakeClassList(),
    textContent: ""
  };
  const body = { dataset: {} };
  const location = { hash: initialHash };
  const listeners = new Map();
  const calls = {
    excel: [],
    fetch: [],
    print: 0,
    scroll: []
  };
  const mockData = structuredClone(sourceMockData);
  let timerId = 0;

  const document = {
    body,
    querySelector(selector) {
      if (selector === "#main-content") return main;
      if (selector === "#toast") return toast;
      if (selector === "#public-process") return { scrollIntoView() {} };
      return null;
    }
  };
  const window = {
    location,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    clearTimeout() {},
    setTimeout() {
      timerId += 1;
      return timerId;
    },
    print() {
      calls.print += 1;
    },
    scrollTo(options) {
      calls.scroll.push(options);
    }
  };

  const context = vm.createContext({
    calculateFee,
    complianceTone,
    daysUntil,
    document,
    downloadLedgerWorkbook(data) {
      calls.excel.push(data);
    },
    escape,
    fetch: async (path) => {
      calls.fetch.push(path);
      return { text: async () => "mock document loaded" };
    },
    mockData,
    rankWorkers,
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    validateJobRequest,
    window
  });

  vm.runInContext(appSource, context, { filename: "public/app.js" });

  return {
    body,
    calls,
    main,
    mockData,
    toast,
    async navigate(route) {
      location.hash = route ? `#${route}` : "";
      await listeners.get("hashchange")?.();
    }
  };
}

const routeSignatures = new Map([
  ["", /class="public-page"/],
  ["dashboard", /class="metric-grid"/],
  ["jobs", /class="filter-bar"/],
  ["workers", /class="card-list"/],
  ["matching", /id="job-select"/],
  ["ledger", /data-export-excel/],
  ["compliance", /data-task=/],
  ["field-audit", /class="field-audit-summary"/],
  ["documents", /class="doc-grid"/],
  ["ai", /data-ai-approve/],
  ["audit", /class="timeline"/]
]);

for (const [route, signature] of routeSignatures) {
  test(`${route || "public"} hash page renders`, async () => {
    const harness = createHarness();
    await harness.navigate(route);

    assert.match(harness.main.innerHTML, signature);
    assert.equal(harness.body.dataset.mode, route ? "admin" : "public");
  });
}

test("unknown hash falls back to the public page", async () => {
  const harness = createHarness();
  await harness.navigate("not-a-route");

  assert.equal(harness.body.dataset.mode, "public");
  assert.match(harness.main.innerHTML, /class="public-page"/);
});

test("matching job selection rerenders the selected request", async () => {
  const harness = createHarness();
  const selectedJobId = harness.mockData.jobRequests[1].id;
  await harness.navigate("matching");

  await harness.main.dispatch("change", {
    value: selectedJobId,
    matches: (selector) => selector === "#job-select"
  });

  assert.match(harness.main.innerHTML, new RegExp(`option value="${selectedJobId}" selected`));
});

test("fee check reports its result through the live toast", async () => {
  const harness = createHarness();
  const placementId = harness.mockData.placements[0].id;
  await harness.navigate("ledger");

  await harness.main.dispatch("click", clickTarget("[data-fee]", { fee: placementId }));

  assert.notEqual(harness.toast.textContent, "");
  assert.equal(harness.toast.classList.contains("is-visible"), true);
});

test("Excel export delegates the current mock ledger", async () => {
  const harness = createHarness();
  await harness.navigate("ledger");

  await harness.main.dispatch("click", clickTarget("[data-export-excel]"));

  assert.equal(harness.calls.excel.length, 1);
  assert.equal(harness.calls.excel[0], harness.mockData);
});

test("PDF export opens the browser print boundary", async () => {
  const harness = createHarness();
  await harness.navigate("ledger");

  await harness.main.dispatch("click", clickTarget("[data-export-pdf]"));

  assert.equal(harness.calls.print, 1);
});

test("compliance task button toggles the local completion state", async () => {
  const harness = createHarness();
  const taskId = harness.mockData.complianceTasks[0].id;
  await harness.navigate("compliance");
  const before = harness.main.innerHTML;

  await harness.main.dispatch("click", clickTarget("[data-task]", { task: taskId }));

  assert.notEqual(harness.main.innerHTML, before);
  assert.match(harness.main.innerHTML, new RegExp(`class="button button-small button-ghost"[^>]+data-task="${taskId}"`));
});

test("document selection fetches and previews the mock file", async () => {
  const harness = createHarness();
  const file = harness.mockData.documents[1].file;
  await harness.navigate("documents");

  await harness.main.dispatch("click", clickTarget("[data-document]", { document: file }));

  assert.deepEqual(harness.calls.fetch, [`/mock-documents/${file}`]);
  assert.match(harness.main.innerHTML, /mock document loaded/);
});

test("AI output requires and records explicit human approval", async () => {
  const harness = createHarness();
  await harness.navigate("ai");

  await harness.main.dispatch("click", clickTarget("[data-ai-approve]"));

  assert.match(harness.main.innerHTML, /data-ai-approve disabled/);
  assert.notEqual(harness.toast.textContent, "");
  assert.equal(harness.toast.classList.contains("is-visible"), true);
});
