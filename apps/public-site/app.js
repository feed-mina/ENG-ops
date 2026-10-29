const menuButton = document.querySelector("[data-menu-button]");
const menu = document.querySelector("[data-menu]");
const tabs = [...document.querySelectorAll("[data-tab]")];
const tabLinks = [...document.querySelectorAll("[data-tab-link]")];

menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  menu?.classList.toggle("is-open", !expanded);
});

menu?.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  menuButton?.setAttribute("aria-expanded", "false");
  menu.classList.remove("is-open");
});

function activateTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(item.dataset.tab);
    if (panel) panel.hidden = !selected;
  }
}

function showLinkedPanel(panelId, { scroll = false, focus = false } = {}) {
  const tab = tabs.find((item) => item.dataset.tab === panelId);
  const panel = document.getElementById(panelId);
  if (!tab || !panel) return false;
  activateTab(tab);
  if (focus) tab.focus({ preventScroll: true });
  if (scroll) {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    requestAnimationFrame(() => panel.scrollIntoView({ behavior, block: "start" }));
  }
  return true;
}

for (const link of tabLinks) {
  link.addEventListener("click", (event) => {
    const panelId = link.dataset.tabLink;
    if (!panelId || !showLinkedPanel(panelId, { scroll: true, focus: true })) return;
    event.preventDefault();
    history.pushState(null, "", `#${panelId}`);
  });
}

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    activateTab(tab);
    tab.focus({ preventScroll: true });
  });
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
    activateTab(next);
    next.focus({ preventScroll: true });
  });
}

const initialPanelId = decodeURIComponent(location.hash.slice(1));
if (initialPanelId) showLinkedPanel(initialPanelId, { scroll: true });
