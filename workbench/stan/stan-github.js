(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'mynotebook';
  const DIR = '00_inbox';
  const TOKEN_KEY = 'zen-note-github-token';

  const stage = document.getElementById('stanStage');
  const speechBox = document.getElementById('stanSpeech');
  const speechLabel = document.getElementById('stanSpeechLabel');
  const transcript = document.getElementById('stanTranscript');
  const mood = document.getElementById('stanMood');

  if (!stage || !speechBox || !speechLabel || !transcript) return;

  const style = document.createElement('style');
  style.textContent = `
    .stan-speech-send {
      min-width: 76px;
      min-height: 34px;
      margin-top: 2px;
      padding: 0 14px;
      border: 1px solid rgba(196, 231, 246, .16);
      border-radius: 0;
      color: rgba(235, 247, 252, .78);
      background: rgba(8, 18, 24, .58);
      font: inherit;
      font-size: 9px;
      letter-spacing: .08em;
      cursor: pointer;
      pointer-events: auto;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    .stan-speech-send:disabled {
      opacity: .28;
      cursor: default;
    }
    .stan-speech-send:focus-visible {
      outline: 1px solid rgba(196, 231, 246, .38);
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'stan-speech-send';
  sendButton.textContent = '送る';
  sendButton.hidden = true;
  speechBox.appendChild(sendButton);

  let posting = false;

  function token() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function pad(value) {
    return String(value).padStart(2, '0');
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
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return map;
  }

  function stamp(date = new Date()) {
    const p = jstParts(date);
    return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
  }

  function encodeUtf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function currentText() {
    return transcript.textContent.trim();
  }

  function refreshButton() {
    const hasText = Boolean(currentText());
    const listening = stage.classList.contains('is-listening');
    sendButton.hidden = !hasText;
    sendButton.disabled = posting || listening || !hasText;
  }

  function setStatus(label, moodText = '') {
    speechBox.hidden = false;
    speechLabel.textContent = label;
    if (moodText && mood) mood.textContent = moodText;
  }

  async function postVoiceMemo() {
    if (posting) return;

    const text = currentText();
    if (!text) return;

    const currentToken = token();
    if (!currentToken) {
      setStatus('GitHub接続が必要', 'つながってない');
      sendButton.disabled = false;
      return;
    }

    const name = `${stamp()}.md`;
    const path = `${DIR}/${name}`;
    posting = true;
    refreshButton();
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
          content: encodeUtf8(`${text}\n`)
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub ${response.status}`);
      }

      transcript.textContent = '';
      setStatus('送ったよ', '送ったよ');
      window.setTimeout(() => {
        if (!stage.classList.contains('is-listening') && !currentText()) {
          speechBox.hidden = true;
        }
      }, 1300);
    } catch (error) {
      console.warn('[Stan] Voice memo post failed:', error);
      setStatus(`送信失敗 · ${String(error?.message || error)}`, '送れなかった');
    } finally {
      posting = false;
      refreshButton();
    }
  }

  ['pointerdown', 'pointerup', 'click', 'dblclick'].forEach((type) => {
    sendButton.addEventListener(type, (event) => event.stopPropagation());
  });
  sendButton.addEventListener('click', postVoiceMemo);

  const observer = new MutationObserver(refreshButton);
  observer.observe(transcript, { childList: true, characterData: true, subtree: true });
  observer.observe(stage, { attributes: true, attributeFilter: ['class'] });
  refreshButton();
})();
