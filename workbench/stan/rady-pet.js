const stage = document.getElementById('stanStage');
const radyPet = document.getElementById('radyPet');
const radySprite = radyPet?.querySelector('img');

if (stage && radyPet && radySprite) {
  const frameUrl = (name) => new URL(`../assets/rady/pixel/${name}`, import.meta.url).href;
  const FRAMES = Object.freeze({
    idle: frameUrl('rady_idle_01.png'),
    blink: frameUrl('rady_idle_02.png'),
    walk1: frameUrl('rady_walk_01.png'),
    walk2: frameUrl('rady_walk_02.png')
  });

  for (const src of Object.values(FRAMES)) {
    const preload = new Image();
    preload.src = src;
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let blinkTimer = 0;
  let walkTimer = 0;
  let stepTimer = 0;
  let currentX = 0;
  let walking = false;

  const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));

  function isRadyActive() {
    return stage.dataset.character === 'rady' && !document.hidden;
  }

  function clearTimers() {
    window.clearTimeout(blinkTimer);
    window.clearTimeout(walkTimer);
    window.clearTimeout(stepTimer);
    blinkTimer = 0;
    walkTimer = 0;
    stepTimer = 0;
  }

  function setFrame(src) {
    if (radySprite.src !== src) radySprite.src = src;
  }

  function setPosition(x, bob = 0) {
    currentX = x;
    radySprite.style.transform = `translate(${Math.round(currentX)}px, calc(-4vh + ${bob}px))`;
  }

  function movementLimit() {
    return Math.max(36, Math.min(132, window.innerWidth * 0.22));
  }

  function scheduleBlink() {
    window.clearTimeout(blinkTimer);
    if (!isRadyActive() || walking) return;

    blinkTimer = window.setTimeout(() => {
      if (!isRadyActive() || walking) return;
      setFrame(FRAMES.blink);
      blinkTimer = window.setTimeout(() => {
        if (!isRadyActive() || walking) return;
        setFrame(FRAMES.idle);
        scheduleBlink();
      }, 145);
    }, randomBetween(2400, 5200));
  }

  function scheduleWalk() {
    window.clearTimeout(walkTimer);
    if (!isRadyActive() || reduceMotion.matches) return;

    walkTimer = window.setTimeout(startWalk, randomBetween(6500, 11500));
  }

  function startWalk() {
    if (!isRadyActive() || reduceMotion.matches || walking) return;

    walking = true;
    window.clearTimeout(blinkTimer);

    const limit = movementLimit();
    let direction = Math.random() < 0.5 ? -1 : 1;
    if (currentX > limit * 0.7) direction = -1;
    if (currentX < -limit * 0.7) direction = 1;

    const totalSteps = randomBetween(6, 10);
    let step = 0;

    const advance = () => {
      if (!isRadyActive()) {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        return;
      }

      if (step >= totalSteps) {
        walking = false;
        setFrame(FRAMES.idle);
        setPosition(currentX, 0);
        scheduleBlink();
        scheduleWalk();
        return;
      }

      const frame = step % 2 === 0 ? FRAMES.walk1 : FRAMES.walk2;
      const bob = step % 2 === 0 ? -1 : 0;
      currentX = Math.max(-limit, Math.min(limit, currentX + direction * 8));
      setFrame(frame);
      setPosition(currentX, bob);
      step += 1;
      stepTimer = window.setTimeout(advance, 185);
    };

    advance();
  }

  function start() {
    clearTimers();
    walking = false;
    setFrame(FRAMES.idle);
    setPosition(currentX, 0);
    if (!isRadyActive()) return;
    scheduleBlink();
    scheduleWalk();
  }

  function stop() {
    clearTimers();
    walking = false;
    setFrame(FRAMES.idle);
    setPosition(currentX, 0);
  }

  radySprite.style.willChange = 'transform';
  radySprite.style.transition = reduceMotion.matches ? 'none' : 'transform 150ms steps(2, end)';

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
    radySprite.style.transition = reduceMotion.matches ? 'none' : 'transform 150ms steps(2, end)';
    start();
  });

  if (stage.dataset.character === 'rady') start();
}
