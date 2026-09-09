(() => {
  const STYLE_ID = 'ai-message-style';
  const PANEL_ID = 'aiMessagePanel';
  const READ_KEY = 'cockpid.ai-message.read.v1';

  function readState() {
    try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}'); }
    catch { return {}; }
  }
  function isRead(date) { return !!readState()[date]; }
  function markRead(date) {
    const state = readState();
    state[date] = new Date().toISOString();
    localStorage.setItem(READ_KEY, JSON.stringify(state));
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ai-transmission{position:relative;overflow:hidden;border-color:#254b46;background:linear-gradient(135deg,#0a1716,#091018 58%,#0a121a);transition:.2s}
      .ai-transmission:before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--green);box-shadow:0 0 16px #45e59b66}
      .ai-transmission.read{border-color:var(--line);background:linear-gradient(180deg,#0d151e,#091017)}
      .ai-transmission.read:before{opacity:.28;box-shadow:none}
      .ai-transmission .section-head{margin-bottom:0}
      .ai-transmission .section-head h2{display:flex;align-items:center;gap:8px}
      .ai-transmission-badge{display:inline-flex;align-items:center;gap:6px;border:1px solid #285a4d;background:#0a1b17;color:var(--green);padding:3px 7px;font:8px ui-monospace;letter-spacing:1px}
      .ai-transmission-badge:before{content:"";width:5px;height:5px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}
      .ai-transmission.read .ai-transmission-badge{color:var(--muted);border-color:var(--line2);background:#0b141c}
      .ai-transmission.read .ai-transmission-badge:before{background:var(--muted);box-shadow:none}
      .ai-transmission-main{padding:13px 3px 2px}
      .ai-transmission-main.collapsed{display:none}
      .ai-transmission-preview{font-size:14px;line-height:1.85;color:#d8e5e8;max-width:1050px;white-space:pre-wrap}
      .ai-transmission-empty{color:var(--muted);font:10px ui-monospace;padding:4px 0}
      .ai-transmission-meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;color:var(--muted);font:9px ui-monospace}
      .ai-transmission-meta b{color:#9db1bb;font-weight:600}
      .ai-transmission-detail{display:none;margin-top:12px;border-top:1px solid var(--line);padding-top:11px}
      .ai-transmission-detail.open{display:block}
      .ai-transmission-section{padding:9px 0;border-bottom:1px solid #14222a}
      .ai-transmission-section:last-child{border-bottom:0}
      .ai-transmission-section h3{margin:0 0 7px;color:var(--cyan);font:700 11px ui-monospace;letter-spacing:.3px}
      .ai-transmission-section p{margin:0;white-space:pre-wrap;color:#b9cbd3;font-size:12px;line-height:1.8}
      .ai-transmission-controls{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}
      .ai-transmission-head-toggle{display:none}
      .ai-transmission.read .ai-transmission-head-toggle{display:inline-block}
      @media(max-width:700px){.ai-transmission-preview{font-size:13px}.ai-transmission-meta{display:block}.ai-transmission-meta span{display:block;margin-top:4px}}
    `;
    document.head.appendChild(style);
  }

  function installCalendarLink() {
    if (document.getElementById('calendarLink')) return;
    const toolbar = document.querySelector('.toolbar');
    const nav = toolbar?.querySelector('.navgroup:last-child');
    if (!nav) return;
    const link = document.createElement('a');
    link.className = 'btn cyan';
    link.id = 'calendarLink';
    link.href = 'calendar.html';
    link.textContent = '▦ 手帳カレンダー';
    nav.insertBefore(link, nav.firstChild);
  }

  function installPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    const section = document.createElement('section');
    section.className = 'section ai-transmission';
    section.id = PANEL_ID;
    section.innerHTML = `
      <div class="section-head">
        <h2>◉ AI TRANSMISSION / IDASH <span class="ai-transmission-badge" id="aiMessageBadge">RECEIVED</span></h2>
        <span>
          <span class="hint" id="aiMessageStatus">READING ADVICE</span>
          <button class="btn ai-transmission-head-toggle" id="aiMessageHeadToggle">OPEN ▾</button>
        </span>
      </div>
      <div class="ai-transmission-main" id="aiMessageMain">
        <div class="ai-transmission-preview" id="aiMessagePreview">読み込み中…</div>
        <div class="ai-transmission-detail" id="aiMessageDetail"></div>
        <div class="ai-transmission-meta">
          <span>DATE <b id="aiMessageDate">—</b></span>
          <span>SOURCE <b id="aiMessageSource">my-storage-note/advice</b></span>
          <span>ROLE <b>VIEWPOINT / NOT DECISION</b></span>
        </div>
        <div class="ai-transmission-controls">
          <button class="btn" id="aiMessageRead" hidden>MARK READ ✓</button>
          <button class="btn cyan" id="aiMessageToggle" hidden>OPEN MESSAGE ▾</button>
        </div>
      </div>`;
    toolbar.insertAdjacentElement('afterend', section);

    document.getElementById('aiMessageToggle').addEventListener('click', () => {
      const detail = document.getElementById('aiMessageDetail');
      const open = detail.classList.toggle('open');
      document.getElementById('aiMessageToggle').textContent = open ? 'CLOSE MESSAGE ▴' : 'OPEN MESSAGE ▾';
    });
    document.getElementById('aiMessageRead').addEventListener('click', () => {
      const date = document.getElementById('aiMessageDate').textContent;
      markRead(date);
      applyReadState(date, true);
    });
    document.getElementById('aiMessageHeadToggle').addEventListener('click', () => {
      const main = document.getElementById('aiMessageMain');
      const collapsed = main.classList.toggle('collapsed');
      document.getElementById('aiMessageHeadToggle').textContent = collapsed ? 'OPEN ▾' : 'CLOSE ▴';
    });
  }

  function applyReadState(date, collapse) {
    const panel = document.getElementById(PANEL_ID);
    const main = document.getElementById('aiMessageMain');
    const badge = document.getElementById('aiMessageBadge');
    const readBtn = document.getElementById('aiMessageRead');
    const headToggle = document.getElementById('aiMessageHeadToggle');
    const read = isRead(date);
    panel.classList.toggle('read', read);
    badge.textContent = read ? 'READ' : 'RECEIVED';
    readBtn.hidden = read;
    if (read && collapse) main.classList.add('collapsed');
    if (!read) main.classList.remove('collapsed');
    headToggle.textContent = main.classList.contains('collapsed') ? 'OPEN ▾' : 'CLOSE ▴';
  }

  function cleanInline(text) {
    return String(text || '')
      .replace(/^>\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '・')
      .trim();
  }

  function parseAdvice(md) {
    const lines = String(md || '').replace(/\r/g, '').split('\n');
    const sections = [];
    let current = { title: '', lines: [] };
    for (const raw of lines) {
      const line = raw.replace(/^>\s?/, '');
      if (/^\[!tip\]/.test(line.trim())) continue;
      const h = line.match(/^###\s+(.+)$/);
      if (h) {
        if (current.title || current.lines.some(x => x.trim())) sections.push(current);
        current = { title: cleanInline(h[1]), lines: [] };
      } else current.lines.push(line);
    }
    if (current.title || current.lines.some(x => x.trim())) sections.push(current);
    return sections.map(s => ({ title: s.title || 'MESSAGE', body: cleanInline(s.lines.join('\n')) })).filter(s => s.body);
  }

  function renderSections(sections) {
    const detail = document.getElementById('aiMessageDetail');
    detail.innerHTML = '';
    for (const s of sections) {
      const block = document.createElement('section');
      block.className = 'ai-transmission-section';
      const h = document.createElement('h3');
      h.textContent = s.title;
      const p = document.createElement('p');
      p.textContent = s.body;
      block.append(h, p);
      detail.appendChild(block);
    }
  }

  async function loadAdviceMessage() {
    if (!document.getElementById(PANEL_ID)) return;
    const date = iso(cursorDate);
    const preview = document.getElementById('aiMessagePreview');
    const status = document.getElementById('aiMessageStatus');
    const toggle = document.getElementById('aiMessageToggle');
    const readBtn = document.getElementById('aiMessageRead');
    const detail = document.getElementById('aiMessageDetail');
    document.getElementById('aiMessageDate').textContent = date;
    document.getElementById('aiMessageSource').textContent = `advice/${date}.md`;
    status.textContent = 'READING ADVICE';
    preview.textContent = '読み込み中…';
    toggle.hidden = true;
    readBtn.hidden = true;
    detail.classList.remove('open');
    detail.innerHTML = '';
    try {
      const file = await repoGetSafe(CFG.analysisRepo, `advice/${date}.md`);
      if (!file || !file.content) {
        preview.textContent = 'この日のAIメッセージはまだありません。';
        preview.className = 'ai-transmission-preview ai-transmission-empty';
        status.textContent = 'NO TRANSMISSION';
        document.getElementById(PANEL_ID).classList.remove('read');
        document.getElementById('aiMessageMain').classList.remove('collapsed');
        return;
      }
      const sections = parseAdvice(decode64(file.content));
      if (!sections.length) {
        preview.textContent = 'メッセージを読み取りましたが、表示できる本文がありません。';
        preview.className = 'ai-transmission-preview ai-transmission-empty';
        status.textContent = 'EMPTY TRANSMISSION';
        return;
      }
      preview.className = 'ai-transmission-preview';
      const first = sections[0];
      const compact = first.body.replace(/\s+/g, ' ').trim();
      preview.textContent = `${first.title}\n${compact.length > 280 ? compact.slice(0, 280) + '…' : compact}`;
      renderSections(sections);
      toggle.hidden = false;
      status.textContent = `${sections.length} SIGNAL${sections.length === 1 ? '' : 'S'} / ${date}`;
      applyReadState(date, true);
    } catch (e) {
      console.error('AI transmission load failed', e);
      preview.textContent = 'AIメッセージの読み込みに失敗しました。接続設定を確認してください。';
      preview.className = 'ai-transmission-preview ai-transmission-empty';
      status.textContent = 'TRANSMISSION ERROR';
    }
  }

  installStyle();
  installCalendarLink();
  installPanel();
  loadAdviceMessage();

  for (const id of ['prevDay', 'nextDay', 'todayBtn']) {
    document.getElementById(id)?.addEventListener('click', () => queueMicrotask(loadAdviceMessage));
  }
  document.getElementById('tokenInput')?.addEventListener('change', () => setTimeout(loadAdviceMessage, 0));
})();
