const $app = document.getElementById("app");

// ---- Kiosk hardening (only when ?kiosk=1) ----
function shouldHardenKiosk() {
  const params = new URLSearchParams(location.search);
  if (params.get("kiosk") === "1") return true;
  if (params.get("debug") === "1") return false;
  return localStorage.getItem("phonepe_kiosk_mode") === "1";
}

function hardenKiosk() {
  if (!shouldHardenKiosk()) return;

  window.addEventListener("contextmenu", (e) => e.preventDefault(), { passive: false });
  window.addEventListener("selectstart", (e) => {
    if (e.target.closest("input, textarea")) return;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false });

  try {
    history.pushState(null, "", location.href);
    window.addEventListener("popstate", () => history.pushState(null, "", location.href));
  } catch {}

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 280) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then((reg) => reg.update?.().catch(() => {}))
      .catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      try {
        location.reload();
      } catch {}
    });
  }
}

// ---- Config ----
async function loadConfig() {
  const res = await fetch("./questions.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load questions.json");
  const data = await res.json();
  validateConfig(data);
  return data;
}

function validateConfig(data) {
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("questions.json must include at least one question");
  }
  data.questions.forEach((q, i) => {
    if (!q.clue || !Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question ${i + 1} needs clue and at least 2 options`);
    }
    if (q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      throw new Error(`Question ${i + 1} has invalid correctIndex`);
    }
    const word = getCategoryWord(q);
    if (!word || word.length < 2) {
      throw new Error(`Question ${i + 1} categoryWord is too short after normalization`);
    }
    if (word.length > (data.grid?.maxSize ?? 24)) {
      throw new Error(`Question ${i + 1} category "${word}" exceeds grid maxSize`);
    }
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Puzzle target = category / keyword of the question (Game Rules #2). */
function getCategoryWord(q) {
  if (q.categoryWord) return normalizeAnswer(q.categoryWord);
  if (q.answer) return normalizeAnswer(q.answer);
  return normalizeAnswer(q.options[q.correctIndex]);
}

function getCategoryLabel(q) {
  if (q.categoryWord) return String(q.categoryWord).trim();
  return getCategoryWord(q);
}

function getAnswerLabel(q) {
  return q.options[q.correctIndex];
}

function normalizeAnswer(s) {
  return String(s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** End-screen message per Game Rules point matrix (0 / 25 / 50 / 75 / 100). */
function getScoreFeedback(total) {
  const table = cfg.scoreFeedback ?? {
    0: "Oops!",
    25: "Not bad!",
    50: "Good Job!",
    75: "Great job!",
    100: "Flawless, perfect score!",
  };
  return table[total] ?? table[String(total)] ?? "Thanks for playing!";
}

function sectionPoints() {
  return cfg.sectionPoints ?? cfg.quizPoints ?? 25;
}

function isFinalMcqRound() {
  return state.questionIndex >= state.roundQuestions.length - 1;
}

/** Excel A/B plus question-specific third wrong option (optionC). */
function getQuizOptions(q) {
  const a = q.options?.[0] ?? "";
  const b = q.options?.[1] ?? "";
  const c = q.optionC ?? q.options?.[2] ?? "Proceed without checking the policy.";
  return [a, b, c];
}

/** Shuffle A/B/C so the correct answer can appear in any position. */
function buildShuffledQuizOptions(q, seed) {
  const items = [
    { text: q.options?.[0] ?? "", isCorrect: q.correctIndex === 0 },
    { text: q.options?.[1] ?? "", isCorrect: q.correctIndex === 1 },
    {
      text: q.optionC ?? q.options?.[2] ?? "Proceed without checking the policy.",
      isCorrect: false,
    },
  ];
  shuffleInPlace(items, seededRandom(seed));
  return {
    options: items.map((x) => x.text),
    correctIndex: items.findIndex((x) => x.isCorrect),
  };
}

function ensureShuffledQuiz() {
  const qIndex = state.questionIndex;
  if (!state.shuffledQuiz || state.shuffledQuiz.forQuestion !== qIndex) {
    const seed = state.puzzleVariant * 5003 + qIndex * 89 + 17;
    const built = buildShuffledQuizOptions(activeQuestion(), seed);
    state.shuffledQuiz = { forQuestion: qIndex, ...built };
  }
  return state.shuffledQuiz;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `count` random unique questions from the bank for this player. */
function pickRoundQuestions(all, count, seed) {
  const rng = seededRandom(seed);
  const idxs = all.map((_, i) => i);
  shuffleInPlace(idxs, rng);
  const n = Math.min(count, idxs.length);
  return idxs.slice(0, n).map((i) => all[i]);
}

/** All keywords for this player's 10 questions — target first, others jumbled. */
function buildKeywordListForPuzzle(questions, targetWord, seed) {
  const seen = new Set();
  const unique = [];
  for (const q of questions) {
    const w = getCategoryWord(q);
    if (!w || seen.has(w)) continue;
    seen.add(w);
    unique.push(w);
  }
  const others = unique.filter((w) => w !== targetWord);
  shuffleInPlace(others, seededRandom(seed));
  return targetWord ? [targetWord, ...others] : others;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Puzzle variant rotation (10 variants, no repeat for consecutive players) ----
function getNextVariantIndex(maxVariants) {
  const key = "phonepe_puzzle_variant";
  try {
    let idx = parseInt(sessionStorage.getItem(key) || "0", 10);
    if (!Number.isFinite(idx) || idx < 0) idx = 0;
    sessionStorage.setItem(key, String((idx + 1) % maxVariants));
    return idx;
  } catch {
    return Math.floor(Math.random() * maxVariants);
  }
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ---- Audio ----
let audioCtx;
function beep(type) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = type === "good" ? 740 : 180;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    const now = audioCtx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(type === "good" ? 0.22 : 0.12, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (type === "good" ? 0.12 : 0.18));
    o.stop(now + (type === "good" ? 0.14 : 0.22));
  } catch {}
}

// ---- Word search generator ----
// Horizontal L→R and vertical top→bottom only (no diagonals, no reverse).
const DIRS = [
  { dr: 0, dc: 1 }, // left → right
  { dr: 1, dc: 0 }, // top → bottom
];

function randInt(n, rng = Math.random) {
  return Math.floor(rng() * n);
}
function choice(arr, rng = Math.random) {
  return arr[randInt(arr.length, rng)];
}
function randomLetter(rng = Math.random) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letters[randInt(letters.length, rng)];
}

function computeGridSize(words, minSize, maxSize) {
  const longest = Math.max(...words.map((a) => a.length));
  // Grow with word count so ~10 keywords still fit (H/V only).
  const byCount = Math.ceil(Math.sqrt(words.reduce((s, w) => s + w.length, 0) * 1.6));
  const base = Math.max(minSize, longest + 2, byCount);
  return Math.min(maxSize, Math.max(base, minSize));
}

function tryPlaceWord(grid, word, wordIndex, rng) {
  const size = grid.length;
  const dir = choice(DIRS, rng);
  const letters = word.split("");
  const dr = dir.dr;
  const dc = dir.dc;
  const rMin = 0;
  const rMax = dr === 1 ? size - letters.length : size - 1;
  const cMin = 0;
  const cMax = dc === 1 ? size - letters.length : size - 1;
  if (rMax < rMin || cMax < cMin) return null;

  const startR = rMin + randInt(rMax - rMin + 1, rng);
  const startC = cMin + randInt(cMax - cMin + 1, rng);
  const cells = [];

  for (let i = 0; i < letters.length; i++) {
    const r = startR + dr * i;
    const c = startC + dc * i;
    const cur = grid[r][c];
    if (cur.letter && cur.letter !== letters[i]) return null;
    cells.push({ r, c });
  }

  for (let i = 0; i < letters.length; i++) {
    const { r, c } = cells[i];
    grid[r][c].letter = letters[i];
    grid[r][c].belongsTo.add(wordIndex);
  }
  return { dir, reversed: false, start: { r: startR, c: startC }, cells };
}

function generateWordSearch(words, cfgGrid, seed) {
  const normalized = words.map(normalizeAnswer).filter(Boolean);
  const minSize = cfgGrid.minSize ?? 14;
  const maxSize = cfgGrid.maxSize ?? 24;
  let size = computeGridSize(normalized, minSize, maxSize);
  const rng = seededRandom(seed);

  for (let grow = 0; grow < 6; grow++) {
    const trySize = Math.min(maxSize, size + grow);
    for (let attempt = 0; attempt < 50; attempt++) {
      const grid = Array.from({ length: trySize }, () =>
        Array.from({ length: trySize }, () => ({ letter: "", belongsTo: new Set() })),
      );
      const placements = [];
      let ok = true;

      // Longer words first — easier packing
      const order = normalized
        .map((w, i) => ({ w, i }))
        .sort((a, b) => b.w.length - a.w.length);

      const placedByOrig = new Array(normalized.length);
      for (const { w, i } of order) {
        let placed = null;
        for (let tries = 0; tries < 400; tries++) {
          placed = tryPlaceWord(grid, w, i, rng);
          if (placed) break;
        }
        if (!placed) {
          ok = false;
          break;
        }
        placedByOrig[i] = placed;
      }
      if (!ok) continue;

      for (let r = 0; r < trySize; r++) {
        for (let c = 0; c < trySize; c++) {
          if (!grid[r][c].letter) grid[r][c].letter = randomLetter(rng);
        }
      }
      return {
        size: trySize,
        grid,
        words: normalized,
        placements: placedByOrig,
        targetIndex: 0,
      };
    }
  }
  throw new Error("Failed to generate grid");
}

// ---- State machine ----
const Screen = {
  ENTER_DETAILS: "enter_details",
  RULES: "rules",
  START: "start",
  QUIZ: "quiz",
  WORDFIND: "wordfind",
  END: "end",
};

let cfg;
let gridAbort = null;
let state = {
  screen: Screen.ENTER_DETAILS,
  playerName: "",
  employeeId: "",
  formError: null,
  questionIndex: 0,
  puzzleVariant: 0,
  roundQuestions: [],
  totalScore: 0,
  roundScores: [],
  currentRound: null,
  gridData: null,
  feedback: null,
  idleResetTimer: null,
  wordFindTimer: null,
  remainingMs: 20000,
  wordFindStartedAt: 0,
  selecting: false,
  selStart: null,
  selEnd: null,
  locked: false,
  quizReveal: null,
  shuffledQuiz: null,
  revealTarget: false,
};

function playerChip() {
  if (!state.playerName) return "";
  const id = state.employeeId ? ` · ${escapeHtml(state.employeeId)}` : "";
  return `<span class="chip">${escapeHtml(state.playerName)}${id}</span>`;
}

function validateName(value) {
  const v = String(value || "").trim();
  if (v.length < 2) return "Please enter your name (at least 2 characters).";
  if (v.length > 60) return "Name is too long.";
  return null;
}

function validateEmployeeId(value) {
  const v = String(value || "").trim();
  if (v.length < 2) return "Please enter your Employee ID (at least 2 characters).";
  if (v.length > 30) return "Employee ID is too long.";
  if (!/^[A-Za-z0-9\-_.]+$/.test(v)) return "Employee ID can only use letters, numbers, - _ .";
  return null;
}

function questionLabel(index) {
  return `Question ${index + 1}`;
}

function wordFindLabel(index) {
  return index === 0 ? "Find the word" : `Find the word · Round ${index + 1}`;
}

function activeQuestion() {
  return state.roundQuestions[state.questionIndex];
}

function goEnterDetails() {
  state.screen = Screen.ENTER_DETAILS;
  state.formError = null;
  render();
}

function goRules() {
  state.screen = Screen.RULES;
  state.formError = null;
  render();
}

function goReady() {
  state.screen = Screen.START;
  state.formError = null;
  render();
}

function roundsPerGame() {
  return Math.min(cfg.roundsPerGame ?? 2, cfg.questions.length);
}

function clearGridHandlers() {
  if (gridAbort) {
    gridAbort.abort();
    gridAbort = null;
  }
}

function clearTimers() {
  if (state.wordFindTimer) clearInterval(state.wordFindTimer);
  state.wordFindTimer = null;
  if (state.idleResetTimer) clearTimeout(state.idleResetTimer);
  state.idleResetTimer = null;
}

function scheduleIdleReset() {
  if (state.idleResetTimer) clearTimeout(state.idleResetTimer);
  const sec = cfg?.idleResetSeconds ?? 10;
  state.idleResetTimer = setTimeout(() => goStart(), sec * 1000);
}

function nowMs() {
  return Date.now();
}

function startGame() {
  clearTimers();
  const variantCount = cfg.puzzleVariants ?? 10;
  state.puzzleVariant = getNextVariantIndex(variantCount);
  state.roundQuestions = pickRoundQuestions(
    cfg.questions,
    roundsPerGame(),
    state.puzzleVariant * 7919 + Date.now(),
  );
  state.questionIndex = 0;
  state.totalScore = 0;
  state.roundScores = [];
  state.currentRound = null;
  state.gridData = null;
  state.feedback = null;
  state.locked = false;
  state.quizReveal = null;
  state.shuffledQuiz = null;
  state.revealTarget = false;
  state.screen = Screen.QUIZ;
  render();
}

function startWordFind() {
  const q = activeQuestion();
  const target = getCategoryWord(q);
  const keywords = buildKeywordListForPuzzle(
    state.roundQuestions,
    target,
    state.puzzleVariant * 1000 + state.questionIndex * 37 + 11,
  );

  state.locked = true;
  try {
    const seed = state.puzzleVariant * 1000 + state.questionIndex * 37 + 11;
    state.gridData = generateWordSearch(keywords, cfg.grid ?? {}, seed);
  } catch {
    state.feedback = { type: "bad", text: "Puzzle error — skipping to next question" };
    state.currentRound.word = 0;
    render();
    setTimeout(() => {
      state.feedback = null;
      finishRound();
    }, 1400);
    return;
  }

  state.remainingMs = (cfg.wordFindSeconds ?? 20) * 1000;
  state.wordFindStartedAt = nowMs();
  state.screen = Screen.WORDFIND;
  state.selecting = false;
  state.selStart = null;
  state.selEnd = null;
  state.locked = false;

  clearTimers();
  state.wordFindTimer = setInterval(() => {
    const elapsed = nowMs() - state.wordFindStartedAt;
    state.remainingMs = Math.max(0, (cfg.wordFindSeconds ?? 20) * 1000 - elapsed);
    if (state.remainingMs <= 0) {
      onWordFindTimeout();
    } else {
      updateWordFindTimerUI();
    }
  }, 200);

  render();
}

async function answerQuiz(optionIndex) {
  if (state.locked || state.screen !== Screen.QUIZ) return;
  state.locked = true;

  const shuffled = ensureShuffledQuiz();
  const correct = optionIndex === shuffled.correctIndex;
  const pts = sectionPoints();
  const quizPts = correct ? pts : 0;
  const mcqLabel = questionLabel(state.questionIndex);

  state.currentRound = { quiz: quizPts, word: 0, quizCorrect: correct, keywordSkipped: !correct };
  state.quizReveal = { picked: optionIndex, correct: shuffled.correctIndex };

  if (!correct) {
    beep("bad");
    // Show green/red option highlight only — no overlay toast
    render();
    await delay(isFinalMcqRound() ? 2200 : 2000);
    state.quizReveal = null;
    state.shuffledQuiz = null;
    finishRound();
    return;
  }

  beep("good");
  const kwLabel = wordFindLabel(state.questionIndex);
  state.feedback = { type: "good", text: `${mcqLabel} correct! +${quizPts} pts — ${kwLabel}` };
  render();
  await delay(1100);
  if (state.screen !== Screen.QUIZ) return;
  state.feedback = null;
  state.quizReveal = null;
  startWordFind();
}

function getTargetPlacementCells() {
  const place = state.gridData?.placements?.[0];
  return place?.cells ?? [];
}

function paintTargetReveal() {
  const cells = getTargetPlacementCells();
  const set = new Set(cells.map((p) => `${p.r},${p.c}`));
  document.querySelectorAll("[data-cell]").forEach((el) => {
    const key = el.getAttribute("data-cell");
    el.classList.toggle("reveal", set.has(key));
    el.classList.remove("sel");
  });
}

async function revealKeywordThenFinish(message, type = "bad", waitMs = 2800) {
  state.revealTarget = true;
  state.selecting = false;
  state.selStart = null;
  state.selEnd = null;
  state.feedback = { type, text: message };
  render();
  paintTargetReveal();
  await delay(waitMs);
  if (state.screen !== Screen.WORDFIND) return;
  state.feedback = null;
  state.revealTarget = false;
  finishRound();
}

function onWordFindTimeout() {
  if (state.screen !== Screen.WORDFIND || state.locked) return;
  state.locked = true;
  clearTimers();
  state.currentRound.word = 0;
  const label = getCategoryLabel(activeQuestion());
  void revealKeywordThenFinish(`Time's up — correct keyword highlighted: ${label}`);
}

async function onWordSelected(matchIdx) {
  if (state.screen !== Screen.WORDFIND || state.locked) return;
  state.locked = true;

  const full = sectionPoints();
  const label = getCategoryLabel(activeQuestion());

  if (matchIdx === 0) {
    clearTimers();
    beep("good");
    state.currentRound.word = full;
    state.revealTarget = true;
    state.feedback = { type: "good", text: `Keyword found! +${full} pts` };
    render();
    paintTargetReveal();
    document.querySelectorAll(".cell.reveal").forEach((el) => {
      el.classList.remove("reveal");
      el.classList.add("foundA");
    });
    await delay(1300);
    if (state.screen !== Screen.WORDFIND) return;
    state.feedback = null;
    state.revealTarget = false;
    finishRound();
    return;
  }

  if (matchIdx > 0) {
    clearTimers();
    beep("bad");
    state.currentRound.word = 0;
    await revealKeywordThenFinish(
      `Wrong keyword — no points for this section. Correct: ${label}`,
      "warn",
      3000,
    );
    return;
  }

  beep("bad");
  state.selecting = false;
  state.selStart = null;
  state.selEnd = null;
  state.feedback = { type: "bad", text: "Not a valid word — try again" };
  flashBad();
  render();
  await delay(900);
  if (state.screen !== Screen.WORDFIND) return;
  state.feedback = null;
  state.locked = false;
  render();
}

function finishRound() {
  if (!state.currentRound) return;
  const pts = (state.currentRound.quiz ?? 0) + (state.currentRound.word ?? 0);
  state.totalScore += pts;
  state.roundScores.push({ ...state.currentRound, total: pts });
  state.currentRound = null;
  state.gridData = null;
  state.locked = false;
  state.selecting = false;
  state.selStart = null;
  state.selEnd = null;
  state.quizReveal = null;
  state.shuffledQuiz = null;
  state.revealTarget = false;
  clearGridHandlers();
  state.questionIndex++;

  if (state.questionIndex >= state.roundQuestions.length) {
    endGame();
  } else {
    state.screen = Screen.QUIZ;
    render();
  }
}

function endGame() {
  clearTimers();
  state.screen = Screen.END;
  scheduleIdleReset();
  render();
}

function goStart() {
  clearTimers();
  clearGridHandlers();
  state.screen = Screen.ENTER_DETAILS;
  state.playerName = "";
  state.employeeId = "";
  state.formError = null;
  state.questionIndex = 0;
  state.roundQuestions = [];
  state.totalScore = 0;
  state.roundScores = [];
  state.currentRound = null;
  state.gridData = null;
  state.feedback = null;
  state.locked = false;
  state.quizReveal = null;
  state.shuffledQuiz = null;
  state.revealTarget = false;
  render();
}

// ---- Selection logic ----
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function sign(n) {
  return n === 0 ? 0 : n > 0 ? 1 : -1;
}
function cellsOnLine(a, b) {
  const dr = b.r - a.r;
  const dc = b.c - a.c;
  const sdr = sign(dr);
  const sdc = sign(dc);
  const absR = Math.abs(dr);
  const absC = Math.abs(dc);
  // Horizontal or vertical only — no diagonals
  if (!(absR === 0 || absC === 0)) return [];
  const steps = Math.max(absR, absC);
  const out = [];
  for (let i = 0; i <= steps; i++) out.push({ r: a.r + sdr * i, c: a.c + sdc * i });
  return out;
}
function readWordFromCells(cells, gridData) {
  // Always read L→R or top→bottom regardless of drag direction.
  const ordered = [...cells].sort((a, b) => (a.r - b.r) || (a.c - b.c));
  return ordered.map(({ r, c }) => gridData.grid[r][c].letter).join("");
}
function whichWordMatch(selectedWord, gridData) {
  return gridData.words.findIndex((w) => w === selectedWord);
}

function flashBad() {
  beep("bad");
  const el = document.querySelector("[data-grid]");
  if (!el) return;
  el.classList.remove("flashBad");
  void el.offsetWidth;
  el.classList.add("flashBad");
}

// ---- Rendering helpers ----
function fmtSeconds(ms) {
  return Math.ceil(ms / 1000);
}
function timerColor(ms, totalMs) {
  const p = ms / totalMs;
  if (p > 0.5) return "good";
  if (p > 0.2) return "warn";
  return "bad";
}

function renderHeader(title, subtitle, chips = "") {
  return `
    <header class="header">
      <div class="brand">
        <img class="logo-img" src="./assets/logo.png" alt="PhonePe" width="132" height="36" />
        <div class="title">
          <div class="h1">${title}</div>
          <div class="sub">${subtitle}</div>
        </div>
      </div>
      <div class="header-meta">${chips}</div>
    </header>
  `;
}

function renderTimerBlock(remaining, totalMs) {
  const sec = fmtSeconds(remaining);
  const tColor = timerColor(remaining, totalMs);
  const pct = clamp(remaining / totalMs, 0, 1);
  const stroke =
    tColor === "good" ? "var(--pp-good)" : tColor === "warn" ? "var(--pp-warn)" : "var(--pp-bad)";
  const r = 24;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  return `
    <div class="timer-block">
      <div class="timer-ring" aria-hidden="true">
        <svg viewBox="0 0 56 56">
          <circle class="track" cx="28" cy="28" r="${r}" />
          <circle class="fill" cx="28" cy="28" r="${r}"
            stroke="${stroke}" stroke-dasharray="${circ.toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}" />
        </svg>
      </div>
      <div class="timer-info">
        <div class="label">Time left</div>
        <div class="value ${tColor}">${sec}s</div>
        <div class="progress-bar"><div style="width:${(pct * 100).toFixed(1)}%;background:${stroke}"></div></div>
      </div>
    </div>
  `;
}

function displayScore() {
  const pending = state.currentRound?.quiz ?? 0;
  return state.totalScore + pending;
}

function updateWordFindTimerUI() {
  if (state.screen !== Screen.WORDFIND) return;
  const totalMs = (cfg.wordFindSeconds ?? 20) * 1000;
  const host = document.querySelector("[data-timer-host]");
  if (host) host.innerHTML = renderTimerBlock(state.remainingMs, totalMs);
}

function renderFeedback() {
  if (!state.feedback) return "";
  return `<div class="feedback feedback-${state.feedback.type}">${escapeHtml(state.feedback.text)}</div>`;
}

function buildGridHtml(gridData, interactive = true) {
  const size = gridData.size;
  const large = size > 14 ? " large" : "";
  const selCells =
    interactive && state.selStart && state.selEnd ? cellsOnLine(state.selStart, state.selEnd) : [];
  const selSet = new Set(selCells.map((p) => `${p.r},${p.c}`));
  const revealSet = state.revealTarget
    ? new Set(getTargetPlacementCells().map((p) => `${p.r},${p.c}`))
    : new Set();
  let html = `<div class="grid-fit"><div class="grid${large}" data-grid data-cols="${size}" style="--cols:${size}">`;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      const cell = gridData.grid[r][c];
      const isSel = selSet.has(key);
      const isReveal = revealSet.has(key);
      const cls = [isSel ? "sel" : "", isReveal ? "reveal" : ""].filter(Boolean).join(" ");
      html += `<div class="cell ${cls}" data-cell="${r},${c}" role="button"
        aria-label="Letter ${cell.letter}">${cell.letter}</div>`;
    }
  }
  html += `</div></div>`;
  return html;
}

function renderFlowStep(step, total, label) {
  return `<div class="flow-step">Step ${step} of ${total} · ${label}</div>`;
}

function renderFormError() {
  if (!state.formError) return "";
  return `<div class="form-error">${escapeHtml(state.formError)}</div>`;
}

function attachFormSubmit(selector, onSubmit) {
  const form = document.querySelector(selector);
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(new FormData(form));
  });
  const input = form.querySelector("input");
  input?.focus();
}

function renderEnterDetails() {
  $app.innerHTML = `
    <div class="screen">
      ${renderHeader("PhonePe Integrity", "Word of Honor", renderFlowStep(1, 3, "Your details"))}
      <div class="screen-body form-body">
        <div class="card card-sm form-card">
          <h2 class="form-title">Enter your details</h2>
          <p class="form-lead">Please enter your name and Employee ID to begin the Integrity challenge.</p>
          <form class="player-form" data-form="details">
            <label class="field-label" for="player-name">Name</label>
            <input id="player-name" class="field-input" name="name" type="text"
              autocomplete="name" enterkeyhint="next" maxlength="60"
              placeholder="Your name" value="${escapeHtml(state.playerName)}" />
            <label class="field-label" for="employee-id">Employee ID</label>
            <input id="employee-id" class="field-input" name="employeeId" type="text"
              inputmode="text" enterkeyhint="go" maxlength="30"
              placeholder="Employee ID" value="${escapeHtml(state.employeeId)}" />
            ${renderFormError()}
            <button class="btn btn-primary" type="submit">Continue</button>
          </form>
        </div>
      </div>
      <footer class="footer">
        <span>Touch to type · then tap Continue</span>
      </footer>
    </div>
  `;
  attachFormSubmit("[data-form=details]", (fd) => {
    const name = String(fd.get("name") || "").trim();
    const id = String(fd.get("employeeId") || "").trim();
    const nameErr = validateName(name);
    if (nameErr) {
      state.formError = nameErr;
      state.playerName = name;
      state.employeeId = id;
      render();
      return;
    }
    const idErr = validateEmployeeId(id);
    if (idErr) {
      state.formError = idErr;
      state.playerName = name;
      state.employeeId = id;
      render();
      document.getElementById("employee-id")?.focus();
      return;
    }
    state.playerName = name;
    state.employeeId = id;
    goRules();
  });
}

function renderRules() {
  const pts = sectionPoints();
  const maxScore = roundsPerGame() * pts * 2;
  const wordSec = cfg.wordFindSeconds ?? 20;
  $app.innerHTML = `
    <div class="screen">
      ${renderHeader("PhonePe Integrity", "Game Rules", renderFlowStep(2, 3, "How to Play"))}
      <div class="screen-body rules-body">
        <div class="card card-sm rules-panel">
          <h2 class="form-title">Word of Honor</h2>
          <p class="form-lead">
            Welcome! Test your knowledge, sharp eyes, and speed across
            <strong>4 interactive rounds</strong>.
          </p>
          <ol class="rules-flow">
            <li>Select the correct answer to unlock <strong>Find the word</strong> for Question 1.</li>
            <li>Find the hidden integrity keyword on the touch screen to earn extra points.</li>
            <li>Answer Question 2 — wrong answer on the final question ends the game.</li>
            <li>Locate the final keyword to maximize your total score.</li>
          </ol>
          <div class="rules-grid">
            <div class="rules-box">
              <div class="rules-box-title">Scoring</div>
              <p>Each correct section awards <strong>${pts} points</strong> (max ${maxScore}).</p>
              <ul class="rules-mini">
                <li>0 pts — Oops!</li>
                <li>25 pts — Not bad!</li>
                <li>50 pts — Good Job!</li>
                <li>75 pts — Great job!</li>
                <li>100 pts — Flawless, perfect score!</li>
              </ul>
            </div>
            <div class="rules-box">
              <div class="rules-box-title">Progression</div>
              <ul class="rules-mini">
                <li>Wrong Question 1 → skip word search, go to Question 2</li>
                <li>Wrong final question → game over</li>
                <li>Wrong keyword or timeout → 0 pts for that section</li>
                <li>${wordSec}s per word search · left→right & top→bottom only</li>
              </ul>
            </div>
          </div>
          <button class="btn btn-primary" data-continue>I Understand — Continue</button>
        </div>
      </div>
      <footer class="footer">
        <span>${escapeHtml(state.playerName)} · ${escapeHtml(state.employeeId)}</span>
      </footer>
    </div>
  `;
  document.querySelector("[data-continue]")?.addEventListener("pointerdown", goReady);
}

function renderStart() {
  const pts = sectionPoints();
  const maxScore = roundsPerGame() * pts * 2;
  const total = roundsPerGame();
  $app.innerHTML = `
    <div class="screen">
      ${renderHeader("PhonePe Integrity", "Start Game", `${renderFlowStep(3, 3, "Ready")} ${playerChip()}`)}
      <div class="start-hero">
        <h1>Ready to play, <span>${escapeHtml(state.playerName)}</span>?</h1>
        <p class="lead">
          You will answer <strong>${total} questions</strong> and find the keyword after each correct answer.
          Maximum score: <strong>${maxScore} points</strong>.
        </p>
        <div class="steps">
          <div class="step">
            <div class="step-num">5</div>
            <div class="step-title">Question 1</div>
            <div class="step-desc">Answer the question · +${pts} pts if correct</div>
          </div>
          <div class="step">
            <div class="step-num">6</div>
            <div class="step-title">Find the word</div>
            <div class="step-desc">Locate the integrity keyword · +${pts} pts</div>
          </div>
          <div class="step">
            <div class="step-num">7</div>
            <div class="step-title">And so on…</div>
            <div class="step-desc">Repeat for Question 2 until the game ends</div>
          </div>
        </div>
        <button class="btn btn-primary" data-start>Start Game</button>
      </div>
      <footer class="footer">
        <span>Employee ID: ${escapeHtml(state.employeeId)}</span>
        <span>Tap Start Game when ready</span>
      </footer>
    </div>
  `;
  document.querySelector("[data-start]")?.addEventListener("pointerdown", () => {
    try {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {}
    startGame();
  });
}

function renderQuiz() {
  const q = activeQuestion();
  const total = state.roundQuestions.length;
  const reveal = state.quizReveal;
  const shuffled = ensureShuffledQuiz();
  const opts = shuffled.options
    .map((opt, i) => {
      let extra = "";
      if (reveal) {
        if (i === reveal.correct) extra = " quiz-option-correct";
        else if (i === reveal.picked) extra = " quiz-option-wrong";
        else extra = " quiz-option-dim";
      }
      return `
      <button class="quiz-option${extra}" data-opt="${i}" type="button" ${reveal ? "disabled" : ""}>
        <span class="opt-letter">${String.fromCharCode(65 + i)}</span>
        <span class="opt-text">${escapeHtml(opt)}</span>
      </button>`;
    })
    .join("");

  const qLabel = questionLabel(state.questionIndex);
  $app.innerHTML = `
    <div class="screen">
      ${renderHeader(
        qLabel,
        "Answer the question",
        `<span class="chip chip-strong">Score: ${displayScore()}</span> ${playerChip()}`,
      )}
      <div class="screen-body quiz-body">
        <div class="card card-sm quiz-card">
          <div class="section-label">${escapeHtml(q.allegation || "Integrity")} · ${qLabel}</div>
          <h2 class="quiz-question">${escapeHtml(q.clue)}</h2>
          <p class="quiz-hint">${
            reveal
              ? reveal.picked === reveal.correct
                ? "Correct!"
                : "Incorrect — green option is the correct answer"
              : "Options are jumbled — tap the correct answer (A, B, or C)"
          }</p>
          <div class="quiz-options">${opts}</div>
        </div>
      </div>
      <footer class="footer">
        <span>${isFinalMcqRound() ? "Wrong answer ends the game" : "Wrong answer skips Find the word"}</span>
        <span>Correct answer unlocks Find the word · ${state.questionIndex + 1} of ${total}</span>
      </footer>
      ${renderFeedback()}
    </div>
  `;

  if (!reveal) {
    document.querySelectorAll("[data-opt]").forEach((btn) => {
      btn.addEventListener("pointerdown", () => answerQuiz(parseInt(btn.dataset.opt, 10)));
    });
  }
}

function renderWordFind() {
  const q = activeQuestion();
  const categoryLabel = getCategoryLabel(q);
  const categoryWord = getCategoryWord(q);
  const answerLabel = getAnswerLabel(q);
  const totalMs = (cfg.wordFindSeconds ?? 20) * 1000;
  const pts = sectionPoints();
  const kwLabel = wordFindLabel(state.questionIndex);
  const keywordCount = state.gridData?.words?.length ?? state.roundQuestions.length;
  const gridHtml = buildGridHtml(state.gridData, !state.revealTarget);

  $app.innerHTML = `
    <div class="screen">
      ${renderHeader(
        kwLabel,
        questionLabel(state.questionIndex),
        `<span class="chip chip-strong">Score: ${displayScore()}</span> ${playerChip()}`,
      )}
      <div class="screen-body">
        <div class="play-layout wordfind-layout">
          <div class="card card-sm puzzle-card">
            <div data-timer-host>${renderTimerBlock(state.remainingMs, totalMs)}</div>
            <div class="find-target">
              <span class="find-target-label">Find this keyword in the grid</span>
              <strong>${escapeHtml(categoryLabel)}</strong>
              <span class="find-target-code">${escapeHtml(categoryWord)}</span>
            </div>
            <div class="grid-section">
              ${gridHtml}
            </div>
            <p class="grid-hint">Drag left→right or top→bottom · ${keywordCount} keywords hidden (jumbled)</p>
          </div>
          <div class="card card-sm rules-card">
            <div class="section-label">Rules</div>
            <ul class="rules-list">
              <li>Find this question’s <strong>keyword</strong> (not the quiz option text)</li>
              <li>Both game keywords are hidden in the crossword (jumbled layout)</li>
              <li>Correct keyword → <strong>+${pts} pts</strong></li>
              <li>Wrong keyword or timeout → <strong>0 pts</strong> for this section</li>
              <li>Each correct section awards <strong>${pts} pts</strong> (max ${roundsPerGame() * pts * 2})</li>
            </ul>
            <div class="quiz-recap">
              <div class="section-label">You answered</div>
              <p class="recap-q">${escapeHtml(q.clue)}</p>
              <p class="recap-a">✓ ${escapeHtml(answerLabel)}</p>
              <p class="recap-cat">Keyword: <strong>${escapeHtml(categoryLabel)}</strong></p>
            </div>
          </div>
        </div>
      </div>
      <footer class="footer">
        <span>${cfg.wordFindSeconds ?? 20} seconds per word search</span>
        <span>Horizontal & vertical only · left→right and top→bottom</span>
      </footer>
      ${renderFeedback()}
    </div>
  `;
  attachGridHandlers();
}

function renderEnd() {
  const pts = sectionPoints();
  const maxScore = roundsPerGame() * pts * 2;
  const feedback = getScoreFeedback(state.totalScore);
  const left = cfg.idleResetSeconds ?? 10;

  const rows = state.roundScores
    .map((r, i) => {
      const q = state.roundQuestions[i];
      const qName = questionLabel(i);
      const kwName = "Find the word";
      return `
        <div class="score-row">
          <div class="score-q">${qName}: ${escapeHtml(q.allegation || q.clue)}</div>
          <div class="score-detail">
            ${qName}: ${r.quizCorrect ? `+${r.quiz}` : "0"}
            · ${kwName}: ${r.keywordSkipped ? "NA" : r.quizCorrect ? (r.word > 0 ? `+${r.word}` : "0") : "NA"}
            · <strong>${r.total} pts</strong>
          </div>
        </div>`;
    })
    .join("");

  $app.innerHTML = `
    <div class="screen">
      ${renderHeader(
        "Game Over",
        feedback,
        `<span class="chip">Resets in ~${left}s</span> ${playerChip()}`,
      )}
      <div class="screen-body">
        <div class="end-score-card card">
          <div class="player-recap">${escapeHtml(state.playerName)} · ${escapeHtml(state.employeeId)}</div>
          <div class="final-score">${state.totalScore}</div>
          <div class="final-score-label">out of ${maxScore} points</div>
          <div class="end-feedback">${escapeHtml(feedback)}</div>
          <div class="score-breakdown">${rows}</div>
          <button class="btn btn-primary" data-new>Play Again</button>
        </div>
      </div>
      <footer class="footer">
        <span>Puzzle variant #${state.puzzleVariant + 1} used</span>
        <span>Next player gets a different puzzle</span>
      </footer>
    </div>
  `;
  document.querySelector("[data-new]")?.addEventListener("pointerdown", () => goReady());
}

function render() {
  if (!cfg) return;
  if (state.screen === Screen.ENTER_DETAILS) return renderEnterDetails();
  if (state.screen === Screen.RULES) return renderRules();
  if (state.screen === Screen.START) return renderStart();
  if (state.screen === Screen.QUIZ) return renderQuiz();
  if (state.screen === Screen.WORDFIND) return renderWordFind();
  if (state.screen === Screen.END) return renderEnd();
}

// ---- Grid touch handlers ----
function parseCellAttr(v) {
  const [r, c] = String(v).split(",").map((x) => parseInt(x, 10));
  return { r, c };
}
function nearestCellFromPoint(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const cell = el?.closest?.("[data-cell]");
  if (!cell) return null;
  return { el: cell, pos: parseCellAttr(cell.getAttribute("data-cell")) };
}

function attachGridHandlers() {
  clearGridHandlers();
  const gridEl = document.querySelector("[data-grid]");
  if (!gridEl) return;

  gridAbort = new AbortController();
  const { signal } = gridAbort;
  let upHandled = false;

  const onDown = (e) => {
    if (state.screen !== Screen.WORDFIND || state.locked) return;
    const hit = nearestCellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    upHandled = false;
    state.selecting = true;
    state.selStart = hit.pos;
    state.selEnd = hit.pos;
    try {
      gridEl.setPointerCapture(e.pointerId);
    } catch {}
    updateGridSelectionUI();
  };

  const onMove = (e) => {
    if (!state.selecting || state.locked) return;
    const hit = nearestCellFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    state.selEnd = hit.pos;
    updateGridSelectionUI();
  };

  const onUp = () => {
    if (!state.selecting || state.locked || upHandled) return;
    upHandled = true;
    state.selecting = false;
    if (!state.selStart || !state.selEnd) return;

    const cells = cellsOnLine(state.selStart, state.selEnd);
    state.selStart = null;
    state.selEnd = null;
    updateGridSelectionUI();

    if (!cells.length) {
      flashBad();
      return;
    }
    const word = readWordFromCells(cells, state.gridData);
    const match = whichWordMatch(word, state.gridData);
    if (match === -1) {
      flashBad();
      return;
    }
    onWordSelected(match);
  };

  gridEl.addEventListener("pointerdown", onDown, { passive: false, signal });
  gridEl.addEventListener("pointermove", onMove, { passive: false, signal });
  gridEl.addEventListener("pointerup", onUp, { passive: true, signal });
  gridEl.addEventListener("pointercancel", onUp, { passive: true, signal });
}

function updateGridSelectionUI() {
  if (!state.gridData) return;
  const selCells =
    state.selStart && state.selEnd ? cellsOnLine(state.selStart, state.selEnd) : [];
  const selSet = new Set(selCells.map((p) => `${p.r},${p.c}`));
  document.querySelectorAll("[data-cell]").forEach((cell) => {
    const pos = parseCellAttr(cell.getAttribute("data-cell"));
    cell.classList.toggle("sel", selSet.has(`${pos.r},${pos.c}`));
  });
}

// ---- Boot ----
(async function main() {
  hardenKiosk();
  try {
    cfg = await loadConfig();
    goStart();
  } catch (err) {
    $app.innerHTML = `<div class="screen"><div class="card card-sm" style="margin:40px auto;max-width:600px">
      <h2>Config error</h2><p>${escapeHtml(err.message)}</p></div></div>`;
  }
  window.addEventListener("pointerdown", () => {
    if (state.screen === Screen.END) scheduleIdleReset();
  });
})();
