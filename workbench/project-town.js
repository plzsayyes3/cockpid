(() => {
  'use strict';

  const OWNER = 'plzsayyes3';
  const REPO = 'gpts';
  const BRANCH = 'main';
  const DIR = 'projects';
  const TOKEN_KEY = 'zen-note-github-token';
  const ROOM_LIMIT = 6;
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
  const characterControllers = new Map();

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const randomBetween = (min, max) => Math.round(min + Math.random() * (max - min));
  const sample = (items) => items[Math.floor(Math.random() * items.length)];

  async function api(url) {
    const h = { Accept: 'application/vnd.github+json' };
    const t = localStorage.getItem(TOKEN_KEY) || '';
    if (t) h.Authorization = `Bearer ${t}`;
    let r = await fetch(url, { headers: h });
    if (!r.ok && t && (r.status === 403 || r.status === 404)) {
      r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    }
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return r.json();
  }

  function decode(v) {
    const b = atob(String(v || '').replace(/\n/g, ''));
    return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
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
      const a = /^\s+-\s+(.*)$/.exec(lines[i]);
      if (a && arr) {
        if (!Array.isArray(meta[arr])) meta[arr] = [];
        meta[arr].push(scalar(a[1]));
        continue;
      }
      const p = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
      if (!p) continue;
      if (!p[2].trim()) {
        meta[p[1]] = '';
        arr = p[1];
      } else {
        meta[p[1]] = scalar(p[2]);
        arr = '';
      }
    }
    return meta;
  }

  function candidate(e) {
    return e.type === 'file'
      && e.name.endsWith('.md')
      && !/^(index|repositories)\.md$/i.test(e.name)
      && !/^PROJECT_/i.test(e.name)
      && !/-\d{4}-\d{2}-\d{2}\.md$/i.test(e.name);
  }

  function todayKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function age(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return 99;
    return Math.floor((Date.parse(`${todayKey()}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000);
  }

  function projectText(p) {
    return `${p.current || ''} ${p.next || ''}`.toLowerCase();
  }

  function hasWaitingCue(p) {
    return /(待ち|待機|保留|様子見|返信|返答|回答|承認|到着|入荷|公開待ち|確認待ち|連絡待ち|次のタイミング|外部要因|blocked|pending|waiting|on hold)/i.test(projectText(p));
  }

  function hasThinkingCue(p) {
    return /(考える|検討|判断|決める|見直す|見直し|構想|方針|どうする|未定|候補|調べる|調査|比較|選ぶ|再試験するか)/i.test(projectText(p));
  }

  function state(p) {
    const a = age(p.last_touched);
    if (hasWaitingCue(p)) return { key: 'waiting', label: '待機中', say: 'まち中…' };
    if (a >= 14) return { key: 'paused', label: 'ひとやすみ', say: '休憩中…' };
    if (p.desk === true) return { key: 'hot', label: '勢いあり', say: '制作中！' };
    if (a <= 1 && !hasThinkingCue(p)) return { key: 'hot', label: '勢いあり', say: '制作中！' };
    if (a <= 3 && !hasThinkingCue(p)) return { key: 'active', label: '進行中', say: '制作中！' };
    if (a <= 13) return { key: 'thinking', label: '考え中', say: '考え中…' };
    return { key: 'paused', label: 'ひとやすみ', say: '休憩中…' };
  }

  function motivation(p) {
    const a = age(p.last_touched);
    let n = a <= 1 ? 3 : a <= 7 ? 2 : 1;
    const commitment = String(p.commitment || '').toLowerCase();
    if (commitment === 'must' || commitment === 'chosen') n = Math.max(n, 2);
    if (commitment === 'must') n = 3;
    return n;
  }

  function pace(p) {
    const s = state(p).key;
    const a = age(p.last_touched);
    if (s === 'hot') return 90;
    if (s === 'active') return 68;
    if (s === 'thinking') return Math.max(38, 58 - a * 3);
    if (s === 'waiting') return 32;
    return a <= 30 ? 18 : 10;
  }

  async function loadOne(e) {
    const x = await api(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${e.path}?ref=${BRANCH}`);
    if (!x.content) return null;
    const m = fm(decode(x.content));
    if (m.type !== 'project' || m.status === 'archived') return null;
    return {
      id: String(m.id || e.name.replace(/\.md$/, '')),
      title: String(m.title || m.id || e.name),
      ...m,
      path: e.path
    };
  }

  const BEHAVIOR = {
    hot: {
      move: 430,
      steps: [
        { zone: 'desk', action: 'work', bubble: '制作中！', min: 1300, max: 2600, effect: 'idea', chance: 0.35 },
        { zone: 'center', action: 'idle', bubble: '', min: 600, max: 1300 },
        { zone: 'desk', action: 'work', bubble: 'すすめ！', min: 1000, max: 2200, effect: 'bang', chance: 0.22 }
      ]
    },
    active: {
      move: 650,
      steps: [
        { zone: 'desk', action: 'work', bubble: '制作中！', min: 1700, max: 3300 },
        { zone: 'center', action: 'idle', bubble: '', min: 900, max: 1800 },
        { zone: 'window', action: 'idle', bubble: 'つぎは…', min: 900, max: 1700 }
      ]
    },
    thinking: {
      move: 820,
      steps: [
        { zone: 'center', action: 'idle', bubble: '考え中…', min: 1800, max: 3800, effect: 'thought', chance: 0.65 },
        { zone: 'window', action: 'idle', bubble: 'うーん', min: 1200, max: 2400 },
        { zone: 'center', action: 'idle', bubble: '', min: 900, max: 1700 }
      ]
    },
    waiting: {
      move: 980,
      steps: [
        { zone: 'window', action: 'idle', bubble: 'まち中…', min: 2300, max: 4800 },
        { zone: 'rest', action: 'rest', bubble: '', min: 1700, max: 3200 },
        { zone: 'center', action: 'idle', bubble: 'まだかな', min: 1000, max: 2200 }
      ]
    },
    paused: {
      move: 1250,
      steps: [
        { zone: 'rest', action: 'rest', bubble: 'zzz', min: 4300, max: 7800, effect: 'sleep', chance: 0.8 },
        { zone: 'rest', action: 'rest', bubble: '', min: 2600, max: 5200 },
        { zone: 'center', action: 'idle', bubble: '', min: 700, max: 1300 }
      ]
    }
  };

  const ZONE_ORDER = { window: 0, rest: 0, center: 1, desk: 2 };

  class CharacterController {
    constructor(worker, project, index) {
      this.worker = worker;
      this.project = project;
      this.mode = state(project).key;
      this.actor = worker.querySelector('.character-actor');
      this.sprite = worker.querySelector('.character-sprite');
      this.bubble = worker.querySelector('.bubble');
      this.effect = worker.querySelector('.character-effect');
      this.zone = index % 2 ? 'center' : 'window';
      this.timer = 0;
      this.stopped = false;
      this.setZone(this.zone, false);
      this.setAction(this.mode === 'paused' ? 'rest' : 'idle');
      this.setBubble('');
    }

    start() {
      if (REDUCED_MOTION) {
        const step = this.mode === 'paused'
          ? { zone: 'rest', action: 'rest', bubble: 'zzz' }
          : this.mode === 'waiting'
            ? { zone: 'window', action: 'idle', bubble: 'まち中…' }
            : this.mode === 'thinking'
              ? { zone: 'center', action: 'idle', bubble: '考え中…' }
              : { zone: 'desk', action: 'work', bubble: '制作中！' };
        this.setZone(step.zone, false);
        this.setAction(step.action);
        this.setBubble(step.bubble);
        return;
      }
      this.schedule(randomBetween(280, 1800));
    }

    stop() {
      this.stopped = true;
      window.clearTimeout(this.timer);
    }

    schedule(delay) {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.next(), delay);
    }

    next() {
      if (this.stopped || !this.worker.isConnected || document.hidden) return;
      const profile = BEHAVIOR[this.mode] || BEHAVIOR.thinking;
      const step = sample(profile.steps);
      this.perform(step, profile.move);
    }

    perform(step, moveMs) {
      const sameZone = this.zone === step.zone;
      this.clearEffect();
      if (!sameZone) {
        const direction = (ZONE_ORDER[step.zone] ?? 1) < (ZONE_ORDER[this.zone] ?? 1) ? 'left' : 'right';
        this.setDirection(direction);
        this.setAction('walk');
        this.setBubble('');
        this.actor.style.setProperty('--move-ms', `${moveMs}ms`);
        this.setZone(step.zone, true);
        this.scheduleAction(step, moveMs + randomBetween(80, 220));
        return;
      }
      this.finishStep(step);
    }

    scheduleAction(step, delay) {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        if (this.stopped || !this.worker.isConnected) return;
        this.finishStep(step);
      }, delay);
    }

    finishStep(step) {
      this.setAction(step.action);
      this.setBubble(step.bubble || '');
      if (step.effect && Math.random() < (step.chance ?? 1)) this.setEffect(step.effect);
      this.schedule(randomBetween(step.min || 1000, step.max || 2200));
    }

    setZone(zone, animate = true) {
      this.zone = zone;
      this.actor.classList.remove('at-window', 'at-center', 'at-desk', 'at-rest');
      if (!animate) this.actor.classList.add('no-transition');
      this.actor.classList.add(`at-${zone}`);
      if (!animate) requestAnimationFrame(() => this.actor.classList.remove('no-transition'));
    }

    setDirection(direction) {
      this.actor.dataset.direction = direction;
    }

    setAction(action) {
      const spriteAction = ['idle', 'walk', 'work', 'rest'].includes(action) ? action : 'idle';
      this.sprite.dataset.action = spriteAction;
      this.worker.dataset.action = spriteAction;
    }

    setBubble(text) {
      this.bubble.textContent = text;
      this.bubble.classList.toggle('is-quiet', !text);
    }

    setEffect(kind) {
      const mark = kind === 'idea' ? '!' : kind === 'thought' ? '…' : kind === 'sleep' ? 'Z' : '✦';
      this.effect.textContent = mark;
      this.effect.dataset.effect = kind;
      this.effect.classList.add('show');
    }

    clearEffect() {
      this.effect.classList.remove('show');
      this.effect.textContent = '';
      this.effect.removeAttribute('data-effect');
    }
  }

  function stopCharacters() {
    characterControllers.forEach((controller) => controller.stop());
    characterControllers.clear();
  }

  function startCharacters() {
    stopCharacters();
    room.querySelectorAll('.worker[data-project-id]').forEach((worker, index) => {
      const project = projects.find((p) => p.id === worker.dataset.projectId);
      if (!project) return;
      const controller = new CharacterController(worker, project, index);
      characterControllers.set(project.id, controller);
      controller.start();
    });
  }

  function workerMarkup(p) {
    const s = state(p);
    return `<button class="worker${selected === p.id ? ' active' : ''}" data-project-id="${esc(p.id)}" data-state="${s.key}" type="button">
      <span class="worker-scene" aria-hidden="true">
        <span class="window-pixel"><i></i><i></i></span>
        <span class="rest-spot"></span>
        <span class="desk-pixel"><i class="monitor"></i><i class="desk-glow"></i></span>
        <span class="character-actor" data-direction="right">
          <span class="character-sprite" data-action="idle"></span>
          <span class="character-effect"></span>
        </span>
      </span>
      <span class="bubble is-quiet"></span>
      <span class="worker-state">${esc(s.label)}</span>
      <span class="worker-name">${esc(p.title)}</span>
    </button>`;
  }

  function renderRoom() {
    const visible = projects.slice(0, ROOM_LIMIT);
    room.innerHTML = visible.map(workerMarkup).join('') || '<div class="room-loading">Projectがありません</div>';
    startCharacters();
  }

  function renderList() {
    count.textContent = projects.length;
    list.innerHTML = projects.map((p) => {
      const s = state(p);
      const pc = pace(p);
      return `<button class="project-row${selected === p.id ? ' active' : ''}" data-project-id="${esc(p.id)}" type="button">
        <span class="project-name">${esc(p.title)}</span>
        <span class="state-chip" data-state="${s.key}">${s.label}</span>
        <span class="meter" aria-label="pace ${pc}"><span style="width:${pc}%"></span></span>
      </button>`;
    }).join('');
  }

  function syncSelection() {
    document.querySelectorAll('[data-project-id]').forEach((node) => {
      node.classList.toggle('active', node.dataset.projectId === selected);
    });
  }

  function show(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    selected = id;
    const s = state(p);
    const m = motivation(p);
    const pc = pace(p);
    const sheets = Math.max(0, Number(p.sheets || 0));

    detailState.textContent = s.label;
    detail.innerHTML = `<div class="detail-head"><div><h2>${esc(p.title)}</h2><div class="detail-meta">最終更新 ${esc(p.last_touched || '—')}</div></div><span class="big-status" data-state="${s.key}">${s.label}</span></div>
      <div class="stat-grid"><div class="stat"><b>勢い</b><strong>${pc}%</strong></div><div class="stat"><b>やる気</b><strong>${'★'.repeat(m)}${'☆'.repeat(3 - m)}</strong></div><div class="stat"><b>SHEETS</b><strong>${sheets}</strong></div></div>
      <div class="detail-block"><b>いま</b><p>${esc(p.current || 'まだCurrentは書かれていません。')}</p></div>
      <div class="detail-block"><b>つぎ</b><p>${esc(p.next || 'まだNextは書かれていません。')}</p></div>`;

    msgTitle.textContent = `「${p.title}」は ${s.label}。`;
    msgText.textContent = s.key === 'hot'
      ? '勢いがあるプロジェクト。机へ向かって、短い休憩を挟みながらよく動きます。'
      : s.key === 'active'
        ? '通常進行中。作業を続けつつ、ときどき机を離れて次の一手を見ています。'
        : s.key === 'thinking'
          ? '最近触れているけれど、まだ進め方を考えている状態。立ち止まる時間も動きの一部です。'
          : s.key === 'waiting'
            ? '外部要因や次のタイミング待ち。窓を見たり、座って待ったりします。'
            : 'しばらく触っていないプロジェクト。いまは休ませて、必要になったら起こせます。';
    syncSelection();
  }

  async function load() {
    reload.disabled = true;
    summary.textContent = 'gpts / projects を読んでいます…';
    stopCharacters();
    try {
      const es = await api(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${DIR}?ref=${BRANCH}`);
      const xs = await Promise.all((Array.isArray(es) ? es : []).filter(candidate).map(async (e) => {
        try {
          return await loadOne(e);
        } catch (err) {
          console.warn('Project Town skip', e.path, err);
          return null;
        }
      }));
      projects = xs.filter(Boolean).sort((a, b) => String(b.last_touched || '').localeCompare(String(a.last_touched || '')));
      const moving = projects.filter((p) => ['hot', 'active', 'thinking'].includes(state(p).key)).length;
      const waiting = projects.filter((p) => state(p).key === 'waiting').length;
      summary.textContent = `動いてる ${moving} / 待機 ${waiting} / 全部 ${projects.length}`;
      selected = projects[0]?.id || '';
      renderRoom();
      renderList();
      if (selected) show(selected);
    } catch (err) {
      console.error(err);
      summary.textContent = `読み込み失敗 · ${err.message || err}`;
      room.innerHTML = '<div class="room-loading">Projectを読み込めませんでした</div>';
    } finally {
      reload.disabled = false;
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-project-id]');
    if (b) show(b.dataset.projectId);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCharacters();
    else if (projects.length) startCharacters();
  });

  reload.addEventListener('click', load);
  load();
})();
