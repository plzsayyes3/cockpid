const stage = document.getElementById('stanStage');
const radyPet = document.getElementById('radyPet');
const radySprite = radyPet?.querySelector('img');
const mood = document.getElementById('stanMood');

if (stage && radyPet && radySprite) {
  const pageParams = new URLSearchParams(window.location.search);
  const imageVersion =
    pageParams.get('_stan_update') ||
    pageParams.get('_stan_refresh') ||
    Date.now().toString(36);
  const frameUrl = (name) =>
    new URL(`../assets/rady/pixel/${name}?v=${encodeURIComponent(imageVersion)}`, import.meta.url).href;
  const FRAMES = Object.freeze({
    idle: frameUrl('rady_idle_01.png'),
    blink: frameUrl('rady_idle_02.png'),
    walk1: frameUrl('rady_walk_01.png'),
    walk2: frameUrl('rady_walk_02.png')
  });

  const SLEEP_START_HOUR = 23;
  const WAKE_HOUR = 6;
  const LIFE_CHECK_MS = 60 * 1000;

  for (const src of Object.values(FRAMES)) {
    const preload = new Image();
    preload.src = src;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let state = 'awake';
  let blinkTimer = 0;
  let walkTimer = 0;
  let stepTimer = 0;
  let playTimer = 0;
  let autoPlayTimer = 0;
  let lifeTimer = 0;
  let currentX = 0;
  let facing = 1;
  let walking = false;

  const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));

  function isRadyActive() {
    return stage.dataset.character === 'rady' && !document.hidden;
  }

  function isSleepTime(date = new Date()) {
    const hour = date.getHours();
    return hour >= SLEEP_START_HOUR || hour < WAKE_HOUR;
  }

  function setFrame(src) {
    if (radySprite.src !== src) radySprite.src = src;
  }

  function setPosition(x, bob = 0) {
    currentX = x;
    radySprite.style.transform =
      `translate(calc(-50% + ${Math.round(currentX)}px), calc(-87.5% + ${bob}px)) scaleX(${facing})`;
  }

  function movementLimit() {
    return Math.max(36, Math.min(132, window.innerWidth * 0.22));
  }

  function clearActivityTimers() {
    window.clearTimeout(blinkTimer);
    window.clearTimeout(walkTimer);
    window.clearTimeout(stepTimer);
    window.clearTimeout(playTimer);
    window.clearTimeout(autoPlayTimer);
    blinkTimer = 0;
    walkTimer = 0;
    stepTimer = 0;
    playTimer = 0;
    autoPlayTimer = 0;
  }

  function setMood(text) {
    if (mood && stage.dataset.character === 'rady') mood.textContent = text;
  }

  function applyState(next) {
    state = next;
    stage.dataset.radyState = next;
    radyPet.dataset.state = next;

    if (next === 'sleeping') {
      walking = false;
      clearActivityTimers();
      setFrame(FRAMES.blink);
      setPosition(currentX, 0);
      setMood('すやすや');
      return;
    }

    if (next === 'playing') {
      setMood('遊んでる');
      return;
    }

    setFrame(FRAMES.idle);
    setPosition(currentX, 0);
    setMood('のんびりしてる');
  }

  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    if (!isRadyActive() || state !== 'awake' || walking) return;

    blinkTimer = window.setTimeout(() => {
      if (!isRadyActive() || state !== 'awake' || walking) return;
      setFrame(FRAMES.blink);
      blinkTimer = window.setTimeout(() => {
        if (!isRadyActive() || state !== 'awake' || walking) return;
        setFrame(FRAMES.idle);
        scheduleBlink();
      }, 145);
    }, randomBetween(2400, 5200));
  }

  function scheduleActivity() {
    window.clearTimeout(walkTimer);
    if (!isRadyActive() || state !== 'awake' || reduceMotion.matches) return;

    walkTimer = window.setTimeout(() => {
      const roll = Math.random();

      if (roll < 0.42) startWalk();
      else if (roll < 0.64) startRun();
      else if (roll < 0.84) startHop();
      else startDrowse();
    }, randomBetween(6500, 11500));
  }

  function scheduleAutoPlay() {
    window.clearTimeout(autoPlayTimer);
    if (!isRadyActive() || state !== 'awake' || reduceMotion.matches) return;
    autoPlayTimer = window.setTimeout(() => startPlay(false), randomBetween(75000, 150000));
  }

  function resumeAwakeLife() {
    if (!isRadyActive()) return;
    if (isSleepTime()) {
      applyState('sleeping');
      return;
    }
    applyState('awake');
    scheduleBlink();
    scheduleActivity();
    scheduleAutoPlay();
  }

  function startWalkPattern({
    minSteps = 6,
    maxSteps = 10,
    stepPx = 8,
    intervalMs = 185,
    bobPx = 1
  } = {}) {
    if (!isRadyActive() || state !== 'awake' || reduceMotion.matches || walking) return;

    walking = true;
    window.clearTimeout(blinkTimer);

    const limit = movementLimit();
    let direction = Math.random() < 0.5 ? -1 : 1;
    if (currentX > limit * 0.7) direction = -1;
    if (currentX < -limit * 0.7) direction = 1;
    facing = direction < 0 ? -1 : 1;

    const totalSteps = randomBetween(minSteps, maxSteps);
    let step = 0;

    const advance = () => {
      if (!isRadyActive() || state !== 'awake') {
        walking = false;
        setPosition(currentX, 0);
        return;
      }

      if (step >= totalSteps) {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        setMood('のんびりしてる');
        scheduleBlink();
        scheduleActivity();
        return;
      }

      const frame = step % 2 === 0 ? FRAMES.walk1 : FRAMES.walk2;
      const bob = step % 2 === 0 ? -bobPx : 0;
      currentX = Math.max(-limit, Math.min(limit, currentX + direction * stepPx));
      setFrame(frame);
      setPosition(currentX, bob);
      step += 1;
      stepTimer = window.setTimeout(advance, intervalMs);
    };

    advance();
  }

  function startWalk() {
    setMood('おさんぽ中');
    startWalkPattern({
      minSteps: 6,
      maxSteps: 10,
      stepPx: 8,
      intervalMs: 185,
      bobPx: 1
    });
  }

  function startRun() {
    setMood('小走り中');
    startWalkPattern({
      minSteps: 9,
      maxSteps: 14,
      stepPx: 12,
      intervalMs: 110,
      bobPx: 2
    });
  }

  function startHop() {
    if (!isRadyActive() || state !== 'awake' || reduceMotion.matches || walking) return;

    walking = true;
    clearActivityTimers();
    setMood('ぴょこぴょこ');

    const totalHops = randomBetween(2, 4);
    const totalPhases = totalHops * 4;
    let phase = 0;

    const advance = () => {
      if (!isRadyActive() || state !== 'awake') {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        return;
      }

      if (phase >= totalPhases) {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        setMood('のんびりしてる');
        scheduleBlink();
        scheduleActivity();
        scheduleAutoPlay();
        return;
      }

      const hopPhase = phase % 4;
      const bob = hopPhase === 1 ? -9 : hopPhase === 2 ? -5 : 0;
      const frame = hopPhase < 2 ? FRAMES.walk1 : FRAMES.walk2;
      setFrame(frame);
      setPosition(currentX, bob);

      phase += 1;
      stepTimer = window.setTimeout(advance, 120);
    };

    advance();
  }

  function startDrowse() {
    if (!isRadyActive() || state !== 'awake' || walking) return;

    walking = true;
    clearActivityTimers();
    setMood('うとうと');

    const sequence = [
      { frame: FRAMES.blink, bob: 1, wait: 760 },
      { frame: FRAMES.idle, bob: 0, wait: 240 },
      { frame: FRAMES.blink, bob: 1, wait: 980 },
      { frame: FRAMES.idle, bob: 0, wait: 280 },
      { frame: FRAMES.blink, bob: 1, wait: 620 }
    ];
    let index = 0;

    const advance = () => {
      if (!isRadyActive() || state !== 'awake') {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        return;
      }

      if (index >= sequence.length) {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        setMood('のんびりしてる');
        scheduleBlink();
        scheduleActivity();
        scheduleAutoPlay();
        return;
      }

      const item = sequence[index];
      setFrame(item.frame);
      setPosition(currentX, item.bob);
      index += 1;
      stepTimer = window.setTimeout(advance, item.wait);
    };

    advance();
  }

  function startPlay(fromTap = true) {
    if (!isRadyActive() || isSleepTime() || state === 'playing') return;

    clearActivityTimers();
    walking = false;
    applyState('playing');

    if (reduceMotion.matches) {
      setFrame(FRAMES.idle);
      playTimer = window.setTimeout(resumeAwakeLife, 1600);
      return;
    }

    const limit = movementLimit();
    const startX = currentX;
    const direction = currentX > limit * 0.55 ? -1 : currentX < -limit * 0.55 ? 1 : (Math.random() < 0.5 ? -1 : 1);
    facing = direction < 0 ? -1 : 1;
    const totalSteps = fromTap ? 16 : 12;
    let step = 0;

    const playStep = () => {
      if (!isRadyActive() || state !== 'playing') return;

      if (step >= totalSteps) {
        currentX = Math.max(-limit, Math.min(limit, currentX));
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        resumeAwakeLife();
        return;
      }

      const phase = step % 4;
      const bob = phase === 1 ? -8 : phase === 2 ? -4 : 0;
      const frame = step % 2 === 0 ? FRAMES.walk1 : FRAMES.walk2;
      const drift = step < totalSteps / 2 ? direction * 5 : -direction * 5;
      currentX = Math.max(-limit, Math.min(limit, currentX + drift));

      setFrame(frame);
      setPosition(currentX, bob);
      step += 1;
      stepTimer = window.setTimeout(playStep, 135);
    };

    setPosition(startX, 0);
    playStep();
  }

  function evaluateLife() {
    if (!isRadyActive()) return;

    if (isSleepTime()) {
      if (state !== 'sleeping') applyState('sleeping');
      return;
    }

    if (state === 'sleeping') {
      resumeAwakeLife();
    }
  }

  function start() {
    clearActivityTimers();
    walking = false;

    if (!isRadyActive()) {
      applyState('awake');
      return;
    }

    if (isSleepTime()) {
      applyState('sleeping');
    } else {
      resumeAwakeLife();
    }
  }

  function stop() {
    clearActivityTimers();
    walking = false;
    setFrame(FRAMES.idle);
    setPosition(currentX, 0);
  }

  radySprite.style.willChange = 'transform';
  radySprite.style.transition = reduceMotion.matches ? 'none' : 'transform 130ms steps(2, end)';
  radySprite.setAttribute('role', 'button');
  radySprite.setAttribute('tabindex', '0');
  radySprite.setAttribute('aria-label', 'らでぃと遊ぶ');

  radySprite.addEventListener('pointerdown', (event) => {
    if (stage.dataset.character !== 'rady') return;
    event.stopPropagation();
  });

  radySprite.addEventListener('pointerup', (event) => {
    if (stage.dataset.character !== 'rady') return;
    event.stopPropagation();
    startPlay(true);
  });

  radySprite.addEventListener('click', (event) => {
    if (stage.dataset.character === 'rady') event.stopPropagation();
  });

  radySprite.addEventListener('keydown', (event) => {
    if (stage.dataset.character !== 'rady') return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    startPlay(true);
  });

  window.addEventListener('stan:character-change', (event) => {
    if (event.detail?.character === 'rady') start();
    else stop();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (stage.dataset.character === 'rady') start();
  });

  window.addEventListener('resize', () => {
    const limit = movementLimit();
    currentX = Math.max(-limit, Math.min(limit, currentX));
    setPosition(currentX, 0);
  });

  reduceMotion.addEventListener?.('change', () => {
    radySprite.style.transition = reduceMotion.matches ? 'none' : 'transform 130ms steps(2, end)';
    start();
  });

  lifeTimer = window.setInterval(evaluateLife, LIFE_CHECK_MS);
  window.addEventListener('pagehide', () => {
    clearActivityTimers();
    window.clearInterval(lifeTimer);
  }, { once: true });

  window.RADY_PET = Object.freeze({
    getState: () => state,
    play: () => startPlay(true)
  });

  if (stage.dataset.character === 'rady') start();
}
