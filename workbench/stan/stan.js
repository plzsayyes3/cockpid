const CAMERA_PREF_KEY = 'cockpid.stan.camera.enabled.v1';
const MEDIAPIPE_VERSION = '1.0.1';
const DETECT_INTERVAL_MS = 220;
const FACE_HOLD_MS = 1200;
const BLINK_MS = 160;

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
  cameraX: 0,
  cameraY: 0,
  faceSeenAt: 0,
  cameraEnabled: false,
  cameraReady: false,
  cameraStarting: false,
  stream: null,
  detector: null,
  detectorLoading: null,
  lastDetectAt: 0,
  autoTimer: null,
  blinkTimer: null,
  aliveStartedAt: performance.now()
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
  const delay = randomBetween(1900, 4800);
  state.autoTimer = setTimeout(() => {
    const returnNearCenter = Math.random() < 0.36;

    if (returnNearCenter) {
      state.autoX = randomBetween(-0.045, 0.045);
      state.autoY = randomBetween(-0.025, 0.025);
    } else {
      const biggerMove = Math.random() < 0.16;
      const spreadX = biggerMove ? 0.66 : 0.28;
      const spreadY = biggerMove ? 0.20 : 0.11;
      state.autoX = randomBetween(-spreadX, spreadX);
      state.autoY = randomBetween(-spreadY, spreadY);

      if (biggerMove && Math.random() < 0.55) {
        const direction = Math.sign(state.autoX) || 1;
        window.setTimeout(() => {
          if (performance.now() - state.faceSeenAt > FACE_HOLD_MS) {
            state.autoX = clamp(state.autoX + direction * randomBetween(-0.04, 0.07), -0.72, 0.72);
            state.autoY = clamp(state.autoY + randomBetween(-0.025, 0.025), -0.22, 0.22);
          }
        }, randomBetween(180, 330));
      }
    }

    if (Math.random() < 0.15) {
      window.setTimeout(() => {
        if (performance.now() - state.faceSeenAt > FACE_HOLD_MS) {
          state.autoX *= 0.16;
          state.autoY *= 0.16;
        }
      }, randomBetween(760, 1400));
    }

    scheduleAutoLook();
  }, delay);
}

function blinkOnce() {
  face.classList.add('is-blinking');
  window.setTimeout(() => face.classList.remove('is-blinking'), BLINK_MS);
}

function scheduleBlink() {
  clearTimeout(state.blinkTimer);
  state.blinkTimer = setTimeout(() => {
    blinkOnce();
    if (Math.random() < 0.1) {
      window.setTimeout(blinkOnce, randomBetween(190, 275));
    }
    scheduleBlink();
  }, randomBetween(2800, 7200));
}

function normalizedFacePosition(detection) {
  const box = detection?.boundingBox;
  if (!box || !video.videoWidth || !video.videoHeight) return null;

  const centerX = (box.originX + box.width / 2) / video.videoWidth;
  const centerY = (box.originY + box.height / 2) / video.videoHeight;
  let x = clamp((centerX - 0.5) * 2, -1, 1);
  let y = clamp((centerY - 0.5) * 2, -1, 1);

  const deadZoneX = 0.065;
  const deadZoneY = 0.08;
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

    state.faceSeenAt = now;
    state.cameraX = ease(state.cameraX, point.x, 0.38);
    state.cameraY = ease(state.cameraY, point.y, 0.32);
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

  const lifeSeconds = (now - state.aliveStartedAt) / 1000;
  const microX = Math.sin(lifeSeconds * 0.73) * 0.011 + Math.sin(lifeSeconds * 1.57) * 0.006;
  const microY = Math.cos(lifeSeconds * 0.53) * 0.007;

  if (hasFace) {
    state.targetX = state.cameraX * 0.92 + microX * 0.16;
    state.targetY = state.cameraY * 0.62 + microY * 0.16;
  } else {
    state.targetX = state.autoX + microX;
    state.targetY = state.autoY + microY;
  }

  const factor = hasFace ? 0.10 : 0.052;
  state.lookX = ease(state.lookX, state.targetX, factor);
  state.lookY = ease(state.lookY, state.targetY, factor);

  face.style.setProperty('--pupil-x', `${(state.lookX * 95).toFixed(2)}%`);
  face.style.setProperty('--pupil-y', `${(state.lookY * 58).toFixed(2)}%`);
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
  state.autoX = x * 0.68;
  state.autoY = y * 0.34;
  setMood('ん？');
  window.setTimeout(() => {
    if (performance.now() - state.faceSeenAt > FACE_HOLD_MS) {
      state.autoX *= 0.18;
      state.autoY *= 0.18;
    }
    setMood(moodForMode(cameraButton.dataset.mode));
  }, 850);
});

scheduleAutoLook();
scheduleBlink();
requestAnimationFrame(render);

if (cameraPreference()) {
  window.setTimeout(startCamera, 450);
} else {
  setCameraUi('CAM · OFF', 'idle');
}