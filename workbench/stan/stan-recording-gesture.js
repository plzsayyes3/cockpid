(() => {
  'use strict';

  const DOUBLE_TAP_MS = 300;
  const DOUBLE_TAP_DISTANCE = 36;
  const POINTER_CANCEL_DISTANCE = 14;

  const stage = document.getElementById('stanStage');
  if (!stage) return;

  const gesture = {
    pointerId: null,
    startX: 0,
    startY: 0,
    cancelled: false,
    lastTapAt: 0,
    lastTapX: 0,
    lastTapY: 0,
    singleTimer: null
  };

  function session() {
    return window.StanSpeechSession || null;
  }

  function isExcludedTarget(target) {
    return Boolean(target?.closest?.('.stan-control, .stan-menu, .stan-menu-backdrop'));
  }

  function clearSingleTap() {
    if (gesture.singleTimer) {
      window.clearTimeout(gesture.singleTimer);
      gesture.singleTimer = null;
    }
    gesture.lastTapAt = 0;
  }

  function resetPointer() {
    gesture.pointerId = null;
    gesture.cancelled = false;
  }

  function block(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onPointerDown(event) {
    const current = session();
    if (!current?.active || isExcludedTarget(event.target)) return;

    block(event);
    gesture.pointerId = event.pointerId;
    gesture.startX = event.clientX;
    gesture.startY = event.clientY;
    gesture.cancelled = false;
  }

  function onPointerMove(event) {
    const current = session();
    if (!current?.active || gesture.pointerId !== event.pointerId) return;

    block(event);
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (distance > POINTER_CANCEL_DISTANCE) gesture.cancelled = true;
  }

  function onPointerUp(event) {
    const current = session();
    if (!current?.active || gesture.pointerId !== event.pointerId) return;

    block(event);
    const wasCancelled = gesture.cancelled;
    resetPointer();
    if (wasCancelled) return;

    const now = performance.now();
    const timeSinceLastTap = now - gesture.lastTapAt;
    const distanceFromLastTap = Math.hypot(event.clientX - gesture.lastTapX, event.clientY - gesture.lastTapY);
    const isDoubleTap = gesture.lastTapAt > 0
      && timeSinceLastTap <= DOUBLE_TAP_MS
      && distanceFromLastTap <= DOUBLE_TAP_DISTANCE;

    if (isDoubleTap) {
      clearSingleTap();
      current.stop();
      return;
    }

    if (gesture.singleTimer) window.clearTimeout(gesture.singleTimer);

    gesture.lastTapAt = now;
    gesture.lastTapX = event.clientX;
    gesture.lastTapY = event.clientY;
    const tapAt = now;

    gesture.singleTimer = window.setTimeout(() => {
      gesture.singleTimer = null;
      if (gesture.lastTapAt !== tapAt) return;
      gesture.lastTapAt = 0;

      const activeSession = session();
      if (!activeSession?.active) return;

      try {
        if (activeSession.paused) {
          activeSession.resume();
        } else {
          activeSession.pause();
        }
      } catch (error) {
        console.warn('[Stan] Could not toggle speech pause:', error);
      }
    }, DOUBLE_TAP_MS);
  }

  function onPointerCancel(event) {
    if (gesture.pointerId !== event.pointerId) return;
    if (session()?.active) block(event);
    resetPointer();
  }

  function blockSyntheticTap(event) {
    if (!session()?.active || isExcludedTarget(event.target)) return;
    block(event);
  }

  stage.addEventListener('pointerdown', onPointerDown, { capture: true });
  stage.addEventListener('pointermove', onPointerMove, { capture: true });
  stage.addEventListener('pointerup', onPointerUp, { capture: true });
  stage.addEventListener('pointercancel', onPointerCancel, { capture: true });
  stage.addEventListener('click', blockSyntheticTap, { capture: true });
  stage.addEventListener('dblclick', blockSyntheticTap, { capture: true });

  window.addEventListener('stan:speech-complete', clearSingleTap);
  window.addEventListener('pagehide', clearSingleTap, { once: true });
})();