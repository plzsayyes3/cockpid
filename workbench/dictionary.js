(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const MODEL = window.COCKPID_DICTIONARY_MODEL;
  const core = window.COCKPID_ONHAND_CORE;
  const tokenKey = 'zen-note-github-token';

  function decode(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function statusHtml(message, kind = '') {
    return `<span class="dictionary-status${kind ? ` ${kind}` : ''}" role="status" aria-live="polite">${MODEL.escapeHtml(message)}</span>`;
  }

  function render(container) {
    if (!container) return Promise.resolve();
    container.innerHTML = `
      <div class="dictionary-view">
        <header class="dictionary-head">
          <div><div class="dictionary-kicker">6 / DICTIONARY</div><h1>Transcription Dictionary</h1><p>StickS3 Voice Captureの手動辞書を編集します。</p></div>
          <div id="dictionaryStatus">${statusHtml('READING…')}</div>
        </header>
        <div class="dictionary-grid">
          <section class="dictionary-card manual-dictionary">
            <div class="dictionary-card-head"><div><span class="dictionary-label">MANUAL / EDITABLE</span><h2>transcription-dictionary.txt</h2></div><button class="dictionary-save" id="dictionarySave" type="button">SAVE</button></div>
            <p class="dictionary-path">${MODEL.escapeHtml(MODEL.FILES.manual.repo)}/${MODEL.escapeHtml(MODEL.FILES.manual.path)}</p>
            <textarea id="dictionaryManual" spellcheck="false" aria-label="手動辞書"></textarea>
          </section>
          <section class="dictionary-card auto-dictionary">
            <div class="dictionary-card-head"><div><span class="dictionary-label">AUTO / READ ONLY</span><h2>transcription-dictionary.auto.txt</h2></div><span class="dictionary-readonly">VIEW ONLY</span></div>
            <p class="dictionary-path">${MODEL.escapeHtml(MODEL.FILES.auto.repo)}/${MODEL.escapeHtml(MODEL.FILES.auto.path)}</p>
            <pre id="dictionaryAuto" aria-label="自動辞書" aria-readonly="true"></pre>
          </section>
        </div>
      </div>`;

    const status = container.querySelector('#dictionaryStatus');
    const manual = container.querySelector('#dictionaryManual');
    const auto = container.querySelector('#dictionaryAuto');
    const save = container.querySelector('#dictionarySave');
    let manualSha = null;

    const setStatus = (message, kind = '') => { status.innerHTML = statusHtml(message, kind); };

    async function load() {
      if (!localStorage.getItem(tokenKey) || !core?.readFile) {
        setStatus('TOKEN REQUIRED', 'error');
        manual.disabled = true;
        save.disabled = true;
        auto.textContent = 'GitHub tokenを設定すると表示できます。';
        return;
      }
      try {
        const [manualPayload, autoPayload] = await Promise.all([
          core.readFile(MODEL.FILES.manual.path, MODEL.FILES.manual.repo),
          core.readFile(MODEL.FILES.auto.path, MODEL.FILES.auto.repo)
        ]);
        const view = MODEL.buildDictionaryView({
          manual: manualPayload ? { content: decode(manualPayload.content), sha: manualPayload.sha } : null,
          auto: autoPayload ? { content: decode(autoPayload.content), sha: autoPayload.sha } : null
        });
        manual.value = view.manual.content;
        auto.textContent = view.auto.content || '自動辞書はまだ生成されていません。';
        manualSha = view.manual.sha;
        setStatus('READY');
      } catch (error) {
        console.error(error);
        setStatus(`READ ERROR · ${error?.message || error}`, 'error');
        auto.textContent = '読み込みに失敗しました。';
      }
    }

    save.addEventListener('click', async () => {
      save.disabled = true;
      setStatus('SAVING…');
      try {
        const result = await core.writeFile(
          MODEL.FILES.manual.path,
          manual.value,
          manualSha,
          'cockpid: update transcription dictionary',
          MODEL.FILES.manual.repo
        );
        manualSha = result?.content?.sha || result?.commit?.sha || manualSha;
        setStatus('SAVED', 'saved');
      } catch (error) {
        console.error(error);
        setStatus(error?.conflict ? 'CONFLICT · RELOAD BEFORE SAVING' : `SAVE ERROR · ${error?.message || error}`, 'error');
      } finally {
        save.disabled = false;
      }
    });

    return load();
  }

  window.COCKPID_DICTIONARY = Object.freeze({ render, owner: OWNER, files: MODEL.FILES });
})();
