const RULES = new Set(['daily', 'weekdays', 'weekly', 'biweekly', 'nth_weekday', 'month_end']);

export function calendarWeekday(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.getUTCDay() : null;
}

export function makeRepeat(values, masterId, newId) {
  if (!masterId) throw new Error('Masterを選択または作成してください。');
  const rule = String(values.rule || 'daily');
  if (!RULES.has(rule)) throw new Error('繰り返しルールが不正です。');
  const result = {
    id: newId,
    master_id: masterId,
    status: 'active',
    rule,
    weekdays: [],
    weekday: '',
    nth: '',
    anchor_date: '',
    section: String(values.section || '').trim(),
    planned_at: String(values.plannedAt || '').trim(),
    estimate: ''
  };
  if (result.planned_at && !/^([01]\d|2[0-3]):[0-5]\d$/.test(result.planned_at)) throw new Error('予定時刻が不正です。');
  if (values.estimate !== '' && values.estimate !== null && values.estimate !== undefined) {
    const estimate = Number(values.estimate);
    if (!Number.isFinite(estimate) || estimate < 0) throw new Error('見積もりは0以上の数値にしてください。');
    result.estimate = Math.round(estimate);
  }
  if (rule === 'weekdays') {
    const parts = String(values.weekdays || '').split(',').map(x => x.trim());
    if (!parts.length || parts.some(x => !/^[0-6]$/.test(x))) throw new Error('曜日は0〜6をカンマ区切りで入力してください。');
    result.weekdays = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  }
  if (['weekly', 'nth_weekday'].includes(rule)) {
    if (!/^[0-6]$/.test(String(values.weekday))) throw new Error('曜日を0〜6で指定してください。');
    result.weekday = Number(values.weekday);
  }
  if (rule === 'nth_weekday') {
    if (!/^[1-5]$/.test(String(values.nth))) throw new Error('第何週は1〜5で指定してください。');
    result.nth = Number(values.nth);
  }
  if (rule === 'biweekly') {
    const day = calendarWeekday(values.anchorDate);
    if (day === null) throw new Error('隔週の基準日を正しい日付で指定してください。');
    result.anchor_date = values.anchorDate;
    result.weekday = day;
  }
  return result;
}

export function findDuplicateRepeat(candidate, repeats, scheduleKey) {
  const key = scheduleKey(candidate);
  return repeats.find(repeat => repeat.id !== candidate.id && (repeat.status || 'active') === 'active' && scheduleKey(repeat) === key) || null;
}

export function setupRepeatCreator({root, $, templates, TL, app, getMasters, setMasters}) {
  const form = $('tlRepeatForm'), title = $('tlRepeatTitle'), rule = $('tlRepeatRule');
  const feedback = $('tlRepeatFeedback'), suggestions = $('tlRepeatSuggestions');
  let availableMasters = [], chosenId = '', saving = false;
  const notify = message => { feedback.textContent = message; };
  const updateFields = () => {
    const current = rule.value;
    $('tlRepeatWeekdaysWrap').hidden = current !== 'weekdays';
    $('tlRepeatWeekdayWrap').hidden = !['weekly', 'nth_weekday'].includes(current);
    $('tlRepeatNthWrap').hidden = current !== 'nth_weekday';
    $('tlRepeatAnchorWrap').hidden = current !== 'biweekly';
  };
  const showSuggestions = () => {
    suggestions.replaceChildren();
    const query = title.value.trim();
    if (!query) return;
    const matches = [...TL.suggestMasters(query, availableMasters, 5)];
    const normalized = TL.norm(query);
    for (const master of availableMasters) {
      if (master.status === 'archived' || matches.some(item => item.id === master.id)) continue;
      if (TL.norm(TL.displayTitle(master.title)).includes(normalized)) matches.push(master);
      if (matches.length >= 5) break;
    }
    for (const master of matches.slice(0, 5)) {
      const button = root.ownerDocument.createElement('button');
      button.type = 'button';
      button.textContent = `${TL.displayTitle(master.title)} · ${master.estimate || 0}m`;
      button.onclick = () => {
        chosenId = master.id;
        title.value = TL.displayTitle(master.title);
        suggestions.replaceChildren();
        notify(`Masterを選択: ${TL.displayTitle(master.title)}`);
      };
      suggestions.append(button);
    }
  };
  title.addEventListener('input', () => { chosenId = ''; showSuggestions(); });
  rule.addEventListener('change', updateFields);
  updateFields();
  $('tlRepeatNew').onclick = async () => {
    form.hidden = !form.hidden;
    if (form.hidden) return;
    $('tlRepeatAnchor').value = app.getDate();
    const weekday = calendarWeekday(app.getDate());
    $('tlRepeatWeekday').value = weekday === null ? '1' : String(weekday);
    if (!title.value) title.value = $('newTitle').value.trim();
    notify('Masterを確認しています…');
    try {
      availableMasters = await templates.loadMasters();
      setMasters(availableMasters);
      showSuggestions();
      notify('既存Masterを選ぶか、新しいタスク名を入力してください。');
    } catch (error) { notify(`Master読込失敗: ${error.message}`); }
    title.focus();
  };
  $('tlRepeatCancel').onclick = () => { form.hidden = true; suggestions.replaceChildren(); };
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    const name = title.value.trim();
    if (!name) { notify('タスク名を入力してください。'); return; }
    saving = true;
    $('tlRepeatSave').disabled = true;
    notify('GitHubへ保存しています…');
    try {
      if (!templates.cfg().token) throw new Error('GitHub Tokenが必要です。TaskLinerの同期設定を確認してください。');
      const [freshMasters, repeats] = await Promise.all([templates.pullMasters(), templates.loadRepeats()]);
      availableMasters = freshMasters;
      let master = freshMasters.find(item => item.id === chosenId && TL.norm(TL.displayTitle(item.title)) === TL.norm(name));
      master ||= TL.findExactMaster(name, freshMasters);
      master ||= freshMasters.find(item => item.status !== 'archived' && TL.norm(TL.displayTitle(item.title)) === TL.norm(name));
      let newMaster = false;
      if (!master) {
        master = {id: TL.id('task'), title: name, aliases: [], status: 'active', estimate: Math.max(0, Math.round(Number($('tlRepeatEstimate').value) || 0))};
        newMaster = true;
      }
      const repeat = makeRepeat({
        rule: rule.value,
        weekdays: $('tlRepeatWeekdays').value,
        weekday: $('tlRepeatWeekday').value,
        nth: $('tlRepeatNth').value,
        anchorDate: $('tlRepeatAnchor').value,
        section: $('tlRepeatSection').value,
        plannedAt: $('tlRepeatTime').value,
        estimate: $('tlRepeatEstimate').value
      }, master.id, TL.id('repeat'));
      const duplicate = findDuplicateRepeat(repeat, repeats, TL.repeatScheduleKey);
      if (duplicate) throw new Error(`同じ条件のRepeatがすでにあります（${duplicate.id}）。`);
      if (newMaster) {
        await templates.saveMaster(master);
        freshMasters.push(master);
      }
      await templates.saveRepeat(repeat);
      setMasters(freshMasters);
      chosenId = master.id;
      suggestions.replaceChildren();
      notify('Repeatを保存しました。表示中の日付に追加するには「Repeatから生成」を押してください。');
    } catch (error) {
      notify(`保存できませんでした: ${error.message}`);
    } finally {
      saving = false;
      $('tlRepeatSave').disabled = false;
    }
  };
}
