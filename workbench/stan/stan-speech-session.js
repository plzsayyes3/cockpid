(() => {
  'use strict';

  const SESSION_MS = 60_000;
  const RESTART_DELAY_MS = 140;
  const NativeSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!NativeSpeechRecognition) return;

  const face = document.getElementById('stanFace');
  let meter = null;
  let meterProgress = null;
  let meterSeconds = null;

  function ensureMeter() {
    if (meter || !face) return;

    const style = document.createElement('style');
    style.textContent = `
      .stan-face { position: relative; }
      .stan-face > .eye { z-index: 1; }
      .stan-listen-meter {
        position: absolute;
        inset: -20px -24px;
        z-index: 0;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease;
      }
      .stan-listen-meter.is-active { opacity: 1; }
      .stan-listen-meter svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .stan-listen-meter-track,
      .stan-listen-meter-progress {
        fill: none;
        vector-effect: non-scaling-stroke;
        stroke-width: 1.5px;
      }
      .stan-listen-meter-track {
        stroke: rgba(190, 226, 242, .08);
      }
      .stan-listen-meter-progress {
        stroke: rgba(202, 239, 252, .46);
        stroke-dasharray: 100;
        stroke-dashoffset: var(--stan-meter-offset, 0);
        stroke-linecap: round;
      }
      .stan-listen-seconds {
        position: absolute;
        top: -10px;
        right: -2px;
        min-width: 2.4em;
        color: rgba(202, 228, 240, .46);
        font-size: 8px;
        line-height: 1;
        letter-spacing: .08em;
        text-align: right;
      }
      .stan-listen-meter.is-urgent .stan-listen-meter-progress {
        stroke: rgba(225, 247, 255, .72);
      }
      .stan-listen-meter.is-urgent .stan-listen-seconds {
        color: rgba(225, 247, 255, .68);
      }
      @media (max-width: 600px) and (orientation: portrait) {
        .stan-listen-meter { inset: -18px -20px; }
        .stan-listen-seconds { top: -9px; right: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .stan-listen-meter { transition: none; }
      }
    `;
    document.head.appendChild(style);

    meter = document.createElement('div');
    meter.className = 'stan-listen-meter';
    meter.setAttribute('aria-hidden', 'true');
    meter.innerHTML = `
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect class="stan-listen-meter-track" x="2" y="2" width="96" height="96" rx="18" ry="18" pathLength="100"></rect>
        <rect class="stan-listen-meter-progress" x="2" y="2" width="96" height="96" rx="18" ry="18" pathLength="100"></rect>
      </svg>
      <span class="stan-listen-seconds">60</span>
    `;
    face.insertBefore(meter, face.firstChild);
    meterProgress = meter.querySelector('.stan-listen-meter-progress');
    meterSeconds = meter.querySelector('.stan-listen-seconds');
  }

  function showMeter(remainingMs = SESSION_MS) {
    ensureMeter();
    if (!meter) return;
    meter.classList.add('is-active');
    updateMeter(remainingMs);
  }

  function updateMeter(remainingMs) {
    if (!meter) return;
    const remaining = Math.max(0, Math.min(SESSION_MS, remainingMs));
    const elapsedRatio = 1 - remaining / SESSION_MS;
    const offset = Math.max(0, Math.min(100, elapsedRatio * 100));
    meter.style.setProperty('--stan-meter-offset', offset.toFixed(3));
    if (meterProgress) meterProgress.style.strokeDashoffset = offset.toFixed(3);
    if (meterSeconds) meterSeconds.textContent = String(Math.max(0, Math.ceil(remaining / 1000)));
    meter.classList.toggle('is-urgent', remaining <= 10_000);
  }

  function hideMeter() {
    if (!meter) return;
    meter.classList.remove('is-active', 'is-urgent');
    updateMeter(SESSION_MS);
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
      this._meterFrame = null;

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
      showMeter(SESSION_MS);
      this._tickMeter();

      try {
        this._native.start();
      } catch (error) {
        this._sessionActive = false;
        this._ending = true;
        this._stopMeter();
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

    _tickMeter() {
      cancelAnimationFrame(this._meterFrame);

      const tick = () => {
        if (!this._sessionActive || this._ending) return;
        const remaining = this._deadline - performance.now();
        updateMeter(remaining);

        if (remaining <= 0) {
          this._expire();
          return;
        }

        this._meterFrame = requestAnimationFrame(tick);
      };

      this._meterFrame = requestAnimationFrame(tick);
    }

    _expire() {
      if (this._endReported || this._ending) return;
      this._sessionActive = false;
      this._ending = true;
      clearTimeout(this._restartTimer);
      updateMeter(0);

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

    _stopMeter() {
      cancelAnimationFrame(this._meterFrame);
      this._meterFrame = null;
      hideMeter();
    }

    _finalize(event) {
      if (this._endReported) return;
      this._endReported = true;
      this._sessionActive = false;
      this._nativeActive = false;
      this._ending = false;
      clearTimeout(this._restartTimer);
      this._stopMeter();
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