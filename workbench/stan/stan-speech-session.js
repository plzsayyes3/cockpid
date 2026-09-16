(() => {
  'use strict';

  const SESSION_MS = 180_000;
  const RESTART_DELAY_MS = 140;
  const NativeSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!NativeSpeechRecognition) return;

  const stage = document.getElementById('stanStage');
  let recordingHud = null;
  let recordingCountdown = null;

  function ensureRecordingHud() {
    if (recordingHud || !stage) return;

    recordingHud = document.createElement('div');
    recordingHud.className = 'stan-recording-hud';
    recordingHud.setAttribute('aria-hidden', 'true');
    recordingHud.innerHTML = `
      <span class="stan-recording-state"><span class="stan-recording-dot"></span>REC</span>
      <span class="stan-recording-countdown">03:00</span>
    `;
    stage.appendChild(recordingHud);
    recordingCountdown = recordingHud.querySelector('.stan-recording-countdown');
  }

  function formatRemaining(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function showRecordingHud(remainingMs = SESSION_MS) {
    ensureRecordingHud();
    if (!recordingHud) return;
    recordingHud.classList.add('is-active');
    updateRecordingHud(remainingMs);
  }

  function updateRecordingHud(remainingMs) {
    if (!recordingHud) return;
    const remaining = Math.max(0, Math.min(SESSION_MS, remainingMs));
    if (recordingCountdown) recordingCountdown.textContent = formatRemaining(remaining);
    recordingHud.classList.toggle('is-urgent', remaining <= 15_000);
  }

  function hideRecordingHud() {
    if (!recordingHud) return;
    recordingHud.classList.remove('is-active', 'is-urgent');
    updateRecordingHud(SESSION_MS);
  }

  class StanSpeechRecognition {
    constructor() {
      this._native = new NativeSpeechRecognition();
      this._sessionActive = false;
      this._nativeActive = false;
      this._ending = false;
      this._reportedStart = false;
      this._endReported = false;
      this._deadline = 0;
      this._restartTimer = null;
      this._hudFrame = null;

      this.onstart = null;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;

      this._native.onstart = (event) => {
        this._nativeActive = true;
        if (!this._reportedStart) {
          this._reportedStart = true;
          this.onstart?.(event);
        }
      };

      this._native.onresult = (event) => {
        this.onresult?.(event);
      };

      this._native.onerror = (event) => {
        const canRecover = this._sessionActive
          && !this._ending
          && performance.now() < this._deadline
          && event.error === 'no-speech';

        if (canRecover) return;

        if (!(event.error === 'aborted' && this._ending)) {
          this._sessionActive = false;
          this._ending = true;
        }
        this.onerror?.(event);
      };

      this._native.onend = (event) => {
        this._nativeActive = false;

        if (this._sessionActive && !this._ending && performance.now() < this._deadline) {
          this._scheduleRestart();
          return;
        }

        this._finalize(event);
      };
    }

    get lang() { return this._native.lang; }
    set lang(value) { this._native.lang = value; }

    get interimResults() { return this._native.interimResults; }
    set interimResults(value) { this._native.interimResults = value; }

    get continuous() { return this._native.continuous; }
    set continuous(value) { this._native.continuous = value; }

    get maxAlternatives() { return this._native.maxAlternatives; }
    set maxAlternatives(value) { this._native.maxAlternatives = value; }

    start() {
      if (this._sessionActive || this._nativeActive) {
        throw new DOMException('Speech recognition has already started.', 'InvalidStateError');
      }

      this._sessionActive = true;
      this._ending = false;
      this._reportedStart = false;
      this._endReported = false;
      this._deadline = performance.now() + SESSION_MS;
      clearTimeout(this._restartTimer);
      showRecordingHud(SESSION_MS);
      this._tickHud();

      try {
        this._native.start();
      } catch (error) {
        this._sessionActive = false;
        this._ending = true;
        this._stopHud();
        throw error;
      }
    }

    stop() {
      if (this._endReported) return;
      this._sessionActive = false;
      this._ending = true;
      clearTimeout(this._restartTimer);

      if (this._nativeActive) {
        try {
          this._native.stop();
        } catch {
          this._finalize(new Event('end'));
        }
      } else {
        this._finalize(new Event('end'));
      }
    }

    abort() {
      if (this._endReported) return;
      this._sessionActive = false;
      this._ending = true;
      clearTimeout(this._restartTimer);

      if (this._nativeActive) {
        try {
          this._native.abort();
        } catch {
          this._finalize(new Event('end'));
        }
      } else {
        this._finalize(new Event('end'));
      }
    }

    _scheduleRestart() {
      clearTimeout(this._restartTimer);
      this._restartTimer = window.setTimeout(() => {
        if (!this._sessionActive || this._ending) return;
        if (performance.now() >= this._deadline) {
          this._expire();
          return;
        }

        try {
          this._native.start();
        } catch (error) {
          console.warn('[Stan] Speech session restart failed:', error);
          this._restartTimer = window.setTimeout(() => this._scheduleRestart(), RESTART_DELAY_MS * 2);
        }
      }, RESTART_DELAY_MS);
    }

    _tickHud() {
      cancelAnimationFrame(this._hudFrame);

      const tick = () => {
        if (!this._sessionActive || this._ending) return;
        const remaining = this._deadline - performance.now();
        updateRecordingHud(remaining);

        if (remaining <= 0) {
          this._expire();
          return;
        }

        this._hudFrame = requestAnimationFrame(tick);
      };

      this._hudFrame = requestAnimationFrame(tick);
    }

    _expire() {
      if (this._endReported || this._ending) return;
      this._sessionActive = false;
      this._ending = true;
      clearTimeout(this._restartTimer);
      updateRecordingHud(0);

      if (this._nativeActive) {
        try {
          this._native.stop();
        } catch {
          this._finalize(new Event('end'));
        }
      } else {
        this._finalize(new Event('end'));
      }
    }

    _stopHud() {
      cancelAnimationFrame(this._hudFrame);
      this._hudFrame = null;
      hideRecordingHud();
    }

    _finalize(event) {
      if (this._endReported) return;
      this._endReported = true;
      this._sessionActive = false;
      this._nativeActive = false;
      this._ending = false;
      clearTimeout(this._restartTimer);
      this._stopHud();
      this.onend?.(event);
    }
  }

  try {
    window.SpeechRecognition = StanSpeechRecognition;
  } catch {
    // Some engines expose only the prefixed constructor.
  }

  try {
    window.webkitSpeechRecognition = StanSpeechRecognition;
  } catch {
    // Ignore read-only constructor aliases.
  }
})();