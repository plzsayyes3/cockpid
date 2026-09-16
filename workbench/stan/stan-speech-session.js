(() => {
  'use strict';

  const SESSION_MS = 180_000;
  const RESTART_DELAY_MS = 140;
  const NativeSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!NativeSpeechRecognition) return;

  const stage = document.getElementById('stanStage');
  let recordingHud = null;
  let recordingCountdown = null;
  let recordingLabel = null;
  let activeInstance = null;

  function ensureRecordingHud() {
    if (recordingHud || !stage) return;

    recordingHud = document.createElement('div');
    recordingHud.className = 'stan-recording-hud';
    recordingHud.setAttribute('aria-hidden', 'true');
    recordingHud.innerHTML = `
      <span class="stan-recording-state"><span class="stan-recording-dot"></span><span class="stan-recording-label">REC</span></span>
      <span class="stan-recording-countdown">03:00</span>
    `;
    stage.appendChild(recordingHud);
    recordingCountdown = recordingHud.querySelector('.stan-recording-countdown');
    recordingLabel = recordingHud.querySelector('.stan-recording-label');
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
    recordingHud.classList.remove('is-paused');
    if (recordingLabel) recordingLabel.textContent = 'REC';
    updateRecordingHud(remainingMs);
  }

  function setRecordingPaused(paused) {
    if (!recordingHud) return;
    recordingHud.classList.toggle('is-paused', paused);
    if (recordingLabel) recordingLabel.textContent = paused ? 'PAUSE' : 'REC';
  }

  function updateRecordingHud(remainingMs) {
    if (!recordingHud) return;
    const remaining = Math.max(0, Math.min(SESSION_MS, remainingMs));
    if (recordingCountdown) recordingCountdown.textContent = formatRemaining(remaining);
    recordingHud.classList.toggle('is-urgent', remaining <= 15_000);
  }

  function hideRecordingHud() {
    if (!recordingHud) return;
    recordingHud.classList.remove('is-active', 'is-urgent', 'is-paused');
    if (recordingLabel) recordingLabel.textContent = 'REC';
    updateRecordingHud(SESSION_MS);
  }

  class StanSpeechRecognition {
    constructor() {
      this._native = new NativeSpeechRecognition();
      this._sessionActive = false;
      this._nativeActive = false;
      this._nativeStarting = false;
      this._ending = false;
      this._paused = false;
      this._reportedStart = false;
      this._endReported = false;
      this._deadline = 0;
      this._remainingMs = SESSION_MS;
      this._finishReason = '';
      this._restartTimer = null;
      this._hudFrame = null;

      this.onstart = null;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;

      activeInstance = this;

      this._native.onstart = (event) => {
        this._nativeStarting = false;
        this._nativeActive = true;

        if (this._paused) {
          try {
            this._native.stop();
          } catch {
            // Pause state wins even if the native engine was still starting.
          }
          return;
        }

        if (!this._reportedStart) {
          this._reportedStart = true;
          this.onstart?.(event);
        }
      };

      this._native.onresult = (event) => {
        this.onresult?.(event);
      };

      this._native.onerror = (event) => {
        this._nativeStarting = false;

        if (this._paused) return;

        const canRecover = this._sessionActive
          && !this._ending
          && performance.now() < this._deadline
          && event.error === 'no-speech';

        if (canRecover) return;

        if (!(event.error === 'aborted' && this._ending)) {
          this._finishReason = 'error';
          this._sessionActive = false;
          this._ending = true;
        }
        this.onerror?.(event);
      };

      this._native.onend = (event) => {
        this._nativeStarting = false;
        this._nativeActive = false;

        if (this._paused && this._sessionActive && !this._ending) return;

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

    get sessionActive() { return this._sessionActive && !this._endReported; }
    get paused() { return this._paused; }

    start() {
      if (this._sessionActive || this._nativeActive || this._nativeStarting) {
        throw new DOMException('Speech recognition has already started.', 'InvalidStateError');
      }

      this._sessionActive = true;
      this._ending = false;
      this._paused = false;
      this._reportedStart = false;
      this._endReported = false;
      this._remainingMs = SESSION_MS;
      this._deadline = performance.now() + this._remainingMs;
      this._finishReason = '';
      clearTimeout(this._restartTimer);
      showRecordingHud(this._remainingMs);
      this._tickHud();

      try {
        this._startNative();
      } catch (error) {
        this._sessionActive = false;
        this._ending = true;
        this._stopHud();
        throw error;
      }
    }

    pause() {
      if (!this._sessionActive || this._ending || this._paused) return false;

      this._remainingMs = Math.max(0, this._deadline - performance.now());
      this._paused = true;
      clearTimeout(this._restartTimer);
      cancelAnimationFrame(this._hudFrame);
      this._hudFrame = null;
      updateRecordingHud(this._remainingMs);
      setRecordingPaused(true);

      if (this._nativeActive || this._nativeStarting) {
        try {
          this._native.stop();
        } catch {
          // The session remains paused even if the native engine already stopped.
        }
      }

      window.dispatchEvent(new CustomEvent('stan:speech-pause'));
      return true;
    }

    resume() {
      if (!this._sessionActive || this._ending || !this._paused) return false;
      if (this._remainingMs <= 0) {
        this._expire();
        return false;
      }

      this._paused = false;
      this._deadline = performance.now() + this._remainingMs;
      setRecordingPaused(false);
      this._tickHud();

      try {
        if (!this._nativeActive && !this._nativeStarting) this._startNative();
      } catch (error) {
        this._paused = true;
        this._remainingMs = Math.max(0, this._deadline - performance.now());
        cancelAnimationFrame(this._hudFrame);
        this._hudFrame = null;
        setRecordingPaused(true);
        throw error;
      }

      window.dispatchEvent(new CustomEvent('stan:speech-resume'));
      return true;
    }

    stop() {
      if (this._endReported) return;
      this._finishReason = 'stop';
      this._sessionActive = false;
      this._ending = true;
      this._paused = false;
      clearTimeout(this._restartTimer);

      if (this._nativeActive || this._nativeStarting) {
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
      this._finishReason = 'abort';
      this._sessionActive = false;
      this._ending = true;
      this._paused = false;
      clearTimeout(this._restartTimer);

      if (this._nativeActive || this._nativeStarting) {
        try {
          this._native.abort();
        } catch {
          this._finalize(new Event('end'));
        }
      } else {
        this._finalize(new Event('end'));
      }
    }

    _startNative() {
      this._nativeStarting = true;
      try {
        this._native.start();
      } catch (error) {
        this._nativeStarting = false;
        throw error;
      }
    }

    _scheduleRestart() {
      clearTimeout(this._restartTimer);
      this._restartTimer = window.setTimeout(() => {
        if (!this._sessionActive || this._ending || this._paused) return;
        if (performance.now() >= this._deadline) {
          this._expire();
          return;
        }

        try {
          this._startNative();
        } catch (error) {
          console.warn('[Stan] Speech session restart failed:', error);
          this._restartTimer = window.setTimeout(() => this._scheduleRestart(), RESTART_DELAY_MS * 2);
        }
      }, RESTART_DELAY_MS);
    }

    _tickHud() {
      cancelAnimationFrame(this._hudFrame);

      const tick = () => {
        if (!this._sessionActive || this._ending || this._paused) return;
        const remaining = this._deadline - performance.now();
        this._remainingMs = Math.max(0, remaining);
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
      this._finishReason = 'timeout';
      this._sessionActive = false;
      this._ending = true;
      this._paused = false;
      this._remainingMs = 0;
      clearTimeout(this._restartTimer);
      updateRecordingHud(0);

      if (this._nativeActive || this._nativeStarting) {
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
      const reason = this._finishReason || 'end';
      this._endReported = true;
      this._sessionActive = false;
      this._nativeActive = false;
      this._nativeStarting = false;
      this._ending = false;
      this._paused = false;
      clearTimeout(this._restartTimer);
      this._stopHud();
      this.onend?.(event);

      if (reason === 'stop' || reason === 'timeout') {
        queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent('stan:speech-complete', { detail: { reason } }));
        });
      }
    }
  }

  window.StanSpeechSession = {
    get active() {
      return Boolean(activeInstance?.sessionActive);
    },
    get paused() {
      return Boolean(activeInstance?.paused);
    },
    pause() {
      return activeInstance?.pause() || false;
    },
    resume() {
      return activeInstance?.resume() || false;
    },
    stop() {
      if (!activeInstance?.sessionActive) return false;
      activeInstance.stop();
      return true;
    }
  };

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