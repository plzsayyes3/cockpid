export default `
<div class="tl-tools">
  <span class="tl-label">TASKLINER</span><span id="tlSaveState" role="status" aria-live="polite">保存済み</span>
  <button id="tlPull" type="button">pull</button><button id="tlSave" type="button">sync</button>
  <button id="tlForceSave" type="button" hidden>ローカルで上書き</button>
  <button id="tlMenuToggle" type="button" aria-expanded="false" aria-controls="tlMenu" aria-label="タスクライナー設定">☰</button>
</div>
<section id="tlMenu" class="tl-menu" hidden>
  <nav><a href="https://plzsayyes3.github.io/taskliner_taskchute-line/master.html" target="_blank" rel="noopener">Master ↗</a><a href="https://plzsayyes3.github.io/taskliner_taskchute-line/repeat.html" target="_blank" rel="noopener">Repeat ↗</a></nav>
  <div class="tl-menu-actions"><button id="tlMasterPull" type="button">Master Pull</button><button id="tlGenerate" type="button">Repeatから生成</button><button id="tlTecho" type="button">手帳からインポート</button></div>
  <label>タスクの文字サイズ <output id="tlFontValue">100%</output><input id="tlFont" type="range" min="50" max="140" step="5" value="100"></label>
  <label>操作ボタン <output id="tlButtonValue">100%</output><input id="tlButton" type="range" min="50" max="150" step="5" value="100"></label>
  <label>メニュー・ヘッダー <output id="tlHeaderValue">100%</output><input id="tlHeader" type="range" min="50" max="150" step="5" value="100"></label>
  <label>表示テーマ<select id="tlTheme"><option value="soft">Dusty Blue</option><option value="terminal">Terminal</option></select></label>
  <details><summary>GitHub同期設定</summary><label>Repository<input id="tlRepo" autocomplete="off"></label><label>Branch<input id="tlBranch" autocomplete="off"></label><label>Folder<input id="tlFolder" autocomplete="off"></label><label>Token<input id="tlToken" type="password" autocomplete="off"></label><button id="tlConfigSave" type="button">設定を保存</button></details>
</section>
<p id="tlStatus" class="tl-status" role="status"></p>
<div class="tl-scroll"><div id="tlAppContent"></div></div>
<div id="tlNote" class="tl-note" hidden><header><strong id="tlNoteTitle"></strong><button id="tlNoteClose" type="button">閉じる</button></header><article id="tlNoteBody"></article></div>
`;
