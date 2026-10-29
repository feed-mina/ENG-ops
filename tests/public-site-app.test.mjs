import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../apps/public-site/app.js", import.meta.url), "utf8");

class FakeClassList {
  #values = new Set();

  toggle(name, force) {
    const enabled = force === undefined ? !this.#values.has(name) : force;
    if (enabled) this.#values.add(name);
    else this.#values.delete(name);
    return enabled;
  }

  remove(name) {
    this.#values.delete(name);
  }

  contains(name) {
    return this.#values.has(name);
  }
}

class FakeElement {
  constructor({ dataset = {}, attributes = {}, onFocus } = {}) {
    this.dataset = { ...dataset };
    this.attributes = new Map(Object.entries(attributes));
    this.classList = new FakeClassList();
    this.hidden = false;
    this.tabIndex = 0;
    this.scrollCalls = [];
    this.listeners = new Map();
    this.onFocus = onFocus;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event = {}) {
    return this.listeners.get(type)?.({
      preventDefault() {},
      target: this,
      ...event
    });
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  focus() {
    this.onFocus?.(this);
  }

  scrollIntoView(options) {
    this.scrollCalls.push(options);
  }
}

function createHarness(hash = "") {
  const document = { activeElement: null };
  const panels = new Map([
    ["restaurant-info", new FakeElement()],
    ["worker-info", new FakeElement()]
  ]);
  const tabs = ["restaurant-info", "worker-info"].map((panelId) => new FakeElement({
    dataset: { tab: panelId },
    attributes: { "aria-selected": panelId === "restaurant-info" ? "true" : "false" },
    onFocus(element) {
      document.activeElement = element;
    }
  }));
  const tabLinks = ["restaurant-info", "worker-info"].map((panelId) => new FakeElement({
    dataset: { tabLink: panelId }
  }));
  const menuButton = new FakeElement({ attributes: { "aria-expanded": "false" } });
  const menu = new FakeElement();
  const location = { hash };
  const historyCalls = [];

  document.querySelector = (selector) => ({
    "[data-menu-button]": menuButton,
    "[data-menu]": menu
  })[selector] ?? null;
  document.querySelectorAll = (selector) => ({
    "[data-tab]": tabs,
    "[data-tab-link]": tabLinks
  })[selector] ?? [];
  document.getElementById = (id) => panels.get(id) ?? null;

  const context = vm.createContext({
    decodeURIComponent,
    document,
    history: {
      pushState(state, title, nextHash) {
        historyCalls.push([state, title, nextHash]);
        location.hash = nextHash;
      }
    },
    location,
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    window: {
      matchMedia() {
        return { matches: false };
      }
    }
  });

  vm.runInContext(appSource, context, { filename: "apps/public-site/app.js" });
  return { document, historyCalls, location, menu, menuButton, panels, tabLinks, tabs };
}

test("worker-info deep link activates and scrolls to the linked panel", () => {
  const harness = createHarness("#worker-info");
  const workerTab = harness.tabs[1];
  const workerPanel = harness.panels.get("worker-info");

  assert.equal(workerTab.getAttribute("aria-selected"), "true");
  assert.equal(workerTab.tabIndex, 0);
  assert.equal(workerPanel.hidden, false);
  assert.equal(workerPanel.scrollCalls.length, 1);
  assert.equal(workerPanel.scrollCalls[0].behavior, "smooth");
  assert.equal(workerPanel.scrollCalls[0].block, "start");
  assert.equal(harness.panels.get("restaurant-info").hidden, true);
  assert.equal(harness.document.activeElement, null);
});

test("mobile menu opens and closes after a navigation link click", () => {
  const harness = createHarness();

  harness.menuButton.dispatch("click");
  assert.equal(harness.menuButton.getAttribute("aria-expanded"), "true");
  assert.equal(harness.menu.classList.contains("is-open"), true);

  harness.menu.dispatch("click", { target: { closest: (selector) => selector === "a" ? {} : null } });
  assert.equal(harness.menuButton.getAttribute("aria-expanded"), "false");
  assert.equal(harness.menu.classList.contains("is-open"), false);
});

test("clicking a tab activates its panel", () => {
  const harness = createHarness();

  harness.tabs[1].dispatch("click");
  assert.equal(harness.tabs[1].getAttribute("aria-selected"), "true");
  assert.equal(harness.panels.get("worker-info").hidden, false);
  assert.equal(harness.panels.get("restaurant-info").hidden, true);
  assert.equal(harness.document.activeElement, harness.tabs[1]);
});

test("ArrowRight moves tab selection and keyboard focus", () => {
  const harness = createHarness();
  let prevented = false;

  harness.tabs[0].focus();
  harness.document.activeElement.dispatch("keydown", {
    key: "ArrowRight",
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(harness.tabs[1].getAttribute("aria-selected"), "true");
  assert.equal(harness.document.activeElement, harness.tabs[1]);
});

test("ArrowLeft moves tab selection and keyboard focus back", () => {
  const harness = createHarness();
  let prevented = false;

  harness.tabs[1].dispatch("click");
  harness.document.activeElement.dispatch("keydown", {
    key: "ArrowLeft",
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(harness.tabs[0].getAttribute("aria-selected"), "true");
  assert.equal(harness.tabs[0].tabIndex, 0);
  assert.equal(harness.tabs[1].getAttribute("aria-selected"), "false");
  assert.equal(harness.tabs[1].tabIndex, -1);
  assert.equal(harness.panels.get("restaurant-info").hidden, false);
  assert.equal(harness.panels.get("worker-info").hidden, true);
  assert.equal(harness.document.activeElement, harness.tabs[0]);
});

test("service link updates the hash, activates the panel, and scrolls", () => {
  const harness = createHarness();
  let prevented = false;

  harness.tabLinks[1].dispatch("click", {
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(harness.location.hash, "#worker-info");
  assert.deepEqual(harness.historyCalls, [[null, "", "#worker-info"]]);
  assert.equal(harness.tabs[1].getAttribute("aria-selected"), "true");
  assert.equal(harness.document.activeElement, harness.tabs[1]);
  const scrollCalls = harness.panels.get("worker-info").scrollCalls;
  assert.equal(scrollCalls.length, 1);
  assert.equal(scrollCalls[0].behavior, "smooth");
  assert.equal(scrollCalls[0].block, "start");
});
