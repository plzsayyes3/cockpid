(() => {
  'use strict';
  const PATH = 'objects/references/daily-note-issues-2026-11.md';
  const RAW = 'https://api.github.com/repos/plzsayyes3/my-storage-note/contents/' + PATH + '?ref=main';
  const SOURCE = 'https://github.com/plzsayyes3/my-storage-note/blob/main/' + PATH;
  const KEY = 'cockpid.onhand.issue.selected.v1';
  const home = document.querySelector('.movement-object');
  const full = document.querySelector('.onhand-grid');
  if (!home && !full) return;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const readSelected = () => { try { return localStorage.getItem(KEY); } catch (_) { return null; } };
  const saveSelected = id => { try { localStorage.setItem(KEY, id); } catch (_) {} };
  let issues = [];
  let selected = readSelected();

  const style = document.createElement('style');
  style.textContent = `
    .movement-grid:has(.issue-home-col){grid-template-columns:repeat(4,minmax(0,1fr))}
    .issue-home-col .issue-home-body{display:flex;flex-direction:column;gap:8px}
    .issue-question{font-size:12px;line-height:1.55;overflow-wrap:anywhere}
    .issue-home-col .issue-question{font-size:11px}
    .issue-tiny{font:700 9px/1.4 ui-monospace,monospace;color:#8d8a83}
    .issue-choose,.issue-pin{cursor:pointer;border:1px solid #dedbd3;border-radius:5px;background:transparent;padding:5px 7px;color:#77736c;font:700 9px/1.4 ui-monospace,monospace}
    .issue-pin[aria-pressed="true"]{color:#315d91;border-color:#9fb4ca;background:#eff4fa}
    .issue-home-col .issue-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
    .issue-home-col a,.issue-full-list a{color:#315d91;text-decoration:none}
    .issue-full-list{display:flex;flex-direction:column;gap:10px}
    .issue-full-card{padding:10px 8px;border-bottom:1px solid #e8e5dc}
    .issue-full-card.is-selected{background:#f2f5f7;border-radius:7px}
    .issue-full-card summary{cursor:pointer;font-size:12px;line-height:1.5}
    .issue-full-card p{font-size:11px;line-height:1.6;margin:7px 0}
    .issue-full-card .issue-pin{margin:7px 0}
    @media(max-width:800px){.movement-grid:has(.issue-home-col){grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:420px){.movement-grid:has(.issue-home-col){grid-template-columns:repeat(2,minmax(0,1fr))}}
    .onhand-grid:has(.issue-lane){grid-template-columns:repeat(4,minmax(0,1fr))}
    @media(max-width:1000px) and (min-width:821px){.onhand-grid:has(.issue-lane){grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:820px){.onhand-grid:has(.issue-lane){display:flex;flex-direction:column}}
  `;
  document.head.appendChild(style);

  if (home) {
    const grid = home.querySelector('.movement-grid');
    grid?.insertAdjacentHTML('beforeend', '<article class="movement-col issue-home-col" aria-label="Issue"><div class="movement-col-head"><span>Issue</span><b id="moveIssueCount">—</b></div><div class="issue-home-body" id="moveIssueItems"><span class="issue-tiny">読み込み中…</span></div></article>');
  }
  if (full) {
    full.insertAdjacentHTML('beforeend', '<article class="lane issue-lane" data-lane="issue"><div class="lane-head"><h2>Issue</h2><span id="fullIssueCount">—</span></div><div class="lane-list issue-full-list" id="fullIssueItems"><div class="empty">読み込み中…</div></div></article>');
  }

  function parse(content) {
    const part = String(content || '').split('## イシュー一覧')[1]?.split('\n## ')[0] || '';
    const blocks = part.split(/(?=^### \d+\. )/m).filter(x => /^### \d+\. /m.test(x));
    return blocks.map(block => {
      const title = block.match(/^### \d+\. (.+)$/m)?.[1]?.trim();
      const id = block.match(/^- ID: `([a-z0-9-]+)`/m)?.[1];
      const priority = block.match(/^- 区分: (.+)$/m)?.[1] || '';
      const observation = block.match(/^- 観察: (.+)$/m)?.[1] || '';
      const purpose = block.match(/^- 答えたいこと: (.+)$/m)?.[1] || '';
      const references = (block.match(/^- 根拠: (.+)$/m)?.[1] || '').match(/https:\/\/github\.com\/plzsayyes3\/mynotebook\/blob\/main\/01_Daily\/\d{4}-\d{2}-\d{2}\.md/g) || [];
      const related = (block.match(/^- 関連: (.+)$/m)?.[1] || '').match(/\.\.\/projects\/[a-z0-9-]+\.md/)?.[0] || '';
      return { id, title, priority, observation, purpose, references, related };
    }).filter(x => x.id && x.title);
  }
  const linkFor = relative => SOURCE.replace('objects/references/daily-note-issues-2026-11.md', 'objects/' + relative.replace('../', ''));
  const link = (href, label) => '<a target="_blank" rel="noopener noreferrer" href="' + esc(href) + '">' + esc(label) + '</a>';
  const current = () => issues.find(x => x.id === selected) || issues[0];

  function render() {
    if (!issues.length) return;
    const issue = current();
    selected = issue.id;
    const homeCount = document.getElementById('moveIssueCount');
    const fullCount = document.getElementById('fullIssueCount');
    if (homeCount) homeCount.textContent = String(issues.length);
    if (fullCount) fullCount.textContent = issues.length + ' ISSUES';
    const homeItems = document.getElementById('moveIssueItems');
    if (homeItems) homeItems.innerHTML =
      '<div class="issue-tiny">' + esc(issue.priority) + ' · SELECTED</div>' +
      '<div class="issue-question">' + esc(issue.title) + '</div>' +
      '<div class="issue-actions">' + link(SOURCE, 'SOURCE') +
      '<button class="issue-choose" type="button" data-issue-next>次の問い ↻</button>' +
      '<button class="issue-choose" type="button" data-issue-open>一覧</button></div>';
    const fullItems = document.getElementById('fullIssueItems');
    if (fullItems) fullItems.innerHTML = issues.map(x =>
      '<div class="issue-full-card' + (x.id === selected ? ' is-selected' : '') + '">' +
      '<details' + (x.id === selected ? ' open' : '') + '><summary>' + esc(x.title) + '</summary>' +
      '<div class="issue-tiny">' + esc(x.priority) + ' · ' + esc(x.id) + '</div>' +
      '<p>' + esc(x.observation) + '</p><p><b>答えたいこと：</b>' + esc(x.purpose) + '</p>' +
      '<button type="button" class="issue-pin" data-issue-select="' + esc(x.id) + '" aria-pressed="' + (x.id === selected) + '">' +
      (x.id === selected ? '選択中' : 'トップに表示') + '</button>' +
      '<div class="issue-tiny">' + x.references.map((u,i) => link(u, '根拠' + (i + 1))).join(' · ') +
      (x.related ? ' · ' + link(linkFor(x.related), '関連Project') : '') + '</div></details></div>'
    ).join('');
  }
  function failure(message) {
    const homeItems = document.getElementById('moveIssueItems');
    const fullItems = document.getElementById('fullIssueItems');
    if (homeItems) homeItems.textContent = message;
    if (fullItems) fullItems.textContent = message;
  }
  document.addEventListener('click', event => {
    const select = event.target.closest('[data-issue-select]');
    if (select && issues.some(x => x.id === select.dataset.issueSelect)) {
      selected = select.dataset.issueSelect; saveSelected(selected); render(); return;
    }
    if (event.target.closest('[data-issue-next]') && issues.length) {
      selected = issues[(issues.findIndex(x => x.id === selected) + 1) % issues.length].id;
      saveSelected(selected); render(); return;
    }
    if (event.target.closest('[data-issue-open]')) {
      if (window.COCKPID_ROUTER?.openApp) window.COCKPID_ROUTER.openApp('onhand');
      else location.href = 'onhand.html';
    }
  });
  window.addEventListener('storage', event => {
    if (event.key === KEY && issues.length) { selected = event.newValue; render(); }
  });
  async function boot() {
    const token = localStorage.getItem('zen-note-github-token');
    if (!token) { failure('GitHub token が必要です'); return; }
    try {
      const res = await fetch(RAW, { headers: {Accept:'application/vnd.github+json', Authorization:'Bearer ' + token}, cache:'no-store' });
      if (!res.ok) throw new Error('read ' + res.status);
      const json = await res.json();
      const bytes = Uint8Array.from(atob(String(json.content||'').replace(/\s/g,'')), c => c.charCodeAt(0));
      issues = parse(new TextDecoder().decode(bytes));
      if (!issues.length) throw new Error('issue format');
      render();
    } catch (error) {
      console.error('ON HAND Issue loading failed', error);
      failure('Issueを読み込めませんでした');
    }
  }
  boot();
})();
