(() => {
  'use strict';

  const GRID = 4;
  const TICK_MS = 100;
  const DEFAULT_MOVE_MS = 900;
  const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const HOME = Object.freeze({
    working: [[18,45],[27,52],[22,61]],
    researching: [[76,42],[84,51],[79,61]],
    review: [[44,72],[56,72],[50,64]],
    paused: [[12,76],[18,74]],
    external_wait: [[67,72],[72,67]]
  });

  const ACTION = Object.freeze({
    working: 'work',
    researching: 'idle',
    review: 'idle',
    paused: 'rest',
    external_wait: 'idle'
  });

  const BUBBLE = Object.freeze({
    working: '作業中',
    researching: '調べ中…',
    review: '見てください！',
    paused: '休憩中…',
    external_wait: '待っています…'
  });

  const randomInt = (min, max) => Math.round(min + Math.random() * (max - min));
  const sample = (items) => items[Math.floor(Math.random() * items.length)];
  const snap = (value) => Math.round(value / GRID) * GRID;
  const snapUp = (value) => Math.max(GRID, Math.ceil(value / GRID) * GRID);

  let room = null;
  let tickId = 0;
  let resizeObserver = null;
  const controllers = new Map();
  const states = new WeakMap();
  const liveWorkers = new Set();

  function percentToPx(percent, size) {
    return snap((percent / 100) * size);
  }

  function applyPosition(worker, state) {
    worker.style.left = `${state.x}px`;
    worker.style.top = `${state.y}px`;
  }

  function resetWorker(worker, percentX, percentY) {
    const roomW = room?.clientWidth || 1;
    const roomH = room?.clientHeight || 1;
    const state = {
      x: percentToPx(percentX, roomW),
      y: percentToPx(percentY, roomH),
      targetX: 0,
      targetY: 0,
      pctX: percentX,
      pctY: percentY,
      roomW,
      roomH,
      axis: 'x',
      step: GRID,
      moving: false
    };

    state.targetX = state.x;
    state.targetY = state.y;
    states.set(worker, state);
    liveWorkers.add(worker);
    applyPosition(worker, state);
    return state;
  }

  function setTarget(worker, percentX, percentY, moveMs = DEFAULT_MOVE_MS) {
    const state = states.get(worker) || resetWorker(worker, 50, 50);
    const roomW = room?.clientWidth || state.roomW || 1;
    const roomH = room?.clientHeight || state.roomH || 1;
    const targetX = percentToPx(percentX, roomW);
    const targetY = percentToPx(percentY, roomH);

    state.pctX = percentX;
    state.pctY = percentY;
    state.roomW = roomW;
    state.roomH = roomH;
    state.targetX = targetX;
    state.targetY = targetY;

    const actor = worker.querySelector('.character-actor');
    if (actor && targetX !== state.x) {
      actor.dataset.direction = targetX < state.x ? 'left' : 'right';
    }

    const distance = Math.abs(targetX - state.x) + Math.abs(targetY - state.y);
    if (moveMs <= 0 || distance === 0) {
      state.x = targetX;
      state.y = targetY;
      state.moving = false;
      applyPosition(worker, state);
      return;
    }

    const ticks = Math.max(1, Math.floor(moveMs / TICK_MS));
    state.step = snapUp(distance / ticks);
    state.axis = targetX !== state.x ? 'x' : 'y';
    state.moving = true;
  }

  function stepAxis(current, target, amount) {
    if (current === target) return current;
    const delta = target - current;
    return current + Math.sign(delta) * Math.min(Math.abs(delta), amount);
  }

  function advanceWorkers() {
    liveWorkers.forEach((worker) => {
      if (!worker.isConnected) {
        liveWorkers.delete(worker);
        return;
      }

      const state = states.get(worker);
      if (!state?.moving) return;

      if (state.axis === 'x') {
        state.x = stepAxis(state.x, state.targetX, state.step);
        if (state.x === state.targetX) state.axis = 'y';
      } else {
        state.y = stepAxis(state.y, state.targetY, state.step);
      }

      applyPosition(worker, state);
      if (state.x === state.targetX && state.y === state.targetY) state.moving = false;
    });
  }

  function resnapForResize() {
    if (!room) return;
    const roomW = room.clientWidth || 1;
    const roomH = room.clientHeight || 1;

    liveWorkers.forEach((worker) => {
      const state = states.get(worker);
      if (!state || !worker.isConnected) return;

      const oldW = state.roomW || roomW;
      const oldH = state.roomH || roomH;
      const currentPctX = oldW ? (state.x / oldW) * 100 : state.pctX;
      const currentPctY = oldH ? (state.y / oldH) * 100 : state.pctY;

      state.roomW = roomW;
      state.roomH = roomH;
      state.x = percentToPx(currentPctX, roomW);
      state.y = percentToPx(currentPctY, roomH);
      state.targetX = percentToPx(state.pctX, roomW);
      state.targetY = percentToPx(state.pctY, roomH);
      applyPosition(worker, state);
    });
  }

  function bindRoom(nextRoom) {
    if (!nextRoom || nextRoom === room) return;

    if (resizeObserver && room) resizeObserver.unobserve(room);
    room = nextRoom;

    if ('ResizeObserver' in window) {
      if (!resizeObserver) resizeObserver = new ResizeObserver(resnapForResize);
      resizeObserver.observe(room);
    }
  }

  class CharacterController {
    constructor(worker, project, index, activityFn, momentumFn) {
      this.worker = worker;
      this.project = project;
      this.activity = activityFn(project);
      this.momentum = momentumFn(project);
      this.sprite = worker.querySelector('.character-sprite');
      this.bubble = worker.querySelector('.bubble');
      this.effect = worker.querySelector('.character-effect');
      this.timer = 0;
      this.stopped = false;

      resetWorker(worker, 34 + (index % 3) * 15, 34 + Math.floor(index / 3) * 20);
    }

    start() {
      if (REDUCED_MOTION) {
        this.moveHome(false);
        return;
      }
      this.timer = window.setTimeout(() => this.moveHome(true), randomInt(250, 1350));
    }

    stop() {
      this.stopped = true;
      window.clearTimeout(this.timer);
      liveWorkers.delete(this.worker);
    }

    moveHome(animate = true) {
      if (this.stopped || !this.worker.isConnected) return;

      const point = sample(HOME[this.activity.key] || HOME.working);
      const moveMs = animate ? Math.round(randomInt(700, 1150) / this.momentum.speed) : 0;

      this.setAction('walk');
      this.setBubble('');
      this.clearEffect();
      this.worker.style.setProperty('--move-ms', `${moveMs}ms`);
      setTarget(this.worker, point[0] + randomInt(-2, 2), point[1] + randomInt(-2, 2), moveMs);

      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.finish(), moveMs + 50);
    }

    finish() {
      if (this.stopped || !this.worker.isConnected) return;

      this.setAction(ACTION[this.activity.key] || 'idle');
      this.setBubble(BUBBLE[this.activity.key] || '');

      if (this.activity.key === 'paused' && Math.random() < .45) this.effectMark('Z', 'sleep');
      else if (this.activity.key === 'researching' && Math.random() < .3) this.effectMark('…', 'thought');
      else if (this.activity.key === 'working' && this.momentum.key === 'surging' && Math.random() < .4) this.effectMark('!', 'idea');
      else if (this.activity.key === 'review' && Math.random() < .35) this.effectMark('!', 'review');

      const min = this.activity.key === 'paused' ? 3200 : 1600;
      const max = this.activity.key === 'paused' ? 5600 : 3300;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.moveHome(true), randomInt(min, max) / this.momentum.speed);
    }

    setAction(action) {
      if (this.sprite) this.sprite.dataset.action = action;
      this.worker.dataset.action = action;
    }

    setBubble(text) {
      if (!this.bubble) return;
      this.bubble.textContent = text;
      this.bubble.classList.toggle('is-quiet', !text);
    }

    clearEffect() {
      if (!this.effect) return;
      this.effect.classList.remove('show');
      this.effect.textContent = '';
      this.effect.removeAttribute('data-effect');
    }

    effectMark(mark, kind) {
      if (!this.effect) return;
      this.effect.textContent = mark;
      this.effect.dataset.effect = kind;
      this.effect.classList.add('show');
    }
  }

  function stop() {
    controllers.forEach((controller) => controller.stop());
    controllers.clear();
    liveWorkers.clear();
  }

  function start({ room: nextRoom, projects, activity, momentum }) {
    stop();
    bindRoom(nextRoom);
    if (!room) return;

    const byId = new Map((projects || []).map((project) => [String(project.id), project]));

    room.querySelectorAll('.worker[data-project-id]').forEach((worker, index) => {
      const project = byId.get(String(worker.dataset.projectId || ''));
      if (!project) return;

      const controller = new CharacterController(worker, project, index, activity, momentum);
      controllers.set(project.id, controller);
      controller.start();
    });
  }

  function destroy() {
    stop();
    if (tickId) window.clearInterval(tickId);
    tickId = 0;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    room = null;
  }

  window.addEventListener('resize', () => {
    if (!('ResizeObserver' in window)) resnapForResize();
  }, { passive: true });

  tickId = window.setInterval(() => {
    if (!document.hidden) advanceWorkers();
  }, TICK_MS);

  window.addEventListener('pagehide', destroy, { once: true });

  window.ProjectTownMotion = Object.freeze({
    grid: GRID,
    tickMs: TICK_MS,
    start,
    stop,
    destroy
  });
})();
