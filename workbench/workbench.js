(() => {
  'use strict';

  const $w = (id) => document.getElementById(id);
  const todayList = $w('todayList');
  const captureText = $w('captureText');
  const captureBtn = $w('captureBtn');
  const captureModeBtn = $w('captureModeBtn');
  const CAPTURE_INPUT_MODE_KEY = 'cockpid.capture.input-mode.v1';
  let captureRawMode = false;
  let captureComposing = false;
  let capturePendingRomaji = null;
  try { captureRawMode = window.localStorage?.getItem(CAPTURE_INPUT_MODE_KEY) === 'raw'; } catch (_) {}
  function syncCaptureMode() {
    if (!captureModeBtn) return;
    captureModeBtn.textContent = captureRawMode ? 'RAW かな / 通常' : '通常 / RAW かな';
    captureModeBtn.setAttribute('aria-pressed', String(captureRawMode));
    captureModeBtn.setAttribute('aria-label', captureRawMode ? 'ローマ字をひらがなへ直接変換中。通常入力に切り替え' : '通常入力中。ローマ字からひらがなへの直接変換に切り替え');
    captureText.setAttribute('lang', captureRawMode ? 'en' : 'ja');
    captureText.setAttribute('autocorrect', 'off');
    captureText.setAttribute('autocapitalize', 'off');
    captureText.setAttribute('spellcheck', 'false');
  }
  function toggleCaptureMode() {
    if (captureComposing) return;
    capturePendingRomaji = null;
    captureRawMode = !captureRawMode;
    try { window.localStorage?.setItem(CAPTURE_INPUT_MODE_KEY, captureRawMode ? 'raw' : 'normal'); } catch (_) {}
    syncCaptureMode();
    captureText.focus();
  }
  // RAW: roman letters become hiragana immediately, without any kanji conversion.
  // Adapted from Zen Flow's local romaji mapping.
  const CAPTURE_ROMA = Object.freeze({
    a:'あ',i:'い',u:'う',e:'え',o:'お',
    ka:'か',ki:'き',ku:'く',ke:'け',ko:'こ',kya:'きゃ',kyu:'きゅ',kyo:'きょ',
    sa:'さ',shi:'し',si:'し',su:'す',se:'せ',so:'そ',sha:'しゃ',shu:'しゅ',sho:'しょ',sya:'しゃ',syu:'しゅ',syo:'しょ',
    ta:'た',chi:'ち',ti:'ち',tsu:'つ',tu:'つ',te:'て',to:'と',cha:'ちゃ',chu:'ちゅ',cho:'ちょ',tya:'ちゃ',tyu:'ちゅ',tyo:'ちょ',
    na:'な',ni:'に',nu:'ぬ',ne:'ね',no:'の',nya:'にゃ',nyu:'にゅ',nyo:'にょ',
    ha:'は',hi:'ひ',fu:'ふ',hu:'ふ',he:'へ',ho:'ほ',hya:'ひゃ',hyu:'ひゅ',hyo:'ひょ',fa:'ふぁ',fi:'ふぃ',fe:'ふぇ',fo:'ふぉ',
    ma:'ま',mi:'み',mu:'む',me:'め',mo:'も',mya:'みゃ',myu:'みゅ',myo:'みょ',
    ya:'や',yu:'ゆ',yo:'よ',
    ra:'ら',ri:'り',ru:'る',re:'れ',ro:'ろ',rya:'りゃ',ryu:'りゅ',ryo:'りょ',
    wa:'わ',wo:'を',
    ga:'が',gi:'ぎ',gu:'ぐ',ge:'げ',go:'ご',gya:'ぎゃ',gyu:'ぎゅ',gyo:'ぎょ',
    za:'ざ',ji:'じ',zi:'じ',zu:'ず',ze:'ぜ',zo:'ぞ',ja:'じゃ',ju:'じゅ',jo:'じょ',jya:'じゃ',jyu:'じゅ',jyo:'じょ',
    da:'だ',di:'ぢ',du:'づ',de:'で',do:'ど',dya:'ぢゃ',dyu:'ぢゅ',dyo:'ぢょ',
    ba:'ば',bi:'び',bu:'ぶ',be:'べ',bo:'ぼ',bya:'びゃ',byu:'びゅ',byo:'びょ',
    pa:'ぱ',pi:'ぴ',pu:'ぷ',pe:'ぺ',po:'ぽ',pya:'ぴゃ',pyu:'ぴゅ',pyo:'ぴょ',
    va:'ゔぁ',vi:'ゔぃ',vu:'ゔ',ve:'ゔぇ',vo:'ゔぉ',wi:'うぃ',we:'うぇ',thi:'てぃ',dhi:'でぃ',twu:'とぅ',dwu:'どぅ',xtsu:'っ',ltsu:'っ',ltu:'っ',xa:'ぁ',xi:'ぃ',xu:'ぅ',xe:'ぇ',xo:'ぉ',la:'ぁ',li:'ぃ',lu:'ぅ',le:'ぇ',lo:'ぉ',xya:'ゃ',xyu:'ゅ',xyo:'ょ',lya:'ゃ',lyu:'ゅ',lyo:'ょ',she:'しぇ',che:'ちぇ',je:'じぇ'
  });
  const captureIsVowel=c=>c!==''&&'aiueo'.includes(c);
  const captureIsConsonant=c=>/^[a-z]$/.test(c)&&!captureIsVowel(c);
  function captureToHiragana(raw,final=false){
    if(!/^[a-z]+$/.test(raw))return raw;
    let out='',i=0;
    while(i<raw.length){
      const ch=raw[i],next=raw[i+1]||'';
      if(ch==='n'){
        if(next==='n'){
          const after=raw[i+2]||'';
          if(!after){out+=final?'ん':raw.slice(i);break;}
          out+='ん';i+=captureIsVowel(after)||after==='y'?1:2;continue;
        }
        if(!next){out+=final?'ん':'n';break;}
        if(captureIsConsonant(next)&&next!=='y'){out+='ん';i++;continue;}
      }
      if(ch===next&&ch!=='n'&&captureIsConsonant(ch)){
        if(i+2>=raw.length&&!final){out+=raw.slice(i);break;}
        out+='っ';i++;continue;
      }
      let found='',width=0;
      for(let len=4;len>=1;len--){
        const seq=raw.slice(i,i+len);
        if(CAPTURE_ROMA[seq]){found=CAPTURE_ROMA[seq];width=len;break;}
      }
      if(found){out+=found;i+=width;continue;}
      out+=raw.slice(i);break;
    }
    return out;
  }

  function convertCaptureAtCaret(inserted) {
    const pending = capturePendingRomaji;
    capturePendingRomaji = null;
    if (!captureRawMode || captureComposing || !inserted ||
        captureText.selectionStart !== captureText.selectionEnd) return;

    const end = captureText.selectionStart;
    const start = end - inserted.length;
    const value = captureText.value;
    if (start < 0 || value.slice(start, end) !== inserted) return;

    // Only join text typed in the same run. Existing or pasted Latin text is left alone.
    const continuesRun = pending?.end === start &&
      pending.value === value.slice(0, start) + value.slice(end);
    const from = continuesRun ? pending.start : start;
    const letters = /^[a-z]+$/.test(inserted);
    const raw = value.slice(from, letters ? end : start);
    if (!raw) return;
    const kana = captureToHiragana(raw, !letters);
    const punctuation = inserted === ',' || inserted === '.' ? '。' : inserted;
    const replacement = letters ? kana : kana + punctuation;
    if (value.slice(from, end) !== replacement) {
      captureText.setRangeText(replacement, from, end, 'end');
    }

    const unfinished = letters && /[a-z]+$/.exec(kana);
    if (unfinished) {
      const caret = captureText.selectionStart;
      capturePendingRomaji = {
        start: caret - unfinished[0].length, end: caret, value: captureText.value
      };
    }
  }
  // Bottom-anchored, typewriter-like capture editing.
  // A hidden mirror tracks the true caret line, including wrapped Japanese text.
  // This avoids moving the actual caret or modifying its text/selection.
  const captureCaretMirror = typeof document.createElement === 'function'
    ? document.createElement('div') : null;
  let captureAnchorFrame = null;
  if (captureCaretMirror && document.body?.appendChild) {
    captureCaretMirror.setAttribute('aria-hidden', 'true');
    Object.assign(captureCaretMirror.style, {
      position: 'fixed', left: '-100000px', top: '0',
      visibility: 'hidden', pointerEvents: 'none',
      height: 'auto', padding: '0', margin: '0', border: '0',
      boxSizing: 'content-box', whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word'
    });
    document.body.appendChild(captureCaretMirror);
  }

  function anchorCaptureCaret() {
    if (captureComposing || !captureCaretMirror || !captureText.clientWidth || !captureText.clientHeight ||
        typeof window.getComputedStyle !== 'function') return;

    // Never shift the writing origin. The previous bottom-anchoring routine
    // changed paddingTop on focus, causing the first line to jump downward.
    captureText.style.paddingTop = '';
    captureText.style.paddingBottom = '';
    if (!captureText.value) {
      captureText.scrollTop = 0;
      return;
    }

    const style = window.getComputedStyle(captureText);
    const pixels = value => parseFloat(value) || 0;
    const lineHeight = pixels(style.lineHeight) || pixels(style.fontSize) * 1.8 || 28;
    const paddingTop = pixels(style.paddingTop);
    const paddingBottom = pixels(style.paddingBottom);
    const mirrorWidth = Math.max(1, captureText.clientWidth -
      pixels(style.paddingLeft) - pixels(style.paddingRight));
    captureCaretMirror.style.width = mirrorWidth + 'px';
    for (const prop of ['fontFamily','fontSize','fontWeight','fontStyle','fontVariant',
      'fontStretch','lineHeight','letterSpacing','wordSpacing','textTransform',
      'textIndent','tabSize','textAlign','wordBreak','overflowWrap','direction']) {
      captureCaretMirror.style[prop] = style[prop];
    }
    const caret = document.createElement('span');
    caret.textContent = '\u200b';
    captureCaretMirror.replaceChildren(
      document.createTextNode(captureText.value.slice(0, captureText.selectionStart)), caret);
    const caretTop = caret.getBoundingClientRect().top -
      captureCaretMirror.getBoundingClientRect().top + paddingTop;

    // Keep the active line visible, but scroll only after it exceeds the
    // visible area. In particular, never force short notes to the bottom.
    const visibleTop = captureText.scrollTop;
    const visibleBottom = visibleTop + captureText.clientHeight - paddingBottom;
    const caretBottom = caretTop + lineHeight;
    const margin = 8;
    if (caretBottom > visibleBottom - margin) {
      captureText.scrollTop = Math.max(0,
        caretBottom + margin + paddingBottom - captureText.clientHeight);
    } else if (caretTop < visibleTop + margin) {
      captureText.scrollTop = Math.max(0, caretTop - margin);
    }
  }
  function scheduleCaptureAnchor() {
    if (!captureCaretMirror || captureAnchorFrame !== null) return;
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame : callback => setTimeout(callback, 0);
    captureAnchorFrame = schedule(() => {
      captureAnchorFrame = null;
      anchorCaptureCaret();
    });
  }

  const captureHint = document.querySelector('.capture-actions .quiet');
  let selectedDate = null;
  let calendarLoadSeq = 0;

  function sourceFor(name, fallbackRepo, fallbackDir) {
    return window.COCKPID_SOURCES?.get(name) || { repo: fallbackRepo, dir: fallbackDir };
  }

  function joinPath(dir, child) {
    const base = String(dir || '').replace(/^\/+|\/+$/g, '');
    const tail = String(child || '').replace(/^\/+/, '');
    return base ? `${base}/${tail}` : tail;
  }

  function encodeApiPath(path) {
    return String(path || '').split('/').map(encodeURIComponent).join('/');
  }

  function captureDefaultHint() {
    const source = sourceFor('inbox', 'mynotebook', '00_inbox');
    return `Ctrl / ⌘ + Enter で ${source.repo}/${source.dir} へ直接保存`;
  }

  function syncSourceHints() {
    if (captureHint) captureHint.textContent = captureDefaultHint();
  }

  function nowParts() {
    $w('todayDate').textContent = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
    }).format(new Date());
    $w('todayTime').textContent = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  }

  function jstDateParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  function dateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function jstDateKey() {
    return dateKey(jstDateParts());
  }

  function shiftDate(parts, amount) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }

  function dateRelation(parts) {
    return dateKey(parts).localeCompare(jstDateKey());
  }

  function updateSelectedDateLabel() {
    const button = $w('todayDateBtn');
    if (!button || !selectedDate) return;
    const date = new Date(Date.UTC(selectedDate.year, selectedDate.month - 1, selectedDate.day));
    const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', weekday: 'short' }).format(date);
    button.textContent = `${selectedDate.month}/${selectedDate.day}(${weekday})`;
    button.classList.toggle('is-today', dateRelation(selectedDate) === 0);
  }

  function jstClockMinutes() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return get('hour') * 60 + get('minute');
  }

  function inboxStamp() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(now);
    const get = (type) => parts.find((part) => part.type === type)?.value || '00';
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}${milliseconds}`;
  }

  const encodeUtf8 = (value) => btoa(unescape(encodeURIComponent(value)));
  const timeToMinutes = (value) => {
    const [hour, minute] = String(value || '').split(':').map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  };
  const padHour = (hour) => `${String(hour).padStart(2, '0')}:00`;

  function cleanItem(text) {
    const value = text.trim().replace(/^\[([ xX/])\]\s*/, '');
    const match = /^(\d{1,2}:\d{2})(?:\s*(?:-|–|—|〜|~)\s*(\d{1,2}:\d{2}))?\s+(.*)$/.exec(value);
    if (!match) return { time: '', title: value, start: null, end: null };
    const start = timeToMinutes(match[1]);
    let end = match[2] ? timeToMinutes(match[2]) : start + 45;
    if (end == null || end <= start) end = Math.min(start + 45, 24 * 60);
    return {
      time: match[2] ? `${match[1]}–${match[2]}` : match[1],
      title: match[3].trim(),
      start,
      end
    };
  }

  function uniqueCalendarItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = [item.start ?? '', item.end ?? '', item.time || '', item.title || ''].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderTodayTimeline(items, day) {
    items = uniqueCalendarItems(items);
    const relation = dateRelation(day);
    const isToday = relation === 0;
    const isPastDay = relation < 0;
    const now = jstClockMinutes();
    const timed = items.filter((item) => Number.isFinite(item.start)).sort((a, b) => a.start - b.start);
    const anytime = items.filter((item) => !Number.isFinite(item.start));
    const anytimeHtml = anytime.length ? `
      <div class="anytime${isPastDay ? ' past' : ''}">
        <span class="anytime-label">ANYTIME</span>
        <div class="anytime-items">${anytime.map((item) => `<span class="anytime-item">${esc(item.title)}</span>`).join('')}</div>
      </div>` : '';

    if (!timed.length) {
      todayList.innerHTML = anytimeHtml || '<div class="empty">この日の予定はまだありません。</div>';
      return;
    }

    let startHour = Math.max(0, Math.floor(timed[0].start / 60) - 1);
    let endHour = Math.min(24, Math.ceil(Math.max(...timed.map((item) => item.end)) / 60) + 1);
    if (endHour - startHour < 6) {
      const missing = 6 - (endHour - startHour);
      startHour = Math.max(0, startHour - Math.ceil(missing / 2));
      endHour = Math.min(24, Math.max(endHour, startHour + 6));
      if (endHour - startHour < 6) startHour = Math.max(0, endHour - 6);
    }

    const startMinutes = startHour * 60;
    const endMinutes = endHour * 60;
    const pxPerMinute = 0.58;
    const height = Math.max(220, Math.round((endMinutes - startMinutes) * pxPerMinute));
    const marks = [];
    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
      const top = Math.min(height, Math.max(0, Math.round((minutes - startMinutes) * pxPerMinute)));
      if (minutes % 60 === 0) {
        marks.push(`<div class="timeline-hour" style="top:${top}px"><span>${padHour(minutes / 60)}</span></div>`);
      } else {
        marks.push(`<div class="timeline-half" style="top:${top}px"></div>`);
      }
    }

    const events = timed.map((item) => {
      const top = Math.round((item.start - startMinutes) * pxPerMinute);
      const eventHeight = Math.max(28, Math.round((item.end - item.start) * pxPerMinute));
      const past = isPastDay || (isToday && item.end <= now);
      return `<div class="timeline-event${past ? ' past' : ''}" style="top:${top}px;height:${eventHeight}px" title="${esc(item.time)}">
        <span class="timeline-event-time">${esc(item.time)}</span>
        <span class="timeline-event-title">${esc(item.title)}</span>
      </div>`;
    }).join('');

    let pastHeight = 0;
    if (isPastDay) pastHeight = height;
    else if (isToday) pastHeight = Math.min(height, Math.max(0, Math.round((now - startMinutes) * pxPerMinute)));
    const pastHtml = pastHeight > 0 ? `<div class="timeline-past" style="height:${pastHeight}px"></div>` : '';
    const nowHtml = isToday && now >= startMinutes && now <= endMinutes
      ? `<div class="timeline-now" style="top:${Math.round((now - startMinutes) * pxPerMinute)}px"><span>NOW</span></div>`
      : '';

    todayList.innerHTML = `${anytimeHtml}<div class="timeline" style="height:${height}px">${pastHtml}${marks.join('')}<div class="timeline-track">${events}</div>${nowHtml}</div>`;
  }

  async function loadToday({ background = false } = {}) {
    if (!selectedDate) selectedDate = jstDateParts();
    updateSelectedDateLabel();
    const seq = ++calendarLoadSeq;
    if (!token()) {
      if (!background) todayList.innerHTML = '<div class="empty">GitHub token が必要です。</div>';
      return;
    }

    const target = { ...selectedDate };
    const source = sourceFor('techo', 'mynotebook', '02_techo');
    const sourcePath = joinPath(source.dir, `${target.year}-${String(target.month).padStart(2, '0')}.md`);
    if (!background) todayList.innerHTML = '<div class="empty">Techoを読んでいます…</div>';
    try {
      const payload = await gh(sourcePath, source.repo);
      if (seq !== calendarLoadSeq) return;
      if (!payload?.content) throw new Error('no source');
      const lines = decode(payload.content).split(/\r?\n/);
      const heading = new RegExp(`^##\\s+${target.month}月${target.day}日(?:\\([^)]*\\))?\\s*$`);
      let active = false;
      const items = [];
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (heading.test(line)) { active = true; continue; }
        if (active && /^##\s+/.test(line)) break;
        if (!active) continue;
        const match = /^\s*-\s+(.*)$/.exec(raw);
        if (match?.[1]?.trim()) items.push(cleanItem(match[1]));
      }
      renderTodayTimeline(items, target);
    } catch (error) {
      if (seq !== calendarLoadSeq) return;
      console.error(error);
      if (!background) todayList.innerHTML = '<div class="empty">Techoを読み込めませんでした。</div>';
    }
  }

  function moveCalendar(amount) {
    selectedDate = shiftDate(selectedDate || jstDateParts(), amount);
    loadToday();
  }

  function resetCalendarToday() {
    selectedDate = jstDateParts();
    loadToday();
  }


  // Gemini finalization mirrors Zen v10 SEND: local kana while typing,
  // AI conversion once at save time. Keys are kept only in this origin's localStorage.
  const CAPTURE_GEMINI_KEY = 'cockpid.capture.gemini-key.v1';
  const CAPTURE_GEMINI_MODEL = 'cockpid.capture.gemini-model.v1';
  const CAPTURE_DEFAULT_MODEL = 'gemini-3.6-flash';
  const captureGeminiKeyInput = $w('captureGeminiKey');
  const captureGeminiModelInput = $w('captureGeminiModel');
  const captureGeminiSaveButton = $w('captureGeminiSave');
  const captureGeminiStatus = $w('captureGeminiStatus');

  const geminiSetting = (key) => {
    try { return (localStorage.getItem(key) || '').trim(); }
    catch (_) { return ''; }
  };
  function updateGeminiSettingsUI(message) {
    const key = geminiSetting(CAPTURE_GEMINI_KEY);
    const model = geminiSetting(CAPTURE_GEMINI_MODEL) || CAPTURE_DEFAULT_MODEL;
    if (captureGeminiKeyInput) captureGeminiKeyInput.value = key;
    if (captureGeminiModelInput) captureGeminiModelInput.value = model;
    if (captureGeminiStatus) captureGeminiStatus.textContent =
      message || (key ? 'Gemini APIキー設定済み · RAW保存時にAI整形' : '未設定 · RAW保存にはGemini APIキーが必要です');
  }
  captureGeminiSaveButton?.addEventListener('click', () => {
    const key = captureGeminiKeyInput?.value.trim() || '';
    const model = (captureGeminiModelInput?.value.trim() || CAPTURE_DEFAULT_MODEL)
      .replace(/^models\//, '');
    if (!key) {
      if (captureGeminiStatus) captureGeminiStatus.textContent = 'APIキーを入力してください（既存キーは保持しています）';
      return;
    }
    try {
      localStorage.setItem(CAPTURE_GEMINI_KEY, key);
      localStorage.setItem(CAPTURE_GEMINI_MODEL, model);
      updateGeminiSettingsUI('保存しました · RAW保存時にGeminiを使用します');
    } catch (_) {
      if (captureGeminiStatus) captureGeminiStatus.textContent = 'ブラウザへの設定保存に失敗しました';
    }
  });
  updateGeminiSettingsUI();

  async function finalizeCaptureWithGemini(sourceText) {
    const apiKey = geminiSetting(CAPTURE_GEMINI_KEY);
    let model = geminiSetting(CAPTURE_GEMINI_MODEL) || CAPTURE_DEFAULT_MODEL;
    if (!apiKey) throw new Error('Gemini APIキーが未設定です。Settings → Appsで登録してください');
    const prompt = [
      'あなたは日本語ノートの最終表記変換器です。',
      '以下はローマ字からひらがなへ単純変換したノートです。',
      '自然な漢字かな交じり・外来語のカタカナに変換してください。',
      '明白な打鍵ミスだけ修正し、意味、文体、改行、箇条書き、固有名詞、URL、英字の略語を保持してください。',
      '要約、補足、文意の変更、勝手な意訳、説明は禁止します。',
      '結果の本文だけを返してください。',
      'ノート全文:', sourceText
    ].join('\n');
    // Match Zen10's retry policy for temporary API errors and suggested model names.
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      try {
        const response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey), {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 4096 }
            })
          }
        );
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          const failure = new Error(error?.error?.message || `Gemini API error (${response.status})`);
          failure.status = response.status;
          throw failure;
        }
        const data = await response.json();
        const converted = (data?.candidates?.[0]?.content?.parts || [])
          .map(part => part.text || '').join('').trim();
        if (!converted) throw new Error('Geminiが変換結果を返しませんでした');
        return converted;
      } catch (error) {
        lastError = error?.name === 'AbortError'
          ? new Error('Geminiの応答がタイムアウトしました') : error;
        const replacement = /use\s+models\/([a-zA-Z0-9._-]+)/i.exec(lastError?.message || '');
        if (replacement?.[1] && replacement[1] !== model && attempt < 2) {
          model = replacement[1];
          continue;
        }
        if ([429, 500, 503].includes(lastError?.status) && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 650 * (attempt + 1)));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('Geminiの変換に失敗しました');
  }

  const CAPTURE_WRITE_TIMEOUT_MS = 20000;
  const CAPTURE_VERIFY_TIMEOUT_MS = 10000;
  const captureOriginalLabel = captureBtn.textContent;
  let captureSaving = false;
  let pendingCapture = null;
  let captureStatusTimer = null;
  let captureLabelTimer = null;

  function captureStatus(message, reset = true) {
    if (!captureHint) return;
    clearTimeout(captureStatusTimer);
    captureHint.textContent = message;
    if (reset) captureStatusTimer = setTimeout(() => {
      captureHint.textContent = captureDefaultHint();
    }, 3500);
  }

  // Aborting a PUT does not prove GitHub rejected it: always verify ambiguous writes.
  async function captureRequest(url, options, timeoutMs) {
    const controller = new AbortController();
    let timeoutId;
    let timedOut = false;
    try {
      return await Promise.race([
        fetch(url, { ...options, signal: controller.signal }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error('通信がタイムアウトしました'));
          }, timeoutMs);
        })
      ]);
    } catch (error) {
      if (timedOut) throw new Error(`通信タイムアウト（${Math.round(timeoutMs / 1000)}秒）`);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function captureUrl(entry) {
    return `https://api.github.com/repos/${OWNER}/${entry.repo}/contents/${encodeApiPath(entry.path)}`;
  }

  function captureHeaders(currentToken) {
    return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${currentToken}` };
  }

  async function captureStoredState(entry, currentToken) {
    const response = await captureRequest(captureUrl(entry), {
      method: 'GET', headers: captureHeaders(currentToken), cache: 'no-store'
    }, CAPTURE_VERIFY_TIMEOUT_MS);
    if (response.status === 404) return 'missing';
    if (!response.ok) throw new Error(`保存確認 ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload.content !== 'string') {
      throw new Error('保存確認の応答に本文がありません');
    }
    return payload.content.replace(/\s/g, '') === encodeUtf8(`${entry.text}\n`)
      ? 'saved' : 'different';
  }

  function captureSaved(entry) {
    // Keep any text edited while the save request was in progress.
    const editedDuringSave = captureComposing || captureText.value.trim() !== (entry.originalText ?? entry.text);
    if (!editedDuringSave) {
      captureText.value = '';
      capturePendingRomaji = null;
    }
    scheduleCaptureAnchor();
    pendingCapture = null;
    try { window.COCKPID_MEMO_ROUTE?.recordMemo(entry.name); }
    catch (error) { console.warn('memo route metadata could not be recorded', error); }
    captureBtn.textContent = '保存済み ✓';
    captureStatus(editedDuringSave
      ? `保存しました · ${entry.name}（入力中の変更は未保存です${entry.aiFallback ? '・AI変換失敗のため原文で保存' : ''}）`
      : `保存しました · ${entry.name}${entry.aiFallback ? '（AI変換失敗のため原文で保存）' : ''}`);
    window.COCKPID_RESIDENT?.complete?.('capture-save');
    clearTimeout(captureLabelTimer);
    captureLabelTimer = setTimeout(() => { captureBtn.textContent = captureOriginalLabel; }, 1600);
  }

  async function saveCaptureDirect() {
    // The shortcut bypasses disabled button state, so guard concurrent calls in code.
    if (captureSaving || captureComposing) return;
    const pending = capturePendingRomaji;
    capturePendingRomaji = null;
    if (pending?.value === captureText.value) {
      const raw = pending.value.slice(pending.start, pending.end);
      const kana = captureToHiragana(raw, true);
      if (kana !== raw) {
        captureText.setRangeText(kana, pending.start, pending.end, 'preserve');
        scheduleCaptureAnchor();
      }
    }
    const originalText = captureText.value.trim();
    if (!originalText) return captureText.focus();
    const currentToken = token();
    if (!currentToken) return captureStatus('GitHub token が必要です');

    const source = sourceFor('inbox', 'mynotebook', '00_inbox');
    const isAiSave = captureRawMode;
    const reusePending = pendingCapture &&
      (pendingCapture.originalText ?? pendingCapture.text) === originalText &&
      pendingCapture.ai === isAiSave &&
      pendingCapture.repo === source.repo && pendingCapture.dir === source.dir;
    const entry = reusePending ? pendingCapture : {
      text: originalText, originalText, ai: isAiSave,
      repo: source.repo, dir: source.dir, name: `${inboxStamp()}.md`
    };
    if (!reusePending) entry.path = joinPath(source.dir, entry.name);
    captureSaving = true;
    let writeAttempted = false;
    clearTimeout(captureLabelTimer);
    captureBtn.disabled = true;
    captureBtn.textContent = reusePending ? '保存結果を確認中…' : (isAiSave ? 'AI変換中…' : '保存中…');
    captureStatus(isAiSave && !reusePending ? 'Geminiで表記を整えています…' :
      `${source.repo}/${source.dir} へ保存しています…`, false);
    window.COCKPID_RESIDENT?.working?.('capture-save');
    try {
      if (isAiSave && !reusePending) {
        // Never save stale AI text if the user typed or switched mode during conversion.
        try {
          entry.text = await finalizeCaptureWithGemini(originalText);
        } catch (conversionError) {
          // Conversion is optional: preserve the original kana note on AI failure.
          console.warn('capture Gemini conversion failed; saving original text', conversionError);
          entry.text = originalText;
          entry.aiFallback = true;
        }
        if (captureComposing || captureText.value.trim() !== originalText || captureRawMode !== isAiSave) {
          captureStatus('AI変換中に入力が変更されたため保存を中止しました。原文は保持しています。', false);
          captureBtn.textContent = captureOriginalLabel;
          return;
        }
        captureBtn.textContent = '保存中…';
      }
      // Only now can the entry be treated as a pending GitHub write.
      pendingCapture = entry;
      if (reusePending) {
        const prior = await captureStoredState(entry, currentToken);
        if (prior === 'saved') {
          captureSaved(entry);
          return;
        }
        if (prior === 'different') {
          pendingCapture = null;
          throw new Error('同名ファイルに異なる内容があります。もう一度保存してください。');
        }
      }
      writeAttempted = true;
      const response = await captureRequest(captureUrl(entry), {
        method: 'PUT',
        headers: { ...captureHeaders(currentToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `cockpid workbench: capture ${entry.name}`,
          content: encodeUtf8(`${entry.text}\n`)
        })
      }, CAPTURE_WRITE_TIMEOUT_MS);
      if (!response.ok) throw new Error(`${source.repo} write ${response.status}`);
      captureSaved(entry);
    } catch (error) {
      console.error('capture save', error);
      if (!writeAttempted && !reusePending && isAiSave) {
        // No GitHub request occurred: keep the original note and do not schedule a retry.
        pendingCapture = null;
        captureBtn.textContent = captureOriginalLabel;
        captureStatus(`AI変換に失敗しました（${error.message}）。未保存・原文を保持しています。`, false);
        window.COCKPID_RESIDENT?.error?.('capture-save');
        return;
      }
      let state = 'unknown';
      if (writeAttempted) {
        try { state = await captureStoredState(entry, currentToken); }
        catch (verificationError) {
          console.warn('capture verification unavailable', verificationError);
        }
        if (state === 'saved') {
          captureSaved(entry);
          return;
        }
      }
      if (state === 'different') pendingCapture = null;
      captureBtn.textContent = state === 'different' ? '別名で再保存' : '再確認して保存';
      captureStatus(state === 'different'
        ? '同名ファイルに別の内容があります。次の保存では新しい名前を使用します。'
        : `保存結果を確認できません（${error.message}）。文章は保持しました。再試行時は同じ保存先を確認します。`, false);
      window.COCKPID_RESIDENT?.error?.('capture-save');
    } finally {
      captureSaving = false;
      captureBtn.disabled = false;
    }
  }

  syncCaptureMode();
  captureModeBtn?.addEventListener('click', toggleCaptureMode);
  captureText.addEventListener('compositionstart', () => { captureComposing = true; });
  captureText.addEventListener('compositionend', (event) => {
    captureComposing = false;
    convertCaptureAtCaret(event.data);
    scheduleCaptureAnchor();
  });
  captureText.addEventListener('input', (event) => {
    if (captureComposing || event.isComposing) return;
    if (event.inputType === 'insertText' || event.inputType === 'insertLineBreak' ||
        event.inputType === 'insertParagraph') {
      convertCaptureAtCaret(event.inputType === 'insertText' ? event.data : '\n');
    } else {
      capturePendingRomaji = null;
    }
    scheduleCaptureAnchor();
  });
  captureText.addEventListener('keyup', scheduleCaptureAnchor);
  captureText.addEventListener('blur', () => { captureComposing = false; });
  captureText.addEventListener('focus', scheduleCaptureAnchor);
  captureText.addEventListener('click', scheduleCaptureAnchor);
  captureText.addEventListener('select', scheduleCaptureAnchor);
  window.addEventListener('resize', scheduleCaptureAnchor);
  window.visualViewport?.addEventListener?.('resize', scheduleCaptureAnchor);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(scheduleCaptureAnchor).observe(captureText);
  }
  captureBtn.addEventListener('click', saveCaptureDirect);
  $w('prevDate')?.addEventListener('click', () => moveCalendar(-1));
  $w('nextDate')?.addEventListener('click', () => moveCalendar(1));
  $w('todayDateBtn')?.addEventListener('click', resetCalendarToday);
  captureText.addEventListener('keydown', (event) => {
    if (event.isComposing || captureComposing || event.keyCode === 229) return;
    if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (event.code === 'Space' || event.key === ' ')) {
      event.preventDefault();
      toggleCaptureMode();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      saveCaptureDirect();
    }
  });
  window.addEventListener('cockpid:sources-changed', () => {
    syncSourceHints();
    loadToday();
  });

  selectedDate = jstDateParts();
  syncSourceHints();
  nowParts();
  setInterval(nowParts, 30000);
  setInterval(() => loadToday({ background: true }), 300000);
  loadToday();
})();
