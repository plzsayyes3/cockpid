(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'gpts';
  const BRANCH = 'main';
  const DIR = 'projects';
  const TOKEN_KEY = 'zen-note-github-token';
  const ROOM_LIMIT = 6;
  const REFRESH_MS = 30 * 60 * 1000;
  const CHATGPT_URL = 'https://chatgpt.com/';
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

  const ACTIVITY = {
    working: { key: 'working', label: '作業中', say: '作業中' },
    researching: { key: 'researching', label: '調査中', say: '調べ中…' },
    review: { key: 'review', label: '見てもらい待ち', say: '見てください！' },
    review_wait: { key: 'review', label: '見てもらい待ち', say: '見てください！' },
    paused: { key: 'paused', label: '休止', say: '休憩中…' },
    external_wait: { key: 'external_wait', label: '外部待ち', say: '待っています…' }
  };

  function inferredActivity(p) {
    const text = projectText(p);
    if (/(見てもら|見てほしい|レビュー|review|確認してもら|確認お願いします|ユーザー確認|人間確認|成果物.*(確認|レビュー)|完成.*確認|提出済|できました|次どうしますか)/i.test(text)) return ACTIVITY.review;
    if (/(返信待ち|回答待ち|入荷待ち|公開待ち|反映待ち|外部要因|blocked|waiting)/i.test(text)) return ACTIVITY.external_wait;
    if (/(保留|休止|いったん止|後回し|次のタイミング|on hold)/i.test(text) || age(p.last_touched) >= 14) return ACTIVITY.paused;
    if (/(調べる|調査|探索|比較|検証|確認する|試す|試験|再試験|候補|検討|考える|判断|決める|方針|選ぶ|見直す|構想)/i.test(text)) return ACTIVITY.researching;
    return ACTIVITY.working;
  }

  function activity(p) {
    const explicit = String(p.activity || '').trim().toLowerCase();
    return ACTIVITY[explicit] || inferredActivity(p);
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

  function decisionText(p, a) {
    if (a.key === 'review') return String(p.decision || p.next || '成果物を確認し、次へ進めるか・修正するかを指示してください。');
    if (a.key === 'external_wait') return `いまは外部要因待ちです。${p.next ? ` 次の確認点: ${p.next}` : ''}`;
    if (a.key === 'paused') return String(p.next || '再開するか、そのまま休止するかを判断できます。');
    if (a.key === 'researching') return '現在はAI側の調査ターンです。急いで判断する必要はありません。';
    return '現在はAI側の作業ターンです。急いで判断する必要はありません。';
  }

  function handoffPrompt(p) {
    return `「${p.title}」Projectの続きを進めたい。\n\nまず gpts/${p.path} を確認して、Project正本を基準に現在地を把握してください。\n\n現在の記録:\nCurrent: ${p.current || '未記載'}\nNext: ${p.next || '未記載'}\nDecision: ${p.decision || '未記載'}\nactivity: ${p.activity || activity(p).key}\n\nこのProjectは私の判断・指示を待っている状態です。まず、今私が判断すべきことを1〜3点に絞って提示してください。私が返答したら、その内容に従って作業を進め、Project正本の current / next / decision / activity / last_touched / History を必要に応じて更新してください。`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
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
    review: [[44,72],[56,72],[50,64]],
    paused: [[12,76],[18,74]],
    external_wait: [[67,72],[72,67]]
  };
  const ACTION = { working:'work', researching:'idle', review:'idle', paused:'rest', external_wait:'idle' };
  const BUBBLE = { working:'作業中', researching:'調べ中…', review:'見てください！', paused:'休憩中…', external_wait:'待っています…' };

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
      else if (this.activity.key === 'review' && Math.random() < .35) this.effectMark('!','review');
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
    const a = activity(p), m = momentum(p);
    return `<button class="worker${selected === p.id ? ' active' : ''}" data-project-id="${esc(p.id)}" data-activity="${a.key}" data-momentum="${m.key}" type="button" aria-label="${esc(p.title)} ${esc(a.label)}">
      <span class="worker-scene" aria-hidden="true"><span class="character-actor" data-direction="right"><span class="character-sprite" data-action="idle"></span><span class="character-effect"></span></span></span>
      <span class="bubble is-quiet"></span><span class="momentum-badge">${esc(m.mark)}${m.key==='surging'?'急':''}</span><span class="worker-state">${esc(a.label)}</span><span class="worker-name">${esc(p.title)}</span>
    </button>`;
  }

  function renderRoom() {
    room.classList.add('town-shared-room');
    const people = projects.slice(0, ROOM_LIMIT).map(workerMarkup).join('');
    room.innerHTML = `<span class="town-zone-label work">💻 作業エリア</span><span class="town-zone-label research">▥ 調査エリア</span><span class="town-zone-label wait">◷ 外部待ち</span><span class="town-zone-label review">成果物はこちらへ ↓</span><span class="town-work-desk"></span><span class="town-shelf"></span><span class="town-wait-spot"></span><span class="town-review-counter"></span><span class="town-rest-sofa"></span>${people || '<div class="room-loading">Projectがありません</div>'}`;
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
    const decision = decisionText(p, a);
    const handoff = a.key === 'review' ? `<div class="decision-card"><b>🎮 今あなたに必要なこと</b><p>${esc(decision)}</p><button type="button" class="handoff-button" data-handoff-id="${esc(p.id)}">ChatGPTで続きを指示する</button><small class="handoff-note">再開用の指示文をコピーして、新しいChatGPTを開きます。</small></div>` : `<div class="decision-card is-passive"><b>今あなたに必要なこと</b><p>${esc(decision)}</p></div>`;
    detailState.textContent = `${a.label} · ${m.mark}${m.label}`;
    detail.innerHTML = `<div class="detail-head"><div><h2>${esc(p.title)}</h2><div class="detail-meta">最終更新 ${esc(p.last_touched || '—')} · activity: ${esc(p.activity || '推定')}</div></div><span class="big-status" data-activity="${a.key}">${esc(a.label)}</span></div><div class="stat-grid"><div class="stat"><b>勢い</b><strong>${esc(m.mark)}${esc(m.label)}</strong></div><div class="stat"><b>やる気</b><strong>${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</strong></div><div class="stat"><b>SHEETS</b><strong>${sheets}</strong></div></div>${handoff}<div class="detail-block"><b>いま</b><p>${esc(p.current || 'まだCurrentは書かれていません。')}</p></div><div class="detail-block"><b>つぎ</b><p>${esc(p.next || 'まだNextは書かれていません。')}</p></div>`;
    msgTitle.textContent = `「${p.title}」は ${a.label}。${m.key === 'normal' ? '' : `${m.mark}${m.label}中。`}`;
    msgText.textContent = a.key === 'working' ? 'AI側の作業ターンです。PCの前で作業しています。' : a.key === 'researching' ? 'AI側の調査ターンです。資料棚の近くで調査・検討中です。' : a.key === 'review' ? 'あなたのターンです。成果物と判断内容を確認して、次の指示を返せます。' : a.key === 'external_wait' ? '外部要因を待っています。今すぐあなたが判断する必要はありません。' : 'いまは休止しています。再開するときに起こせます。';
    syncSelection();
  }

  function updateSummary() {
    const working = projects.filter((p) => activity(p).key === 'working').length;
    const review = projects.filter((p) => activity(p).key === 'review').length;
    const surge = projects.filter((p) => momentum(p).key === 'surging').length;
    summary.textContent = `作業 ${working} / あなた待ち ${review} / 急上昇 ${surge} / 全部 ${projects.length}`;
  }

  async function handleHandoff(id, button) {
    const p = projects.find((x) => x.id === id); if (!p) return;
    const prompt = handoffPrompt(p);
    const copying = copyText(prompt);
    window.open(CHATGPT_URL, '_blank', 'noopener,noreferrer');
    const ok = await copying;
    if (button) {
      button.textContent = ok ? 'コピーしました → ChatGPTへ貼り付け' : 'ChatGPTを開きました';
      button.disabled = true;
      setTimeout(() => { button.textContent = 'ChatGPTで続きを指示する'; button.disabled = false; }, 1600);
    }
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
    const handoff = e.target.closest?.('[data-handoff-id]');
    if (handoff) { e.preventDefault(); e.stopPropagation(); handleHandoff(handoff.dataset.handoffId, handoff); return; }
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