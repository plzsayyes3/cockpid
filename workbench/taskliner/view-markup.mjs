export default `
<div class="tl-tools">
  <span class="tl-label">TASKLINER</span><span id="tlSaveState" role="status" aria-live="polite">保存済み</span>
  <button id="tlPull" type="button">pull</button><button id="tlSave" type="button">sync</button>
  <button id="tlForceSave" type="button" hidden>ローカルで上書き</button>
  <button id="tlMenuToggle" type="button" aria-expanded="false" aria-controls="tlMenu" aria-label="タスクライナー設定">☰</button>
</div>
<section id="tlMenu" class="tl-menu" hidden>
  <nav><a href="https://plzsayyes3.github.io/taskliner_taskchute-line/master.html" target="_blank" rel="noopener">Master ↗</a><a href="https://plzsayyes3.github.io/taskliner_taskchute-line/repeat.html" target="_blank" rel="noopener">Repeat ↗</a></nav>
  <div class="tl-menu-actions"><button id="tlMasterPull" type="button">Master Pull</button><button id="tlGenerate" type="button">Repeatから生成</button><button id="tlRepeatNew" type="button">新規Repeat</button><button id="tlTecho" type="button">手帳からインポート</button></div>
  <form id="tlRepeatForm" class="tl-repeat-form" hidden>
    <div class="tl-repeat-heading"><strong>新規リピートタスク</strong><button id="tlRepeatCancel" type="button">閉じる</button></div>
    <label>タスク名 / Master<input id="tlRepeatTitle" type="text" autocomplete="off" required placeholder="タスク名を入力"></label>
    <div id="tlRepeatSuggestions" class="tl-repeat-suggestions"></div>
    <label>繰り返し<select id="tlRepeatRule">
      <option value="daily">毎日</option><option value="weekdays">曜日指定</option><option value="weekly">毎週</option>
      <option value="biweekly">隔週</option><option value="nth_weekday">第●曜日</option><option value="month_end">月末</option>
    </select></label>
    <label id="tlRepeatWeekdaysWrap" hidden>曜日指定（日0・月1・…・土6、カンマ区切り）<input id="tlRepeatWeekdays" value="1,2,3,4,5"></label>
    <label id="tlRepeatWeekdayWrap" hidden>曜日（日=0、土=6）<input id="tlRepeatWeekday" type="number" min="0" max="6" value="1"></label>
    <label id="tlRepeatNthWrap" hidden>第何週<input id="tlRepeatNth" type="number" min="1" max="5" value="1"></label>
    <label id="tlRepeatAnchorWrap" hidden>隔週の基準日<input id="tlRepeatAnchor" type="date"></label>
    <div class="tl-repeat-grid"><label>Section<input id="tlRepeatSection" placeholder="例: 7-9"></label><label>予定時刻<input id="tlRepeatTime" type="time"></label></div>
    <label>見積もり（分・空欄ならMasterの標準値）<input id="tlRepeatEstimate" type="number" min="0" step="5"></label>
    <button id="tlRepeatSave" type="submit">Repeatを保存</button>
    <p id="tlRepeatFeedback" role="status" aria-live="polite"></p>
  </form>
  <div class="tl-menu-actions tl-recovery-actions"><button id="tlRecover" type="button">GitHub版で復旧</button><button id="tlRestoreBackup" type="button">復旧前に戻す</button></div>
  <p class="tl-recovery-help">現在の日付だけをGitHub最新版で置き換えます。復旧前のローカル内容を端末内に保存します。GitHub Token・他の日付は削除しません。</p>
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
