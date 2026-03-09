const Mode = {
  CLOCK: "clock",
  STOPWATCH: "stopwatch",
  TIMER: "timer",
};

const hourEl = document.getElementById("hours");
const minuteEl = document.getElementById("minutes");
const secondEl = document.getElementById("seconds");
const subUnitEl = document.getElementById("sub-unit");
const subValueEl = document.getElementById("sub-value");
const ampmEl = document.getElementById("ampm");
const modeBtns = document.querySelectorAll(".mode-btn");
const militaryToggleBtn = document.getElementById("military-toggle");
const actionToggleBtn = document.getElementById("action-toggle");
const resetBtn = document.getElementById("reset-btn");
const timerSetEl = document.getElementById("timer-set");
const timerMinInput = document.getElementById("timer-min");
const timerSecInput = document.getElementById("timer-sec");
const timerApplyBtn = document.getElementById("timer-apply");

let currentMode = Mode.CLOCK;
let rafId = null;
let militaryTime = true;

let stopwatchRunning = false;
let stopwatchStartTs = null;
let stopwatchAccumulatedMs = 0;

let timerRunning = false;
let timerEndTs = null;
let timerRemainingMs = 0;
let timerInitialDurationMs = 300_000;

function formatUnit(value) {
  return String(value).padStart(2, "0");
}

function formatMs(ms) {
  return String(Math.floor(ms / 10) % 100).padStart(2, "0");
}

function animationForMode(modeKind) {
  if (modeKind === "hour") {
    return { outClass: "animate-hour-out", inClass: "animate-hour-in", ms: 340 };
  }
  if (modeKind === "minute") {
    return { outClass: "animate-minute-out", inClass: "animate-minute-in", ms: 400 };
  }
  return { outClass: "animate-second-out", inClass: "animate-second-in", ms: 520 };
}

function animateDigit(el, nextValue, modeKind) {
  if (!el) return;
  const { outClass, inClass, ms } = animationForMode(modeKind);
  const existingLayer = el.querySelector(".digit-layer.current");
  const outgoing = existingLayer ?? document.createElement("span");
  outgoing.className = `digit-layer current ${outClass}`;
  outgoing.textContent = el.dataset.value ?? nextValue;

  const incoming = document.createElement("span");
  incoming.className = `digit-layer next ${inClass}`;
  incoming.textContent = nextValue;

  el.innerHTML = "";
  el.append(outgoing, incoming);
  el.dataset.value = nextValue;

  setTimeout(() => {
    if (el.dataset.value === nextValue) {
      incoming.className = "digit-layer current";
      el.innerHTML = "";
      el.append(incoming);
    }
  }, ms + 30);
}

function setDigitInstant(el, value) {
  if (!el) return;
  const text = formatUnit(value);
  el.dataset.value = text;
  const single = document.createElement("span");
  single.className = "digit-layer current";
  single.textContent = text;
  el.innerHTML = "";
  el.append(single);
}

function updateDigit(el, value, modeKind) {
  if (!el) return;
  const next = formatUnit(value);
  const previous = el.dataset.value ?? "";
  if (previous === next) return;
  animateDigit(el, next, modeKind);
}

function setDisplay(h, m, s) {
  updateDigit(hourEl, h, "hour");
  updateDigit(minuteEl, m, "minute");
  updateDigit(secondEl, s, "second");
}

function setDisplayInstant(h, m, s) {
  setDigitInstant(hourEl, h);
  setDigitInstant(minuteEl, m);
  setDigitInstant(secondEl, s);
}

function setSubValue(text) {
  if (subValueEl) subValueEl.textContent = text;
}

function showSubUnit() {
  if (subUnitEl) subUnitEl.classList.remove("hidden");
}

function hideSubUnit() {
  if (subUnitEl) subUnitEl.classList.add("hidden");
}

function hmsFromMs(totalMs) {
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    centiseconds: Math.floor((totalMs % 1000) / 10),
  };
}

function cancelLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function updateActionButtons() {
  actionToggleBtn.classList.add("hidden");
  resetBtn.classList.add("hidden");
  if (timerSetEl) timerSetEl.classList.add("hidden");

  if (currentMode === Mode.STOPWATCH) {
    actionToggleBtn.classList.remove("hidden");
    actionToggleBtn.textContent = stopwatchRunning ? "stop" : "start";
    if (stopwatchAccumulatedMs > 0 || stopwatchRunning) {
      resetBtn.classList.remove("hidden");
    }
    return;
  }

  if (currentMode === Mode.TIMER) {
    actionToggleBtn.classList.remove("hidden");
    actionToggleBtn.textContent = timerRunning ? "stop" : "start";
    resetBtn.classList.remove("hidden");
    if (timerSetEl && !timerRunning) {
      timerSetEl.classList.remove("hidden");
      syncTimerInputs();
    }
  }
}

function syncTimerInputs() {
  const t = hmsFromMs(timerRemainingMs > 0 ? timerRemainingMs : timerInitialDurationMs);
  if (timerMinInput) timerMinInput.value = t.minutes;
  if (timerSecInput) timerSecInput.value = t.seconds;
}

// -- Clock --

function getClockHoursMinutesSeconds() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  if (!militaryTime) {
    h = h % 12 || 12;
  }
  return { h, m, s, ampm: militaryTime ? null : (now.getHours() < 12 ? "AM" : "PM") };
}

function clockLoop() {
  const { h, m, s, ampm } = getClockHoursMinutesSeconds();
  setDisplay(h, m, s);
  if (ampmEl) {
    if (ampm) {
      ampmEl.textContent = ampm;
      ampmEl.classList.remove("hidden");
    } else {
      ampmEl.classList.add("hidden");
    }
  }
  rafId = requestAnimationFrame(clockLoop);
}

function startClock() {
  cancelLoop();
  const { h, m, s, ampm } = getClockHoursMinutesSeconds();
  setDisplayInstant(h, m, s);
  hideSubUnit();
  if (ampmEl) {
    if (ampm) {
      ampmEl.textContent = ampm;
      ampmEl.classList.remove("hidden");
    } else {
      ampmEl.classList.add("hidden");
    }
  }
  clockLoop();
}

// -- Stopwatch --

function getStopwatchElapsedMs() {
  let ms = stopwatchAccumulatedMs;
  if (stopwatchRunning && stopwatchStartTs !== null) {
    ms += performance.now() - stopwatchStartTs;
  }
  return Math.max(0, ms);
}

function stopwatchLoop() {
  const elapsedMs = getStopwatchElapsedMs();
  const { hours, minutes, seconds, centiseconds } = hmsFromMs(elapsedMs);
  setDisplay(hours, minutes, seconds);
  setSubValue(`.${formatUnit(centiseconds)}`);
  if (stopwatchRunning) {
    rafId = requestAnimationFrame(stopwatchLoop);
  }
}

function startStopwatch() {
  cancelLoop();
  stopwatchRunning = true;
  stopwatchStartTs = performance.now();
  updateActionButtons();
  showSubUnit();
  stopwatchLoop();
}

function pauseStopwatch() {
  if (!stopwatchRunning) return;
  stopwatchAccumulatedMs += performance.now() - stopwatchStartTs;
  stopwatchStartTs = null;
  stopwatchRunning = false;
  cancelLoop();

  const elapsedMs = getStopwatchElapsedMs();
  const { hours, minutes, seconds, centiseconds } = hmsFromMs(elapsedMs);
  setDisplayInstant(hours, minutes, seconds);
  setSubValue(`.${formatUnit(centiseconds)}`);
  updateActionButtons();
}

function resetStopwatch() {
  stopwatchRunning = false;
  stopwatchAccumulatedMs = 0;
  stopwatchStartTs = null;
  cancelLoop();
  setDisplayInstant(0, 0, 0);
  setSubValue(".00");
  showSubUnit();
  updateActionButtons();
}

// -- Timer --

function getTimerRemainingMs() {
  if (timerRunning && timerEndTs !== null) {
    return Math.max(0, timerEndTs - performance.now());
  }
  return Math.max(0, timerRemainingMs);
}

function timerLoop() {
  const remainingMs = getTimerRemainingMs();
  const { hours, minutes, seconds, centiseconds } = hmsFromMs(remainingMs);
  setDisplay(hours, minutes, seconds);
  setSubValue(`.${formatUnit(centiseconds)}`);

  if (remainingMs <= 0) {
    timerRunning = false;
    timerRemainingMs = 0;
    cancelLoop();
    setDisplayInstant(0, 0, 0);
    setSubValue(".00");
    flashTimerComplete();
    updateActionButtons();
    return;
  }

  if (timerRunning) {
    rafId = requestAnimationFrame(timerLoop);
  }
}

function startTimer() {
  cancelLoop();
  const ms = timerRemainingMs > 0 ? timerRemainingMs : timerInitialDurationMs;
  if (ms <= 0) {
    timerRemainingMs = 30_000;
    timerInitialDurationMs = 30_000;
  } else {
    timerRemainingMs = ms;
  }
  timerRunning = true;
  timerEndTs = performance.now() + timerRemainingMs;
  updateActionButtons();
  showSubUnit();
  timerLoop();
}

function pauseTimer() {
  if (!timerRunning) return;
  timerRemainingMs = Math.max(0, timerEndTs - performance.now());
  timerEndTs = null;
  timerRunning = false;
  cancelLoop();

  const { hours, minutes, seconds, centiseconds } = hmsFromMs(timerRemainingMs);
  setDisplayInstant(hours, minutes, seconds);
  setSubValue(`.${formatUnit(centiseconds)}`);
  updateActionButtons();
}

function resetTimer() {
  timerRunning = false;
  timerEndTs = null;
  timerRemainingMs = timerInitialDurationMs;
  cancelLoop();
  const { hours, minutes, seconds } = hmsFromMs(timerInitialDurationMs);
  setDisplayInstant(hours, minutes, seconds);
  setSubValue(".00");
  showSubUnit();
  updateActionButtons();
}

function applyTimerFromInputs() {
  if (timerRunning) return;
  const min = Math.max(0, Math.min(599, parseInt(timerMinInput?.value || "0", 10) || 0));
  const sec = Math.max(0, Math.min(59, parseInt(timerSecInput?.value || "0", 10) || 0));
  const ms = (min * 60 + sec) * 1000;
  if (ms <= 0) return;
  timerInitialDurationMs = ms;
  timerRemainingMs = ms;
  resetTimer();
}

function flashTimerComplete() {
  const row = document.querySelector(".time-row");
  if (!row) return;
  row.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0.6, transform: "translateY(-2px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 700, easing: "ease-out" },
  );
}

// -- Mode switching --

function setMode(nextMode) {
  if (nextMode === currentMode) return;
  const prevMode = currentMode;
  currentMode = nextMode;

  modeBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === nextMode);
  });

  document.body.className = "";
  if (nextMode === Mode.CLOCK) document.body.classList.add("clock-mode");

  cancelLoop();
  if (prevMode === Mode.STOPWATCH && stopwatchRunning) pauseStopwatch();
  if (prevMode === Mode.TIMER && timerRunning) pauseTimer();

  if (nextMode === Mode.CLOCK) {
    hideSubUnit();
    startClock();
  } else {
    if (ampmEl) ampmEl.classList.add("hidden");
    if (nextMode === Mode.STOPWATCH) {
      resetStopwatch();
    } else if (nextMode === Mode.TIMER) {
      resetTimer();
    }
  }
  updateActionButtons();
}

// -- Event listeners --

militaryToggleBtn.addEventListener("click", () => {
  militaryTime = !militaryTime;
  militaryToggleBtn.textContent = militaryTime ? "24h" : "12h";
  militaryToggleBtn.classList.toggle("active", militaryTime);
  if (currentMode === Mode.CLOCK) {
    startClock();
  }
});

modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (mode === Mode.CLOCK || mode === Mode.STOPWATCH || mode === Mode.TIMER) {
      setMode(mode);
    }
  });
});

actionToggleBtn.addEventListener("click", () => {
  if (currentMode === Mode.STOPWATCH) {
    if (stopwatchRunning) pauseStopwatch();
    else startStopwatch();
    return;
  }
  if (currentMode === Mode.TIMER) {
    if (timerRunning) pauseTimer();
    else startTimer();
  }
});

resetBtn.addEventListener("click", () => {
  if (currentMode === Mode.STOPWATCH) resetStopwatch();
  if (currentMode === Mode.TIMER) resetTimer();
});

timerApplyBtn.addEventListener("click", () => {
  if (currentMode === Mode.TIMER) applyTimerFromInputs();
});

[timerMinInput, timerSecInput].forEach((el) => {
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyTimerFromInputs();
  });
});

// -- Init --

document.body.classList.add("clock-mode");
setDisplayInstant(0, 0, 0);
hideSubUnit();
modeBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === Mode.CLOCK));
militaryToggleBtn.textContent = militaryTime ? "24h" : "12h";
militaryToggleBtn.classList.toggle("active", militaryTime);
if (ampmEl) ampmEl.classList.add("hidden");
updateActionButtons();
startClock();
