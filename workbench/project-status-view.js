(() => {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function renderTownStatus(project, status) {
    const currentActivity = status.activity(project);
    const currentMomentum = status.momentum(project);
    const motivation = status.motivation(project);
    const decision = status.decisionText(project, currentActivity);
    const message = status.detailMessage(currentActivity);
    const id = escapeHtml(project?.id || '');

    return `<section class="project-town-status" data-project-id="${id}">
      <div class="town-status-top">
        <div><span class="detail-section-label">PROJECT TOWN / STATUS</span><h2>${escapeHtml(project?.title || 'Project')}</h2></div>
        <span class="town-turn town-turn-${escapeHtml(currentActivity.key)}">${escapeHtml(currentActivity.label)}</span>
      </div>
      <p class="town-status-message">${escapeHtml(message)}</p>
      <div class="town-status-metrics">
        <div><span>ACTIVITY</span><strong>${escapeHtml(currentActivity.label)}</strong></div>
        <div><span>MOMENTUM</span><strong>${escapeHtml(`${currentMomentum.label} ${currentMomentum.mark}`.trim())}</strong></div>
        <div><span>MOTIVATION</span><strong>${escapeHtml(`${motivation} / 3`)}</strong></div>
      </div>
      <div class="town-decision"><span>DECISION / NEXT SIGNAL</span><p>${escapeHtml(decision)}</p></div>
    </section>`;
  }

  const api = { escapeHtml, renderTownStatus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.COCKPID_PROJECT_STATUS_VIEW = Object.freeze(api);
})();
