(() => {
  'use strict';

  const overlay = document.getElementById('detailOverlay');
  const modal = document.getElementById('detailPanel');
  const projectList = document.getElementById('projectList');
  const projectRoom = document.getElementById('projectRoom');
  let lastTrigger = null;

  function isPhoneLike() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    return coarse && Math.min(window.innerWidth, window.innerHeight) <= 600;
  }

  function syncMobileUi() {
    document.documentElement.classList.toggle('mobile-ui', isPhoneLike());
  }

  function openDetail(trigger) {
    if (!overlay) return;
    lastTrigger = trigger || document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('detail-open');
    requestAnimationFrame(() => modal?.querySelector('.project-detail-close')?.focus());
  }

  function closeDetail() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('detail-open');
    if (lastTrigger instanceof HTMLElement && lastTrigger.isConnected) lastTrigger.focus();
  }

  function projectTrigger(target) {
    const trigger = target.closest?.('[data-project-id]');
    if (!trigger) return null;
    if (!projectList?.contains(trigger) && !projectRoom?.contains(trigger)) return null;
    return trigger;
  }

  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('[data-detail-close]');
    if (close) {
      event.preventDefault();
      closeDetail();
      return;
    }

    const trigger = projectTrigger(event.target);
    if (trigger) openDetail(trigger);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay && !overlay.hidden) closeDetail();
  });

  window.addEventListener('resize', syncMobileUi, { passive: true });
  window.addEventListener('orientationchange', syncMobileUi, { passive: true });

  syncMobileUi();
})();
