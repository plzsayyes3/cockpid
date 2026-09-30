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
  let activeMergeQueueNames = null;
  let completedMergeNames = new Set();
  let topMergeButton = null;
  let topMergeProgress = '';
  let areaRouteButton = null;
  let areaRoutePanel = null;
  let areaRouteAreas = new Map();
  let selectedRouteArea = null;
  const memoRoute = window.COCKPID_MEMO_ROUTE;

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
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\d{3})?\.md$/.exec(String(fileName || ''));
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
    const count = currentFiles.filter(isMergeCandidateFile).length;
    button.disabled = Boolean(topMergeProgress) || merging || loading || !token() || !count;
    button.textContent = topMergeProgress || (merging ? 'INBOX → DAILY …' : `INBOX → DAILY${count ? ` · ${count}` : ''}`);
    button.title = topMergeProgress
      ? topMergeProgress
      : (count ? `${count}件のInboxメモをDailyへ統合` : 'Dailyへ統合できるInboxメモはありません');
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

  function ensureAreaRoutingUi() {
    const actions = document.querySelector('.capture-object .capture-actions');
    const captureButton = document.getElementById('captureBtn');
    if (!actions || !captureButton) return null;
    if (!areaRouteButton) {
      areaRouteButton = document.createElement('button');
      areaRouteButton.className = 'memo-area-route';
      areaRouteButton.type = 'button';
      areaRouteButton.textContent = 'AREA →';
      areaRouteButton.setAttribute('aria-expanded', 'false');
      captureButton.before(areaRouteButton);
    }
    if (!areaRoutePanel) {
      areaRoutePanel = document.createElement('div');
      areaRoutePanel.className = 'memo-area-route-panel';
      areaRoutePanel.hidden = true;
      areaRoutePanel.setAttribute('aria-live', 'polite');
      actions.parentElement?.append(areaRoutePanel);
    }
    return areaRouteButton;
  }

  function branchCount(area, key) {
    const collection = `${key}s`;
    return Array.isArray(area?.[collection]) ? area[collection].length : 0;
  }

  function renderBranchChoices(area) {
    if (!areaRoutePanel || !memoRoute) return;
    selectedRouteArea = area;
    const branches = memoRoute.branchTypes();
    areaRoutePanel.innerHTML = `<span class="memo-area-route-label">${esc(area.title || area.id)} · Project / Assignment / Task / Reference / Principle</span>${branches.map((branch) => `<button type="button" data-memo-branch="${branch.key}">${branch.label}${branchCount(area, branch.key) ? ` · ${branchCount(area, branch.key)}` : ''}</button>`).join('')}`;
  }

  function renderSelectedRoute(route) {
    if (!areaRoutePanel || !memoRoute || !route) return;
    areaRoutePanel.innerHTML = `<span class="memo-area-route-label">選択中: ${esc(memoRoute.displayLabel(route))} · 保存先はInboxのまま</span><button type="button" data-memo-route-reset="true">Areaを選び直す</button>`;
  }

  async function showAreaRouting() {
    if (!areaRoutePanel) return;
    areaRouteButton.setAttribute('aria-expanded', 'true');
    areaRoutePanel.hidden = false;
    areaRoutePanel.textContent = 'Areaを読み込んでいます…';
    try {
      const view = await window.COCKPID_AREA_VIEW?.load?.();
      const areas = Array.isArray(view?.areas) ? view.areas : [];
      areaRouteAreas = new Map(areas.map((area) => [String(area.id), area]));
      areaRoutePanel.innerHTML = areas.length
        ? `<span class="memo-area-route-label">IDEAの次の分岐</span>${areas.map((area) => `<button type="button" data-area-route-id="${String(area.id).replace(/[^A-Za-z0-9_-]/g, '')}">${esc(area.title || area.id)}</button>`).join('')}`
        : '<span class="memo-area-route-label">未分類のままInboxへ置きます。</span>';
    } catch (_) {
      areaRoutePanel.textContent = 'Areaを読み込めませんでした。Inboxへ置けます。';
    }
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
    if (status) {
      status.textContent = message;
      status.classList.toggle('is-error', error);
    }
  }

  function setTopMergeProgress(message = '') {
    topMergeProgress = message;
    syncTopMergeButton();
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
    if (mergeButton) mergeButton.disabled = merging || !files.some(isMergeCandidateFile);
    syncTopMergeButton();
    if (!files.length) {
      inboxList.innerHTML = '<div class="memo-inbox-empty">未処理Memoはありません。</div>';
      return;
    }
    inboxList.innerHTML = files.slice(0, 60).map((file) => {
      const fallback = `https://github.com/plzsayyes3/${encodeURIComponent(source.repo)}/blob/main/${encodeWebPath(source.dir)}/${encodeURIComponent(file.name)}`;
      const href = file.html_url || fallback;
      const route = memoRoute?.forMemo(file.name);
      const routeLabel = route ? `<span class="memo-inbox-item-route">${esc(memoRoute.displayLabel(route))}</span>` : '';
      return `<a class="memo-inbox-item" href="${href}" target="_blank" rel="noopener noreferrer"><span class="memo-inbox-item-main"><b>${esc(file.name)}</b><span>${esc(labelFor(file.name))}</span>${routeLabel}</span><span class="memo-inbox-item-open">OPEN ↗</span></a>`;
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
      const visibleRows = merging && activeMergeQueueNames
        ? rows.filter((row) => !completedMergeNames.has(row.name))
        : rows;
      render(visibleRows, source);
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

  function sourceMarkerFor(entry) {
    return `<!-- inbox-source:${encodeURIComponent(entry.fileName)} -->`;
  }

  function legacyMarkerFor(entry) {
    return `<!-- workbench-memo:${encodeURIComponent(entry.fileName)}:${encodeURIComponent(entry.sha)} -->`;
  }

  function visibleEntry(entry) {
    return `- ${entry.timeStr} ${entry.body}`;
  }

  function formattedEntry(entry) {
    return `${visibleEntry(entry)}\n  ${sourceMarkerFor(entry)}`;
  }

  function normalizeForCompare(value) {
    return String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]*/g, '\n')
      .trim();
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  }

  function classifyDailyEntry(content, entry) {
    const text = String(content || '');
    if (text.includes(sourceMarkerFor(entry)) || text.includes(legacyMarkerFor(entry))) {
      return { state: 'existing-id', reason: 'ID一致' };
    }
    const normalizedDaily = normalizeForCompare(text);
    const normalizedEntry = normalizeForCompare(visibleEntry(entry));
    if (normalizedEntry && normalizedDaily.includes(normalizedEntry)) {
      return { state: 'existing-content', reason: '時刻＋本文一致' };
    }
    const sameTime = new RegExp(`(^|\\n)\\s*-\\s*${escapeRegExp(entry.timeStr)}(?:\\s|$)`, 'm').test(text);
    if (sameTime) {
      return { state: 'ambiguous', reason: '同時刻の別内容あり' };
    }
    return { state: 'pending', reason: '未処理' };
  }

  function alreadyMerged(content, entry) {
    const state = classifyDailyEntry(content, entry).state;
    return state === 'existing-id' || state === 'existing-content';
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

    const inbox = inboxSource();
    const daily = dailySource();
    if (unsafeSourceRelationship(inbox, daily)) {
      setMergeStatus('安全のため統合を停止しました。Inbox / Daily の保存先設定を確認してください。', true);
      return;
    }

    // Inbox全体のpullは開始時の1回だけ。
    // この時点の候補を固定キューとして扱い、処理中に増えたMemoは次回へ回す。
    setMergeStatus('Inboxを取得して処理キューを作っています…');
    setTopMergeProgress('INBOX取得中…');
    loaded = false;
    await loadInbox(true);

    const queue = currentFiles
      .filter(isMergeCandidateFile)
      .map((file) => ({ ...file }))
      .sort((a, b) => a.name.localeCompare(b.name));
    activeMergeQueueNames = new Set(queue.map((file) => file.name));
    completedMergeNames = new Set();
    if (!queue.length) {
      activeMergeQueueNames = null;
      completedMergeNames = new Set();
      setTopMergeProgress('');
      setMergeStatus(currentFiles.length ? '統合対象のMemoはありません。' : '統合対象はありません。');
      if (!currentFiles.length && topMergeButton) {
        topMergeButton.textContent = 'INBOX EMPTY';
        setTimeout(syncTopMergeButton, 1200);
      }
      return;
    }

    const approved = window.confirm(
      `Inboxから${queue.length}件を処理します。\n\n1件ずつ Daily確認 → 必要なら追記 → 成功確認 → archive の順で処理します。\n失敗したMemoはInboxに残し、後続のMemoは続行します。\n\n続行しますか？`
    );
    if (!approved) {
      activeMergeQueueNames = null;
      completedMergeNames = new Set();
      setTopMergeProgress('');
      return;
    }

    const mergeButton = document.getElementById('memoInboxMerge');
    merging = true;
    if (mergeButton) mergeButton.disabled = true;
    if (refreshButton) refreshButton.disabled = true;
    syncTopMergeButton();

    let added = 0;
    let existing = 0;
    let archived = 0;
    let ambiguous = 0;
    let failed = 0;
    const archivedNames = new Set();
    const failedNames = [];

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const file = queue[index];
        const remaining = queue.length - index;
        setMergeStatus(`処理 ${index + 1}/${queue.length} · 残り${remaining} · ${file.name}`);
        setTopMergeProgress(`INBOX → DAILY ${index + 1}/${queue.length}`);

        try {
          // 対象Memoだけを最新取得。Inbox一覧は再pullしない。
          const entry = await readMemo(file, inbox);

          // Dailyは毎回最新版を取得。前の1件でSHAが変わるため必須。
          const dailyPath = joinPath(daily.dir, `${entry.dateStr}.md`);
          const latestDaily = await gh(dailyPath, daily.repo);
          if (!latestDaily || Array.isArray(latestDaily) || !latestDaily.sha) {
            throw missingDailyError(entry.dateStr);
          }
          const latestDailyContent = latestDaily.content ? decodeContent(latestDaily.content) : '';
          const classification = classifyDailyEntry(latestDailyContent, entry);

          if (classification.state === 'ambiguous') {
            ambiguous += 1;
            failedNames.push(`${entry.fileName}（要確認）`);
            continue;
          }

          if (classification.state === 'pending') {
            const wrote = await writeDaily(entry.dateStr, [entry], daily);
            added += wrote;

            // 書き込み後にDailyを再確認。markerまたは本文一致を確認できるまでarchiveしない。
            const verifiedDaily = await gh(dailyPath, daily.repo);
            if (!verifiedDaily || Array.isArray(verifiedDaily) || !verifiedDaily.sha) {
              throw new Error(`${entry.fileName}: Daily書き込み後の確認に失敗しました。`);
            }
            const verifiedContent = verifiedDaily.content ? decodeContent(verifiedDaily.content) : '';
            if (!alreadyMerged(verifiedContent, entry)) {
              throw new Error(`${entry.fileName}: Dailyへの反映を確認できませんでした。`);
            }
          } else {
            existing += 1;
          }

          // archive直前に対象Memoだけを再確認。
          const latestInboxMemo = await gh(entry.path, inbox.repo);
          if (!latestInboxMemo || Array.isArray(latestInboxMemo) || !latestInboxMemo.sha) {
            throw new Error(`${entry.fileName}: archive前にInbox Memoを確認できませんでした。`);
          }
          if (latestInboxMemo.sha !== entry.sha) {
            throw new Error(`${entry.fileName}: 処理中にMemoが変更されたためInboxに残しました。`);
          }

          await archiveMemo(entry, inbox);
          archived += 1;
          archivedNames.add(entry.fileName);
          completedMergeNames.add(entry.fileName);

          // Inbox全体は再pullせず、ローカルのキュー表示だけ更新。
          currentFiles = currentFiles.filter((row) => !completedMergeNames.has(row.name));
          render(currentFiles, inbox);
        } catch (error) {
          failed += 1;
          failedNames.push(file.name);
          console.error('memo inbox item merge', file.name, error);
          // 1件の失敗で全体を止めない。元MemoはInboxに残る。
        }
      }

      const parts = [
        `処理 ${queue.length}件`,
        `新規追記 ${added}件`,
        `Daily既存 ${existing}件`,
        `archive ${archived}件`,
        `要確認 ${ambiguous}件`,
        `失敗 ${failed}件`
      ];
      setMergeStatus(`完了 · ${parts.join(' / ')}`, failed > 0 || ambiguous > 0);
      setTopMergeProgress(failed > 0 || ambiguous > 0
        ? `完了 · ${archived}/${queue.length}`
        : `完了 · ${queue.length}/${queue.length}`);

      if (failedNames.length) {
        console.warn('[Inbox → Daily] Inboxに残したMemo', failedNames);
      }
    } finally {
      // 完了済みを古いInbox取得結果から復活させない。
      currentFiles = currentFiles.filter((row) => !completedMergeNames.has(row.name));
      render(currentFiles, inbox);
      merging = false;
      activeMergeQueueNames = null;
      if (refreshButton) refreshButton.disabled = false;
      const button = document.getElementById('memoInboxMerge');
      if (button) button.disabled = !currentFiles.some(isMergeCandidateFile);
      syncTopMergeButton();
      if (topMergeProgress) {
        setTimeout(() => {
          topMergeProgress = '';
          completedMergeNames = new Set();
          syncTopMergeButton();
        }, 1800);
      }
    }
  }

  const { mergeButton } = ensureMergeUi();
  const topButton = ensureTopMergeUi();
  const areaButton = ensureAreaRoutingUi();
  mergeButton?.addEventListener('click', mergeInboxToDaily);
  topButton?.addEventListener('click', mergeInboxToDaily);
  areaButton?.addEventListener('click', () => {
    if (areaRoutePanel?.hidden) showAreaRouting();
    else {
      areaRoutePanel.hidden = true;
      areaButton.setAttribute('aria-expanded', 'false');
    }
  });
  areaRoutePanel?.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-area-route-id]');
    if (button) {
      const area = areaRouteAreas.get(button.dataset.areaRouteId);
      if (area) renderBranchChoices(area);
      return;
    }
    const branchButton = event.target.closest?.('[data-memo-branch]');
    if (branchButton && selectedRouteArea && memoRoute) {
      const route = memoRoute.selectBranch(selectedRouteArea, branchButton.dataset.memoBranch);
      memoRoute.setCurrent(route);
      renderSelectedRoute(route);
      const status = document.getElementById('memoStatus');
      if (status) status.textContent = `分岐: ${memoRoute.displayLabel(route)} · 保存先はInboxのまま`;
      return;
    }
    const resetButton = event.target.closest?.('[data-memo-route-reset]');
    if (resetButton) {
      selectedRouteArea = null;
      showAreaRouting();
    }
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
