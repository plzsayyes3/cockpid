(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'mynotebook';
  const DIR = '00_inbox';
  const TOKEN_KEY = 'zen-note-github-token';
  const PENDING_KEY = 'cockpid.stan.pending-voice.v1';

  const stage = document.getElementById('stanStage');
  const speechBox = document.getElementById('stanSpeech');
  const speechLabel = document.getElementById('stanSpeechLabel');
  const transcript = document.getElementById('stanTranscript');
  const mood = document.getElementById('stanMood');

  if (!stage || !speechBox || !speechLabel || !transcript) return;

  let posting = false;
  let memoryPending = null;

  function token() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function jstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.map((part) => [part.type, part.value]));
  }

  function stamp(date = new Date()) {
    const p = jstParts(date);
    const millis = String(date.getMilliseconds()).padStart(3, '0');
    return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}${millis}`;
  }

  function encodeUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeUtf8Base64(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function currentText() {
    const value = transcript.textContent.trim();
    return value === '保存しました' ? '' : value;
  }

  function readPending() {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
      if (value?.name && value?.text) {
        memoryPending = value;
        return value;
      }
    } catch {
      // Fall through to the in-memory copy.
    }
    return memoryPending;
  }

  function writePending(value) {
    memoryPending = value || null;
    try {
      if (value) localStorage.setItem(PENDING_KEY, JSON.stringify(value));
      else localStorage.removeItem(PENDING_KEY);
    } catch {
      // The in-memory copy still protects the current page.
    }
  }

  function ensurePending(text) {
    const existing = readPending();
    if (existing?.name && existing?.text === text) return existing;
    const pending = {
      name: `${stamp()}.md`,
      text,
      created_at: new Date().toISOString()
    };
    writePending(pending);
    return pending;
  }

  function setStatus(label, moodText = '') {
    speechBox.hidden = false;
    speechLabel.textContent = label;
    if (moodText && mood) mood.textContent = moodText;
  }

  async function existingMemoMatches(path, text, currentToken) {
    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=main`, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${currentToken}`,
          'X-GitHub-Api-Version': '2022-11-28'
        },
        cache: 'no-store'
      });
      if (!response.ok) return false;
      const payload = await response.json();
      return decodeUtf8Base64(payload.content) === `${text}\n`;
    } catch {
      return false;
    }
  }

  async function postVoiceMemo() {
    if (posting) return false;

    const visibleText = currentText();
    const existing = readPending();
    const pending = existing || (visibleText ? ensurePending(visibleText) : null);
    const text = pending?.text || '';
    if (!text) {
      speechBox.hidden = true;
      return false;
    }

    if (transcript.textContent.trim() !== text) transcript.textContent = text;

    const currentToken = token();
    if (!currentToken) {
      setStatus('未送信 · GitHub接続が必要', 'つながってない');
      return false;
    }

    const name = pending.name;
    const path = `${DIR}/${name}`;
    posting = true;
    stage.classList.add('is-posting');
    setStatus('送ってる…', '送ってる…');

    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          message: `cockpid: stan voice memo ${name}`,
          content: encodeUtf8(`${text}\n`),
          branch: 'main'
        })
      });

      if (!response.ok) {
        const alreadySaved = response.status === 422
          && await existingMemoMatches(path, text, currentToken);
        if (!alreadySaved) throw new Error(`GitHub ${response.status}`);
      }

      writePending(null);
      transcript.textContent = '保存しました';
      setStatus('送ったよ', '送ったよ');
      window.dispatchEvent(new CustomEvent('stan:voice-posted', { detail: { path } }));

      window.setTimeout(() => {
        if (!stage.classList.contains('is-listening') && !readPending()) {
          transcript.textContent = '';
          speechBox.hidden = true;
        }
      }, 900);
      return true;
    } catch (error) {
      console.warn('[Stan] Voice memo post failed:', error);
      setStatus(`未送信 · ${String(error?.message || error)}`, '送れなかった');
      return false;
    } finally {
      posting = false;
      stage.classList.remove('is-posting');
    }
  }

  function restorePending() {
    const pending = readPending();
    if (!pending?.text) return false;
    transcript.textContent = pending.text;
    setStatus('未送信 · 再送待ち', '送るの待ってる');
    return true;
  }

  window.StanVoiceMemo = Object.freeze({
    hasPending: () => Boolean(readPending()?.text),
    retry: postVoiceMemo
  });

  window.addEventListener('stan:speech-complete', () => {
    const text = currentText();
    if (text) ensurePending(text);
    window.setTimeout(postVoiceMemo, 0);
  });
  window.addEventListener('online', () => {
    if (readPending()) postVoiceMemo();
  });
  window.addEventListener('focus', () => {
    if (readPending()) postVoiceMemo();
  });

  if (restorePending() && token() && navigator.onLine !== false) {
    window.setTimeout(postVoiceMemo, 350);
  }
})();