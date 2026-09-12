(() => {
  'use strict';

  const TARGET_HEADING = '#### ショートメモ';
  const captureTab = document.getElementById('memoCaptureTab');
  const inboxTab = document.getElementById('memoInboxTab');
  const capturePanel = document.getElementById('memoCapturePanel');
  const inboxPanel = document.getElementById('memoInboxPanel');
  const inboxList = document.getElementById('memoInboxList');
  const inboxCount = document.getElementById('memoInboxCount');
  const refreshButton = document.getElementById('memoInboxRefresh');
  if (!captureTab || !inboxTab || !capturePanel || !inboxPanel || !inboxList || !inboxCount) return;

  let loaded = false;
  let loading = false;
  let merging = false;
  let currentFiles = [];
  let topMergeButton = null;

  function inboxSource() {
    return window.COCKPID_SOURCES?.get('inbox') || { repo: 'mynotebook', dir: '00_inbox' };
  }

  function dailySource() {
    return window.COCKPID_SOURCES?.get('daily') || { repo: 'mynotebook', dir: '01_Daily' };
  }

  function normalizeSourceDir(dir) {
    return String(dir || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  }

  function unsafeSourceRelationship(inbox, daily) {
    const inboxRepo = String(inbox?.repo || '').trim().toLowerCase();
    const dailyRepo = String(daily?.repo || '').trim().toLowerCase();
    if (inboxRepo !== dailyRepo) return false;

    const inboxDir = normalizeSourceDir(inbox?.dir);
    const dailyDir = normalizeSourceDir(daily?.dir);
    const unsafeSegment = (dir) => dir.split('/').some((part) => part === '.' || part === '..');
    if (unsafeSegment(inboxDir) || unsafeSegment(dailyDir)) return true;
    if (inboxDir === dailyDir) return true;
    if (!inboxDir || !dailyDir) return true;
    return inboxDir.startsWith(`${dailyDir}/`) || dailyDir.startsWith(`${inboxDir}/`);
  }

  function parseMemoFileName(fileName) {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.md$/.exec(String(fileName || ''));
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    if (month < 1 || month > 12 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

    const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (day < 1 || day > daysInMonth) return null;

    return {
      dateStr: `${match[1]}-${match[2]}-${match[3]}`,
      timeStr: `${match[4]}:${match[5]}:${match[6]}`
    };
  }

  function isMergeCandidateFile(file) {
    return file?.type === 'file' && Boolean(parseMemoFileName(file.name));
  }

  function joinPath(dir, child) {
    const base = String(dir || '').replace(/^\/+|\/+$/g, '');
    const tail = String(child || '').replace(/^\/+/, '');
    return base ? `${base}/${tail}` : tail;
  }

  function encodeWebPath(path) {
    return String(path || '').split('/').map(encodeURIComponent).join('/');
  }

  function encodeContent(value) {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function decodeContent(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function jstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  }

  function archiveStamp() {
    const p = jstParts();
    return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}${String(new Date().getMilliseconds()).padStart(3, '0')}`;
  }

  function syncTopMergeButton() {
    const button = topMergeButton || document.getElementById('topMemoMerge');
    if (!button) return;
    const count = currentFiles.length;
    button.disabled = merging || loading || !token();
    button.textContent = merging ? 'INBOX → DAILY …' : `INBOX → DAILY${count ? ` · ${count}` : ''}`;
    button.title = count ? `${count}件のInboxメモをDailyへ統合` : 'Inboxを確認してDailyへ統合';
  }

  function ensureTopMergeUi() {
    const actions = document.querySelector('.capture-object .capture-actions');
    const captureButton = document.getElementById('captureBtn');
    if (!actions || !captureButton) return null;
    let button = document.getElementById('topMemoMerge');
    if (!button) {
      button = document.createElement('button');
      button.className = 'memo-top-merge';
      button.id = 'topMemoMerge';
      button.type = 'button';
      button.textContent = 'INBOX → DAILY';
      captureButton.before(button);
    }
    topMergeButton = button;
    syncTopMergeButton();
    return button;
  }

  function syncInboxSourceUi() {
    const source = inboxSource();
    const daily = dailySource();
    const heading = inboxPanel.querySelector('.memo-inbox-head b');
    if (heading) heading.textContent = `${source.repo} / ${source.dir}`;
    const description = inboxPanel.querySelector('.memo-inbox-head span:not(.memo-inbox-merge-status)');
    if (description) description.textContent = `Daily: ${daily.repo} / ${daily.dir} → ${TARGET_HEADING}`;
    const links = inboxPanel.querySelectorAll('.memo-inbox-actions a');
    const obsidianLink = links[0];
    const githubLink = links[1];
    if (obsidianLink) obsidianLink.href = `obsidian://open?vault=Notebook&file=${encodeURIComponent(source.dir)}`;
    if (githubLink) githubLink.href = `https://github.com/plzsayyes3/${encodeURIComponent(source.repo)}/tree/main/${encodeWebPath(source.dir)}`;
  }

  function ensureMergeUi() {
    const head = inboxPanel.querySelector('.memo-inbox-head');
    if (!head || !refreshButton) return {};

    let controls = head.querySelector('.memo-inbox-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'memo-inbox-controls';
      refreshButton.before(controls);
      controls.append(refreshButton);
    }

    let mergeButton = document.getElementById('memoInboxMerge');
    if (!mergeButton) {
      mergeButton = document.createElement('button');
      mergeButton.className = 'btn primary';
      mergeButton.id = 'memoInboxMerge';
      mergeButton.type = 'button';
      mergeButton.textContent = 'MERGE TO DAILY';
      controls.append(mergeButton);
    }

    let status = document.getElementById('memoInboxMergeStatus');
    if (!status) {
      status = document.createElement('span');
      status.className = 'memo-inbox-merge-status';
      status.id = 'memoInboxMergeStatus';
      status.setAttribute('aria-live', 'polite');
      const info = head.querySelector('div:not(.memo-inbox-controls)');
      info?.append(status);
    }
    return { mergeButton, status };
  }

  function setMergeStatus(message = '', error = false) {
    const status = document.getElementById('memoInboxMergeStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function setMode(mode) {
    const inbox = mode === 'inbox';
    captureTab.classList.toggle('active', !inbox);
    inboxTab.classList.toggle('active', inbox);
    captureTab.setAttribute('aria-selected', inbox ? 'false' : 'true');
    inboxTab.setAttribute('aria-selected', inbox ? 'true' : 'false');
    capturePanel.classList.toggle('active', !inbox);
    inboxPanel.classList.toggle('active', inbox);
    capturePanel.hidden = inbox;
    inboxPanel.hidden = !inbox;
    if (inbox) loadInbox();
    else setTimeout(() => document.getElementById('memoText')?.focus(), 20);
  }

  function labelFor(name) {
    const parsed = parseMemoFileName(name);
    if (!parsed) return name.replace(/\.md$/i, '');
    return `${parsed.dateStr.replace(/-/g, '.')} ${parsed.timeStr.slice(0, 5)}`;
  }

  function render(rows, source) {
    const files = (Array.isArray(rows) ? rows : [])
      .filter((row) => row.type === 'file' && /\.md$/i.test(row.name))
      .sort((a, b) => b.name.localeCompare(a.name));
    currentFiles = files;
    inboxCount.textContent = String(files.length);
    const mergeButton = document.getElementById('memoInboxMerge');
    if (mergeButton) mergeButton.disabled = merging || !files.length;
    syncTopMergeButton();
    if (!files.length) {
      inboxList.innerHTML = '<div class="memo-inbox-empty">未処理Memoはありません。</div>';
      return;
    }
    inboxList.innerHTML = files.slice(0, 60).map((file) => {
      const fallback = `https://github.com/plzsayyes3/${encodeURIComponent(source.repo)}/blob/main/${encodeWebPath(source.dir)}/${encodeURIComponent(file.name)}`;
      const href = file.html_url || fallback;
      return `<a class="memo-inbox-item" href="${href}" target="_blank" rel="noopener noreferrer"><span class="memo-inbox-item-main"><b>${esc(file.name)}</b><span>${esc(labelFor(file.name))}</span></span><span class="memo-inbox-item-open">OPEN ↗</span></a>`;
    }).join('');
  }

  async function loadInbox(force = false) {
    if (loading || (loaded && !force)) return;
    if (!token()) {
      currentFiles = [];
      inboxCount.textContent = '—';
      inboxList.innerHTML = '<div class="memo-inbox-empty">GitHub token が必要です。Battery / Settings → GitHub から設定してください。</div>';
      const mergeButton = document.getElementById('memoInboxMerge');
      if (mergeButton) mergeButton.disabled = true;
      syncTopMergeButton();
      return;
    }
    const source = inboxSource();
    loading = true;
    syncTopMergeButton();
    inboxList.innerHTML = `<div class="memo-inbox-empty">${esc(source.repo)}/${esc(source.dir)} を確認しています…</div>`;
    try {
      const rows = await gh(source.dir, source.repo);
      render(rows, source);
      loaded = true;
    } catch (error) {
      console.error('memo inbox', error);
      currentFiles = [];
      inboxCount.textContent = '!';
      inboxList.innerHTML = `<div class="memo-inbox-empty">${esc(String(error?.message || error))}</div>`;
      const mergeButton = document.getElementById('memoInboxMerge');
      if (mergeButton) mergeButton.disabled = true;
    } finally {
      loading = false;
      syncTopMergeButton();
    }
  }

  async function apiWrite(method, repo, path, payload) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${encodeWebPath(path)}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      const error = new Error(detail?.message || `${repo} ${method} ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json().catch(() => ({}));
  }

  async function putFile(repo, path, content, message, sha = '') {
    const payload = { message, content: encodeContent(content), branch: 'main' };
    if (sha) payload.sha = sha;
    return apiWrite('PUT', repo, path, payload);
  }

  async function deleteFile(repo, path, sha, message) {
    return apiWrite('DELETE', repo, path, { message, sha, branch: 'main' });
  }

  async function readMemo(file, source) {
    const parsed = parseMemoFileName(file?.name);
    if (!parsed) throw new Error(`${file?.name || '不明なファイル'} は統合対象のMemo名ではありません。`);

    const path = joinPath(source.dir, file.name);
    const detail = await gh(path, source.repo);
    if (!detail || Array.isArray(detail) || !detail.content || !detail.sha) throw new Error(`${file.name} を読み込めません。`);
    const rawText = decodeContent(detail.content);
    let body = rawText.replace(/^---[\s\S]*?---\n?/, '').trim();
    if (!body) body = `*(空のメモ: ${file.name.replace(/\.md$/i, '')})*`;
    const indentedBody = body.split('\n').map((line, index) => index === 0 ? line : `  ${line}`).join('\n');
    return { fileName: file.name, path, sha: detail.sha, rawText, body: indentedBody, ...parsed };
  }

  function markerFor(entry) {
    return `<!-- workbench-memo:${encodeURIComponent(entry.fileName)}:${encodeURIComponent(entry.sha)} -->`;
  }

  function visibleEntry(entry) {
    return `- ${entry.timeStr} ${entry.body}`;
  }

  function formattedEntry(entry) {
    return `${visibleEntry(entry)}\n  ${markerFor(entry)}`;
  }

  function alreadyMerged(content, entry) {
    return content.includes(markerFor(entry));
  }

  function insertUnderHeading(content, appendBlock) {
    if (!content.trim()) return `${TARGET_HEADING}\n${appendBlock}`;
    if (content.includes(TARGET_HEADING)) {
      const headingIndex = content.indexOf(TARGET_HEADING);
      const afterHeadingIndex = headingIndex + TARGET_HEADING.length;
      const remainder = content.slice(afterHeadingIndex);
      const nextHeadingMatch = remainder.match(/\n#{1,6}\s/);
      if (nextHeadingMatch) {
        const insertPos = afterHeadingIndex + nextHeadingMatch.index;
        return content.slice(0, insertPos) + `\n${appendBlock}` + content.slice(insertPos);
      }
      return content.trimEnd() + `\n${appendBlock}`;
    }
    return content.trimEnd() + `\n\n${TARGET_HEADING}\n${appendBlock}`;
  }

  function missingDailyError(dateStr) {
    return new Error(`${dateStr} のDailyが存在しないため統合を停止しました。`);
  }

  async function assertDailyFilesExist(dates, source) {
    for (const dateStr of dates) {
      const path = joinPath(source.dir, `${dateStr}.md`);
      const daily = await gh(path, source.repo);
      if (!daily || Array.isArray(daily) || !daily.sha) throw missingDailyError(dateStr);
    }
  }

  async function writeDaily(dateStr, entries, source) {
    const path = joinPath(source.dir, `${dateStr}.md`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const old = await gh(path, source.repo);
      if (!old || Array.isArray(old) || !old.sha) throw missingDailyError(dateStr);
      const current = old.content ? decodeContent(old.content) : '';
      const pending = entries.filter((entry) => !alreadyMerged(current, entry));
      if (!pending.length) return 0;
      const appendBlock = pending.map(formattedEntry).join('\n') + '\n';
      const next = insertUnderHeading(current, appendBlock);
      try {
        await putFile(source.repo, path, next, `workbench: merge ${pending.length} memo(s) into ${dateStr}`, old.sha);
        return pending.length;
      } catch (error) {
        if (error.status === 409 && attempt === 0) continue;
        throw error;
      }
    }
    return 0;
  }

  async function archiveMemo(entry, source) {
    if (!parseMemoFileName(entry?.fileName)) throw new Error(`${entry?.fileName || '不明なファイル'} はarchive対象のMemo名ではありません。`);

    const archiveDir = joinPath(source.dir, 'archive');
    let destPath = joinPath(archiveDir, entry.fileName);
    const existing = await gh(destPath, source.repo);
    if (existing && !Array.isArray(existing)) {
      const same = existing.content && decodeContent(existing.content) === entry.rawText;
      if (same) {
        await deleteFile(source.repo, entry.path, entry.sha, `workbench: archive memo ${entry.fileName}`);
        return;
      }
      const dot = entry.fileName.lastIndexOf('.');
      const base = dot > 0 ? entry.fileName.slice(0, dot) : entry.fileName;
      const ext = dot > 0 ? entry.fileName.slice(dot) : '';
      destPath = joinPath(archiveDir, `${base}_${archiveStamp()}${ext}`);
    }
    await putFile(source.repo, destPath, entry.rawText, `workbench: archive memo ${entry.fileName}`);
    await deleteFile(source.repo, entry.path, entry.sha, `workbench: remove merged memo ${entry.fileName}`);
  }

  async function mergeInboxToDaily() {
    if (merging) return;
    if (!token()) {
      setMergeStatus('TOKEN REQUIRED', true);
      return;
    }

    const files = currentFiles.filter(isMergeCandidateFile);
    if (!files.length) {
      setMergeStatus(currentFiles.length ? '統合対象のMemoはありません。' : '統合対象はありません。');
      if (!currentFiles.length && topMergeButton) {
        topMergeButton.textContent = 'INBOX EMPTY';
        setTimeout(syncTopMergeButton, 1200);
      }
      return;
    }

    const inbox = inboxSource();
    const daily = dailySource();
    if (unsafeSourceRelationship(inbox, daily)) {
      setMergeStatus('安全のため統合を停止しました。Inbox / Daily の保存先設定を確認してください。', true);
      return;
    }

    const approved = window.confirm(`${inbox.repo}/${inbox.dir} の ${files.length} 件を ${daily.repo}/${daily.dir} の「${TARGET_HEADING}」へ統合し、archiveへ退避します。`);
    if (!approved) return;

    const mergeButton = document.getElementById('memoInboxMerge');
    merging = true;
    if (mergeButton) mergeButton.disabled = true;
    if (refreshButton) refreshButton.disabled = true;
    syncTopMergeButton();
    setMergeStatus('メモを読み込んでいます…');

    try {
      const entries = [];
      for (let index = 0; index < files.length; index += 1) {
        setMergeStatus(`読み込み ${index + 1}/${files.length}…`);
        entries.push(await readMemo(files[index], inbox));
      }

      const groups = new Map();
      entries.forEach((entry) => {
        if (!groups.has(entry.dateStr)) groups.set(entry.dateStr, []);
        groups.get(entry.dateStr).push(entry);
      });
      groups.forEach((group) => group.sort((a, b) => a.fileName.localeCompare(b.fileName)));

      const dates = [...groups.keys()].sort();
      setMergeStatus('Dailyの存在を確認しています…');
      await assertDailyFilesExist(dates, daily);

      let added = 0;
      let archived = 0;
      for (let dateIndex = 0; dateIndex < dates.length; dateIndex += 1) {
        const dateStr = dates[dateIndex];
        const group = groups.get(dateStr);
        setMergeStatus(`Daily更新 ${dateIndex + 1}/${dates.length} · ${dateStr}…`);
        added += await writeDaily(dateStr, group, daily);
        for (const entry of group) {
          setMergeStatus(`archive ${archived + 1}/${entries.length}…`);
          await archiveMemo(entry, inbox);
          archived += 1;
        }
      }

      setMergeStatus(`完了 · ${added}件追記 / ${archived}件archive`);
      loaded = false;
      await loadInbox(true);
    } catch (error) {
      console.error('memo inbox merge', error);
      setMergeStatus(`停止 · ${String(error?.message || error)}`, true);
      loaded = false;
      await loadInbox(true).catch(() => {});
    } finally {
      merging = false;
      if (refreshButton) refreshButton.disabled = false;
      const button = document.getElementById('memoInboxMerge');
      if (button) button.disabled = !currentFiles.length;
      syncTopMergeButton();
    }
  }

  const { mergeButton } = ensureMergeUi();
  const topButton = ensureTopMergeUi();
  mergeButton?.addEventListener('click', mergeInboxToDaily);
  topButton?.addEventListener('click', async () => {
    await loadInbox(true);
    await mergeInboxToDaily();
  });
  captureTab.addEventListener('click', () => setMode('capture'));
  inboxTab.addEventListener('click', () => setMode('inbox'));
  refreshButton?.addEventListener('click', () => loadInbox(true));

  document.getElementById('memoOpen')?.addEventListener('click', () => {
    if (inboxTab.classList.contains('active')) loadInbox(true);
  });
  window.addEventListener('cockpid:sources-changed', () => {
    loaded = false;
    syncInboxSourceUi();
    loadInbox(true);
  });

  syncInboxSourceUi();
  setMode('capture');
  loadInbox(true);
})();
