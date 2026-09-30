const STORAGE_PREFIX = 'taskliner_taskchute_line_v1:';
const marquee = document.getElementById('radyTaskMarquee');
const textNode = document.getElementById('radyTaskMarqueeText');

if (marquee && textNode) {
  let minuteTimer = 0;
  let minuteAlignTimer = 0;

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function storedTasksFor(date) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + dateKey(date));
      if (!raw) return [];
      const stored = JSON.parse(raw);
      const tasks = Array.isArray(stored) ? stored : stored && Array.isArray(stored.tasks) ? stored.tasks : [];
      return tasks.filter(Boolean);
    } catch {
      return [];
    }
  }

  function runningTask() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const candidates = [...storedTasksFor(today), ...storedTasksFor(yesterday)];
    return candidates.find((task) => task.start && !task.end && !task.completed && !task.deferred) || null;
  }

  function cleanTitle(value) {
    return String(value || '')
      .replace(/\s*<!--\s*tl:[^>]*-->\s*$/i, '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim();
  }

  function expectedEnd(start, estimate) {
    const match = String(start || '').match(/^(\d{1,2}):(\d{2})$/);
    const mins = Number(estimate);
    if (!match || !Number.isFinite(mins) || mins <= 0) return '';
    const total = (Number(match[1]) * 60 + Number(match[2]) + mins) % 1440;
    return `${Math.floor(total / 60)}時${pad(total % 60)}分`;
  }

  function message() {
    const task = runningTask();
    if (!task) return 'ただいま、実行中のタスクはありません。';
    const title = cleanTitle(task.title) || '名称未設定のタスク';
    const end = expectedEnd(task.start, task.estimate);
    return end
      ? `ただいま、${title}実行中。終了予定時刻は${end}です`
      : `ただいま、${title}実行中。終了予定時刻は未設定です`;
  }

  function update() {
    const next = message();
    if (textNode.textContent === next) return;
    textNode.textContent = next;
    marquee.setAttribute('aria-label', next);
  }

  function scheduleMinuteUpdates() {
    window.clearTimeout(minuteAlignTimer);
    window.clearInterval(minuteTimer);
    const delay = 60000 - (Date.now() % 60000) + 30;
    minuteAlignTimer = window.setTimeout(() => {
      update();
      minuteTimer = window.setInterval(update, 60000);
    }, delay);
  }

  window.addEventListener('storage', (event) => {
    if (!event.key || event.key.startsWith(STORAGE_PREFIX)) update();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) update();
  });

  update();
  scheduleMinuteUpdates();
}
