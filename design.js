/* Visual UI editor — open with ?design=1 or Ctrl+Alt+D */
(() => {
  const STORE = "phonepe_design_css";
  const params = new URLSearchParams(location.search);
  const kiosk = params.get("kiosk") === "1";
  const allowed = !kiosk && (params.get("design") === "1" || params.get("debug") === "1");

  const PROPS = [
    ["width", "Width"],
    ["height", "Height"],
    ["max-width", "Max W"],
    ["max-height", "Max H"],
    ["min-width", "Min W"],
    ["min-height", "Min H"],
    ["padding", "Padding"],
    ["margin", "Margin"],
    ["gap", "Gap"],
    ["font-size", "Font size"],
    ["font-weight", "Weight"],
    ["line-height", "Line ht"],
    ["letter-spacing", "Tracking"],
    ["color", "Color"],
    ["text-align", "Align"],
    ["background", "Background"],
    ["border", "Border"],
    ["border-radius", "Radius"],
    ["box-shadow", "Shadow"],
    ["opacity", "Opacity"],
    ["display", "Display"],
    ["flex-direction", "Flex dir"],
    ["justify-content", "Justify"],
    ["align-items", "Align items"],
    ["overflow", "Overflow"],
    ["position", "Position"],
    ["top", "Top"],
    ["left", "Left"],
    ["right", "Right"],
    ["bottom", "Bottom"],
    ["transform", "Transform"],
    ["z-index", "Z-index"],
  ];

  let on = false;
  let edit = true;
  let selected = null;
  let selector = "";
  const rules = loadRules();
  let styleEl;
  let ui;
  let overlay;
  let dragging = null;

  function loadRules() {
    try {
      return JSON.parse(localStorage.getItem(STORE) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveRules() {
    localStorage.setItem(STORE, JSON.stringify(rules));
    applySheet();
  }

  function applySheet() {
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "phonepe-design-overrides";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = Object.entries(rules)
      .map(([sel, decls]) => {
        const body = Object.entries(decls)
          .filter(([, v]) => String(v || "").trim())
          .map(([k, v]) => `${k}: ${v} !important`)
          .join("; ");
        return body ? `${sel}{${body}}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  function cssSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return "";
    if (el.dataset?.ui) return `[data-ui="${el.dataset.ui}"]`;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const skip = new Set(["sel", "foundA", "reveal", "flashBad"]);
    const cls = [...(el.classList || [])].filter((c) => !skip.has(c)).slice(0, 3);
    const parent = el.closest?.("[data-ui]");
    const prefix = parent && parent !== el ? `[data-ui="${parent.dataset.ui}"] ` : "";
    if (cls.length) return `${prefix}.${cls.map((c) => CSS.escape(c)).join(".")}`;
    const tag = el.tagName.toLowerCase();
    if (parent) return `${prefix}${tag}`;
    return tag;
  }

  function pickTarget(el) {
    if (!el || el.closest?.("#pp-design")) return null;
    if (el.id === "app") return el.firstElementChild || el;
    return el.closest?.("[data-ui], .panel, .card, .btn, .chip, .cell, .grid, header, .screen") || el;
  }

  function currentDecls() {
    if (!selector) return {};
    if (!rules[selector]) rules[selector] = {};
    return rules[selector];
  }

  function setDecl(prop, value) {
    if (!selector) return;
    const decls = currentDecls();
    if (!String(value || "").trim()) delete decls[prop];
    else decls[prop] = String(value).trim();
    if (!Object.keys(decls).length) delete rules[selector];
    saveRules();
    refreshFields();
    placeOverlay();
  }

  function computed(prop) {
    if (!selected) return "";
    return getComputedStyle(selected).getPropertyValue(prop).trim();
  }

  function buildUI() {
    ui = document.createElement("div");
    ui.id = "pp-design";
    ui.innerHTML = `
      <style>
        #pp-design{position:fixed;inset:auto 0 0 auto;width:min(360px,100vw);max-height:min(72vh,720px);
          z-index:999999;display:flex;flex-direction:column;background:#1b1228;color:#f4eefe;
          font:12px/1.4 ui-sans-serif,system-ui,sans-serif;border:1px solid rgba(255,255,255,.16);
          border-radius:16px 0 0 0;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden}
        #pp-design *{box-sizing:border-box}
        #pp-design .bar{display:flex;gap:6px;align-items:center;padding:8px 10px;background:#120a1c;
          border-bottom:1px solid rgba(255,255,255,.1);flex-wrap:wrap}
        #pp-design .bar b{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#cbb6f0;margin-right:auto}
        #pp-design button,#pp-design select{background:#3d2470;color:#fff;border:0;border-radius:8px;
          padding:6px 8px;font:600 11px ui-sans-serif,system-ui;cursor:pointer}
        #pp-design button:hover{background:#5f259f}
        #pp-design .sel-name{padding:6px 10px;font-family:ui-monospace,Consolas,monospace;font-size:11px;
          color:#9be7ff;background:#0f0818;border-bottom:1px solid rgba(255,255,255,.08);word-break:break-all}
        #pp-design .hint{padding:6px 10px;color:#b7a8cc;font-size:11px}
        #pp-design .props{flex:1;overflow:auto;padding:8px 10px 12px;display:grid;gap:6px}
        #pp-design label{display:grid;grid-template-columns:88px 1fr;gap:6px;align-items:center;color:#d8ccec}
        #pp-design input,#pp-design textarea{width:100%;background:#2a1b40;color:#fff;border:1px solid #4a3270;
          border-radius:8px;padding:6px 8px;font:12px ui-monospace,Consolas,monospace}
        #pp-design textarea{min-height:72px;resize:vertical}
        #pp-design .row{display:flex;gap:6px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.08)}
        #pp-design-overlay{position:fixed;pointer-events:none;z-index:999998;border:2px solid #2ec4ff;
          box-shadow:0 0 0 1px rgba(46,196,255,.35),inset 0 0 0 1px rgba(255,255,255,.25);border-radius:4px}
        #pp-design-overlay .h{position:absolute;width:12px;height:12px;background:#2ec4ff;border:2px solid #fff;
          border-radius:2px;pointer-events:auto;cursor:nwse-resize}
        #pp-design-overlay .h.n{top:-7px;left:50%;margin-left:-6px;cursor:ns-resize}
        #pp-design-overlay .h.s{bottom:-7px;left:50%;margin-left:-6px;cursor:ns-resize}
        #pp-design-overlay .h.e{right:-7px;top:50%;margin-top:-6px;cursor:ew-resize}
        #pp-design-overlay .h.w{left:-7px;top:50%;margin-top:-6px;cursor:ew-resize}
        #pp-design-overlay .h.ne{top:-7px;right:-7px;cursor:nesw-resize}
        #pp-design-overlay .h.nw{top:-7px;left:-7px;cursor:nwse-resize}
        #pp-design-overlay .h.se{bottom:-7px;right:-7px;cursor:nwse-resize}
        #pp-design-overlay .h.sw{bottom:-7px;left:-7px;cursor:nesw-resize}
        #pp-design-fab{position:fixed;right:12px;bottom:12px;z-index:999997;background:#5f259f;color:#fff;
          border:0;border-radius:999px;padding:10px 14px;font:800 12px ui-sans-serif,system-ui;
          box-shadow:0 8px 24px rgba(20,8,40,.4);cursor:pointer}
        @media (max-width:720px){
          #pp-design{width:100vw;max-height:48vh;border-radius:16px 16px 0 0;left:0;right:0;bottom:0}
        }
      </style>
      <div class="bar">
        <b>Design</b>
        <button data-act="mode">Edit</button>
        <button data-act="copy">Copy CSS</button>
        <button data-act="reset">Reset</button>
        <button data-act="close">Close</button>
      </div>
      <div class="sel-name" data-sel>Click any component</div>
      <div class="hint">Drag to move · corner handles resize · change any property. Saved only on this browser.</div>
      <div class="props" data-props></div>
      <div class="row">
        <button data-act="parent">Select parent</button>
        <button data-act="clear">Clear this</button>
      </div>
    `;
    document.body.appendChild(ui);

    overlay = document.createElement("div");
    overlay.id = "pp-design-overlay";
    overlay.innerHTML = "n,s,e,w,ne,nw,se,sw".split(",").map((d) => `<div class="h ${d}" data-h="${d}"></div>`).join("");
    document.body.appendChild(overlay);

    const propsBox = ui.querySelector("[data-props]");
    propsBox.innerHTML =
      PROPS.map(
        ([k, label]) =>
          `<label><span>${label}</span><input data-prop="${k}" spellcheck="false" /></label>`,
      ).join("") +
      `<label style="grid-template-columns:1fr"><span>Custom CSS</span><textarea data-custom placeholder="e.g. letter-spacing: .02em"></textarea></label>`;

    ui.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "close") setOn(false);
      if (act === "mode") {
        edit = !edit;
        ui.querySelector('[data-act="mode"]').textContent = edit ? "Edit" : "Play";
      }
      if (act === "copy") {
        const css = styleEl?.textContent || "";
        navigator.clipboard?.writeText(css).then(() => {
          ui.querySelector("[data-sel]").textContent = "CSS copied — paste it to apply in code";
        });
      }
      if (act === "reset") {
        Object.keys(rules).forEach((k) => delete rules[k]);
        saveRules();
        selected = null;
        selector = "";
        refreshFields();
        placeOverlay();
      }
      if (act === "parent" && selected?.parentElement) selectEl(selected.parentElement);
      if (act === "clear" && selector) {
        delete rules[selector];
        saveRules();
        refreshFields();
        placeOverlay();
      }
    });

    propsBox.addEventListener("input", (e) => {
      const prop = e.target.dataset.prop;
      if (prop) setDecl(prop, e.target.value);
    });
    propsBox.addEventListener("change", (e) => {
      if (!e.target.dataset.custom || !selector) return;
      e.target.value.split(";").forEach((chunk) => {
        const i = chunk.indexOf(":");
        if (i < 1) return;
        setDecl(chunk.slice(0, i).trim(), chunk.slice(i + 1).trim());
      });
    });

    overlay.addEventListener("pointerdown", (e) => {
      const h = e.target.dataset.h;
      if (!h || !selected) return;
      e.preventDefault();
      e.stopPropagation();
      const r = selected.getBoundingClientRect();
      dragging = { type: "resize", h, x: e.clientX, y: e.clientY, w: r.width, hgt: r.height };
      overlay.setPointerCapture?.(e.pointerId);
    });
  }

  function refreshFields() {
    if (!ui) return;
    ui.querySelector("[data-sel]").textContent = selector || "Click any component";
    const decls = selector ? rules[selector] || {} : {};
    ui.querySelectorAll("[data-prop]").forEach((input) => {
      const k = input.dataset.prop;
      input.value = decls[k] || "";
      input.placeholder = computed(k);
    });
    const custom = ui.querySelector("[data-custom]");
    if (custom) custom.value = "";
  }

  function placeOverlay() {
    if (!overlay) return;
    if (!on || !selected || !document.contains(selected)) {
      overlay.style.display = "none";
      return;
    }
    const r = selected.getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
  }

  function selectEl(el) {
    selected = pickTarget(el);
    selector = cssSelector(selected);
    refreshFields();
    placeOverlay();
  }

  function onPointerDown(e) {
    if (!on || !edit) return;
    if (e.target.closest?.("#pp-design")) return;
    if (e.target.closest?.("#pp-design-overlay")) return;
    e.preventDefault();
    e.stopPropagation();
    selectEl(e.target);
    if (!selected) return;
    dragging = {
      type: "move",
      x: e.clientX,
      y: e.clientY,
      left: parseFloat(currentDecls().left) || 0,
      top: parseFloat(currentDecls().top) || 0,
    };
  }

  function onPointerMove(e) {
    if (!dragging || !selected) return;
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    if (dragging.type === "move") {
      if (!currentDecls().position) setDecl("position", "relative");
      setDecl("left", `${Math.round(dragging.left + dx)}px`);
      setDecl("top", `${Math.round(dragging.top + dy)}px`);
    } else {
      const h = dragging.h;
      let w = dragging.w;
      let ht = dragging.hgt;
      if (h.includes("e")) w = Math.max(24, dragging.w + dx);
      if (h.includes("w")) w = Math.max(24, dragging.w - dx);
      if (h.includes("s")) ht = Math.max(24, dragging.hgt + dy);
      if (h.includes("n")) ht = Math.max(24, dragging.hgt - dy);
      setDecl("width", `${Math.round(w)}px`);
      setDecl("height", `${Math.round(ht)}px`);
    }
    placeOverlay();
  }

  function onPointerUp() {
    dragging = null;
  }

  function setOn(next) {
    on = next;
    if (on) {
      if (!ui) buildUI();
      ui.style.display = "flex";
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerup", onPointerUp, true);
      window.addEventListener("resize", placeOverlay);
      placeOverlay();
    } else {
      if (ui) ui.style.display = "none";
      if (overlay) overlay.style.display = "none";
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("resize", placeOverlay);
      selected = null;
    }
  }

  function ensureFab() {
    if (document.getElementById("pp-design-fab")) return;
    const fab = document.createElement("button");
    fab.id = "pp-design-fab";
    fab.type = "button";
    fab.textContent = "Design";
    fab.addEventListener("click", () => setOn(!on));
    document.body.appendChild(fab);
  }

  applySheet();
  if (!allowed) return;

  const start = () => {
    ensureFab();
    setOn(true);
    const app = document.getElementById("app");
    if (app) {
      new MutationObserver(() => {
        if (selected && !document.contains(selected) && selector) {
          selected = document.querySelector(selector);
        }
        placeOverlay();
      }).observe(app, { childList: true, subtree: true });
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.altKey && e.code === "KeyD") {
      e.preventDefault();
      setOn(!on);
    }
    if (on && e.key === "Escape") setOn(false);
  });
})();
