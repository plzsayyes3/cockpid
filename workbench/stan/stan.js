const CAMERA_PREF_KEY = 'cockpid.stan.camera.enabled.v1';
const MEDIAPIPE_VERSION = '1.0.1';
const DETECT_INTERVAL_MS = 220;
const FACE_HOLD_MS = 1350;
const BLINK_MIN_MS = 3200;
const BLINK_MAX_MS = 7900;

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
  lastBlinkAt: -10000
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
  setMood(moodForMode(mode));
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

cameraButton.addEventListener('click', toggleCamera);
window.addEventListener('pagehide', () => stopCamera({ preservePreference: true }));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.stream?.getVideoTracks().forEach((track) => { track.enabled = false; });
  } else if (state.cameraEnabled && state.stream) {
    state.stream.getVideoTracks().forEach((track) => { track.enabled = true; });
  }
});

stage.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.stan-control')) return;

  const rect = stage.getBoundingClientRect();
  const x = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
  const y = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -0.65, 0.65);
  state.autoX = x * 0.58;
  state.autoY = y * 0.28;
  setMood('ん？');

  window.setTimeout(() => {
    if (performance.now() - state.faceSeenAt > FACE_HOLD_MS) {
      state.autoX *= 0.16;
      state.autoY *= 0.16;
    }
    setMood(moodForMode(cameraButton.dataset.mode));
  }, 900);
});

scheduleAutoLook();
scheduleMicroLook();
scheduleBlink();
requestAnimationFrame(render);

if (cameraPreference()) {
  window.setTimeout(startCamera, 450);
} else {
  setCameraUi('CAM · OFF', 'idle');
}
