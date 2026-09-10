(() => {
  'use strict';

  const TYPES = ['action', 'question', 'idea', 'theme', 'hypothesis'];
  const HISTORY_KEY = 'cockpid.today-movement.checked.v1';
  const DISPLAY_LIMIT = 2;
  const targets = {
    do: { count: document.getElementById('moveDoCount'), list: document.getElementById('moveDoItems') },
    check: { count: document.getElementById('moveCheckCount'), list: document.getElementById('moveCheckItems') },
    action: { count: document.getElementById('moveThinkCount'), list: document.getElementById('moveThinkItems') }
  };
  const source = document.getElementById('movementDate');
  const randomButton = document.getElementById('movementRandom');
  if (!targets.do.list || !targets.check.list || !targets.action.list) return;

  const dateName = /^\d{4}-\d{2}-\d{2}\.json$/;
  const pools = { do: [], check: [], action: [] };
  let checked = readChecked();

  function jstDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  function dateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function shiftDays(parts, delta) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + delta));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  const todayKey = dateKey(jstDateParts());
  const weekStartKey = dateKey(shiftDays(jstDateParts(), -6));

  function readChecked() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeChecked() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(checked));
  }

  function itemId(item) {
    const seed = `${item._date}|${item._type}|${item.title || item.summary || ''}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `m${(hash >>> 0).toString(36)}`;
  }

  function classify(type, item) {
    const text = `${item?.title || ''} ${item?.summary || ''}`;
    if (type === 'question') return 'check';
    if (type === 'idea' || type === 'theme' || type === 'hypothesis') return 'action';
    if (/(確認|状況|対象|進捗|チェック|把握|照合|レビュー|聞く|調べる|見直す)/.test(text)) return 'check';
    if (/(考え|検討|整理|構想|方針|目的|設計|見極め|判断|振り返)/.test(text)) return 'action';
    return 'do';
  }

  function unique(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = String(item.title || item.summary || '').trim().replace(/\s+/g, ' ');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function emptyRow(label = '候補なし') {
    return `<label class="movement-item movement-item-empty"><input type="checkbox" disabled><span class="movement-item-body"><span class="movement-item-title">${esc(label)}</span></span></label>`;
  }

  function rowHtml(item) {
    const id = itemId(item);
    const isChecked = Boolean(checked[id]);
    const title = item.title || item.summary || 'Untitled';
    const time = checked[id]?.checked_at ? new Date(checked[id].checked_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<label class="movement-item${isChecked ? ' is-checked' : ''}" title="${esc(title)}">
      <input class="movement-check" type="checkbox" data-movement-id="${id}" ${isChecked ? 'checked' : ''}>
      <span class="movement-item-body">
        <span class="movement-item-title">${esc(title)}</span>
        <span class="movement-item-meta"><span class="movement-item-type">[${esc(item._type)}]</span><span>${esc(item._date.slice(5).replace('-', '.'))}${time ? ` · ${esc(time)}` : ''}</span></span>
      </span>
    </label>`;
  }

  function render(bucket) {
    const target = targets[bucket];
    const cleaned = unique(pools[bucket]);
    const open = cleaned.filter((item) => !checked[itemId(item)]);
    const done = cleaned.filter((item) => checked[itemId(item)]);
    target.count.textContent = String(open.length);

    if (!cleaned.length) {
      target.list.innerHTML = emptyRow();
      return;
    }

    const candidates = open.length ? open : done;
    target.list.innerHTML = shuffle(candidates).slice(0, DISPLAY_LIMIT).map(rowHtml).join('');
  }

  function renderAll() {
    render('do');
    render('check');
    render('action');
  }

  async function loadSevenDays() {
    const directories = await Promise.all(TYPES.map(async (type) => {
      try {
        const entries = await gh(`extracted/${type}`, 'my-storage-note');
        return { type, entries: Array.isArray(entries) ? entries : [] };
      } catch (error) {
        console.error(error);
        return { type, entries: [] };
      }
    }));

    const files = [];
    directories.forEach(({ type, entries }) => {
      entries.forEach((entry) => {
        if (entry?.type !== 'file' || !dateName.test(entry.name)) return;
        const date = entry.name.slice(0, 10);
        if (date < weekStartKey || date > todayKey) return;
        files.push({ type, date, path: `extracted/${type}/${entry.name}` });
      });
    });

    const payloads = await Promise.all(files.map(async (file) => {
      try {
        const payload = await gh(file.path, 'my-storage-note');
        if (!payload?.content) return [];
        const data = JSON.parse(decode(payload.content));
        return (Array.isArray(data?.items) ? data.items : []).map((item) => ({ ...item, _type: file.type, _date: file.date }));
      } catch (error) {
        console.error(error);
        return [];
      }
    }));

    return payloads.flat();
  }

  async function boot() {
    if (!token()) {
      source.textContent = '7 DAYS · ANALYSIS OFF';
      Object.values(targets).forEach((target) => {
        target.count.textContent = '—';
        target.list.innerHTML = emptyRow('token required');
      });
      return;
    }

    source.textContent = '7 DAYS · LOADING';
    const items = await loadSevenDays();
    pools.do.length = pools.check.length = pools.action.length = 0;
    items.forEach((item) => pools[classify(item._type, item)].push(item));
    renderAll();
    source.textContent = `${weekStartKey.slice(5).replace('-', '.')}–${todayKey.slice(5).replace('-', '.')}`;
  }

  randomButton?.addEventListener('click', () => renderAll());

  document.querySelector('.movement-object')?.addEventListener('change', (event) => {
    const input = event.target.closest?.('[data-movement-id]');
    if (!input) return;
    const id = input.dataset.movementId;
    if (input.checked) checked[id] = { checked_at: new Date().toISOString() };
    else delete checked[id];
    writeChecked();
    renderAll();
  });

  boot().catch((error) => {
    console.error(error);
    source.textContent = '7 DAYS · ERROR';
  });
})();
