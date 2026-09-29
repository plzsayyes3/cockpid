const stage = document.getElementById('stanStage');
const clockTime = document.getElementById('radyClockTime');
const clockDate = document.getElementById('radyClockDate');

const MINUTE = 60 * 1000;
let timer = null;

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start + (start.getTimezoneOffset() - date.getTimezoneOffset()) * MINUTE;
  return Math.floor(diff / 86400000);
}

// Lightweight seasonal daylight model for Japan-like mid-latitudes.
// It is date-aware rather than a fixed 06:00/18:00 switch:
// summer -> earlier sunrise / later sunset, winter -> the reverse.
function daylightMinutes(date) {
  const day = dayOfYear(date);
  const seasonal = Math.cos((2 * Math.PI * (day - 172)) / 365.2422);
  return {
    sunrise: 360 - 75 * seasonal, // roughly 04:45 summer / 07:15 winter
    sunset: 1080 + 75 * seasonal // roughly 19:15 summer / 16:45 winter
  };
}

function phaseFor(date) {
  const nowMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const { sunrise, sunset } = daylightMinutes(date);
  const glow = 45;

  if (nowMinutes >= sunrise - glow && nowMinutes < sunrise + glow) return 'dawn';
  if (nowMinutes >= sunrise + glow && nowMinutes < sunset - glow) return 'day';
  if (nowMinutes >= sunset - glow && nowMinutes < sunset + glow) return 'sunset';
  return 'night';
}

function celestialPosition(date, phase) {
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const { sunrise, sunset } = daylightMinutes(date);

  if (phase === 'night') {
    const nightStart = sunset + 45;
    const nextSunrise = sunrise - 45 + 1440;
    let value = minutes;
    if (value < sunrise) value += 1440;
    const progress = Math.max(0, Math.min(1, (value - nightStart) / (nextSunrise - nightStart)));
    const x = 12 + progress * 76;
    const arc = Math.sin(progress * Math.PI);
    return { x, y: 35 - arc * 18 };
  }

  const progress = Math.max(0, Math.min(1, (minutes - (sunrise - 45)) / ((sunset + 45) - (sunrise - 45))));
  const x = 10 + progress * 80;
  const arc = Math.sin(progress * Math.PI);
  return { x, y: 54 - arc * 38 };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function updateWorld() {
  const now = new Date();
  const phase = phaseFor(now);
  const position = celestialPosition(now, phase);

  stage.dataset.radyTime = phase;
  stage.style.setProperty('--sun-x', position.x.toFixed(2) + '%');
  stage.style.setProperty('--sun-y', position.y.toFixed(2) + '%');

  clockTime.textContent = pad(now.getHours()) + ':' + pad(now.getMinutes());
  clockDate.textContent =
    now.getFullYear() + '.' + pad(now.getMonth() + 1) + '.' + pad(now.getDate());

  const nextTick = 30000 - (Date.now() % 30000);
  clearTimeout(timer);
  timer = window.setTimeout(updateWorld, nextTick);
}

updateWorld();

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateWorld();
});

window.addEventListener('pagehide', () => clearTimeout(timer));
