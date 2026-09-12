(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'gpts';
  const BRANCH = 'main';
  const DIR = 'projects';
  const TOKEN_KEY = 'zen-note-github-token';
  const ROOM_LIMIT = 6;
  const REFRESH_MS = 30 * 60 * 1000;
  const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const $ = (id) => document.getElementById(id);
  const list = $('projectList');
  const room = $('projectRoom');
  const count = $('projectCount');
  const summary = $('townSummary');
  const detail = $('detailContent');
  const detailState = $('detailState');
  const reload = $('reloadBtn');
  const msgTitle = $('messageTitle');
  const msgText = $('messageText');

  let projects = [];
  let selected = '';
  let lastRefreshAt = 0;
  let refreshTimer = 0;
  let raf = 0;
  const controllers = new Map();
  const liveActors = new Set();

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rnd = (min, max) => Math.round(min + Math.random() * (max - min));
  const sample = (items) => items[Math.floor(Math.random() * items.length)];

  async function api(url) {
    const headers = { Accept: 'application/vnd.github+json' };
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (token) headers.Authorization = `Bearer ${token}`;
    let res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok && token && (res.status === 403 || res.status === 404)) {
      res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    }
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return res.json();
  }

  function decode(v) {
    const raw = atob(String(v || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0)));
  }

  function scalar(v) {
    v = String(v ?? '').trim();
    if (!v) return '';
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
    return v;
  }

  function fm(md) {
    const lines = String(md || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    if (lines[0] !== '---') return {};
    const meta = {};
    let arr = '';
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === '---') break;
      const item = /^\s+-\s+(.*)$/.exec(lines[i]);
      if (item && arr) {
        if (!Array.isArray(meta[arr])) meta[arr] = [];
        meta[arr].push(scalar(item[1]));
        continue;
      }
      const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
      if (!pair) continue;
      if (!pair[2].trim()) {
        meta[pair[1]] = '';
        arr = pair[1];
      } else {
        meta[pair[1]] = scalar(pair[2]);
        arr = '';
      }
    }
    return meta;
  }

  function candidate(e) {
    return e.type === 'file' && e.name.endsWith('.md') && !/^(index|repositories)\.md$/i.test(e.name) && !/^PROJECT_/i.test(e.name) && !/-\d{4}-\d{2}-\d{2}\.md$/i.test(e.name);
  }

  function todayKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  function age(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return 99;
    return Math.floor((Date.parse(`${todayKey()}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000);
  }

  function projectText(p) { return `${p.current || ''} ${p.next || ''}`.toLowerCase(); }

  function activity(p) {
    const text = projectText(p);
    if (/(見てもら|見てほしい|レビュー|review|確認してもら|確認お願いします|ユーザー確認|人間確認|成果物.*(確認|レビュー)|完成.*確認|提出済|できました)/i.test(text)) {
      return { key: 'review_wait', label: '見てもらい待ち', say: '見てください！' };
    }
    if (/(保留|休止|いったん止|後回し|次のタイミング|外部要因|返信待ち|回答待ち|入荷待ち|blocked|on hold)/i.test(text) || age(p.last_touched) >= 14) {
      return { key: 'paused', label: '休止', say: '休憩中…' };
    }
    if (/(調べる|調査|探索|比較|検証|確認する|試す|試験|再試験|候補|検討|考える|判断|決める|方針|選ぶ|見直す|構想)/i.test(text)) {
      return { key: 'researching', label: '調査中', say: '調べ中…' };
    }
    return { key: 'working', label: '作業中', say: '作業中' };
  }

  function momentum(p) {
    const a = age(p.last_touched);
    const commitment = String(p.commitment || '').toLowerCase();
    if (a === 0 && p.desk === true) return { key: 'surging', label: '急上昇', mark: '↑↑', speed: 1.42 };
    if (a === 0) return { key: 'rising', label: '上昇', mark: '↑', speed: 1.18 };
    if (a <= 2 && (p.desk === true || commitment === 'must' || commitment === 'chosen')) return { key: 'rising', label: '上昇', mark: '↑', speed: 1.16 };
    return { key: 'normal', label: '通常', mark: '', speed: 1 };
  }

  function motivation(p) {
    const a = age(p.last_touched);
    let n = a <= 1 ? 3 : a <= 7 ? 2 : 1;
    const c = String(p.commitment || '').toLowerCase();
    if (c === 'must' || c === 'chosen') n = Math.max(n, 2);
    if (c === 'must') n = 3;
    return n;
  }

  async function loadOne(e) {
    const x = await api(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${e.path}?ref=${BRANCH}&_=${Date.now()}`);
    if (!x.content) return null;
    const m = fm(decode(x.content));
    if (m.type !== 'project' || m.status === 'archived') return null;
    return { id: String(m.id || e.name.replace(/\.md$/, '')), title: String(m.title || m.id || e.name), ...m, path: e.path };
  }

  const HOME = {
    working: [[18,45],[27,52],[22,61]],
    researching: [[76,42],[84,51],[79,61]],
    review_wait: [[44,72],[56,72],[50,64]],
    paused: [[12,76],[18,74]]
  };
  const ACTION = { working:'work', researching:'idle', review_wait:'idle', paused:'rest' };
  const BUBBLE = { working:'作業中', researching:'調べ中…', review_wait:'見てください！', paused:'休憩中…' };

  class CharacterController {
    constructor(worker, project, index) {
      this.worker = worker;
      this.project = project;
      this.activity = activity(project);
      this.momentum = momentum(project);
      this.actor = worker.querySelector('.character-actor');
      this.sprite = worker.querySelector('.character-sprite');
      this.bubble = worker.querySelector('.bubble');
      this.effect = worker.querySelector('.character-effect');
      this.phase = Math.random() * Math.PI * 2;
      this.timer = 0;
      this.stopped = false;
      this.worker.style.left = `${34 + (index % 3) * 15}%`;
      this.worker.style.top = `${34 + Math.floor(index / 3) * 20}%`;
      liveActors.add(this);
    }
    start() {
      if (REDUCED_MOTION) { this.moveHome(false); return; }
      this.timer = setTimeout(() => this.moveHome(true), rnd(250, 1350));
    }
    stop() { this.stopped = true; clearTimeout(this.timer); liveActors.delete(this); }
    moveHome(animate = true) {
      if (this.stopped || !this.worker.isConnected) return;
      const point = sample(HOME[this.activity.key] || HOME.working);
      const currentX = parseFloat(this.worker.style.left) || 50;
      this.actor.dataset.direction = point[0] < currentX ? 'left' : 'right';
      this.setAction('walk'); this.setBubble(''); this.clearEffect();
      const move = animate ? Math.round(rnd(700, 1150) / this.momentum.speed) : 0;
      this.worker.style.setProperty('--move-ms', `${move}ms`);
      this.worker.style.left = `${point[0] + rnd(-2,2)}%`;
      this.worker.style.top = `${point[1] + rnd(-2,2)}%`;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.finish(), move + 50);
    }
    finish() {
      if (this.stopped || !this.worker.isConnected) return;
      this.setAction(ACTION[this.activity.key] || 'idle');
      this.setBubble(BUBBLE[this.activity.key] || '');
      if (this.activity.key === 'paused' && Math.random() < .45) this.effectMark('Z','sleep');
      else if (this.activity.key === 'researching' && Math.random() < .3) this.effectMark('…','thought');
      else if (this.activity.key === 'working' && this.momentum.key === 'surging' && Math.random() < .4) this.effectMark('!','idea');
      const min = this.activity.key === 'paused' ? 3200 : 1600;
      const max = this.activity.key === 'paused' ? 5600 : 3300;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.moveHome(true), rnd(min,max) / this.momentum.speed);
    }
    setAction(action) { this.sprite.dataset.action = action; this.worker.dataset.action = action; }
    setBubble(text) { this.bubble.textContent = text; this.bubble.classList.toggle('is-quiet', !text); }
    clearEffect() { this.effect.classList.remove('show'); this.effect.textContent=''; this.effect.removeAttribute('data-effect'); }
    effectMark(mark, kind) { this.effect.textContent=mark; this.effect.dataset.effect=kind; this.effect.classList.add('show'); }
  }

  function stopCharacters() {
    controllers.forEach((c) => c.stop());
    controllers.clear();
  }

  function startCharacters() {
    stopCharacters();
    room.querySelectorAll('.worker[data-project-id]').forEach((worker, index) => {
      const p = projects.find((x) => x.id === worker.dataset.projectId);
      if (!p) return;
      const c = new CharacterController(worker, p, index);
      controllers.set(p.id, c);
      c.start();
    });
    if (!REDUCED_MOTION && !raf) raf = requestAnimationFrame(liveFrame);
  }

  function liveFrame(t) {
    liveActors.forEach((c) => {
      if (!c.actor?.isConnected) return;
      const action = c.worker.dataset.action;
      const speed = c.momentum.speed;
      const amp = action === 'walk' ? 1.8 : action === 'work' ? 1.05 : action === 'rest' ? .3 : .55;
      const y = Math.sin(t * .005 * speed + c.phase) * amp;
      const x = action === 'work' ? Math.sin(t * .018 * speed + c.phase) * .65 : 0;
      c.actor.style.transform = `translate3d(${x}px,${y}px,0)`;
    });
    raf = requestAnimationFrame(liveFrame);
  }

  function workerMarkup(p) {
    const a = activity(p); const m = momentum(p);
    return `<button class="worker${selected === p.id ? ' active' : ''}" data-project-id="${esc(p.id)}" data-activity="${a.key}" data-momentum="${m.key}" type="button">
      <span class="worker-scene" aria-hidden="true"><span class="character-actor" data-direction="right"><span class="character-sprite" data-action="idle"></span><span class="character-effect"></span></span></span>
      <span class="bubble is-quiet"></span><span class="momentum-badge">${esc(m.mark)}${m.key==='surging'?'急':''}</span><span class="worker-state">${esc(a.label)}</span><span class="worker-name">${esc(p.title)}</span>
    </button>`;
  }

  function renderRoom() {
    room.classList.add('town-shared-room');
    const people = projects.slice(0, ROOM_LIMIT).map(workerMarkup).join('');
    room.innerHTML = `<span class="town-zone-label work">💻 作業エリア</span><span class="town-zone-label research">▥ 調査エリア</span><span class="town-zone-label review">成果物はこちらへ ↓</span><span class="town-work-desk"></span><span class="town-shelf"></span><span class="town-review-counter"></span><span class="town-rest-sofa"></span>${people || '<div class="room-loading">Projectがありません</div>'}`;
    startCharacters();
  }

  function renderList() {
    count.textContent = projects.length;
    list.innerHTML = projects.map((p) => {
      const a = activity(p), m = momentum(p);
      return `<button class="project-row${selected === p.id ? ' active' : ''}" data-project-id="${esc(p.id)}" type="button"><span class="project-name">${esc(p.title)}</span><span class="state-chip" data-activity="${a.key}">${esc(a.label)}</span><span class="momentum-chip" data-momentum="${m.key}">${esc(m.mark)}${esc(m.label)}</span></button>`;
    }).join('');
  }

  function syncSelection() {
    document.querySelectorAll('[data-project-id]').forEach((node) => node.classList.toggle('active', node.dataset.projectId === selected));
  }

  function show(id) {
    const p = projects.find((x) => x.id === id); if (!p) return;
    selected = id;
    const a = activity(p), m = momentum(p), stars = motivation(p), sheets = Math.max(0, Number(p.sheets || 0));
    detailState.textContent = `${a.label} · ${m.mark}${m.label}`;
    detail.innerHTML = `<div class="detail-head"><div><h2>${esc(p.title)}</h2><div class="detail-meta">最終更新 ${esc(p.last_touched || '—')}</div></div><span class="big-status" data-activity="${a.key}">${esc(a.label)}</span></div><div class="stat-grid"><div class="stat"><b>勢い</b><strong>${esc(m.mark)}${esc(m.label)}</strong></div><div class="stat"><b>やる気</b><strong>${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</strong></div><div class="stat"><b>SHEETS</b><strong>${sheets}</strong></div></div><div class="detail-block"><b>いま</b><p>${esc(p.current || 'まだCurrentは書かれていません。')}</p></div><div class="detail-block"><b>つぎ</b><p>${esc(p.next || 'まだNextは書かれていません。')}</p></div>`;
    msgTitle.textContent = `「${p.title}」は ${a.label}。${m.key === 'normal' ? '' : `${m.mark}${m.label}中。`}`;
    msgText.textContent = a.key === 'working' ? 'PCの前で作業しています。勢いが上がると移動と作業モーションも少し速くなります。' : a.key === 'researching' ? '資料棚の近くで調査・検討中です。' : a.key === 'review_wait' ? 'AI側の作業はいったん終わり、あなたの確認を待っています。' : 'いまはソファ側で休止しています。必要になればまた動き出します。';
    syncSelection();
  }

  function updateSummary() {
    const working = projects.filter((p) => activity(p).key === 'working').length;
    const review = projects.filter((p) => activity(p).key === 'review_wait').length;
    const surge = projects.filter((p) => momentum(p).key === 'surging').length;
    summary.textContent = `作業 ${working} / 確認待ち ${review} / 急上昇 ${surge} / 全部 ${projects.length}`;
  }

  async function load({ silent = false } = {}) {
    if (!silent) { reload.disabled = true; summary.textContent = 'gpts / projects を読んでいます…'; }
    try {
      const es = await api(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DIR}?ref=${BRANCH}&_=${Date.now()}`);
      const xs = await Promise.all((Array.isArray(es) ? es : []).filter(candidate).map(async (e) => { try { return await loadOne(e); } catch (err) { console.warn('Project Town skip', e.path, err); return null; } }));
      const previous = selected;
      projects = xs.filter(Boolean).sort((a,b) => String(b.last_touched || '').localeCompare(String(a.last_touched || '')));
      selected = projects.some((p) => p.id === previous) ? previous : (projects[0]?.id || '');
      lastRefreshAt = Date.now();
      renderRoom(); renderList(); updateSummary(); if (selected) show(selected);
    } catch (err) {
      console.error(err);
      if (!projects.length) {
        summary.textContent = `読み込み失敗 · ${err.message || err}`;
        room.innerHTML = '<div class="room-loading">Projectを読み込めませんでした</div>';
      }
    } finally {
      reload.disabled = false;
    }
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => { if (!document.hidden) load({ silent: true }); }, REFRESH_MS);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-project-id]'); if (b) show(b.dataset.projectId);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopCharacters(); return; }
    if (Date.now() - lastRefreshAt >= REFRESH_MS) load({ silent: true });
    else if (projects.length) startCharacters();
  });
  reload.addEventListener('click', () => load());
  window.addEventListener('pagehide', () => { clearInterval(refreshTimer); stopCharacters(); if (raf) cancelAnimationFrame(raf); });

  load();
  scheduleRefresh();
})();
