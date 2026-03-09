const Mode = {
  CLOCK: "clock",
  STOPWATCH: "stopwatch",
  TIMER: "timer",
};

const MODE_ORDER = [Mode.CLOCK, Mode.STOPWATCH, Mode.TIMER];

const hourEl = document.getElementById("hours");
const minuteEl = document.getElementById("minutes");
const secondEl = document.getElementById("seconds");
const modeToggleBtn = document.getElementById("mode-toggle");
const actionToggleBtn = document.getElementById("action-toggle");
const timerAdjustBtn = document.getElementById("timer-adjust");

let currentMode = Mode.CLOCK;
let currentTimerId = null;

let stopwatchRunning = false;
let stopwatchStartTs = null;
let stopwatchAccumulatedMs = 0;

let timerRunning = false;
let timerEndTs = null;
let timerInitialDurationMs = 300_000;
let stopwatchLastSecond = -1;
let timerLastSecond = -1;

function formatUnit(value) {
  return String(value).padStart(2, "0");
}

function animationForMode(modeKind) {
  if (modeKind === "hour") {
    return { outClass: "animate-hour-out", inClass: "animate-hour-in", ms: 350 };
  }
  if (modeKind === "minute") {
    return { outClass: "animate-minute-out", inClass: "animate-minute-in", ms: 420 };
  }
  return { outClass: "animate-second-out", inClass: "animate-second-in", ms: 980 };
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
  el.setAttribute("aria-label", nextValue);

  setTimeout(() => {
    incoming.className = "digit-layer current";
    el.innerHTML = "";
    el.append(incoming);
  }, ms + 24);
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

function formatMsAsClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds };
}

function updateActionButtons() {
  actionToggleBtn.classList.add("hidden");
  timerAdjustBtn.classList.add("hidden");

  if (currentMode === Mode.STOPWATCH) {
    actionToggleBtn.classList.remove("hidden");
    actionToggleBtn.textContent = stopwatchRunning ? "stop" : "start";
    return;
  }

  if (currentMode === Mode.TIMER) {
    actionToggleBtn.classList.remove("hidden");
    timerAdjustBtn.classList.remove("hidden");
    actionToggleBtn.textContent = timerRunning ? "stop" : "start";
    const t = formatMsAsClock(timerInitialDurationMs);
    timerAdjustBtn.textContent = `set ${formatUnit(t.minutes)}:${formatUnit(t.seconds)}`;
  }
}

function clearTimer() {
  if (currentTimerId !== null) {
    clearTimeout(currentTimerId);
    clearInterval(currentTimerId);
    currentTimerId = null;
  }
}

function startClock() {
  clearTimer();

  function tick() {
    const now = new Date();
    setDisplay(now.getHours(), now.getMinutes(), now.getSeconds());
    const msToNextSecond = 1000 - now.getMilliseconds();
    currentTimerId = setTimeout(tick, msToNextSecond + 5);
  }

  tick();
}

function startStopwatch() {
  clearTimer();
  stopwatchRunning = true;
  if (stopwatchStartTs === null) stopwatchStartTs = performance.now();
  updateActionButtons();

  function tick() {
    if (!stopwatchRunning) return;
    const now = performance.now();
    const elapsedMs = stopwatchAccumulatedMs + (stopwatchRunning ? now - stopwatchStartTs : 0);
    const totalSeconds = Math.floor(elapsedMs / 1000);
    if (totalSeconds !== stopwatchLastSecond) {
      stopwatchLastSecond = totalSeconds;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      setDisplay(hours, minutes, seconds);
    }
    const msToNextSecond = 1000 - (elapsedMs % 1000);
    currentTimerId = setTimeout(tick, Math.max(16, msToNextSecond));
  }

  tick();
}

function pauseStopwatch() {
  if (!stopwatchRunning) return;
  const now = performance.now();
  stopwatchAccumulatedMs += now - stopwatchStartTs;
  stopwatchRunning = false;
  clearTimer();
  updateActionButtons();
}

function resetStopwatch() {
  stopwatchRunning = false;
  stopwatchAccumulatedMs = 0;
  stopwatchStartTs = null;
  stopwatchLastSecond = -1;
  clearTimer();
  setDisplayInstant(0, 0, 0);
  updateActionButtons();
}

function adjustTimerDuration() {
  if (timerRunning) return;
  timerInitialDurationMs += 30_000;
  if (timerInitialDurationMs > 3_599_000) {
    timerInitialDurationMs = 30_000;
  }
  resetTimer();
  updateActionButtons();
}

function startTimer() {
  clearTimer();
  if (timerInitialDurationMs <= 0) timerInitialDurationMs = 30_000;
  timerRunning = true;
  updateActionButtons();
  const now = performance.now();
  timerEndTs = now + timerInitialDurationMs;
  timerLastSecond = -1;

  function tick() {
    if (!timerRunning) return;
    const current = performance.now();
    const remainingMs = Math.max(0, timerEndTs - current);
    const totalSeconds = Math.floor(remainingMs / 1000);
    if (totalSeconds !== timerLastSecond) {
      timerLastSecond = totalSeconds;
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      setDisplay(hours, minutes, seconds);
    }

    if (remainingMs <= 0) {
      timerRunning = false;
      clearTimer();
      flashTimerComplete();
      updateActionButtons();
      return;
    }
    const msToNextSecond = remainingMs % 1000 || 1000;
    currentTimerId = setTimeout(tick, Math.max(16, msToNextSecond));
  }

  tick();
}

function pauseTimer() {
  if (!timerRunning) return;
  const now = performance.now();
  const remainingMs = Math.max(0, timerEndTs - now);
  timerInitialDurationMs = remainingMs;
  timerRunning = false;
  clearTimer();
  updateActionButtons();
}

function resetTimer() {
  timerRunning = false;
  clearTimer();
  const totalSeconds = Math.floor(timerInitialDurationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  timerLastSecond = totalSeconds;
  setDisplayInstant(hours, minutes, seconds);
  updateActionButtons();
}

function flashTimerComplete() {
  const row = document.querySelector(".time-row");
  if (!row) return;
  row.animate(
    [
      { opacity: 1, transform: "translateY(0)" },
      { opacity: 0.7, transform: "translateY(-1px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 620, easing: "ease-out" },
  );
}

function setMode(nextMode) {
  if (nextMode === currentMode) return;
  const prevMode = currentMode;
  currentMode = nextMode;
  modeToggleBtn.textContent =
    nextMode === Mode.CLOCK ? "now" : nextMode === Mode.STOPWATCH ? "stopwatch" : "timer";
  document.body.classList.toggle("timer-mode", nextMode === Mode.TIMER);

  clearTimer();
  if (prevMode === Mode.STOPWATCH && stopwatchRunning) {
    pauseStopwatch();
  }
  if (prevMode === Mode.TIMER && timerRunning) {
    pauseTimer();
  }

  if (nextMode === Mode.CLOCK) {
    startClock();
  } else if (nextMode === Mode.STOPWATCH) {
    resetStopwatch();
  } else if (nextMode === Mode.TIMER) {
    resetTimer();
  }
  updateActionButtons();
}

modeToggleBtn.addEventListener("click", () => {
  const currentIndex = MODE_ORDER.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % MODE_ORDER.length;
  setMode(MODE_ORDER[nextIndex]);
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

timerAdjustBtn.addEventListener("click", () => {
  if (currentMode === Mode.TIMER) adjustTimerDuration();
});

// initial render
setDisplayInstant(0, 0, 0);
modeToggleBtn.textContent = "now";
updateActionButtons();
startClock();

