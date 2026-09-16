const CAMERA_PREF_KEY = 'cockpid.stan.camera.enabled.v1';
const QUICK_ACTION_URL_KEY = 'cockpid.stan.quick-action-url.v1';
const MEDIAPIPE_VERSION = '1.0.1';
const DETECT_INTERVAL_MS = 220;
const FACE_HOLD_MS = 1350;
const BLINK_MIN_MS = 3200;
const BLINK_MAX_MS = 7900;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 36;
const POINTER_CANCEL_DISTANCE = 14;
const BLOCKED_QUICK_ACTION_PROTOCOLS = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:']);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const ease = (current, target, factor) => current + (target - current) * factor;

const stage = document.getElementById('stanStage');
const face = document.getElementById('stanFace');
const cameraButton = document.getElementById('cameraToggle');
const cameraState = document.getElementById('cameraState');
const cameraDot = document.getElementById('cameraDot');
const mood = document.getElementById('stanMood');
const video = document.getElementById('cameraFeed');
const speechBox = document.getElementById('stanSpeech');
const speechLabel = document.getElementById('stanSpeechLabel');
const speechTranscript = document.getElementById('stanTranscript');
const menu = document.getElementById('stanMenu');
const menuBackdrop = document.getElementById('stanMenuBackdrop');
const menuClose = document.getElementById('stanMenuClose');
const quickActionInput = document.getElementById('quickActionUrl');
const quickActionStatus = document.getElementById('quickActionStatus');
const saveQuickActionButton = document.getElementById('saveQuickAction');
const runQuickActionButton = document.getElementById('runQuickAction');
const clearQuickActionButton = document.getElementById('clearQuickAction');
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;

let quickActionMemory = '';

const state = {
  lookX: 0,
  lookY: 0,
  targetX: 0,
  targetY: 0,
  autoX: 0,
  autoY: 0,
  microX: 0,
  microY: 0,
  cameraX: 0,
  cameraY: 0,
  faceSeenAt: 0,
  hadFace: false,
  noticeUntil: 0,
  cameraEnabled: false,
  cameraReady: false,
  cameraStarting: false,
  stream: null,
  detector: null,
  detectorLoading: null,
  lastDetectAt: 0,
  autoTimer: null,
  microTimer: null,
  blinkTimer: null,
  returnTimer: null,
  blinking: false,
  lastBlinkAt: -10000,
  menuOpen: false,
  pointerId: null,
  pressStartX: 0,
  pressStartY: 0,
  pressCancelled: false,
  lastTapAt: 0,
  lastTapX: 0,
  lastTapY: 0,
  singleTapTimer: null,
  speechRecognition: null,
  speechStarting: false,
  speechListening: false,
  speechSuppressError: false,
  speechFinalText: '',
  speechInterimText: '',
  speechErrorMessage: ''
};

function setMood(text) {
  if (mood && mood.textContent !== text) mood.textContent = text;
}

function moodForMode(mode) {
  if (mode === 'found') return 'みつけた';
  if (mode === 'on' || mode === 'loading') return 'みてるよ';
  return '待ってるよ';
}

function setCameraUi(label, mode = 'idle') {
  cameraState.textContent = label;
  cameraButton.dataset.mode = mode;
  cameraButton.setAttribute('aria-pressed', state.cameraEnabled ? 'true' : 'false');
  cameraDot.dataset.mode = mode;
  if (!state.menuOpen && !state.speechStarting && !state.speechListening) {
    setMood(moodForMode(mode));
  }
}

function cameraPreference() {
  try {
    return localStorage.getItem(CAMERA_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveCameraPreference(enabled) {
  try {
    localStorage.setItem(CAMERA_PREF_KEY, String(enabled));
  } catch {
    // localStorage can be unavailable in private/restricted contexts.
  }
}

function quickActionValue() {
  try {
    const saved = localStorage.getItem(QUICK_ACTION_URL_KEY);
    if (saved) return saved;
  } catch {
    // Try session storage below.
  }

  try {
    const saved = sessionStorage.getItem(QUICK_ACTION_URL_KEY);
    if (saved) return saved;
  } catch {
    // Fall back to in-memory storage below.
  }

  return quickActionMemory;
}

function saveQuickActionValue(value) {
  const nextValue = String(value || '');
  quickActionMemory = nextValue;

  try {
    if (nextValue) {
      localStorage.setItem(QUICK_ACTION_URL_KEY, nextValue);
    } else {
      localStorage.removeItem(QUICK_ACTION_URL_KEY);
    }

    if ((localStorage.getItem(QUICK_ACTION_URL_KEY) || '') === nextValue) {
      try {
        sessionStorage.removeItem(QUICK_ACTION_URL_KEY);
      } catch {
        // Ignore cleanup failures.
      }
      return 'local';
    }
  } catch {
    // Fall back to session storage below.
  }

  try {
    if (nextValue) {
      sessionStorage.setItem(QUICK_ACTION_URL_KEY, nextValue);
    } else {
      sessionStorage.removeItem(QUICK_ACTION_URL_KEY);
    }

    if ((sessionStorage.getItem(QUICK_ACTION_URL_KEY) || '') === nextValue) {
      return 'session';
    }
  } catch {
    // Keep the value in memory for the current page.
  }

  return 'memory';
}

function normalizeQuickActionUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';

  const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  const isRelative = /^(?:\.{0,2}\/|[?#])/.test(raw);

  if (!hasExplicitScheme && !isRelative) {
    raw = `https://${raw}`;
  }

  try {
    const url = new URL(raw, window.location.href);
    if (BLOCKED_QUICK_ACTION_PROTOCOLS.has(url.protocol.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}

function syncQuickActionUi(message = '') {
  const saved = quickActionValue();
  quickActionInput.value = saved;
  runQuickActionButton.disabled = !saved;
  clearQuickActionButton.disabled = !saved;
  quickActionStatus.textContent = message || (saved ? '設定済み' : '未設定');
}

function clearPendingTap() {
  if (state.singleTapTimer) {
    window.clearTimeout(state.singleTapTimer);
    state.singleTapTimer = null;
  }
  state.lastTapAt = 0;
}

function setSpeechUi(label, text = '') {
  speechBox.hidden = false;
  speechLabel.textContent = label;
  speechTranscript.textContent = text;
}

function speechErrorMessage(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'マイクを許可してください';
  if (error === 'audio-capture') return 'マイクを使えません';
  if (error === 'network') return '音声認識に接続できません';
  if (error === 'no-speech') return '聞き取れませんでした';
  return '音声認識エラー';
}

function ensureSpeechRecognition() {
  if (!SpeechRecognitionCtor) return null;
  if (state.speechRecognition) return state.speechRecognition;

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'ja-JP';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    state.speechStarting = false;
    state.speechListening = true;
    state.speechErrorMessage = '';
    stage.classList.add('is-listening');
    setSpeechUi('聞いてる…', '');
    if (!state.menuOpen) setMood('聞いてる…');
  };

  recognition.onresult = (event) => {
    let interim = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index]?.[0]?.transcript?.trim() || '';
      if (!transcript) continue;

      if (event.results[index].isFinal) {
        state.speechFinalText = `${state.speechFinalText} ${transcript}`.trim();
      } else {
        interim = `${interim} ${transcript}`.trim();
      }
    }

    state.speechInterimText = interim;
    const displayText = [state.speechFinalText, state.speechInterimText].filter(Boolean).join(' ');
    setSpeechUi(state.speechInterimText ? '聞いてる…' : '聞いたよ', displayText);
  };

  recognition.onerror = (event) => {
    state.speechStarting = false;

    if (event.error === 'aborted' && state.speechSuppressError) return;

    const message = speechErrorMessage(event.error);
    state.speechErrorMessage = message;
    setSpeechUi(message, state.speechFinalText || state.speechInterimText);
    if (!state.menuOpen) setMood('もう一度？');
  };

  recognition.onend = () => {
    const wasSuppressed = state.speechSuppressError;
    state.speechStarting = false;
    state.speechListening = false;
    state.speechSuppressError = false;
    stage.classList.remove('is-listening');

    if (wasSuppressed || state.menuOpen) return;
    if (state.speechErrorMessage) return;

    const text = (state.speechFinalText || state.speechInterimText).trim();
    if (text) {
      setSpeechUi('聞いたよ', text);
      setMood('聞いたよ');
      window.setTimeout(() => {
        if (!state.menuOpen && !state.speechListening && !state.speechStarting) {
          setMood(moodForMode(cameraButton.dataset.mode));
        }
      }, 1200);
    } else {
      setSpeechUi('もう一度どうぞ', '');
      setMood('もう一度？');
    }
  };

  state.speechRecognition = recognition;
  return recognition;
}

function startSpeechRecognition() {
  if (!SpeechRecognitionCtor) {
    setSpeechUi('音声認識未対応', 'このブラウザではブラウザ音声認識を使えません');
    openMenu({ message: 'このブラウザでは音声認識未対応です' });
    return false;
  }

  if (state.speechStarting || state.speechListening) return true;

  const recognition = ensureSpeechRecognition();
  if (!recognition) return false;

  state.speechFinalText = '';
  state.speechInterimText = '';
  state.speechErrorMessage = '';
  state.speechSuppressError = false;
  state.speechStarting = true;
  setSpeechUi('準備中…', '');
  setMood('聞くよ');

  try {
    recognition.start();
    return true;
  } catch (error) {
    state.speechStarting = false;
    console.warn('[Stan] Speech recognition could not start:', error);
    setSpeechUi('開始できません', 'もう一度ダブルタップしてください');
    setMood('もう一度？');
    return false;
  }
}

function stopSpeechRecognition({ abort = false, silent = false } = {}) {
  const recognition = state.speechRecognition;
  if (!recognition || (!state.speechStarting && !state.speechListening)) return;

  if (silent) state.speechSuppressError = true;

  try {
    if (abort) {
      recognition.abort();
    } else {
      recognition.stop();
    }
  } catch (error) {
    console.warn('[Stan] Speech recognition could not stop:', error);
    state.speechStarting = false;
    state.speechListening = false;
    stage.classList.remove('is-listening');
  }
}

function toggleSpeechRecognition() {
  if (state.speechStarting || state.speechListening) {
    stopSpeechRecognition();
    return true;
  }

  return startSpeechRecognition();
}

function openMenu({ focusInput = false, message = '' } = {}) {
  clearPendingTap();
  stopSpeechRecognition({ abort: true, silent: true });
  state.menuOpen = true;
  stage.classList.add('is-menu-open');
  menu.setAttribute('aria-hidden', 'false');
  menuBackdrop.setAttribute('aria-hidden', 'false');
  syncQuickActionUi(message);
  setMood('どうする？');

  if (focusInput) {
    requestAnimationFrame(() => quickActionInput.focus());
  }
}

function closeMenu() {
  if (!state.menuOpen) return;
  state.menuOpen = false;
  stage.classList.remove('is-menu-open');
  menu.setAttribute('aria-hidden', 'true');
  menuBackdrop.setAttribute('aria-hidden', 'true');
  setMood(moodForMode(cameraButton.dataset.mode));
}

function saveQuickAction() {
  const normalized = normalizeQuickActionUrl(quickActionInput.value);

  if (normalized === null) {
    quickActionStatus.textContent = '有効なURL / URIを入力してください';
    return;
  }

  const storageMode = saveQuickActionValue(normalized);

  if (!normalized) {
    syncQuickActionUi('未設定にしました');
  } else if (storageMode === 'local') {
    syncQuickActionUi('保存しました');
  } else if (storageMode === 'session') {
    syncQuickActionUi('このタブ内に保存しました');
  } else {
    syncQuickActionUi('この画面内に一時保存しました');
  }
}

function clearQuickAction() {
  saveQuickActionValue('');
  syncQuickActionUi('未設定にしました');
}

function runQuickAction() {
  const normalized = normalizeQuickActionUrl(quickActionValue());

  if (!normalized) {
    openMenu({ focusInput: true, message: 'クイックアクションを設定してください' });
    return false;
  }

  setMood('いってらっしゃい');

  try {
    window.location.assign(normalized);
    return true;
  } catch (error) {
    console.warn('[Stan] Quick action could not be opened:', error);
    openMenu({ message: 'このリンクを開けませんでした' });
    return false;
  }
}

function setLookTowardPoint(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const x = clamp(((clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
  const y = clamp(((clientY - rect.top) / rect.height - 0.5) * 2, -0.65, 0.65);
  state.autoX = x * 0.58;
  state.autoY = y * 0.28;
}

function scheduleAutoLook() {
  clearTimeout(state.autoTimer);
  state.autoTimer = setTimeout(() => {
    const roll = Math.random();

    if (roll < 0.48) {
      state.autoX = randomBetween(-0.045, 0.045);
      state.autoY = randomBetween(-0.03, 0.03);
    } else if (roll < 0.90) {
      const direction = Math.random() < 0.5 ? -1 : 1;
      state.autoX = direction * randomBetween(0.18, 0.44);
      state.autoY = randomBetween(-0.08, 0.08);
    } else {
      const direction = Math.random() < 0.5 ? -1 : 1;
      state.autoX = direction * randomBetween(0.50, 0.72);
      state.autoY = randomBetween(-0.11, 0.11);
    }

    if (Math.abs(state.autoX) > 0.14 && Math.random() < 0.46) {
      const direction = Math.sign(state.autoX) || 1;
      window.setTimeout(() => {
        if (performance.now() - state.faceSeenAt > FACE_HOLD_MS) {
          state.autoX = clamp(state.autoX + direction * randomBetween(-0.035, 0.055), -0.74, 0.74);
          state.autoY = clamp(state.autoY + randomBetween(-0.025, 0.025), -0.14, 0.14);
        }
      }, randomBetween(170, 350));
    }

    if (Math.abs(state.autoX) > 0.12 && Math.random() < 0.24) {
      window.setTimeout(() => {
        if (performance.now() - state.faceSeenAt > FACE_HOLD_MS) {
          state.autoX *= 0.12;
          state.autoY *= 0.12;
        }
      }, randomBetween(850, 1500));
    }

    scheduleAutoLook();
  }, randomBetween(2100, 5200));
}

function scheduleMicroLook() {
  clearTimeout(state.microTimer);
  state.microTimer = setTimeout(() => {
    const faceIsRecent = performance.now() - state.faceSeenAt < FACE_HOLD_MS;

    if (faceIsRecent) {
      state.microX = randomBetween(-0.018, 0.018);
      state.microY = randomBetween(-0.012, 0.012);
    } else if (Math.random() < 0.44) {
      state.microX = 0;
      state.microY = 0;
    } else {
      state.microX = randomBetween(-0.038, 0.038);
      state.microY = randomBetween(-0.024, 0.024);
    }

    scheduleMicroLook();
  }, randomBetween(760, 1650));
}

function blinkOnce(duration = randomBetween(126, 156)) {
  if (state.blinking) return;

  state.blinking = true;
  state.lastBlinkAt = performance.now();
  face.style.setProperty('--blink-ms', `${Math.round(duration)}ms`);
  face.classList.add('is-blinking');

  window.setTimeout(() => {
    face.classList.remove('is-blinking');
    state.blinking = false;
  }, duration + 20);
}

function scheduleBlink() {
  clearTimeout(state.blinkTimer);
  state.blinkTimer = setTimeout(() => {
    blinkOnce();

    if (Math.random() < 0.12) {
      window.setTimeout(() => blinkOnce(randomBetween(118, 146)), randomBetween(210, 300));
    }

    scheduleBlink();
  }, randomBetween(BLINK_MIN_MS, BLINK_MAX_MS));
}

function normalizedFacePosition(detection) {
  const box = detection?.boundingBox;
  if (!box || !video.videoWidth || !video.videoHeight) return null;

  const centerX = (box.originX + box.width / 2) / video.videoWidth;
  const centerY = (box.originY + box.height / 2) / video.videoHeight;

  // User-facing camera frames behave like a non-mirrored photo. Flip X so
  // Stan looks toward the person's physical direction like a mirror would.
  let x = clamp((0.5 - centerX) * 2, -1, 1);
  let y = clamp((centerY - 0.5) * 2, -1, 1);

  const deadZoneX = 0.07;
  const deadZoneY = 0.09;
  if (Math.abs(x) < deadZoneX) x = 0;
  if (Math.abs(y) < deadZoneY) y = 0;

  x = Math.sign(x) * Math.max(0, (Math.abs(x) - deadZoneX) / (1 - deadZoneX));
  y = Math.sign(y) * Math.max(0, (Math.abs(y) - deadZoneY) / (1 - deadZoneY));

  return { x: clamp(x, -0.95, 0.95), y: clamp(y, -0.65, 0.65), area: box.width * box.height };
}

function choosePrimaryFace(detections) {
  let selected = null;
  let selectedArea = -1;

  for (const detection of detections || []) {
    const point = normalizedFacePosition(detection);
    if (!point) continue;
    if (point.area > selectedArea) {
      selected = point;
      selectedArea = point.area;
    }
  }

  return selected;
}

async function loadDetector() {
  if (state.detector) return state.detector;
  if (state.detectorLoading) return state.detectorLoading;

  state.detectorLoading = (async () => {
    const module = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`);
    const vision = await module.FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
    );
    const detector = await module.FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.55,
      minSuppressionThreshold: 0.3
    });
    state.detector = detector;
    return detector;
  })();

  try {
    return await state.detectorLoading;
  } finally {
    state.detectorLoading = null;
  }
}

async function startCamera() {
  if (state.cameraStarting || state.cameraReady) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraUi('CAM · UNSUPPORTED', 'error');
    state.cameraEnabled = false;
    saveCameraPreference(false);
    return;
  }

  state.cameraStarting = true;
  state.cameraEnabled = true;
  saveCameraPreference(true);
  setCameraUi('CAM · STARTING', 'loading');

  try {
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 24 }
        },
        audio: false
      }),
      loadDetector()
    ]);

    if (!state.cameraEnabled) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    state.cameraReady = true;
    state.lastDetectAt = 0;
    setCameraUi('CAM · LOOKING', 'on');
  } catch (error) {
    console.warn('[Stan] Camera unavailable:', error);
    stopCamera({ preservePreference: false });
    setCameraUi(error?.name === 'NotAllowedError' ? 'CAM · DENIED' : 'CAM · OFFLINE', 'error');
  } finally {
    state.cameraStarting = false;
  }
}

function stopCamera({ preservePreference = false } = {}) {
  state.cameraEnabled = false;
  state.cameraReady = false;
  state.faceSeenAt = 0;
  state.hadFace = false;
  state.noticeUntil = 0;
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  if (video.srcObject) video.srcObject = null;
  if (!preservePreference) saveCameraPreference(false);
  setCameraUi('CAM · OFF', 'idle');
}

function toggleCamera() {
  if (state.cameraEnabled || state.cameraStarting) {
    stopCamera();
  } else {
    startCamera();
  }
}

function detectFace(now) {
  if (!state.cameraReady || !state.detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  if (now - state.lastDetectAt < DETECT_INTERVAL_MS) return;
  state.lastDetectAt = now;

  try {
    const result = state.detector.detectForVideo(video, now);
    const point = choosePrimaryFace(result?.detections);
    if (!point) return;

    const wasRecent = state.faceSeenAt > 0 && now - state.faceSeenAt < FACE_HOLD_MS;
    state.faceSeenAt = now;
    state.cameraX = ease(state.cameraX, point.x, wasRecent ? 0.36 : 0.58);
    state.cameraY = ease(state.cameraY, point.y, wasRecent ? 0.30 : 0.48);

    if (!wasRecent) {
      state.noticeUntil = now + 650;
      state.microX = 0;
      state.microY = 0;

      if (now - state.lastBlinkAt > 1400 && Math.random() < 0.42) {
        window.setTimeout(() => blinkOnce(randomBetween(122, 148)), randomBetween(150, 250));
      }
    }

    if (cameraButton.dataset.mode !== 'found') setCameraUi('CAM · FOUND YOU', 'found');
  } catch (error) {
    console.warn('[Stan] Face detection failed:', error);
  }
}

function render(now) {
  detectFace(now);

  const hasFace = state.cameraEnabled && state.faceSeenAt > 0 && now - state.faceSeenAt < FACE_HOLD_MS;

  if (state.cameraEnabled && state.cameraReady && !hasFace && cameraButton.dataset.mode === 'found') {
    setCameraUi('CAM · LOOKING', 'on');
  }

  if (hasFace && !state.hadFace) {
    state.hadFace = true;
    clearTimeout(state.returnTimer);
  } else if (!hasFace && state.hadFace) {
    state.hadFace = false;
    state.autoX = clamp(state.lookX * 0.58, -0.42, 0.42);
    state.autoY = clamp(state.lookY * 0.50, -0.18, 0.18);
    clearTimeout(state.returnTimer);
    state.returnTimer = window.setTimeout(() => {
      if (performance.now() - state.faceSeenAt > FACE_HOLD_MS) {
        state.autoX *= 0.18;
        state.autoY *= 0.18;
      }
    }, randomBetween(720, 1150));
  }

  if (hasFace) {
    state.targetX = state.cameraX * 0.76 + state.microX * 0.15;
    state.targetY = state.cameraY * 0.43 + state.microY * 0.15;
  } else {
    state.targetX = state.autoX + state.microX;
    state.targetY = state.autoY + state.microY;
  }

  const factor = now < state.noticeUntil ? 0.17 : hasFace ? 0.10 : 0.055;
  state.lookX = ease(state.lookX, state.targetX, factor);
  state.lookY = ease(state.lookY, state.targetY, factor);

  const pupilX = Math.round(clamp(state.lookX, -1, 1) * 7);
  const pupilY = Math.round(clamp(state.lookY, -0.75, 0.75) * 4);
  face.style.setProperty('--pupil-x', `${pupilX}px`);
  face.style.setProperty('--pupil-y', `${pupilY}px`);
  face.classList.toggle('is-aware', hasFace);

  requestAnimationFrame(render);
}

function resetPressState() {
  state.pointerId = null;
  state.pressCancelled = false;
}

function beginStagePress(event) {
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest('.stan-control, .stan-menu, .stan-menu-backdrop')) return;
  if (state.menuOpen) return;

  state.pointerId = event.pointerId;
  state.pressStartX = event.clientX;
  state.pressStartY = event.clientY;
  state.pressCancelled = false;
  setLookTowardPoint(event.clientX, event.clientY);
}

function moveStagePress(event) {
  if (state.pointerId !== event.pointerId) return;
  const distance = Math.hypot(event.clientX - state.pressStartX, event.clientY - state.pressStartY);

  if (distance > POINTER_CANCEL_DISTANCE) {
    state.pressCancelled = true;
  }
}

function endStagePress(event) {
  if (state.pointerId !== event.pointerId) return;

  const wasCancelled = state.pressCancelled;
  resetPressState();

  if (wasCancelled || state.menuOpen) return;

  setLookTowardPoint(event.clientX, event.clientY);
  const now = performance.now();
  const timeSinceLastTap = now - state.lastTapAt;
  const distanceFromLastTap = Math.hypot(event.clientX - state.lastTapX, event.clientY - state.lastTapY);
  const isDoubleTap = state.lastTapAt > 0
    && timeSinceLastTap <= DOUBLE_TAP_MS
    && distanceFromLastTap <= DOUBLE_TAP_DISTANCE;

  if (isDoubleTap) {
    clearPendingTap();
    toggleSpeechRecognition();
    return;
  }

  if (state.singleTapTimer) {
    window.clearTimeout(state.singleTapTimer);
    state.singleTapTimer = null;
  }

  state.lastTapAt = now;
  state.lastTapX = event.clientX;
  state.lastTapY = event.clientY;
  const tapAt = now;
  state.singleTapTimer = window.setTimeout(() => {
    if (state.lastTapAt !== tapAt) return;
    state.singleTapTimer = null;
    state.lastTapAt = 0;
    openMenu();
  }, DOUBLE_TAP_MS);
}

cameraButton.addEventListener('click', toggleCamera);
menuClose.addEventListener('click', closeMenu);
menuBackdrop.addEventListener('click', closeMenu);
saveQuickActionButton.addEventListener('click', saveQuickAction);
clearQuickActionButton.addEventListener('click', clearQuickAction);
runQuickActionButton.addEventListener('click', runQuickAction);
quickActionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveQuickAction();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu();
  }
});

stage.addEventListener('pointerdown', beginStagePress);
stage.addEventListener('pointermove', moveStagePress);
stage.addEventListener('pointerup', endStagePress);
stage.addEventListener('pointercancel', resetPressState);
stage.addEventListener('dblclick', (event) => {
  if (!event.target.closest('.stan-control, .stan-menu')) event.preventDefault();
});
stage.addEventListener('contextmenu', (event) => {
  if (!event.target.closest('.stan-control, .stan-menu')) event.preventDefault();
});

window.addEventListener('pagehide', () => {
  clearPendingTap();
  stopSpeechRecognition({ abort: true, silent: true });
  stopCamera({ preservePreference: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearPendingTap();
    stopSpeechRecognition({ abort: true, silent: true });
    state.stream?.getVideoTracks().forEach((track) => { track.enabled = false; });
  } else if (state.cameraEnabled && state.stream) {
    state.stream.getVideoTracks().forEach((track) => { track.enabled = true; });
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.menuOpen) closeMenu();
});

syncQuickActionUi();
scheduleAutoLook();
scheduleMicroLook();
scheduleBlink();
requestAnimationFrame(render);

if (cameraPreference()) {
  window.setTimeout(startCamera, 450);
} else {
  setCameraUi('CAM · OFF', 'idle');
}