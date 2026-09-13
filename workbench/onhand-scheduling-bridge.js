(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const TOKEN_KEY = 'zen-note-github-token';
  const TASK_BRANCH = 'task-data';
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

  async function getFile(repo, path, branch) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, {
      headers: { Accept:'application/vnd.github+json', Authorization:`Bearer ${token()}` },
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
      headers: {
        Accept:'application/vnd.github+json',
        Authorization:`Bearer ${token()}`,
        'Content-Type':'application/json'
      },
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
      if (result.duplicate) return { duplicate:true, path };
      try {
        await putFile(repo, path, branch, result.text, current?.sha || null, message);
        return { duplicate:false, path };
      } catch (error) {
        if (!error.conflict || attempt === MAX_RETRIES - 1) throw error;
      }
    }
    throw new Error('保存競合を解消できませんでした');
  }

  function tasklinerTitleFromRow(line) {
    const cells = line.split('|').slice(1, -1).map((cell) => clean(cell.replace(/\\\|/g, '|')));
    return cells.length >= 2 ? cells[1] : '';
  }

  function appendTaskliner(text, title, date) {
    const wanted = clean(title);
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    if (lines.some((line) => /^\s*\|/.test(line) && clean(tasklinerTitleFromRow(line)) === wanted)) {
      return { duplicate:true };
    }

    const safeTitle = wanted.replace(/\|/g, '｜');
    const header = '| ✓ | Task | Planned | Actual Start | Actual End | Actual | Status |';
    const divider = '|---|---|---|---|---|---|---|';
    const row = `| □ | ${safeTitle} |  |  |  | 0m |  |`;
    let base = String(text || '').replace(/\s+$/, '');
    if (!base) base = `# TaskLiner ${date}`;

    const existingLines = base.split('\n');
    const headerIndex = existingLines.findIndex((line) => clean(line) === clean(header));
    if (headerIndex >= 0) {
      let insertAt = headerIndex + 1;
      if (/^\s*\|[-:| ]+\|\s*$/.test(existingLines[insertAt] || '')) insertAt += 1;
      while (insertAt < existingLines.length && /^\s*\|/.test(existingLines[insertAt])) insertAt += 1;
      existingLines.splice(insertAt, 0, row);
      return { text:`${existingLines.join('\n').replace(/\s+$/, '')}\n` };
    }

    return { text:`${base}\n\n${header}\n${divider}\n${row}\n` };
  }

  async function sendTaskliner({ title }) {
    const target = source('taskliner', { repo:'mynotebook', dir:'09_taskchute' });
    const date = jstDate();
    const path = pathJoin(target.dir, `${date}.md`);
    return mutateFile({
      repo:target.repo,
      path,
      branch:TASK_BRANCH,
      message:`cockpid: send ON HAND to TaskLiner ${date}`,
      mutate:(text) => appendTaskliner(text, title, date)
    });
  }

  function fnv32(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function dateInfo(date) {
    const match = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) throw new Error('日付が不正です');
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const weekday = ['日','月','火','水','木','金','土'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return { year, month, day, weekday };
  }

  function headingIndex(lines, start, pattern, end = lines.length) {
    for (let i = start; i < end; i += 1) if (pattern.test(lines[i])) return i;
    return -1;
  }

  function nextHeading(lines, start, levelPattern, fallback) {
    for (let i = start; i < fallback; i += 1) if (levelPattern.test(lines[i])) return i;
    return fallback;
  }

  function categoryHasDuplicate(lines, start, end, title, id) {
    const wanted = clean(title);
    for (let i = start; i < end; i += 1) {
      if (String(lines[i]).includes(`{#${id}}`)) return true;
      const match = String(lines[i]).match(/^\s*-\s*\[[ xX]\]\s*(.*?)(?:\s+\{#[-\w]+\})?(?:\s+\{[^}]+\})*\s*$/);
      if (match && clean(match[1]) === wanted) return true;
    }
    return false;
  }

  function insertTecho(text, { title, date, category, id }) {
    const info = dateInfo(date);
    const taskId = fnv32(`${id}|${date}|${category}`);
    const taskLine = `- [ ] ${clean(title)} {#${taskId}}`;
    const datePattern = new RegExp(`^##\\s+${info.month}\\/${info.day}\\([^)]*\\)\\s*$`);
    let lines = String(text || '').replace(/\r/g, '').split('\n');
    if (lines.length === 1 && !lines[0]) lines = [`# ${info.year}年${info.month}月`];
    if (!lines.some((line) => /^#\s+/.test(line))) lines.unshift(`# ${info.year}年${info.month}月`, '');

    let dateStart = headingIndex(lines, 0, datePattern);
    if (dateStart < 0) {
      while (lines.length && !clean(lines[lines.length - 1])) lines.pop();
      lines.push('', `## ${info.month}/${info.day}(${info.weekday})`, `### ${category}`, '#### その他', taskLine, '');
      return { text:`${lines.join('\n').replace(/\s+$/, '')}\n` };
    }

    const dateEnd = nextHeading(lines, dateStart + 1, /^##\s+/, lines.length);
    const categoryPattern = new RegExp(`^###\\s+${category}\\s*$`);
    let categoryStart = headingIndex(lines, dateStart + 1, categoryPattern, dateEnd);
    if (categoryStart < 0) {
      lines.splice(dateEnd, 0, `### ${category}`, '#### その他', taskLine, '');
      return { text:`${lines.join('\n').replace(/\s+$/, '')}\n` };
    }

    const categoryEnd = nextHeading(lines, categoryStart + 1, /^(?:##|###)\s+/, dateEnd);
    if (categoryHasDuplicate(lines, categoryStart + 1, categoryEnd, title, taskId)) return { duplicate:true };

    const groupStart = headingIndex(lines, categoryStart + 1, /^####\s+その他\s*$/, categoryEnd);
    if (groupStart < 0) {
      lines.splice(categoryEnd, 0, '#### その他', taskLine, '');
      return { text:`${lines.join('\n').replace(/\s+$/, '')}\n` };
    }

    const groupEnd = nextHeading(lines, groupStart + 1, /^(?:##|###|####)\s+/, categoryEnd);
    lines.splice(groupEnd, 0, taskLine);
    return { text:`${lines.join('\n').replace(/\s+$/, '')}\n` };
  }

  async function scheduleTecho({ title, id, date, category }) {
    if (!['事業','家庭'].includes(category)) throw new Error('分類が不正です');
    const info = dateInfo(date);
    const target = source('techo', { repo:'mynotebook', dir:'02_techo' });
    const path = pathJoin(target.dir, `${info.year}-${String(info.month).padStart(2, '0')}.md`);
    return mutateFile({
      repo:target.repo,
      path,
      branch:TECHO_BRANCH,
      message:`cockpid: schedule ON HAND ${date}`,
      mutate:(text) => insertTecho(text, { title, id, date, category })
    });
  }

  function installStyle() {
    if (document.getElementById('onhand-scheduling-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'onhand-scheduling-bridge-style';
    style.textContent = `
      .onhand-bridge-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:7px}
      .onhand-bridge-btn{border:0;border-radius:5px;background:rgba(234,232,225,.9);color:#706d66;padding:5px 7px;font:700 7px/1 ui-monospace,monospace;letter-spacing:.04em;cursor:pointer}
      .onhand-bridge-btn:hover{background:#e1ded6;color:#4f4c46}.onhand-bridge-btn:disabled{opacity:.42;cursor:default}
      .onhand-bridge-status{min-height:1em;color:#8b8880;font:650 7px/1.3 ui-monospace,monospace}.onhand-bridge-status.error{color:#a24f49}
      .onhand-schedule-form{display:grid;grid-template-columns:minmax(120px,1fr) auto auto auto;gap:5px;align-items:center;margin-top:6px}.onhand-schedule-form[hidden]{display:none}
      .onhand-schedule-form input,.onhand-schedule-form select{min-width:0;border:1px solid #dedbd3;border-radius:5px;background:#fffef9;color:#5e5a53;padding:5px 6px;font:650 8px/1.2 ui-monospace,monospace}
      .onhand-bridge-toast{position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));z-index:80;transform:translate(-50%,12px);opacity:0;pointer-events:none;padding:9px 13px;border-radius:999px;background:rgba(41,41,36,.94);color:#fffef9;box-shadow:0 8px 24px rgba(37,34,29,.14);font:700 10px/1 ui-monospace,monospace;transition:opacity .16s,transform .16s}.onhand-bridge-toast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:820px){.onhand-bridge-actions{gap:6px;margin-top:9px}.onhand-bridge-btn{padding:7px 9px;font-size:8px}.onhand-bridge-status{font-size:8px}.onhand-schedule-form{grid-template-columns:1fr auto;gap:6px}.onhand-schedule-form input{grid-column:1/-1}.onhand-schedule-form select{min-height:30px}.onhand-bridge-toast{max-width:calc(100vw - 24px);white-space:normal;text-align:center}}
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
    toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
  }

  function rowInfo(row) {
    const movement = row.matches('.movement-item[data-movement-row]');
    const checkbox = movement ? row.querySelector('.movement-done[data-movement-id]') : row.querySelector('.done-box[data-id]');
    const titleNode = movement ? row.querySelector('.movement-item-title') : row.querySelector('.item-title');
    const body = movement ? row.querySelector('.movement-item-body') : row.querySelector('.item-main');
    if (!checkbox || !titleNode || !body) return null;
    return {
      id:movement ? checkbox.dataset.movementId : checkbox.dataset.id,
      bucket:checkbox.dataset.bucket,
      title:clean(titleNode.textContent),
      checkbox,
      body
    };
  }

  function injectRow(row) {
    if (row.querySelector('.onhand-bridge-actions')) return;
    const info = rowInfo(row);
    if (!info || info.checkbox.checked || info.checkbox.disabled || !info.title) return;
    const actions = document.createElement('div');
    actions.className = 'onhand-bridge-actions';
    actions.innerHTML = `<button type="button" class="onhand-bridge-btn" data-onhand-taskliner>→ TASK</button><button type="button" class="onhand-bridge-btn" data-onhand-schedule>予定</button><span class="onhand-bridge-status" aria-live="polite"></span>`;
    const form = document.createElement('div');
    form.className = 'onhand-schedule-form';
    form.hidden = true;
    form.innerHTML = `<input type="date" data-onhand-date value="${jstDate()}"><select data-onhand-category aria-label="予定の分類"><option value="事業">事業</option><option value="家庭">家庭</option></select><button type="button" class="onhand-bridge-btn" data-onhand-schedule-save>登録</button><button type="button" class="onhand-bridge-btn" data-onhand-schedule-cancel>×</button>`;
    info.body.append(actions, form);
  }

  function scan() {
    document.querySelectorAll('.movement-item[data-movement-row],.item[data-row-id]').forEach(injectRow);
  }

  function setBusy(row, busy, message = '', error = false) {
    row.querySelectorAll('.onhand-bridge-btn').forEach((button) => { button.disabled = busy; });
    const status = row.querySelector('.onhand-bridge-status');
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

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-onhand-taskliner],[data-onhand-schedule],[data-onhand-schedule-save],[data-onhand-schedule-cancel]');
    if (!button) return;
    const row = button.closest('.movement-item[data-movement-row],.item[data-row-id]');
    if (!row) return;
    const info = rowInfo(row);
    if (!info) return;
    const form = row.querySelector('.onhand-schedule-form');

    if (button.matches('[data-onhand-schedule]')) {
      form.hidden = !form.hidden;
      return;
    }
    if (button.matches('[data-onhand-schedule-cancel]')) {
      form.hidden = true;
      return;
    }

    if (button.matches('[data-onhand-taskliner]')) {
      setBusy(row, true, '送信中…');
      try {
        const result = await sendTaskliner(info);
        toast(result.duplicate ? 'TaskLiner登録済み · ON HAND処理済み' : 'TaskLinerへ送りました');
        markHandled(row);
      } catch (error) {
        console.error('ON HAND → TaskLiner failed', error);
        setBusy(row, false, `送信失敗: ${error.message}`, true);
        toast('TaskLinerへの送信に失敗しました');
      }
      return;
    }

    if (button.matches('[data-onhand-schedule-save]')) {
      const date = form.querySelector('[data-onhand-date]')?.value || '';
      const category = form.querySelector('[data-onhand-category]')?.value || '';
      setBusy(row, true, '登録中…');
      try {
        const result = await scheduleTecho({ ...info, date, category });
        toast(result.duplicate ? 'Techo登録済み · ON HAND処理済み' : `${date} のTechoへ予定化しました`);
        markHandled(row);
      } catch (error) {
        console.error('ON HAND → Techo failed', error);
        setBusy(row, false, `登録失敗: ${error.message}`, true);
        toast('Techoへの登録に失敗しました');
      }
    }
  });

  installStyle();
  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once:true });
  else scan();

  window.COCKPID_ON_HAND_BRIDGE = Object.freeze({
    sendTaskliner,
    scheduleTecho,
    defaultDate:jstDate
  });
})();
