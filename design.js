/* Visual UI editor — open with ?design=1 or ?debug=1 */
(() => {
  const STORE = "phonepe_design_css";
  const TEXT_STORE = "phonepe_design_text";
  const params = new URLSearchParams(location.search);
  const kiosk = params.get("kiosk") === "1";
  const allowed = !kiosk && (params.get("design") === "1" || params.get("debug") === "1");

  const SPACE = [
    ["padding", "All sides"],
    ["gap", "Gap inside"],
    ["row-gap", "Row gap"],
    ["column-gap", "Column gap"],
  ];
  const TYPE = [
    ["font-size", "Size"],
    ["font-weight", "Weight"],
    ["line-height", "Line height"],
    ["letter-spacing", "Letter space"],
    ["color", "Color"],
    ["text-align", "Align"],
  ];
  const MORE = [
    ["width", "Width"],
    ["height", "Height"],
    ["max-width", "Max W"],
    ["max-height", "Max H"],
    ["min-width", "Min W"],
    ["min-height", "Min H"],
    ["margin", "Margin outside"],
    ["margin-top", "Margin top"],
    ["margin-right", "Margin right"],
    ["margin-bottom", "Margin bottom"],
    ["margin-left", "Margin left"],
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
  let applyingText = false;
  const rules = loadJson(STORE);
  const texts = loadJson(TEXT_STORE);
  let styleEl;
  let ui;
  let overlay;
  let dragging = null;
  let press = null;

  function loadJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveRules() {
    localStorage.setItem(STORE, JSON.stringify(rules));
    applySheet();
  }

  function saveTexts() {
    localStorage.setItem(TEXT_STORE, JSON.stringify(texts));
    applyTexts();
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

  function applyTexts() {
    if (applyingText) return;
    applyingText = true;
    try {
      Object.entries(texts).forEach(([sel, value]) => {
        document.querySelectorAll(sel).forEach((el) => {
          if (!canEditText(el)) return;
          if (el.textContent !== value) el.textContent = value;
        });
      });
    } finally {
      applyingText = false;
    }
  }

  function canEditText(el) {
    if (!el) return false;
    if (el.matches?.("input,textarea,svg,img,canvas")) return false;
    if (el.closest?.(".grid,[data-grid]")) return false;
    return el.childElementCount === 0;
  }

  function cssSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return "";
    if (el.dataset?.ui) return `[data-ui="${el.dataset.ui}"]`;
    if (el.id && el.id !== "app") return `#${CSS.escape(el.id)}`;
    const skip = new Set(["sel", "foundA", "reveal", "flashBad"]);
    const cls = [...(el.classList || [])].filter((c) => !skip.has(c)).slice(0, 3);
    const parent = el.closest?.("[data-ui]");
    const prefix = parent && parent !== el ? `[data-ui="${parent.dataset.ui}"] ` : "";
    if (cls.length) return `${prefix}.${cls.map((c) => CSS.escape(c)).join(".")}`;
    const tag = el.tagName.toLowerCase();
    if (parent) {
      const same = [...parent.querySelectorAll(tag)];
      if (same.length > 1) return `${prefix}${tag}:nth-of-type(${same.indexOf(el) + 1})`;
      return `${prefix}${tag}`;
    }
    return tag;
  }

  function pickTarget(el) {
    if (!el || el.closest?.("#pp-design,#pp-design-overlay,#pp-design-fab")) return null;
    if (el.id === "app") return el.firstElementChild || el;
    const texty = el.closest?.(
      "h1,h2,h3,p,strong,em,label,span,li,button,a,.chip,.section-label,.find-target-label,.recap-q,.recap-a,.quiz-question,.opt-text,.opt-letter,.grid-hint,.lead,.step-title,.step-desc,.brand-banner-title,.brand-banner-sub,.timer-info .label,.timer-info .value,.quiz-topic,.quiz-progress,.quiz-hint,.form-title,.form-lead,.field-label,.player-recap",
    );
    if (texty && !texty.closest("#pp-design") && !texty.closest(".grid")) return texty;
    if (el.dataset?.ui) return el;
    return (
      el.closest?.(
        "[data-ui], .panel, .card, .btn, .find-target, .puzzle-rules, .quiz-recap, .timer-block, header, .screen",
      ) || el
    );
  }

  function currentDecls() {
    if (!selector) return {};
    if (!rules[selector]) rules[selector] = {};
    return rules[selector];
  }

  function setDecl(prop, value, silent) {
    if (!selector) return;
    const decls = currentDecls();
    if (!String(value || "").trim()) delete decls[prop];
    else decls[prop] = String(value).trim();
    if (!Object.keys(decls).length) delete rules[selector];
    saveRules();
    if (!silent) refreshFields();
    placeOverlay();
  }

  function computed(prop) {
    if (!selected) return "";
    return getComputedStyle(selected).getPropertyValue(prop).trim();
  }

  function fieldRow(k, label) {
    return `<label><span>${label}</span><span class="step"><button type="button" data-nudge="${k}" data-dir="-">−</button><input data-prop="${k}" spellcheck="false" /><button type="button" data-nudge="${k}" data-dir="+">+</button></span></label>`;
  }

  function buildUI() {
    ui = document.createElement("div");
    ui.id = "pp-design";
    ui.innerHTML = `
      <style>
        #pp-design{position:fixed;inset:auto 0 0 auto;width:min(380px,100vw);max-height:min(78vh,820px);
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
        #pp-design .props{flex:1;overflow:auto;padding:8px 10px 14px;display:grid;gap:8px}
        #pp-design .sec{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
          color:#f5c518;margin:6px 0 0}
        #pp-design label{display:grid;grid-template-columns:92px 1fr;gap:6px;align-items:center;color:#d8ccec}
        #pp-design label.stack{grid-template-columns:1fr}
        #pp-design input,#pp-design textarea{width:100%;background:#2a1b40;color:#fff;border:1px solid #4a3270;
          border-radius:8px;padding:7px 8px;font:12px ui-sans-serif,system-ui}
        #pp-design textarea{min-height:70px;resize:vertical}
        #pp-design .step{display:grid;grid-template-columns:32px 1fr 32px;gap:4px;align-items:center}
        #pp-design .step button{padding:0;min-height:32px;font-size:16px;line-height:1}
        #pp-design .box{display:grid;grid-template-columns:40px 1fr 40px;grid-template-rows:32px 1fr 32px;
          gap:4px;background:#2a1b40;border:1px solid #4a3270;border-radius:10px;padding:8px;align-items:center}
        #pp-design .box .mid{grid-column:2;grid-row:2;background:#3d2470;border-radius:8px;color:#cbb6f0;
          display:grid;place-items:center;min-height:36px;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
        #pp-design .box input{text-align:center;padding:4px}
        #pp-design .row{display:flex;gap:6px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.08)}
        #pp-design-overlay{position:fixed;pointer-events:none;z-index:999998;border:2px solid #2ec4ff;
          box-shadow:0 0 0 1px rgba(46,196,255,.35),inset 0 0 0 1px rgba(255,255,255,.25);border-radius:4px}
        #pp-design-overlay .h{position:absolute;width:14px;height:14px;background:#2ec4ff;border:2px solid #fff;
          border-radius:2px;pointer-events:auto;cursor:nwse-resize}
        #pp-design-overlay .h.n{top:-8px;left:50%;margin-left:-7px;cursor:ns-resize}
        #pp-design-overlay .h.s{bottom:-8px;left:50%;margin-left:-7px;cursor:ns-resize}
        #pp-design-overlay .h.e{right:-8px;top:50%;margin-top:-7px;cursor:ew-resize}
        #pp-design-overlay .h.w{left:-8px;top:50%;margin-top:-7px;cursor:ew-resize}
        #pp-design-overlay .h.ne{top:-8px;right:-8px;cursor:nesw-resize}
        #pp-design-overlay .h.nw{top:-8px;left:-8px;cursor:nwse-resize}
        #pp-design-overlay .h.se{bottom:-8px;right:-8px;cursor:nwse-resize}
        #pp-design-overlay .h.sw{bottom:-8px;left:-8px;cursor:nesw-resize}
        #pp-design-fab{position:fixed;right:12px;bottom:12px;z-index:999997;background:#5f259f;color:#fff;
          border:0;border-radius:999px;padding:10px 14px;font:800 12px ui-sans-serif,system-ui;
          box-shadow:0 8px 24px rgba(20,8,40,.4);cursor:pointer}
        [data-design-edit="1"]{outline:2px dashed #f5c518;outline-offset:2px;min-width:1ch}
        @media (max-width:720px){
          #pp-design{width:100vw;max-height:52vh;border-radius:16px 16px 0 0;left:0;right:0;bottom:0}
        }
      </style>
      <div class="bar">
        <b>Design</b>
        <button data-act="mode">Edit</button>
        <button data-act="copy">Copy</button>
        <button data-act="reset">Reset</button>
        <button data-act="close">Close</button>
      </div>
      <div class="sel-name" data-sel>Click any component</div>
      <div class="hint">Click the words to edit text. Click the box to change padding inside. Drag only after moving a little.</div>
      <div class="props" data-props></div>
      <div class="row">
        <button data-act="parent">Select parent box</button>
        <button data-act="clear">Clear this</button>
      </div>
    `;
    document.body.appendChild(ui);

    overlay = document.createElement("div");
    overlay.id = "pp-design-overlay";
    overlay.innerHTML = "n,s,e,w,ne,nw,se,sw"
      .split(",")
      .map((d) => `<div class="h ${d}" data-h="${d}"></div>`)
      .join("");
    document.body.appendChild(overlay);

    const propsBox = ui.querySelector("[data-props]");
    propsBox.innerHTML = `
      <div class="sec">Text inside</div>
      <label class="stack"><span>Words in this box</span>
        <textarea data-text placeholder="Click text on the page, then type here or double-tap the words"></textarea>
      </label>
      <div class="sec">Spacing inside the box</div>
      <div class="box" data-padbox>
        <input data-prop="padding-top" data-slot="t" placeholder="T" title="Padding top" />
        <input data-prop="padding-left" data-slot="l" placeholder="L" title="Padding left" />
        <div class="mid">Inside</div>
        <input data-prop="padding-right" data-slot="r" placeholder="R" title="Padding right" />
        <input data-prop="padding-bottom" data-slot="b" placeholder="B" title="Padding bottom" />
      </div>
      ${SPACE.map(([k, label]) => fieldRow(k, label)).join("")}
      <div class="sec">Text style</div>
      ${TYPE.map(([k, label]) => fieldRow(k, label)).join("")}
      <div class="sec">More</div>
      ${MORE.map(([k, label]) => fieldRow(k, label)).join("")}
      <label class="stack"><span>Custom CSS</span><textarea data-custom placeholder="e.g. letter-spacing: .02em"></textarea></label>
    `;
    const padBox = propsBox.querySelector("[data-padbox]");
    padBox.querySelector('[data-slot="t"]').style.gridColumn = "2";
    padBox.querySelector('[data-slot="t"]').style.gridRow = "1";
    padBox.querySelector('[data-slot="l"]').style.gridColumn = "1";
    padBox.querySelector('[data-slot="l"]').style.gridRow = "2";
    padBox.querySelector('[data-slot="r"]').style.gridColumn = "3";
    padBox.querySelector('[data-slot="r"]').style.gridRow = "2";
    padBox.querySelector('[data-slot="b"]').style.gridColumn = "2";
    padBox.querySelector('[data-slot="b"]').style.gridRow = "3";

    ui.addEventListener("click", (e) => {
      const nudge = e.target.closest("[data-nudge]");
      if (nudge) {
        e.preventDefault();
        bump(nudge.dataset.nudge, nudge.dataset.dir === "+" ? 2 : -2);
        return;
      }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "close") setOn(false);
      if (act === "mode") {
        edit = !edit;
        ui.querySelector('[data-act="mode"]').textContent = edit ? "Edit" : "Play";
      }
      if (act === "copy") copyAll();
      if (act === "reset") {
        Object.keys(rules).forEach((k) => delete rules[k]);
        Object.keys(texts).forEach((k) => delete texts[k]);
        saveRules();
        saveTexts();
        selected = null;
        selector = "";
        refreshFields();
        placeOverlay();
      }
      if (act === "parent" && selected?.parentElement) selectEl(selected.parentElement);
      if (act === "clear" && selector) {
        delete rules[selector];
        delete texts[selector];
        saveRules();
        saveTexts();
        refreshFields();
        placeOverlay();
      }
    });

    propsBox.addEventListener("input", (e) => {
      const prop = e.target.dataset.prop;
      if (prop) setDecl(prop, e.target.value, true);
      if (e.target.dataset.text !== undefined) writeText(e.target.value);
    });
    propsBox.addEventListener("change", (e) => {
      if (!e.target.dataset.custom || !selector) return;
      e.target.value.split(";").forEach((chunk) => {
        const i = chunk.indexOf(":");
        if (i < 1) return;
        setDecl(chunk.slice(0, i).trim(), chunk.slice(i + 1).trim(), true);
      });
      refreshFields();
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

  function bump(prop, delta) {
    if (!selector) return;
    const raw = currentDecls()[prop] || computed(prop) || "0px";
    const num = parseFloat(raw);
    if (Number.isNaN(num)) return;
    const unit = String(raw).replace(/^[-\d.]+/, "") || "px";
    setDecl(prop, `${Math.max(0, Math.round(num + delta))}${unit}`);
  }

  function writeText(value) {
    if (!selector || !selected || !canEditText(selected)) return;
    selected.textContent = value;
    if (!String(value || "").trim()) delete texts[selector];
    else texts[selector] = value;
    saveTexts();
    placeOverlay();
  }

  function refreshFields() {
    if (!ui) return;
    ui.querySelector("[data-sel]").textContent = selector || "Click any component";
    const decls = selector ? rules[selector] || {} : {};
    ui.querySelectorAll("[data-prop]").forEach((input) => {
      const k = input.dataset.prop;
      input.value = decls[k] || "";
      input.placeholder = computed(k) || k;
    });
    const textArea = ui.querySelector("[data-text]");
    if (textArea) {
      const editable = !!(selected && canEditText(selected));
      textArea.disabled = !editable;
      textArea.value = editable ? (texts[selector] ?? selected.textContent ?? "") : "";
      textArea.placeholder = editable
        ? "Type to change the words inside"
        : "Click the actual words (or Select parent box)";
    }
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
    overlay.style.width = `${Math.max(8, r.width)}px`;
    overlay.style.height = `${Math.max(8, r.height)}px`;
  }

  function selectEl(el) {
    stopInlineEdit();
    selected = pickTarget(el);
    selector = cssSelector(selected);
    refreshFields();
    placeOverlay();
  }

  function stopInlineEdit() {
    document.querySelectorAll('[data-design-edit="1"]').forEach((el) => {
      el.removeAttribute("contenteditable");
      el.removeAttribute("data-design-edit");
    });
  }

  function startInlineEdit(el) {
    if (!canEditText(el)) return;
    stopInlineEdit();
    el.setAttribute("contenteditable", "true");
    el.setAttribute("data-design-edit", "1");
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const finish = () => {
      el.removeEventListener("blur", finish);
      writeText(el.textContent || "");
      refreshFields();
      stopInlineEdit();
    };
    el.addEventListener("blur", finish);
  }

  function onPointerDown(e) {
    if (!on || !edit) return;
    if (e.target.closest?.("#pp-design,#pp-design-overlay,#pp-design-fab")) return;
    if (e.target.closest?.("[data-design-edit='1']")) return;
    e.preventDefault();
    e.stopPropagation();
    selectEl(e.target);
    if (!selected) return;
    press = {
      x: e.clientX,
      y: e.clientY,
      left: parseFloat(currentDecls().left) || 0,
      top: parseFloat(currentDecls().top) || 0,
      at: Date.now(),
    };
  }

  function onPointerMove(e) {
    if (dragging && selected) {
      const dx = e.clientX - dragging.x;
      const dy = e.clientY - dragging.y;
      if (dragging.type === "move") {
        if (!currentDecls().position) setDecl("position", "relative", true);
        setDecl("left", `${Math.round(dragging.left + dx)}px`, true);
        setDecl("top", `${Math.round(dragging.top + dy)}px`, true);
      } else {
        const h = dragging.h;
        let w = dragging.w;
        let ht = dragging.hgt;
        if (h.includes("e")) w = Math.max(24, dragging.w + dx);
        if (h.includes("w")) w = Math.max(24, dragging.w - dx);
        if (h.includes("s")) ht = Math.max(24, dragging.hgt + dy);
        if (h.includes("n")) ht = Math.max(24, dragging.hgt - dy);
        setDecl("width", `${Math.round(w)}px`, true);
        setDecl("height", `${Math.round(ht)}px`, true);
      }
      placeOverlay();
      return;
    }
    if (!press || !selected) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.hypot(dx, dy) < 10) return;
    dragging = { type: "move", x: press.x, y: press.y, left: press.left, top: press.top };
    press = null;
  }

  function onPointerUp(e) {
    const wasPress = press;
    press = null;
    dragging = null;
    if (!wasPress || !selected) return;
    if (Date.now() - wasPress.at < 500 && Math.hypot(e.clientX - wasPress.x, e.clientY - wasPress.y) < 10) {
      if (canEditText(selected) && e.detail >= 2) startInlineEdit(selected);
    }
  }

  function copyAll() {
    const css = styleEl?.textContent || "";
    const textJson = JSON.stringify(texts, null, 2);
    const blob = `/* CSS */\n${css}\n\n/* TEXT */\n${textJson}`;
    navigator.clipboard?.writeText(blob).then(() => {
      ui.querySelector("[data-sel]").textContent = "Copied CSS + text — send this to lock it in";
    });
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
      stopInlineEdit();
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
  applyTexts();
  if (!allowed) return;

  const start = () => {
    ensureFab();
    setOn(true);
    const app = document.getElementById("app");
    if (app) {
      new MutationObserver(() => {
        if (applyingText) return;
        applyTexts();
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
