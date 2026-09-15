(() => {
  'use strict';

  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const IDLE_RETRY_MS = 3000;
  const VERSION_KEY = 'cockpid.stan.last-seen-version.v1';
  const COMMITS_URL = 'https://api.github.com/repos/plzsayyes3/cockpid/commits?path=workbench%2Fstan&per_page=1';

  const stage = document.getElementById('stanStage');
  const transcript = document.getElementById('stanTranscript');
  const speechBox = document.getElementById('stanSpeech');
  const speechLabel = document.getElementById('stanSpeechLabel');

  let checking = false;
  let pendingSha = '';
  let idleRetryTimer = null;

  function readSeenSha() {
    try {
      return localStorage.getItem(VERSION_KEY) || '';
    } catch {
      return '';
    }
  }

  function writeSeenSha(sha) {
    try {
      localStorage.setItem(VERSION_KEY, sha);
    } catch {
      // A missing baseline only means this tab cannot remember update state.
    }
  }

  function hasVisibleSpeechActivity() {
    if (!speechBox || speechBox.hidden) return false;
    const label = speechLabel?.textContent?.trim() || '';
    return label === '準備中…' || label === '聞いてる…' || label === '送ってる…';
  }

  function isSafeToReload() {
    if (document.hidden) return false;
    if (stage?.classList.contains('is-listening')) return false;
    if (stage?.classList.contains('is-menu-open')) return false;
    if ((transcript?.textContent || '').trim()) return false;
    if (hasVisibleSpeechActivity()) return false;
    return true;
  }

  function reloadForUpdate(sha) {
    writeSeenSha(sha);
    const url = new URL(window.location.href);
    url.searchParams.set('_stan_update', sha.slice(0, 12));
    window.location.replace(url.href);
  }

  function tryApplyPendingUpdate() {
    if (!pendingSha) return;

    if (isSafeToReload()) {
      const sha = pendingSha;
      pendingSha = '';
      if (idleRetryTimer) {
        window.clearTimeout(idleRetryTimer);
        idleRetryTimer = null;
      }
      reloadForUpdate(sha);
      return;
    }

    if (!idleRetryTimer) {
      idleRetryTimer = window.setTimeout(() => {
        idleRetryTimer = null;
        tryApplyPendingUpdate();
      }, IDLE_RETRY_MS);
    }
  }

  async function checkForUpdate() {
    if (checking) return;
    checking = true;

    try {
      const response = await fetch(COMMITS_URL, {
        cache: 'no-store',
        headers: {
          Accept: 'application/vnd.github+json'
        }
      });

      if (!response.ok) return;

      const commits = await response.json();
      const latestSha = commits?.[0]?.sha || '';
      if (!latestSha) return;

      const seenSha = readSeenSha();
      if (!seenSha) {
        writeSeenSha(latestSha);
        return;
      }

      if (latestSha !== seenSha) {
        pendingSha = latestSha;
        tryApplyPendingUpdate();
      }
    } catch (error) {
      console.debug('[Stan] Update check skipped:', error);
    } finally {
      checking = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      tryApplyPendingUpdate();
      checkForUpdate();
    }
  });

  window.addEventListener('online', checkForUpdate);

  checkForUpdate();
  window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
})();
