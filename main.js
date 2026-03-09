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
const timerHrInput = document.getElementById("timer-hr");
const timerMinInput = document.getElementById("timer-min");
const timerSecInput = document.getElementById("timer-sec");
const timerApplyBtn = document.getElementById("timer-apply");
const spotifyConnectBtn = document.getElementById("spotify-connect");
const spotifyPanelEl = document.getElementById("spotify-panel");
const spotifyExpandBtn = document.getElementById("spotify-expand");
const spotifyArtEl = document.getElementById("spotify-art");
const spotifyTrackEl = document.getElementById("spotify-track");
const spotifyArtistEl = document.getElementById("spotify-artist");
const spotifyProgressEl = document.getElementById("spotify-progress");
const spotifyElapsedEl = document.getElementById("spotify-elapsed");
const spotifyDurationEl = document.getElementById("spotify-duration");
const spotifyPrevBtn = document.getElementById("spotify-prev");
const spotifyPlayBtn = document.getElementById("spotify-play");
const spotifyNextBtn = document.getElementById("spotify-next");
const spotifyRewindBtn = document.getElementById("spotify-rewind");

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

const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");
const SPOTIFY_TOKEN_KEY = "spotify_tokens";
const SPOTIFY_PKCE_VERIFIER_KEY = "spotify_pkce_verifier";
const SPOTIFY_PKCE_STATE_KEY = "spotify_pkce_state";
const SPOTIFY_CLIENT_ID_KEY = "spotify_client_id";
const SPOTIFY_DEFAULT_CLIENT_ID = "57578693a97b44ec8147a737b03432a8";
const SPOTIFY_REDIRECT_URI = `${window.location.origin}${window.location.pathname}`;

let spotifyTokens = null;
let spotifyPollTimer = null;
let spotifyFetchTimer = null;
let spotifyLastProgressMs = 0;
let spotifyLastIsPlaying = false;
let spotifyDurationMs = 0;
let spotifyProgressAnchorTs = Date.now();
let spotifyExpanded = false;

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
  if (timerHrInput) timerHrInput.value = t.hours;
  if (timerMinInput) timerMinInput.value = t.minutes;
  if (timerSecInput) timerSecInput.value = t.seconds;
}

function readSpotifyClientId() {
  return localStorage.getItem(SPOTIFY_CLIENT_ID_KEY) || SPOTIFY_DEFAULT_CLIENT_ID;
}

function ensureSpotifyClientId() {
  let clientId = readSpotifyClientId();
  if (clientId) return clientId;
  const value = window.prompt("Enter your Spotify Client ID");
  if (!value) return "";
  clientId = value.trim();
  if (!clientId) return "";
  localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, clientId);
  return clientId;
}

function setSpotifyUiDisconnected() {
  if (spotifyConnectBtn) spotifyConnectBtn.textContent = "spotify";
  if (spotifyPanelEl) spotifyPanelEl.classList.add("hidden");
  if (spotifyTrackEl) spotifyTrackEl.textContent = "Not connected";
  if (spotifyArtistEl) spotifyArtistEl.textContent = "Connect Spotify to show now playing";
  if (spotifyArtEl) spotifyArtEl.removeAttribute("src");
  spotifyDurationMs = 0;
  spotifyLastProgressMs = 0;
  updateSpotifyProgressUi();
}

function setSpotifyUiConnected() {
  if (spotifyConnectBtn) spotifyConnectBtn.textContent = "disconnect";
  if (spotifyPanelEl) spotifyPanelEl.classList.remove("hidden");
}

function stopSpotifyPolling() {
  if (spotifyPollTimer !== null) {
    clearInterval(spotifyPollTimer);
    spotifyPollTimer = null;
  }
  if (spotifyFetchTimer !== null) {
    clearInterval(spotifyFetchTimer);
    spotifyFetchTimer = null;
  }
}

function saveSpotifyTokens(tokens) {
  spotifyTokens = tokens;
  localStorage.setItem(SPOTIFY_TOKEN_KEY, JSON.stringify(tokens));
  setSpotifyUiConnected();
}

function clearSpotifyAuth() {
  spotifyTokens = null;
  stopSpotifyPolling();
  localStorage.removeItem(SPOTIFY_TOKEN_KEY);
  localStorage.removeItem(SPOTIFY_PKCE_VERIFIER_KEY);
  localStorage.removeItem(SPOTIFY_PKCE_STATE_KEY);
  setSpotifyUiDisconnected();
}

function formatTrackTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getLiveSpotifyProgressMs() {
  if (!spotifyLastIsPlaying) return spotifyLastProgressMs;
  const delta = Date.now() - spotifyProgressAnchorTs;
  return Math.min(spotifyDurationMs || Number.MAX_SAFE_INTEGER, spotifyLastProgressMs + delta);
}

function updateSpotifyProgressUi() {
  const progress = getLiveSpotifyProgressMs();
  if (spotifyElapsedEl) spotifyElapsedEl.textContent = formatTrackTime(progress);
  if (spotifyDurationEl) spotifyDurationEl.textContent = formatTrackTime(spotifyDurationMs);
  if (spotifyProgressEl) {
    const ratio = spotifyDurationMs > 0 ? progress / spotifyDurationMs : 0;
    spotifyProgressEl.value = String(Math.round(Math.max(0, Math.min(1, ratio)) * 1000));
  }
}

async function sha256base64url(text) {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues, (x) => chars[x % chars.length]).join("");
}

async function spotifyAuthorize() {
  const clientId = ensureSpotifyClientId();
  if (!clientId) return;
  const verifier = randomString(96);
  const state = randomString(24);
  const challenge = await sha256base64url(verifier);
  localStorage.setItem(SPOTIFY_PKCE_VERIFIER_KEY, verifier);
  localStorage.setItem(SPOTIFY_PKCE_STATE_KEY, state);

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", SPOTIFY_REDIRECT_URI);
  authUrl.searchParams.set("scope", SPOTIFY_SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", challenge);
  window.location.href = authUrl.toString();
}

async function spotifyTokenRequest(params) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!response.ok) {
    throw new Error("Spotify token request failed");
  }
  return response.json();
}

async function handleSpotifyAuthCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code) return;

  const storedState = localStorage.getItem(SPOTIFY_PKCE_STATE_KEY);
  const verifier = localStorage.getItem(SPOTIFY_PKCE_VERIFIER_KEY);
  if (!verifier || !storedState || state !== storedState) {
    clearSpotifyAuth();
    return;
  }

  const clientId = readSpotifyClientId();
  if (!clientId) return;

  try {
    const data = await spotifyTokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    });
    saveSpotifyTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
    });
  } finally {
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, "", url.toString());
    localStorage.removeItem(SPOTIFY_PKCE_VERIFIER_KEY);
    localStorage.removeItem(SPOTIFY_PKCE_STATE_KEY);
  }
}

async function ensureSpotifyAccessToken() {
  if (!spotifyTokens) return "";
  if (Date.now() < spotifyTokens.expires_at - 60_000) return spotifyTokens.access_token;
  if (!spotifyTokens.refresh_token) return "";

  const clientId = readSpotifyClientId();
  if (!clientId) return "";

  const data = await spotifyTokenRequest({
    grant_type: "refresh_token",
    refresh_token: spotifyTokens.refresh_token,
    client_id: clientId,
  });
  saveSpotifyTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token || spotifyTokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });
  return spotifyTokens.access_token;
}

async function spotifyApi(path, options = {}) {
  const token = await ensureSpotifyAccessToken();
  if (!token) throw new Error("No Spotify token");
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) {
    clearSpotifyAuth();
    throw new Error("Spotify session expired");
  }
  return response;
}

async function fetchNowPlaying() {
  if (!spotifyTokens) return;
  try {
    const response = await spotifyApi("/me/player/currently-playing");
    if (response.status === 204) {
      if (spotifyTrackEl) spotifyTrackEl.textContent = "Nothing playing";
      if (spotifyArtistEl) spotifyArtistEl.textContent = "Start playback in Spotify";
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !data.item) return;
    spotifyLastProgressMs = data.progress_ms || 0;
    spotifyLastIsPlaying = Boolean(data.is_playing);
    spotifyDurationMs = data.item.duration_ms || 0;
    spotifyProgressAnchorTs = Date.now();
    const artUrl = data.item.album?.images?.[0]?.url || "";
    const track = data.item.name || "Unknown track";
    const artist = (data.item.artists || []).map((a) => a.name).join(", ");
    if (spotifyArtEl && artUrl) spotifyArtEl.src = artUrl;
    if (spotifyTrackEl) spotifyTrackEl.textContent = track;
    if (spotifyArtistEl) spotifyArtistEl.textContent = artist || "Unknown artist";
    if (spotifyPlayBtn) spotifyPlayBtn.textContent = spotifyLastIsPlaying ? "⏸" : "▶";
    updateSpotifyProgressUi();
  } catch {
    // keep UI stable on polling errors
  }
}

function startSpotifyPolling() {
  stopSpotifyPolling();
  fetchNowPlaying();
  spotifyPollTimer = setInterval(() => {
    updateSpotifyProgressUi();
  }, 300);
  spotifyFetchTimer = setInterval(fetchNowPlaying, 5000);
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
  const hr = Math.max(0, Math.min(99, parseInt(timerHrInput?.value || "0", 10) || 0));
  const min = Math.max(0, Math.min(59, parseInt(timerMinInput?.value || "0", 10) || 0));
  const sec = Math.max(0, Math.min(59, parseInt(timerSecInput?.value || "0", 10) || 0));
  const ms = (hr * 3600 + min * 60 + sec) * 1000;
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

[timerHrInput, timerMinInput, timerSecInput].forEach((el) => {
  if (!el) return;
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyTimerFromInputs();
  });
});

spotifyConnectBtn.addEventListener("click", async () => {
  if (spotifyTokens) {
    clearSpotifyAuth();
    return;
  }
  await spotifyAuthorize();
});

spotifyExpandBtn.addEventListener("click", () => {
  spotifyExpanded = !spotifyExpanded;
  spotifyPanelEl.classList.toggle("expanded", spotifyExpanded);
  spotifyExpandBtn.textContent = spotifyExpanded ? "collapse" : "expand";
});

spotifyPrevBtn.addEventListener("click", async () => {
  try {
    await spotifyApi("/me/player/previous", { method: "POST" });
    spotifyProgressAnchorTs = Date.now();
    setTimeout(fetchNowPlaying, 280);
  } catch {}
});

spotifyPlayBtn.addEventListener("click", async () => {
  try {
    const path = spotifyLastIsPlaying ? "/me/player/pause" : "/me/player/play";
    await spotifyApi(path, { method: "PUT" });
    spotifyLastIsPlaying = !spotifyLastIsPlaying;
    spotifyProgressAnchorTs = Date.now();
    spotifyPlayBtn.textContent = spotifyLastIsPlaying ? "⏸" : "▶";
    updateSpotifyProgressUi();
    setTimeout(fetchNowPlaying, 220);
  } catch {}
});

spotifyNextBtn.addEventListener("click", async () => {
  try {
    await spotifyApi("/me/player/next", { method: "POST" });
    spotifyProgressAnchorTs = Date.now();
    setTimeout(fetchNowPlaying, 280);
  } catch {}
});

spotifyRewindBtn.addEventListener("click", async () => {
  try {
    const rewindTo = Math.max(0, spotifyLastProgressMs - 10_000);
    await spotifyApi(`/me/player/seek?position_ms=${rewindTo}`, { method: "PUT" });
    spotifyLastProgressMs = rewindTo;
    spotifyProgressAnchorTs = Date.now();
    updateSpotifyProgressUi();
    setTimeout(fetchNowPlaying, 200);
  } catch {}
});

spotifyProgressEl.addEventListener("input", () => {
  if (spotifyDurationMs <= 0) return;
  const ratio = Number(spotifyProgressEl.value) / 1000;
  const previewMs = Math.floor(spotifyDurationMs * ratio);
  if (spotifyElapsedEl) spotifyElapsedEl.textContent = formatTrackTime(previewMs);
});

spotifyProgressEl.addEventListener("change", async () => {
  if (spotifyDurationMs <= 0) return;
  try {
    const ratio = Number(spotifyProgressEl.value) / 1000;
    const seekMs = Math.floor(spotifyDurationMs * ratio);
    await spotifyApi(`/me/player/seek?position_ms=${seekMs}`, { method: "PUT" });
    spotifyLastProgressMs = seekMs;
    spotifyProgressAnchorTs = Date.now();
    updateSpotifyProgressUi();
  } catch {}
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

setSpotifyUiDisconnected();
try {
  const storedTokens = localStorage.getItem(SPOTIFY_TOKEN_KEY);
  if (storedTokens) spotifyTokens = JSON.parse(storedTokens);
} catch {
  spotifyTokens = null;
}

handleSpotifyAuthCallback().finally(() => {
  if (spotifyTokens) {
    setSpotifyUiConnected();
    startSpotifyPolling();
  }
});
