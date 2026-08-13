/**
 * Live design studio — open with ?design=1 or Ctrl+Shift+D
 * Click Inspect, then tap any component. Edit tokens or any CSS property.
 * Overrides persist in this browser (localStorage).
 */
const STORE_KEY = "phonepe_ui_overrides_v1";
const COMMON_PROPS = [
  "color",
  "background",
  "padding",
  "margin",
  "font-size",
  "font-weight",
  "letter-spacing",
  "line-height",
  "border",
  "border-radius",
  "width",
  "height",
  "max-width",
  "max-height",
  "gap",
  "opacity",
  "box-shadow",
  "text-align",
  "display",
  "zoom",
];

const TOKEN_GROUPS = [
  ["Brand", ["--pp-purple", "--pp-purple-deep", "--pp-cyan", "--pp-green", "--pp-yellow", "--pp-orange", "--pp-red", "--pp-ink", "--pp-muted", "--pp-white"]],
  ["Layout", ["--ui-page-zoom", "--radius", "--radius-sm", "--ui-panel-bg", "--ui-panel-radius", "--ui-panel-pad"]],
  ["Header", ["--ui-header-h", "--ui-header-bg", "--ui-logo-w", "--ui-chip-bg", "--ui-chip-color", "--ui-chip-pad", "--ui-chip-size"]],
  ["Title", ["--ui-banner-title-size", "--ui-banner-title-color", "--ui-banner-sub-size", "--ui-banner-sub-color"]],
  ["Keyword", ["--ui-keyword-bg", "--ui-keyword-border", "--ui-keyword-pad", "--ui-keyword-radius", "--ui-keyword-label-size", "--ui-keyword-label-color", "--ui-keyword-text-size", "--ui-keyword-text-color"]],
  ["Crossword", ["--ui-grid-bg", "--ui-grid-gap", "--ui-grid-pad", "--ui-grid-radius", "--ui-grid-border", "--ui-cell-bg", "--ui-cell-color", "--ui-cell-radius", "--ui-cell-border"]],
  ["Rules", ["--ui-rules-bg", "--ui-rules-pad", "--ui-rules-radius", "--ui-rules-border", "--ui-rules-text-size", "--ui-rules-text-color", "--ui-rules-gap", "--ui-recap-q-color", "--ui-recap-a-color"]],
  ["Hint", ["--ui-hint-size", "--ui-hint-color"]],
];

let state = loadState();
let inspectOn = false;
let selectedName = "";
let panelOpen = false;

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "") || { vars: {}, els: {} };
  } catch {
    return { vars: {}, els: {} };
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  applyOverrides();
}

function applyOverrides() {
  let css = "";
  const app = document.querySelector(".app");
  if (app) {
    for (const [k, v] of Object.entries(state.vars || {})) {
      app.style.setProperty(k, v);
    }
  }
  for (const [name, props] of Object.entries(state.els || {})) {
    const decls = Object.entries(props)
      .filter(([, v]) => String(v || "").trim())
      .map(([p, v]) => `${p}: ${v} !important`)
      .join("; ");
    if (decls) css += `[data-ui="${name}"]{${decls}}\n`;
  }
  let tag = document.getElementById("pp-design-overrides");
  if (!tag) {
    tag = document.createElement("style");
    tag.id = "pp-design-overrides";
    document.head.appendChild(tag);
  }
  tag.textContent = css;
}

function injectChrome() {
  if (document.getElementById("pp-designer")) return;
  const style = document.createElement("style");
  style.id = "pp-designer-css";
  style.textContent = `
    .pp-design-open { cursor: default; }
    .pp-design-open.pp-inspecting [data-ui] { outline: 2px dashed rgba(46,196,255,.85); outline-offset: 2px; cursor: crosshair; }
    .pp-design-open [data-ui].pp-ui-selected { outline: 3px solid #ff7a1a !important; outline-offset: 2px; }
    #pp-designer {
      position: fixed; z-index: 99999; right: 12px; bottom: 12px; width: min(360px, calc(100vw - 24px));
      max-height: min(78vh, 640px); display: flex; flex-direction: column;
      background: #1b1230; color: #f4f0ff; border: 1px solid rgba(255,255,255,.18);
      border-radius: 16px; box-shadow: 0 18px 50px rgba(0,0,0,.45); font: 13px/1.4 "Segoe UI", system-ui, sans-serif;
      overflow: hidden;
    }
    #pp-designer.pp-hidden { display: none; }
    #pp-designer header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #2a1b4a; font-weight: 800; }
    #pp-designer header span { flex: 1; }
    #pp-designer header button, #pp-designer .pp-actions button, #pp-designer .pp-inspect {
      border: 0; border-radius: 999px; padding: 6px 10px; font-weight: 700; cursor: pointer;
    }
    #pp-designer .pp-inspect { background: #2ec4ff; color: #082030; }
    #pp-designer .pp-inspect.on { background: #ff7a1a; color: #fff; }
    #pp-designer .pp-x { background: transparent; color: #fff; font-size: 18px; }
    #pp-designer .pp-body { overflow: auto; padding: 10px 12px 14px; display: grid; gap: 10px; }
    #pp-designer label { display: block; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #c8bddc; margin-bottom: 4px; }
    #pp-designer select, #pp-designer input {
      width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid rgba(255,255,255,.16);
      background: #120a22; color: #fff; padding: 7px 8px; font: inherit;
    }
    #pp-designer .pp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; align-items: end; }
    #pp-designer .pp-row.pp-3 { grid-template-columns: 1fr 1fr auto; }
    #pp-designer .pp-group { background: rgba(255,255,255,.05); border-radius: 10px; padding: 8px; }
    #pp-designer .pp-group h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9ee7ff; }
    #pp-designer .pp-token { display: grid; grid-template-columns: 1fr 88px; gap: 6px; margin-bottom: 6px; }
    #pp-designer .pp-token small { grid-column: 1 / -1; color: #9b90b4; font-size: 10px; word-break: break-all; }
    #pp-designer .pp-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    #pp-designer .pp-actions button { background: #5f259f; color: #fff; }
    #pp-designer .pp-hint { margin: 0; color: #c8bddc; font-size: 12px; }
    #pp-designer [data-zoom-out], #pp-designer [data-zoom-in] {
      background: #5f259f; color: #fff; min-width: 40px;
    }
    #pp-designer [data-zoom-label] { display: block; margin-top: 4px; color: #9ee7ff; font-weight: 700; }
    #pp-fab {
      position: fixed; z-index: 99998; right: 14px; bottom: 14px; width: 48px; height: 48px;
      border: 0; border-radius: 50%; background: #5f259f; color: #fff; font-weight: 800; font-size: 18px;
      box-shadow: 0 10px 28px rgba(20,8,40,.4); cursor: pointer;
    }
    #pp-fab.pp-hidden { display: none; }
  `;
  document.head.appendChild(style);

  const fab = document.createElement("button");
  fab.id = "pp-fab";
  fab.type = "button";
  fab.title = "Design studio (Ctrl+Shift+D)";
  fab.textContent = "✎";
  fab.addEventListener("click", () => setOpen(true));
  document.body.appendChild(fab);

  const panel = document.createElement("aside");
  panel.id = "pp-designer";
  panel.className = "pp-hidden";
  panel.innerHTML = `
    <header>
      <button type="button" class="pp-inspect" data-inspect>Inspect</button>
      <span>Design studio</span>
      <button type="button" class="pp-x" data-close aria-label="Close">×</button>
    </header>
    <div class="pp-body">
      <div class="pp-group">
        <h4>Chrome page zoom</h4>
        <p class="pp-hint">Property: <code>zoom</code> / token <code>--ui-page-zoom</code>. Keyboard: Ctrl + and Ctrl − (Ctrl 0 reset).</p>
        <div class="pp-row pp-3">
          <button type="button" data-zoom-out>−</button>
          <input data-zoom type="range" min="0.7" max="1.5" step="0.05" />
          <button type="button" data-zoom-in>+</button>
        </div>
        <small data-zoom-label>100%</small>
      </div>
      <p class="pp-hint">Chrome DevTools also works: F12 → Elements → click a <code>data-ui</code> node, or edit tokens on <code>.app</code>.</p>
      <div>
        <label>Component</label>
        <select data-pick></select>
      </div>
      <div class="pp-group" data-el-props>
        <h4>Any CSS property</h4>
        <div data-el-fields></div>
        <div class="pp-row pp-3" style="margin-top:6px">
          <input data-new-prop placeholder="property e.g. padding" />
          <input data-new-val placeholder="value e.g. 8px" />
          <button type="button" data-add-prop>Add</button>
        </div>
      </div>
      <div data-tokens></div>
      <div class="pp-actions">
        <button type="button" data-copy>Copy CSS</button>
        <button type="button" data-reset>Reset all</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  panel.querySelector("[data-close]").addEventListener("click", () => setOpen(false));
  panel.querySelector("[data-inspect]").addEventListener("click", toggleInspect);
  panel.querySelector("[data-pick]").addEventListener("change", (e) => selectName(e.target.value));
  panel.querySelector("[data-add-prop]").addEventListener("click", addCustomProp);
  panel.querySelector("[data-copy]").addEventListener("click", copyCss);
  panel.querySelector("[data-reset]").addEventListener("click", () => {
    state = { vars: {}, els: {} };
    document.querySelector(".app")?.removeAttribute("style");
    saveState();
    renderPanel();
  });
  panel.querySelector("[data-tokens]").addEventListener("input", onTokenInput);
  panel.querySelector("[data-el-fields]").addEventListener("input", onElPropInput);
  panel.querySelector("[data-zoom]").addEventListener("input", (e) => setPageZoom(Number(e.target.value)));
  panel.querySelector("[data-zoom-in]").addEventListener("click", () => nudgeZoom(0.05));
  panel.querySelector("[data-zoom-out]").addEventListener("click", () => nudgeZoom(-0.05));

  document.addEventListener("click", onInspectClick, true);
}

function currentZoom() {
  const raw = state.vars["--ui-page-zoom"];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function setPageZoom(n) {
  const z = Math.min(1.5, Math.max(0.7, Math.round(n * 20) / 20));
  if (z === 1) delete state.vars["--ui-page-zoom"];
  else state.vars["--ui-page-zoom"] = String(z);
  saveState();
  const panel = document.getElementById("pp-designer");
  const slider = panel?.querySelector("[data-zoom]");
  const label = panel?.querySelector("[data-zoom-label]");
  if (slider) slider.value = String(z);
  if (label) label.textContent = `${Math.round(z * 100)}%`;
}

function nudgeZoom(delta) {
  setPageZoom(currentZoom() + delta);
}

function setOpen(open) {
  panelOpen = open;
  document.getElementById("pp-designer")?.classList.toggle("pp-hidden", !open);
  document.getElementById("pp-fab")?.classList.toggle("pp-hidden", open);
  document.body.classList.toggle("pp-design-open", open);
  if (!open) {
    inspectOn = false;
    document.body.classList.remove("pp-inspecting");
    document.getElementById("pp-designer")?.querySelector("[data-inspect]")?.classList.remove("on");
  } else {
    renderPanel();
  }
}

function toggleInspect() {
  inspectOn = !inspectOn;
  document.body.classList.toggle("pp-inspecting", inspectOn);
  document.getElementById("pp-designer")?.querySelector("[data-inspect]")?.classList.toggle("on", inspectOn);
}

function onInspectClick(e) {
  if (!panelOpen || !inspectOn) return;
  if (e.target.closest("#pp-designer, #pp-fab")) return;
  const hit = e.target.closest?.("[data-ui]");
  if (!hit) return;
  e.preventDefault();
  e.stopPropagation();
  selectName(hit.getAttribute("data-ui"));
  inspectOn = false;
  document.body.classList.remove("pp-inspecting");
  document.getElementById("pp-designer")?.querySelector("[data-inspect]")?.classList.remove("on");
}

function currentNames() {
  return [...new Set([...document.querySelectorAll("[data-ui]")].map((el) => el.getAttribute("data-ui")))];
}

function selectName(name) {
  selectedName = name || "";
  document.querySelectorAll(".pp-ui-selected").forEach((el) => el.classList.remove("pp-ui-selected"));
  if (selectedName) {
    document.querySelectorAll(`[data-ui="${selectedName}"]`).forEach((el) => el.classList.add("pp-ui-selected"));
  }
  renderPanel();
}

function onTokenInput(e) {
  const input = e.target.closest("[data-var]");
  if (!input) return;
  const key = input.getAttribute("data-var");
  const val = input.value;
  if (!val) delete state.vars[key];
  else state.vars[key] = val;
  saveState();
}

function onElPropInput(e) {
  const input = e.target.closest("[data-el-prop]");
  if (!input || !selectedName) return;
  const prop = input.getAttribute("data-el-prop");
  state.els[selectedName] ||= {};
  if (!input.value.trim()) delete state.els[selectedName][prop];
  else state.els[selectedName][prop] = input.value.trim();
  if (!Object.keys(state.els[selectedName]).length) delete state.els[selectedName];
  saveState();
}

function addCustomProp() {
  const panel = document.getElementById("pp-designer");
  const prop = panel.querySelector("[data-new-prop]").value.trim();
  const val = panel.querySelector("[data-new-val]").value.trim();
  if (!selectedName || !prop || !val) return;
  state.els[selectedName] ||= {};
  state.els[selectedName][prop] = val;
  panel.querySelector("[data-new-prop]").value = "";
  panel.querySelector("[data-new-val]").value = "";
  saveState();
  renderPanel();
}

function copyCss() {
  const tag = document.getElementById("pp-design-overrides");
  const varLines = Object.entries(state.vars || {})
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  const text = `${varLines ? `.app {\n${varLines}\n}\n` : ""}${tag?.textContent || ""}`.trim();
  navigator.clipboard?.writeText(text || "/* no overrides */").catch(() => {});
}

function renderPanel() {
  const panel = document.getElementById("pp-designer");
  if (!panel || panel.classList.contains("pp-hidden")) return;
  const names = currentNames();
  const pick = panel.querySelector("[data-pick]");
  const z = currentZoom();
  const slider = panel.querySelector("[data-zoom]");
  const label = panel.querySelector("[data-zoom-label]");
  if (slider) slider.value = String(z);
  if (label) label.textContent = `${Math.round(z * 100)}%`;

  pick.innerHTML = `<option value="">— choose component —</option>` + names.map((n) =>
    `<option value="${n}" ${n === selectedName ? "selected" : ""}>${n}</option>`,
  ).join("");

  const elFields = panel.querySelector("[data-el-fields]");
  if (!selectedName) {
    elFields.innerHTML = `<p class="pp-hint">Inspect or pick a component to edit any CSS property.</p>`;
  } else {
    const saved = state.els[selectedName] || {};
    const sample = document.querySelector(`[data-ui="${selectedName}"]`);
    const cs = sample ? getComputedStyle(sample) : null;
    const props = [...new Set([...COMMON_PROPS, ...Object.keys(saved)])];
    elFields.innerHTML = props.map((p) => {
      const val = saved[p] ?? "";
      const computed = cs ? cs.getPropertyValue(p) : "";
      return `<div class="pp-token">
        <label>${p}</label>
        <input data-el-prop="${p}" value="${escapeAttr(val)}" placeholder="${escapeAttr(computed.trim())}" />
      </div>`;
    }).join("");
  }

  const tokens = panel.querySelector("[data-tokens]");
  const app = document.querySelector(".app");
  const appCs = app ? getComputedStyle(app) : null;
  tokens.innerHTML = TOKEN_GROUPS.map(([title, vars]) => `
    <div class="pp-group">
      <h4>${title} tokens</h4>
      ${vars.map((v) => {
        const current = state.vars[v] || appCs?.getPropertyValue(v)?.trim() || "";
        const isColor = /color|purple|cyan|green|yellow|orange|red|ink|white|bg$/.test(v) && /^#|^rgb|^hsl/.test(current);
        return `<div class="pp-token">
          <input data-var="${v}" value="${escapeAttr(state.vars[v] || "")}" placeholder="${escapeAttr(current)}" />
          ${isColor ? `<input data-var="${v}" type="color" value="${toHex(current)}" />` : `<small>${escapeAttr(v)}</small>`}
          ${isColor ? `<small>${escapeAttr(v)}</small>` : ""}
        </div>`;
      }).join("")}
    </div>
  `).join("");
}

function toHex(v) {
  const m = String(v).trim().match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const h = m[1];
    if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    if (h.length >= 6) return `#${h.slice(0, 6)}`;
  }
  return "#5f259f";
}

function escapeAttr(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function tagUi(root = document.getElementById("app")) {
  if (!root) return;
  const pairs = [
    [".header", "header"],
    [".logo-img", "logo"],
    [".header-meta", "header-meta"],
    [".chip-strong", "score-chip"],
    [".chip:not(.chip-strong)", "player-chip"],
    [".brand-banner", "page-title"],
    [".brand-banner-title", "page-title-text"],
    [".brand-banner-sub", "page-subtitle"],
    [".wordfind-body", "wordfind-page"],
    [".wordfind-layout", "wordfind-layout"],
    [".puzzle-card", "puzzle-card"],
    [".timer-block", "timer"],
    [".find-target", "keyword-box"],
    [".find-target strong", "keyword-text"],
    [".grid-section", "grid-section"],
    [".grid", "crossword"],
    [".cell", "grid-cell"],
    [".grid-hint", "grid-hint"],
    [".puzzle-rules", "rules-below"],
    [".rules-card", "rules-sidebar"],
    [".quiz-recap", "you-answered"],
    [".quiz-card", "quiz-card"],
    [".quiz-question", "quiz-question"],
    [".quiz-options", "quiz-options"],
    [".quiz-option", "quiz-option"],
    [".form-card", "details-card"],
    [".field-group", "form-field"],
    [".field-input", "form-input"],
    [".rules-panel", "rules-page"],
    [".start-hero", "ready-hero"],
    [".end-score-card", "end-card"],
    [".btn-primary", "primary-button"],
    [".feedback", "feedback-toast"],
    [".screen", "screen"],
  ];
  for (const [sel, name] of pairs) {
    root.querySelectorAll(sel).forEach((el) => el.setAttribute("data-ui", name));
  }
  applyOverrides();
  if (selectedName) {
    document.querySelectorAll(`[data-ui="${selectedName}"]`).forEach((el) => el.classList.add("pp-ui-selected"));
  }
  if (panelOpen) renderPanel();
}

export function bootDesignStudio() {
  injectChrome();
  applyOverrides();
  const params = new URLSearchParams(location.search);
  if (params.get("design") === "1" || localStorage.getItem("phonepe_design_mode") === "1") {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes, viewport-fit=cover");
    setOpen(true);
  }
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
      e.preventDefault();
      setOpen(!panelOpen);
    }
  });
}
