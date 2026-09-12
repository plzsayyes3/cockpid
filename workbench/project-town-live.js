(() => {
  'use strict';

  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reducedMotion) return;

  const actors = new WeakMap();
  let lastScan = 0;
  let rafId = 0;

  const stateSpeed = {
    hot: 1.35,
    active: 1.0,
    thinking: 0.78,
    waiting: 0.62,
    paused: 0.38
  };

  function registerActors() {
    document.querySelectorAll('#projectRoom .worker .character-actor').forEach((actor, index) => {
      if (actors.has(actor)) return;
      actors.set(actor, {
        phase: Math.random() * Math.PI * 2,
        drift: (Math.random() - 0.5) * 0.9,
        index
      });
    });
  }

  function motionFor(action, time, phase, speed) {
    const t = time * speed;
    if (action === 'walk') {
      return {
        x: Math.sin(t * 0.010 + phase) * 0.9,
        y: -Math.abs(Math.sin(t * 0.016 + phase)) * 2.4
      };
    }
    if (action === 'work') {
      return {
        x: Math.sin(t * 0.018 + phase) * 0.8,
        y: Math.sin(t * 0.023 + phase) * 0.9
      };
    }
    if (action === 'rest') {
      return {
        x: Math.sin(t * 0.0017 + phase) * 0.35,
        y: Math.sin(t * 0.0021 + phase) * 0.45
      };
    }
    return {
      x: Math.sin(t * 0.0028 + phase) * 0.65,
      y: Math.sin(t * 0.0036 + phase) * 1.15
    };
  }

  function tick(time) {
    if (time - lastScan > 800) {
      registerActors();
      lastScan = time;
    }

    if (!document.hidden) {
      document.querySelectorAll('#projectRoom .worker .character-actor').forEach((actor) => {
        const data = actors.get(actor);
        if (!data) return;
        const worker = actor.closest('.worker');
        if (!worker) return;
        const action = worker.dataset.action || actor.querySelector('.character-sprite')?.dataset.action || 'idle';
        const state = worker.dataset.state || 'active';
        const speed = stateSpeed[state] || 1;
        const motion = motionFor(action, time, data.phase, speed);
        const x = motion.x + data.drift;
        actor.style.transform = `translate3d(${x.toFixed(2)}px, ${motion.y.toFixed(2)}px, 0)`;
      });
    }

    rafId = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) registerActors();
  });

  registerActors();
  rafId = requestAnimationFrame(tick);

  window.addEventListener('pagehide', () => cancelAnimationFrame(rafId), { once: true });
})();
