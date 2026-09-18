(() => {
  'use strict';

  const FILES = Object.freeze({
    manual: Object.freeze({ repo: 'sticks3-voice-capture', path: 'local-receiver/transcription-dictionary.txt' }),
    auto: Object.freeze({ repo: 'sticks3-voice-capture', path: 'local-receiver/transcription-dictionary.auto.txt' })
  });

  const encodeUtf8Base64 = (value) => {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function buildDictionaryView({ manual, auto }) {
    return {
      manual: {
        ...FILES.manual,
        content: String(manual?.content ?? ''),
        sha: manual?.sha || null,
        editable: true
      },
      auto: {
        ...FILES.auto,
        content: String(auto?.content ?? ''),
        sha: auto?.sha || null,
        editable: false
      }
    };
  }

  function createPutPayload(text, sha) {
    const payload = {
      message: 'cockpid: update transcription dictionary',
      branch: 'main',
      content: encodeUtf8Base64(text)
    };
    if (sha) payload.sha = sha;
    return payload;
  }

  const api = { FILES, buildDictionaryView, encodeUtf8Base64, createPutPayload, escapeHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.COCKPID_DICTIONARY_MODEL = Object.freeze(api);
})();
