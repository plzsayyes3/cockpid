(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const TOKEN_KEY = 'zen-note-github-token';
  const TASK_BRANCH = 'main';
  const TECHO_BRANCH = 'main';
  const MAX_RETRIES = 3;

  const token = () => localStorage.getItem(TOKEN_KEY) || '';
  const source = (name, fallback) => window.COCKPID_SOURCES?.get?.(name) || fallback;
  const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
  const cleanDir = (value) => String(value || '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  const pathJoin = (dir, name) => cleanDir(dir) ? `${cleanDir(dir)}/${String(name || '').replace(/^\/+/, '')}` : String(name || '').replace(/^\/+/, '');
  const encodePath = (path) => String(path || '').split('/').map(encodeURIComponent).join('/');

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(String(value ?? ''));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function decodeBase64(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }

  function jstDate() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(new Date());
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function dateInfo(date) {
    const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error('日付が不正です');
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const weekday = ['日','月','火','水','木','金','土'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return { year, month, day, weekday };
  }

  function isoWeek(date) {
    const info = dateInfo(date);
    const value = new Date(Date.UTC(info.year, info.month - 1, info.day));
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
    return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  }

  async function getFile(repo, path, branch) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, {
      headers:{ Accept:'application/vnd.github+json', Authorization:`Bearer ${token()}` },
      cache:'no-store'
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${repo} read ${response.status}`);
    const payload = await response.json();
    return { sha:payload.sha || null, text:decodeBase64(payload.content || '') };
  }

  async function putFile(repo, path, branch, text, sha, message) {
    const body = { message, branch, content:encodeBase64(text) };
    if (sha) body.sha = sha;
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${encodePath(path)}`, {
      method:'PUT',
      headers:{ Accept:'application/vnd.github+json', Authorization:`Bearer ${token()}`, 'Content-Type':'application/json' },
      body:JSON.stringify(body)
    });
    if (response.status === 409 || response.status === 422) {
      const error = new Error(`${repo} conflict ${response.status}`);
      error.conflict = true;
      throw error;
    }
    if (!response.ok) throw new Error(`${repo} write ${response.status}`);
    return response.json();
  }

  async function mutateFile({ repo, path, branch, message, mutate }) {
    if (!token()) throw new Error('GitHub token が必要です');
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const current = await getFile(repo, path, branch);
      const result = mutate(current?.text || '');
      if (result.duplicate) return { duplicate:true, path, detail:result.detail || '' };
      try {
        await putFile(repo, path, branch, result.text, current?.sha || null, message);
        return { duplicate:false, path, detail:result.detail || '' };
      } catch (error) {
        if (!error.conflict || attempt === MAX_RETRIES - 1) throw error;
      }
    }
    throw new Error('保存競合を解消できませんでした');
  }

  function tasklinerTitle(line) {
    const match = String(line || '').match(/^\s*-\s+(?:\[[ xX/>]\]\s+)?(.+?)\s*$/);
    if (!match) return '';
    let value = match[1]
      .replace(/\s*【[^】]*】\s*$/, '')
      .replace(/\s*(?:\(\s*\d+\s*m\s*\)|⏳\s*\d+\s*m)\s*$/, '');
    return clean(value);
  }

  function appendTaskliner(text, title, date) {
    const wanted = clean(title);
    let lines = String(text || '').replace(/\r/g, '').split('\n');
    if (lines.some((line) => tasklinerTitle(line) === wanted)) return { duplicate:true };
    if (!lines.some((line) => clean(line))) lines = [`# ${date}`];

    const row = `- [ ] ${wanted}`;
    const firstSection = lines.findIndex((line) => /^##\s+/.test(line));
    if (firstSection >= 0) {
      let insertAt = firstSection;
      while (insertAt > 0 && !clean(lines[insertAt - 1])) insertAt -= 1;
      const block = [row, ''];
      if (insertAt > 0 && clean(lines[insertAt - 1])) block.unshift('');
      lines.splice(insertAt, 0, ...block);
    } else {
      while (lines.length && !clean(lines[lines.length - 1])) lines.pop();
      if (lines.length && clean(lines[lines.length - 1])) lines.push('');
      lines.push(row);
    }
    return { text:`${lines.join('\n').replace(/\s+$/, '')}\n` };
  }

  async function sendTodayToTaskliner({ title }) {
    const target = source('taskliner', { repo:'mynotebook', dir:'09_taskchute' });
    const date = jstDate();
    return mutateFile({
      repo:target.repo,
      path:pathJoin(target.dir, `${date}.md`),
      branch:TASK_BRANCH,
      message:`cockpid: send ON HAND to TaskLiner ${date}`,
      mutate:(text) => appendTaskliner(text, title, date)
    });
  }

  function headingLevel(line) {
    return String(line || '').match(/^(#{1,6})\s+/)?.[1].length || 0;
  }

  function sectionEnd(lines, start, level) {
    for (let i = start + 1; i < lines.length; i += 1) {
      const next = headingLevel(lines[i]);
      if (next && next <= level) return i;
    }
    return lines.length;
  }

  function nextHeading(lines, start) {
    for (let i = start + 1; i < lines.length; i += 1) if (headingLevel(lines[i])) return i;
    return lines.length;
  }

  function itemTitle(line) {
    const match = String(line || '').match(/^\s*-\s+(?:\[([ xX])\]\s+)?(?:(\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?)\s+)?(.+?)\s*$/);
    return match ? clean(match[3]) : '';
  }

  function hasTitle(lines, start, end, title) {
    const wanted = clean(title);
    for (let i = start; i < end; i += 1) if (itemTitle(lines[i]) === wanted) return true;
    return false;
  }

  function ensureMonthBase(text, info) {
    const raw = String(text || '').replace(/\r/g, '');
    if (raw.trim()) return raw.split('\n');
    return [`# ${info.year}年${info.month}月`, ''];
  }

  function targetDateHeading(line, info) {
    const value = String(line || '');
    return new RegExp(`^#{1,6}\\s+${info.year}-${String(info.month).padStart(2, '0')}-${String(info.day).padStart(2, '0')}\\s*$`).test(value)
      || new RegExp(`^#{1,6}\\s+${info.month}月${info.day}日(?:\\([^)]*\\))?\\s*$`).test(value)
      || new RegExp(`^#{1,6}\\s+${info.month}/${info.day}(?:\\([^)]*\\))?\\s*$`).test(value);
  }

  function weekNumberFromHeading(line) {
    const match = String(line || '').match(/^##\s+week\s*(\d{1,2})\s*$/i);
    return match ? Number(match[1]) : null;
  }

  function dateFromHeading(line, year) {
    let match = String(line || '').match(/^##\s+(\d{4})-(\d{2})-(\d{2})\s*$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    match = String(line || '').match(/^##\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/);
    if (match) return `${year}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
    match = String(line || '').match(/^##\s+(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?\s*$/);
    if (match) return `${year}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
    return '';
  }

  function appendDatedTecho(text, title, date) {
    const info = dateInfo(date);
    const lines = ensureMonthBase(text, info);
    const dateStart = lines.findIndex((line) => targetDateHeading(line, info));
    const taskLine = `- [ ] ${clean(title)}`;

    if (dateStart >= 0) {
      const end = nextHeading(lines, dateStart);
      if (hasTitle(lines, dateStart + 1, end, title)) return { duplicate:true };
      let insertAt = end;
      while (insertAt > dateStart + 1 && !clean(lines[insertAt - 1])) insertAt -= 1;
      lines.splice(insertAt, 0, taskLine);
      return { text:`${lines.join('\n').replace(/\s+$/, '')}\n`, detail:date };
    }

    const targetWeek = isoWeek(date);
    const weekStarts = lines.map((line, index) => ({ index, week:weekNumberFromHeading(line) })).filter((entry) => entry.week !== null);
    const exactWeek = weekStarts.find((entry) => entry.week === targetWeek);
    let start = exactWeek ? exactWeek.index + 1 : 0;
    let end = exactWeek ? (weekStarts.find((entry) => entry.index > exactWeek.index)?.index ?? lines.length) : lines.length;
    if (!exactWeek && weekStarts.length) {
      const later = weekStarts.find((entry) => entry.week > targetWeek);
      if (later) end = later.index;
    }

    let insertAt = end;
    for (let i = start; i < end; i += 1) {
      const existingDate = dateFromHeading(lines[i], info.year);
      if (existingDate && existingDate > date) { insertAt = i; break; }
    }
    while (insertAt > start && !clean(lines[insertAt - 1])) insertAt -= 1;
    const block = [`## ${info.month}月${info.day}日(${info.weekday})`, '', taskLine, ''];
    if (insertAt > 0 && clean(lines[insertAt - 1])) block.unshift('');
    lines.splice(insertAt, 0, ...block);
    return { text:`${lines.join('\n').replace(/\s+$/, '')}\n`, detail:date };
  }

  function findUndatedHeading(lines, start, end) {
    for (let i = start; i < end; i += 1) if (/^###\s+日付未定\s*$/.test(lines[i])) return i;
    return -1;
  }

  function appendMonthUndated(text, title, date) {
    const info = dateInfo(date);
    const lines = ensureMonthBase(text, info);
    const firstWeek = lines.findIndex((line) => weekNumberFromHeading(line) !== null);
    const boundary = firstWeek >= 0 ? firstWeek : lines.length;
    const heading = findUndatedHeading(lines, 0, boundary);
    const taskLine = `- [ ] ${clean(title)}`;

    if (heading < 0) {
      let insertAt = lines.findIndex((line) => /^#\s+/.test(line));
      insertAt = insertAt >= 0 ? insertAt + 1 : 0;
      while (insertAt < lines.length && !clean(lines[insertAt])) insertAt += 1;
      lines.splice(insertAt, 0, '', '### 日付未定', taskLine, '');
      return { text:`${lines.join('\n').replace(/\s+$/, '')}\n`, detail:`${info.year}-${String(info.month).padStart(2, '0')}` };
    }

    const end = sectionEnd(lines, heading, 3);
    if (hasTitle(lines, heading + 1, end, title)) return { duplicate:true };
    let insertAt = end;
    while (insertAt > heading + 1 && !clean(lines[insertAt - 1])) insertAt -= 1;
    lines.splice(insertAt, 0, taskLine);
    return { text:`${lines.join('\n').replace(/\s+$/, '')}\n`, detail:`${info.year}-${String(info.month).padStart(2, '0')}` };
  }

  function appendWeekUndated(text, title, date) {
    const info = dateInfo(date);
    const week = isoWeek(date);
    const lines = ensureMonthBase(text, info);
    const weeks = lines.map((line, index) => ({ index, week:weekNumberFromHeading(line) })).filter((entry) => entry.week !== null);
    const current = weeks.find((entry) => entry.week === week);
    const taskLine = `- [ ] ${clean(title)}`;

    if (!current) {
      const later = weeks.find((entry) => entry.week > week);
      const insertAt = later?.index ?? lines.length;
      const block = [`## week${week}`, '### 日付未定', taskLine, ''];
      if (insertAt > 0 && clean(lines[insertAt - 1])) block.unshift('');
      lines.splice(insertAt, 0, ...block);
      return { text:`${lines.join('\n').replace(/\s+$/, '')}\n`, detail:`week${week}` };
    }

    const weekEnd = weeks.find((entry) => entry.index > current.index)?.index ?? lines.length;
    const heading = findUndatedHeading(lines, current.index + 1, weekEnd);
    if (heading < 0) {
      lines.splice(current.index + 1, 0, '### 日付未定', taskLine);
      return { text:`${lines.join('\n').replace(/\s+$/, '')}\n`, detail:`week${week}` };
    }

    const end = sectionEnd(lines, heading, 3);
    if (hasTitle(lines, heading + 1, Math.min(end, weekEnd), title)) return { duplicate:true };
    let insertAt = Math.min(end, weekEnd);
    while (insertAt > heading + 1 && !clean(lines[insertAt - 1])) insertAt -= 1;
    lines.splice(insertAt, 0, taskLine);
    return { text:`${lines.join('\n').replace(/\s+$/, '')}\n`, detail:`week${week}` };
  }

  async function sendToTecho({ title, date, mode }) {
    const info = dateInfo(date);
    const target = source('techo', { repo:'mynotebook', dir:'02_techo' });
    const path = pathJoin(target.dir, `${info.year}-${String(info.month).padStart(2, '0')}.md`);
    const mutate = mode === 'date' ? (text) => appendDatedTecho(text, title, date)
      : mode === 'week' ? (text) => appendWeekUndated(text, title, date)
      : mode === 'month' ? (text) => appendMonthUndated(text, title, date)
      : null;
    if (!mutate) throw new Error('送信先が不正です');
    return mutateFile({
      repo:target.repo,
      path,
      branch:TECHO_BRANCH,
      message:`cockpid: route ON HAND to Techo ${mode} ${date}`,
      mutate
    });
  }

  function installStyle() {
    if (document.getElementById('onhand-scheduling-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'onhand-scheduling-bridge-style';
    style.textContent = `
      .onhand-route-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap}
      .onhand-send-btn,.onhand-route-btn{border:0;border-radius:5px;background:var(--soft,#eceae3);color:#77736c;padding:5px 7px;font:700 7px/1 ui-monospace,monospace;letter-spacing:.04em;cursor:pointer}.onhand-send-btn:hover,.onhand-route-btn:hover{background:#e1ded6;color:#4f4c46}.onhand-send-btn:disabled,.onhand-route-btn:disabled{opacity:.4;cursor:default}
      .onhand-route-panel{margin-top:7px;padding:7px;border:1px solid rgba(80,76,68,.10);border-radius:7px;background:rgba(248,247,242,.72)}.onhand-route-panel[hidden],.onhand-date-form[hidden]{display:none}
      .onhand-route-choices{display:flex;gap:5px;flex-wrap:wrap}.onhand-date-form{display:flex;align-items:center;gap:5px;margin-top:6px}.onhand-date-form input{min-width:130px;border:1px solid #dedbd3;border-radius:5px;background:#fffef9;color:#5e5a53;padding:5px 6px;font:650 8px/1.2 ui-monospace,monospace}
      .onhand-route-status{display:block;min-height:1em;margin-top:5px;color:#8b8880;font:650 7px/1.3 ui-monospace,monospace}.onhand-route-status.error{color:#a24f49}
      .onhand-bridge-toast{position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));z-index:80;transform:translate(-50%,12px);opacity:0;pointer-events:none;padding:9px 13px;border-radius:999px;background:rgba(41,41,36,.94);color:#fffef9;box-shadow:0 8px 24px rgba(37,34,29,.14);font:700 10px/1 ui-monospace,monospace;transition:opacity .16s,transform .16s}.onhand-bridge-toast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:820px){.onhand-route-actions{gap:7px}.onhand-send-btn,.onhand-route-btn{padding:7px 9px;font-size:8px}.onhand-route-panel{margin-top:9px;padding:9px}.onhand-route-choices{gap:7px}.onhand-date-form{align-items:stretch;flex-wrap:wrap}.onhand-date-form input{min-height:32px;flex:1 1 160px}.onhand-route-status{font-size:8px}.onhand-bridge-toast{max-width:calc(100vw - 24px);white-space:normal;text-align:center}}
    `;
    document.head.appendChild(style);
  }

  let toastTimer = null;
  function toast(message) {
    let node = document.getElementById('onhandBridgeToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'onhandBridgeToast';
      node.className = 'onhand-bridge-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2800);
  }

  function rowInfo(row) {
    const movement = row.matches('.movement-item[data-movement-row]');
    const checkbox = movement ? row.querySelector('.movement-done[data-movement-id]') : row.querySelector('.done-box[data-id]');
    const titleNode = movement ? row.querySelector('.movement-item-title') : row.querySelector('.item-title');
    const body = movement ? row.querySelector('.movement-item-body') : row.querySelector('.item-main');
    const skip = movement ? row.querySelector('.movement-skip') : row.querySelector('.skip-btn');
    if (!checkbox || !titleNode || !body || !skip) return null;
    return { id:movement ? checkbox.dataset.movementId : checkbox.dataset.id, title:clean(titleNode.textContent), checkbox, body, skip };
  }

  function injectRow(row) {
    if (row.querySelector('.onhand-route-actions')) return;
    const info = rowInfo(row);
    if (!info || info.checkbox.checked || info.checkbox.disabled || !info.title) return;

    const wrap = document.createElement('div');
    wrap.className = 'onhand-route-actions';
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'onhand-send-btn';
    send.dataset.onhandSend = '';
    send.textContent = '送る';
    info.skip.replaceWith(wrap);
    wrap.append(send, info.skip);

    const panel = document.createElement('div');
    panel.className = 'onhand-route-panel';
    panel.hidden = true;
    panel.innerHTML = `<div class="onhand-route-choices"><button type="button" class="onhand-route-btn" data-onhand-route="today">今日</button><button type="button" class="onhand-route-btn" data-onhand-route="date">日付</button><button type="button" class="onhand-route-btn" data-onhand-route="week">週未定</button><button type="button" class="onhand-route-btn" data-onhand-route="month">月未定</button></div><div class="onhand-date-form" hidden><input type="date" data-onhand-date value="${jstDate()}"><button type="button" class="onhand-route-btn" data-onhand-date-save>登録</button><button type="button" class="onhand-route-btn" data-onhand-date-cancel>×</button></div><span class="onhand-route-status" aria-live="polite"></span>`;
    info.body.appendChild(panel);
  }

  function scan() {
    document.querySelectorAll('.movement-item[data-movement-row],.item[data-row-id]').forEach(injectRow);
  }

  function setBusy(row, busy, message = '', error = false) {
    row.querySelectorAll('.onhand-send-btn,.onhand-route-btn,.movement-skip,.skip-btn').forEach((button) => { button.disabled = busy; });
    const status = row.querySelector('.onhand-route-status');
    if (status) {
      status.textContent = message;
      status.classList.toggle('error', error);
    }
  }

  function markHandled(row) {
    const info = rowInfo(row);
    if (!info || info.checkbox.checked || info.checkbox.disabled) return;
    info.checkbox.checked = true;
    info.checkbox.dispatchEvent(new Event('change', { bubbles:true }));
  }

  async function completeSend(row, operation, successText) {
    setBusy(row, true, '送信中…');
    try {
      const result = await operation();
      toast(result.duplicate ? '登録済み · ON HAND処理済み' : successText(result));
      markHandled(row);
    } catch (error) {
      console.error('ON HAND scheduling bridge failed', error);
      setBusy(row, false, `送信失敗: ${error.message}`, true);
      toast('送信に失敗しました。候補はOPENのままです');
    }
  }

  document.addEventListener('click', async (event) => {
    const control = event.target.closest('[data-onhand-send],[data-onhand-route],[data-onhand-date-save],[data-onhand-date-cancel]');
    if (!control) return;
    const row = control.closest('.movement-item[data-movement-row],.item[data-row-id]');
    if (!row) return;
    const info = rowInfo(row);
    if (!info) return;
    const panel = row.querySelector('.onhand-route-panel');
    const dateForm = row.querySelector('.onhand-date-form');

    if (control.matches('[data-onhand-send]')) {
      panel.hidden = !panel.hidden;
      if (panel.hidden) dateForm.hidden = true;
      return;
    }
    if (control.matches('[data-onhand-date-cancel]')) {
      dateForm.hidden = true;
      return;
    }
    if (control.matches('[data-onhand-date-save]')) {
      const date = dateForm.querySelector('[data-onhand-date]')?.value || '';
      await completeSend(row, () => sendToTecho({ ...info, date, mode:'date' }), () => `${date} のTechoへ送りました`);
      return;
    }

    const mode = control.dataset.onhandRoute;
    if (mode === 'date') {
      dateForm.hidden = false;
      dateForm.querySelector('[data-onhand-date]')?.focus();
      return;
    }
    if (mode === 'today') {
      await completeSend(row, () => sendTodayToTaskliner(info), () => '今日のTaskLinerへ送りました');
      return;
    }
    if (mode === 'week') {
      const date = jstDate();
      await completeSend(row, () => sendToTecho({ ...info, date, mode:'week' }), (result) => `${result.detail} の日付未定へ送りました`);
      return;
    }
    if (mode === 'month') {
      const date = jstDate();
      await completeSend(row, () => sendToTecho({ ...info, date, mode:'month' }), (result) => `${result.detail} の日付未定へ送りました`);
    }
  });

  installStyle();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once:true });
  else scan();

  window.COCKPID_ON_HAND_BRIDGE = Object.freeze({
    sendTodayToTaskliner,
    sendToTecho,
    defaultDate:jstDate,
    isoWeek
  });
})();