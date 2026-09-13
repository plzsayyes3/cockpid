(() => {
  'use strict';

  // Deliberately coarse game tick: movement advances only 10 times per second.
  // The artwork still uses a 2px source-pixel scale, but positions snap to a
  // 4px movement grid so actors read like old console sprites instead of DOM.
  const GRID = 4;
  const TICK_MS = 100;
  const DEFAULT_MOVE_MS = 900;
  const room = document.getElementById('projectRoom');
  if (!room) return;

  const states = new WeakMap();
  const live = new Set();
  let tickId = 0;

  const snap = (value) => Math.round(value / GRID) * GRID;
  const snapUp = (value) => Math.max(GRID, Math.ceil(value / GRID) * GRID);

  function percentValue(value, fallback = 50) {
    const n = parseFloat(String(value || ''));
    return Number.isFinite(n) ? n : fallback;
  }

  function percentToPx(percent, size) {
    return snap((percent / 100) * size);
  }

  function applyPosition(worker, state) {
    worker.style.left = `${state.x}px`;
    worker.style.top = `${state.y}px`;
  }

  function register(worker) {
    if (!(worker instanceof HTMLElement) || states.has(worker)) return;

    const left = worker.style.left || '50%';
    const top = worker.style.top || '50%';
    const pctX = left.endsWith('%') ? percentValue(left) : 50;
    const pctY = top.endsWith('%') ? percentValue(top) : 50;
    const roomW = room.clientWidth || 1;
    const roomH = room.clientHeight || 1;
    const x = left.endsWith('%') ? percentToPx(pctX, roomW) : snap(parseFloat(left) || roomW / 2);
    const y = top.endsWith('%') ? percentToPx(pctY, roomH) : snap(parseFloat(top) || roomH / 2);

    const state = {
      x,
      y,
      targetX: x,
      targetY: y,
      pctX,
      pctY,
      roomW,
      roomH,
      axis: 'x',
      step: GRID,
      moving: false
    };

    states.set(worker, state);
    live.add(worker);
    applyPosition(worker, state);
  }

  function captureTarget(worker) {
    register(worker);
    const state = states.get(worker);
    if (!state) return;

    const left = String(worker.style.left || '').trim();
    const top = String(worker.style.top || '').trim();
    if (!left.endsWith('%') && !top.endsWith('%')) return;

    const roomW = room.clientWidth || state.roomW || 1;
    const roomH = room.clientHeight || state.roomH || 1;
    const pctX = left.endsWith('%') ? percentValue(left, state.pctX) : state.pctX;
    const pctY = top.endsWith('%') ? percentValue(top, state.pctY) : state.pctY;
    const targetX = percentToPx(pctX, roomW);
    const targetY = percentToPx(pctY, roomH);

    state.pctX = pctX;
    state.pctY = pctY;
    state.roomW = roomW;
    state.roomH = roomH;
    state.targetX = targetX;
    state.targetY = targetY;

    const actor = worker.querySelector('.character-actor');
    if (actor && targetX !== state.x) actor.dataset.direction = targetX < state.x ? 'left' : 'right';

    // project-town-v2 writes a percentage destination. Restore the current
    // snapped pixel position immediately, then walk to that destination.
    applyPosition(worker, state);

    const rawMoveMs = parseFloat(worker.style.getPropertyValue('--move-ms'));
    const moveMs = Number.isFinite(rawMoveMs) ? rawMoveMs : DEFAULT_MOVE_MS;
    const distance = Math.abs(targetX - state.x) + Math.abs(targetY - state.y);

    if (moveMs <= 0 || distance === 0) {
      state.x = targetX;
      state.y = targetY;
      state.moving = false;
      applyPosition(worker, state);
      return;
    }

    // Keep the controller's existing travel duration, but quantize the route
    // into a small number of visibly discrete 4px-aligned game ticks.
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
    live.forEach((worker) => {
      if (!worker.isConnected) {
        live.delete(worker);
        return;
      }

      const state = states.get(worker);
      if (!state?.moving) return;

      // Never interpolate both axes in one tick. Old-console movement reads
      // much more naturally as horizontal first, then vertical.
      if (state.axis === 'x') {
        state.x = stepAxis(state.x, state.targetX, state.step);
        if (state.x === state.targetX) state.axis = 'y';
      } else {
        state.y = stepAxis(state.y, state.targetY, state.step);
      }

      applyPosition(worker, state);

      if (state.x === state.targetX && state.y === state.targetY) {
        state.moving = false;
      }
    });
  }

  const styleObserver = new MutationObserver((records) => {
    const touched = new Set();
    records.forEach((record) => {
      if (record.target instanceof HTMLElement) touched.add(record.target);
    });
    touched.forEach(captureTarget);
  });

  function scan(root = room) {
    if (root instanceof HTMLElement && root.matches('.worker[data-project-id]')) {
      register(root);
      styleObserver.observe(root, { attributes: true, attributeFilter: ['style'] });
    }
    root.querySelectorAll?.('.worker[data-project-id]').forEach((worker) => {
      if (!states.has(worker)) {
        register(worker);
        styleObserver.observe(worker, { attributes: true, attributeFilter: ['style'] });
      }
    });
  }

  const roomObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scan(node);
      });
    });
  });

  function resnapForResize() {
    const roomW = room.clientWidth || 1;
    const roomH = room.clientHeight || 1;
    live.forEach((worker) => {
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

  scan();
  roomObserver.observe(room, { childList: true, subtree: true });

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(resnapForResize);
    resizeObserver.observe(room);
    window.addEventListener('pagehide', () => resizeObserver.disconnect(), { once: true });
  } else {
    window.addEventListener('resize', resnapForResize, { passive: true });
  }

  tickId = window.setInterval(() => {
    if (!document.hidden) advanceWorkers();
  }, TICK_MS);

  window.addEventListener('pagehide', () => {
    window.clearInterval(tickId);
    roomObserver.disconnect();
    styleObserver.disconnect();
  }, { once: true });
})();
