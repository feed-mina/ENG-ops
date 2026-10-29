import { COMPONENT_REGISTRY, FORMATTER_REGISTRY } from "../sdui-contracts/index.js";
import { createRendererCapabilities } from "../sdui-renderer-core/index.js";

export const WEB_COMPONENT_TYPES = Object.freeze([
  "Page", "Section", "Grid", "Card", "Heading", "Text", "Stat", "Notice"
]);

const WEB_COMPONENT_REGISTRY = Object.freeze(Object.fromEntries(
  WEB_COMPONENT_TYPES.map((type) => [type, COMPONENT_REGISTRY[type]])
));

const STYLE_PROPERTIES = Object.freeze({
  gap: "gap",
  padding: "padding",
  paddingX: ["padding-left", "padding-right"],
  paddingY: ["padding-top", "padding-bottom"],
  marginTop: "margin-top",
  width: "width",
  maxWidth: "max-width",
  minHeight: "min-height",
  background: "background-color",
  borderRadius: "border-radius",
  color: "color"
});

export function createWebRendererCapabilities() {
  return createRendererCapabilities({
    surface: "web",
    components: WEB_COMPONENT_REGISTRY,
    formatters: FORMATTER_REGISTRY
  });
}

function setClass(element, names) {
  element.setAttribute("class", names.filter(Boolean).join(" "));
}

function setText(element, text) {
  element.textContent = text ?? "";
  return element;
}

function appendTextElement(domDocument, parent, tagName, text, className) {
  const child = domDocument.createElement(tagName);
  if (className) setClass(child, [className]);
  setText(child, text);
  parent.append(child);
  return child;
}

function applyStyle(element, style) {
  for (const [key, value] of Object.entries(style ?? {})) {
    const properties = STYLE_PROPERTIES[key];
    if (!properties) continue;
    for (const property of Array.isArray(properties) ? properties : [properties]) {
      element.style.setProperty(property, value);
    }
  }
}

function applyAccessibility(element, node) {
  const accessibility = node.accessibility ?? {};
  if (accessibility.role) element.setAttribute("role", accessibility.role);
  if (accessibility.live) element.setAttribute("aria-live", accessibility.live);
  if (accessibility.label) element.setAttribute("aria-label", accessibility.label);
  if (accessibility.description) element.setAttribute("aria-description", accessibility.description);
}

function appendChildren(domDocument, element, node) {
  for (const child of node.children ?? []) element.append(renderWebNode(domDocument, child));
}

function renderContainer(domDocument, node, tagName, className) {
  const element = domDocument.createElement(tagName);
  element.setAttribute("id", node.id);
  setClass(element, ["sdui-node", className]);
  applyStyle(element, node.style);
  applyAccessibility(element, node);
  appendChildren(domDocument, element, node);
  return element;
}

function renderPage(domDocument, node) {
  const element = renderContainer(domDocument, node, "main", "sdui-page");
  element.setAttribute("data-page-title", node.messages.title ?? "");
  return element;
}

function renderSection(domDocument, node) {
  const element = renderContainer(domDocument, node, "section", "sdui-section");
  if (!element.getAttribute("aria-label") && node.messages.title) element.setAttribute("aria-label", node.messages.title);
  return element;
}

function renderGrid(domDocument, node) {
  const element = renderContainer(domDocument, node, "div", "sdui-grid");
  element.style.setProperty("--sdui-grid-columns", String(node.props.columns ?? 1));
  if (node.tokens.gap) element.style.setProperty("--sdui-grid-gap", node.tokens.gap);
  return element;
}

function renderHeading(domDocument, node) {
  const level = Math.min(6, Math.max(1, Number(node.props.level)));
  const element = domDocument.createElement(`h${level}`);
  element.setAttribute("id", node.id);
  setClass(element, ["sdui-node", "sdui-heading"]);
  applyStyle(element, node.style);
  applyAccessibility(element, node);
  return setText(element, node.messages.message);
}

function renderText(domDocument, node) {
  const element = domDocument.createElement("p");
  element.setAttribute("id", node.id);
  setClass(element, ["sdui-node", "sdui-text", node.props.tone ? `sdui-tone-${node.props.tone}` : ""]);
  applyStyle(element, node.style);
  applyAccessibility(element, node);
  return setText(element, node.messages.message);
}

function renderStat(domDocument, node) {
  const list = domDocument.createElement("dl");
  list.setAttribute("id", node.id);
  setClass(list, ["sdui-node", "sdui-stat"]);
  applyStyle(list, node.style);
  applyAccessibility(list, node);
  const item = domDocument.createElement("div");
  appendTextElement(domDocument, item, "dt", node.messages.label, "sdui-stat-label");
  appendTextElement(domDocument, item, "dd", node.binding?.formattedValue ?? "", "sdui-stat-value");
  list.append(item);
  return list;
}

function renderNotice(domDocument, node) {
  const element = domDocument.createElement("aside");
  element.setAttribute("id", node.id);
  setClass(element, ["sdui-node", "sdui-notice", node.props.tone ? `sdui-tone-${node.props.tone}` : ""]);
  applyStyle(element, node.style);
  applyAccessibility(element, node);
  if (!element.getAttribute("role")) element.setAttribute("role", "status");
  appendTextElement(domDocument, element, "h2", node.messages.title, "sdui-notice-title");
  appendTextElement(domDocument, element, "p", node.messages.message, "sdui-notice-message");
  return element;
}

function renderUnsupported(domDocument, node) {
  const element = domDocument.createElement("div");
  setClass(element, ["sdui-node", "sdui-unsupported"]);
  element.setAttribute("data-component", String(node.type ?? "unknown"));
  element.setAttribute("role", "status");
  appendTextElement(domDocument, element, "p", "지원하지 않는 화면 요소입니다.", "sdui-unsupported-message");
  return element;
}

const ADAPTERS = Object.freeze({
  Page: renderPage,
  Section: renderSection,
  Grid: renderGrid,
  Card: (domDocument, node) => renderContainer(domDocument, node, "article", "sdui-card"),
  Heading: renderHeading,
  Text: renderText,
  Stat: renderStat,
  Notice: renderNotice
});

export function renderWebNode(domDocument, node) {
  if (!domDocument || typeof domDocument.createElement !== "function") throw new TypeError("DOM document가 필요합니다.");
  const adapter = Object.hasOwn(ADAPTERS, node?.type) ? ADAPTERS[node.type] : undefined;
  return adapter ? adapter(domDocument, node) : renderUnsupported(domDocument, node ?? {});
}

function renderState(domDocument, plan) {
  const element = domDocument.createElement("section");
  setClass(element, ["sdui-root", "sdui-state", `sdui-state-${plan.status}`]);
  element.setAttribute("data-state", plan.status);
  element.setAttribute("role", plan.state.role);
  element.setAttribute("aria-live", plan.state.live);
  element.setAttribute("tabindex", "-1");
  appendTextElement(domDocument, element, "h2", plan.state.title, "sdui-state-title");
  appendTextElement(domDocument, element, "p", plan.state.message, "sdui-state-message");
  return element;
}

export function renderSduiPlan(domDocument, plan) {
  if (!plan || typeof plan !== "object") throw new TypeError("renderer plan이 필요합니다.");
  if (plan.status !== "ready") return renderState(domDocument, plan);
  const element = renderWebNode(domDocument, plan.root);
  const existingClass = element.getAttribute("class");
  setClass(element, ["sdui-root", existingClass]);
  element.setAttribute("tabindex", "-1");
  element.setAttribute("data-document-id", plan.documentId);
  element.setAttribute("data-revision", String(plan.revision));
  return element;
}

export function mountSduiPlan(container, plan, { focus = false } = {}) {
  if (!container || typeof container.replaceChildren !== "function") throw new TypeError("mount container가 필요합니다.");
  const domDocument = container.ownerDocument;
  const element = renderSduiPlan(domDocument, plan);
  container.replaceChildren(element);
  if (focus && typeof element.focus === "function") element.focus({ preventScroll: true });
  return element;
}
