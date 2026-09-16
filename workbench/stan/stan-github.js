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

  let posting = false;

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

  function currentText() {
    return transcript.textContent.trim();
  }

  function setStatus(label, moodText = '') {
    speechBox.hidden = false;
    speechLabel.textContent = label;
    if (moodText && mood) mood.textContent = moodText;
  }

  async function postVoiceMemo() {
    if (posting) return;

    const text = currentText();
    if (!text) {
      speechBox.hidden = true;
      return;
    }

    const currentToken = token();
    if (!currentToken) {
      setStatus('GitHub接続が必要', 'つながってない');
      return;
    }

    const name = `${stamp()}.md`;
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
          content: encodeUtf8(`${text}\n`)
        })
      });

      if (!response.ok) throw new Error(`GitHub ${response.status}`);

      transcript.textContent = '保存しました';
      setStatus('送ったよ', '送ったよ');
      window.dispatchEvent(new CustomEvent('stan:voice-posted', { detail: { path } }));

      window.setTimeout(() => {
        if (!stage.classList.contains('is-listening')) {
          transcript.textContent = '';
          speechBox.hidden = true;
        }
      }, 900);
    } catch (error) {
      console.warn('[Stan] Voice memo post failed:', error);
      setStatus(`送信失敗 · ${String(error?.message || error)}`, '送れなかった');
    } finally {
      posting = false;
      stage.classList.remove('is-posting');
    }
  }

  window.addEventListener('stan:speech-complete', () => {
    window.setTimeout(postVoiceMemo, 0);
  });
})();