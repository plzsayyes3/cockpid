(() => {
  'use strict';

  const CLIENT_ID_KEY = 'cockpid.google-calendar.client-id.v1';
  const CACHE_KEY = 'cockpid.google-calendar.cache.v1';
  const SESSION_TOKEN_KEY = 'cockpid.google-calendar.access-token.v1';
  const AUTHORIZED_KEY = 'cockpid.google-calendar.authorized.v1';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly';
  const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
  const TECHO_REPO = 'mynotebook';
  const TECHO_DIR = '02_techo';
  const originalGh = typeof window.gh === 'function' ? window.gh : null;
  let tokenClient = null;
  let tokenClientId = '';

  function pad(value) { return String(value).padStart(2, '0'); }

  function jstParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  function shiftMonth(parts, amount) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: 1 };
  }

  function monthKey(parts) { return `${parts.year}-${pad(parts.month)}`; }
  function dateKey(parts) { return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`; }

  function threeMonthWindow() {
    const today = jstParts();
    const first = { year: today.year, month: today.month, day: 1 };
    const after = shiftMonth(first, 3);
    const lastDate = new Date(Date.UTC(after.year, after.month - 1, 0));
    const months = [first, shiftMonth(first, 1), shiftMonth(first, 2)];
    return {
      months,
      from: dateKey(first),
      to: `${lastDate.getUTCFullYear()}-${pad(lastDate.getUTCMonth() + 1)}-${pad(lastDate.getUTCDate())}`,
      timeMin: `${dateKey(first)}T00:00:00+09:00`,
      timeMax: `${dateKey(after)}T00:00:00+09:00`
    };
  }

  function readJson(storage, key) {
    try { return JSON.parse(storage.getItem(key) || 'null'); } catch { return null; }
  }

  function readCache() {
    const value = readJson(localStorage, CACHE_KEY);
    return value?.version === 1 && value.months && typeof value.months === 'object' ? value : null;
  }

  function writeCache(value) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  }

  function getSessionToken() {
    const value = readJson(sessionStorage, SESSION_TOKEN_KEY);
    if (!value?.accessToken || !value?.expiresAt || value.expiresAt < Date.now() + 60000) return null;
    return value.accessToken;
  }

  function saveSessionToken(response) {
    const expiresIn = Number(response.expires_in || 3600);
    sessionStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify({
      accessToken: response.access_token,
      expiresAt: Date.now() + expiresIn * 1000
    }));
  }

  function getClientId(reset = false) {
    if (reset) localStorage.removeItem(CLIENT_ID_KEY);
    let clientId = localStorage.getItem(CLIENT_ID_KEY) || '';
    if (clientId) return clientId;
    clientId = window.prompt(
      'Google Calendar 同期の初回設定です。\n\nGoogle Cloud で「ウェブ アプリケーション」の OAuth Client ID を作成し、Authorized JavaScript origins に https://plzsayyes3.github.io を登録してください。\n\nClient ID を貼り付けてください。'
    )?.trim() || '';
    if (!clientId) throw new Error('Google Client ID が未設定です。');
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    return clientId;
  }

  function ensureGoogleIdentity() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-cockpid-google-identity]');
      if (existing) {
        const started = Date.now();
        const timer = setInterval(() => {
          if (window.google?.accounts?.oauth2) { clearInterval(timer); resolve(); }
          else if (Date.now() - started > 15000) { clearInterval(timer); reject(new Error('Google Identity Services の読み込みに失敗しました。')); }
        }, 100);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.cockpidGoogleIdentity = '1';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google Identity Services の読み込みに失敗しました。'));
      document.head.appendChild(script);
    });
  }

  async function requestAccessToken(resetClientId = false) {
    const cached = getSessionToken();
    if (cached && !resetClientId) return cached;
    const clientId = getClientId(resetClientId);
    await ensureGoogleIdentity();

    return new Promise((resolve, reject) => {
      if (!tokenClient || tokenClientId !== clientId) {
        tokenClientId = clientId;
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: () => {}
        });
      }
      tokenClient.callback = (response) => {
        if (response?.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        if (!response?.access_token) {
          reject(new Error('Google access token を取得できませんでした。'));
          return;
        }
        saveSessionToken(response);
        localStorage.setItem(AUTHORIZED_KEY, '1');
        resolve(response.access_token);
      };
      tokenClient.requestAccessToken({ prompt: localStorage.getItem(AUTHORIZED_KEY) === '1' ? '' : 'consent' });
    });
  }

  async function googleGet(path, accessToken, params = {}) {
    const url = new URL(`${CALENDAR_API}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.error?.message || body?.error_description || '';
      } catch { /* no-op */ }
      throw new Error(`Google Calendar API ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return response.json();
  }

  async function listCalendars(accessToken) {
    const calendars = [];
    let pageToken = '';
    do {
      const data = await googleGet('/users/me/calendarList', accessToken, {
        maxResults: 250,
        minAccessRole: 'reader',
        pageToken
      });
      calendars.push(...(data.items || []).filter((item) => item?.id && !item.hidden && item.accessRole !== 'freeBusyReader'));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return calendars;
  }

  async function listEvents(accessToken, calendarId, timeMin, timeMax) {
    const events = [];
    let pageToken = '';
    do {
      const data = await googleGet(`/calendars/${encodeURIComponent(calendarId)}/events`, accessToken, {
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        showDeleted: false,
        pageToken
      });
      events.push(...(data.items || []).filter((event) => event?.status !== 'cancelled'));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    return events;
  }

  function hash4(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36).padStart(4, '0').slice(-4);
  }

  function calendarSlug(calendarId) {
    const local = (calendarId.split('@')[0] || calendarId)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${local.slice(0, 20) || 'cal'}-${hash4(calendarId)}`;
  }

  async function readSidecar(month) {
    if (!originalGh) return { version: 1, entries: {} };
    try {
      const payload = await originalGh(`${TECHO_DIR}/.my-system-techo/google-${month}.json`, TECHO_REPO);
      if (!payload?.content) return { version: 1, entries: {} };
      return JSON.parse(decode(payload.content));
    } catch (error) {
      console.warn('[COCKPID][Google Calendar] sidecar read failed', month, error);
      return { version: 1, entries: {} };
    }
  }

  function sidecarSlugs(sidecars) {
    const slugs = new Set();
    for (const sidecar of sidecars.values()) {
      for (const key of Object.keys(sidecar?.entries || {})) {
        const slug = key.split(':')[0];
        if (slug) slugs.add(slug);
      }
    }
    return slugs;
  }

  function leadingEmoji(title) {
    try { return /^([\p{Extended_Pictographic}\p{Emoji_Presentation}]\uFE0F?)/u.exec(String(title || ''))?.[1] || ''; }
    catch { return ''; }
  }

  function prefixMap(sidecars) {
    const counts = new Map();
    for (const sidecar of sidecars.values()) {
      for (const [key, entry] of Object.entries(sidecar?.entries || {})) {
        const slug = key.split(':')[0];
        const prefix = leadingEmoji(entry?.title);
        if (!slug || !prefix) continue;
        if (!counts.has(slug)) counts.set(slug, new Map());
        const bucket = counts.get(slug);
        bucket.set(prefix, (bucket.get(prefix) || 0) + 1);
      }
    }
    const result = new Map();
    for (const [slug, bucket] of counts) {
      const [winner] = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
      if (winner) result.set(slug, winner[0]);
    }
    return result;
  }

  function jstDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
  }

  function addDateString(date, amount) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    if (!match) return date;
    const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount));
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }

  function eventEntries(event, calendar, prefixes, from, to) {
    const slug = calendarSlug(calendar.id);
    const prefix = prefixes.get(slug) || '';
    const summary = String(event.summary || '(無題)').replace(/[\r\n\t]+/g, ' ').trim() || '(無題)';
    const title = prefix && !summary.startsWith(prefix) ? `${prefix}${summary}` : summary;
    const id = String(event.id || `${summary}:${event.start?.dateTime || event.start?.date || ''}`);
    const entries = [];

    if (event.start?.date) {
      const start = event.start.date;
      const end = event.end?.date || addDateString(start, 1);
      let cursor = start;
      let guard = 0;
      while (cursor < end && guard < 370) {
        if (cursor >= from && cursor <= to) entries.push({ key: `${slug}:${id}/${cursor}`, slug, date: cursor, time: '', title, allDay: true });
        cursor = addDateString(cursor, 1);
        guard += 1;
      }
      return entries;
    }

    const start = jstDateTime(event.start?.dateTime);
    if (!start || start.date < from || start.date > to) return entries;
    const end = jstDateTime(event.end?.dateTime);
    const time = end ? `${start.time}-${end.time}` : start.time;
    entries.push({ key: `${slug}:${id}`, slug, date: start.date, time, title, allDay: false });
    return entries;
  }

  async function syncThreeMonths({ resetClientId = false } = {}) {
    if (typeof token === 'function' && !token()) throw new Error('先にCOCKPIDのGitHub tokenを設定してください。');
    const accessToken = await requestAccessToken(resetClientId);
    const range = threeMonthWindow();
    const sidecars = new Map();
    for (const month of range.months.map(monthKey)) sidecars.set(month, await readSidecar(month));

    const existingSlugs = sidecarSlugs(sidecars);
    const prefixes = prefixMap(sidecars);
    const allCalendars = await listCalendars(accessToken);
    const calendars = existingSlugs.size
      ? allCalendars.filter((calendar) => existingSlugs.has(calendarSlug(calendar.id)))
      : allCalendars;

    const months = Object.fromEntries(range.months.map((parts) => [monthKey(parts), []]));
    const failedCalendars = [];
    const successfulSlugs = [];
    const failedSlugs = [];
    let eventCount = 0;

    for (const calendar of calendars) {
      try {
        const events = await listEvents(accessToken, calendar.id, range.timeMin, range.timeMax);
        successfulSlugs.push(calendarSlug(calendar.id));
        for (const event of events) {
          for (const entry of eventEntries(event, calendar, prefixes, range.from, range.to)) {
            const key = entry.date.slice(0, 7);
            if (!months[key]) continue;
            months[key].push(entry);
            eventCount += 1;
          }
        }
      } catch (error) {
        failedCalendars.push(calendar.summaryOverride || calendar.summary || calendar.id);
        failedSlugs.push(calendarSlug(calendar.id));
        console.error('[COCKPID][Google Calendar] calendar fetch failed', calendar.id, error);
      }
    }

    Object.values(months).forEach((entries) => entries.sort((a, b) => {
      const timeA = a.time || '';
      const timeB = b.time || '';
      return a.date.localeCompare(b.date) || timeA.localeCompare(timeB) || a.title.localeCompare(b.title, 'ja');
    }));

    const cache = {
      version: 1,
      syncedAt: new Date().toISOString(),
      range: { from: range.from, to: range.to },
      calendarCount: calendars.length,
      failedCalendars,
      successfulSlugs,
      failedSlugs,
      months
    };
    writeCache(cache);
    return { from: range.from, to: range.to, eventCount, calendarCount: calendars.length, failedCalendars };
  }

  function normalizeTime(value) {
    return String(value || '').replace(/[–—〜~]/g, '-').replace(/\s+/g, '');
  }

  function signature(date, time, title) {
    return `${date}|${normalizeTime(time)}|${String(title || '').trim()}`;
  }

  function parseListLine(rawLine, date) {
    const list = /^\s*-\s+(.*)$/.exec(rawLine);
    if (!list?.[1]) return null;
    const text = list[1].trim();
    if (/^\[[ xX/]\]\s*/.test(text)) return null;
    const timed = /^(\d{1,2}:\d{2})(?:\s*(?:-|–|—|〜|~)\s*(\d{1,2}:\d{2}))?\s+(.*)$/.exec(text);
    if (!timed) return signature(date, '', text);
    return signature(date, timed[2] ? `${timed[1]}-${timed[2]}` : timed[1], timed[3]);
  }

  function lineForEntry(entry) {
    return `- ${entry.time ? `${entry.time} ` : ''}${entry.title}`;
  }

  function overlayMarkdown(markdown, year, month, liveEntries, sidecar, successfulSlugList = []) {
    if (!liveEntries?.length && !sidecar?.entries) return markdown;
    const monthText = pad(month);
    const liveByDate = new Map();
    for (const entry of liveEntries || []) {
      if (!liveByDate.has(entry.date)) liveByDate.set(entry.date, []);
      liveByDate.get(entry.date).push(entry);
    }

    const successfulSlugs = new Set(successfulSlugList);
    const remove = new Set();
    for (const [key, entry] of Object.entries(sidecar?.entries || {})) {
      const slug = key.split(':')[0];
      if (successfulSlugs.has(slug) && entry?.date?.startsWith(`${year}-${monthText}-`)) {
        remove.add(signature(entry.date, entry.time || '', entry.title || ''));
      }
    }
    for (const entry of liveEntries || []) remove.add(signature(entry.date, entry.time || '', entry.title || ''));

    const lines = markdown.split(/\r?\n/);
    const out = [];
    const inserted = new Set();
    let currentDate = '';

    for (const rawLine of lines) {
      const day = /^##\s+(\d{1,2})月(\d{1,2})日(?:\([^)]*\))?\s*$/.exec(rawLine.trimEnd());
      if (day) {
        const headingMonth = Number(day[1]);
        currentDate = headingMonth === month ? `${year}-${monthText}-${pad(Number(day[2]))}` : '';
        out.push(rawLine);
        if (currentDate && liveByDate.has(currentDate)) {
          for (const entry of liveByDate.get(currentDate)) out.push(lineForEntry(entry));
          inserted.add(currentDate);
        }
        continue;
      }
      if (/^#{1,6}\s+/.test(rawLine)) {
        currentDate = '';
        out.push(rawLine);
        continue;
      }

      if (currentDate) {
        const itemSignature = parseListLine(rawLine, currentDate);
        if (itemSignature && remove.has(itemSignature)) continue;
      }
      out.push(rawLine);
    }

    for (const [date, entries] of liveByDate) {
      if (inserted.has(date)) continue;
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (!match) continue;
      out.push('', `## ${Number(match[2])}月${Number(match[3])}日`);
      for (const entry of entries) out.push(lineForEntry(entry));
    }
    return out.join('\n');
  }

  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
    }
    return btoa(binary);
  }

  async function overlayTechoPayload(payload, path, repo) {
    const match = new RegExp(`^${TECHO_DIR}/(\\d{4})-(\\d{2})\\.md$`).exec(path || '');
    if (!match || repo !== TECHO_REPO || !payload?.content) return payload;
    const month = `${match[1]}-${match[2]}`;
    const cache = readCache();
    const liveEntries = cache?.months?.[month];
    if (!Array.isArray(liveEntries)) return payload;

    const sidecar = await readSidecar(month);
    const markdown = decode(payload.content);
    const overlaid = overlayMarkdown(markdown, Number(match[1]), Number(match[2]), liveEntries, sidecar, cache.successfulSlugs || []);
    if (overlaid === markdown) return payload;
    return { ...payload, content: encodeBase64(overlaid) };
  }

  if (originalGh) {
    window.gh = async function cockpidGoogleAwareGh(path, repo, ...rest) {
      const payload = await originalGh(path, repo, ...rest);
      return overlayTechoPayload(payload, path, repo || 'my-storage-note');
    };
  }

  function bindSyncButton() {
    const button = document.getElementById('googleSyncBtn');
    if (!button) return;
    const status = document.getElementById('sourceStatus');
    const initialLabel = button.textContent;
    button.title = 'Google Calendarの当月＋翌2か月を同期。Shift+クリックでClient IDを再設定';
    button.addEventListener('click', async (event) => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = 'SYNCING…';
      if (status) status.textContent = 'GOOGLE SYNCING';
      try {
        const result = await syncThreeMonths({ resetClientId: event.shiftKey });
        button.textContent = 'SYNCED';
        if (status) {
          status.textContent = result.failedCalendars.length
            ? `GOOGLE PARTIAL · ${result.eventCount}`
            : `GOOGLE LIVE · ${result.eventCount}`;
        }
        window.setTimeout(() => location.reload(), 350);
      } catch (error) {
        console.error('[COCKPID][Google Calendar] sync failed', error);
        button.disabled = false;
        button.textContent = initialLabel;
        if (status) status.textContent = 'GOOGLE ERROR';
        window.alert(`${error?.message || error}\n\nGoogle Web OAuth Client IDを変更する場合は、SYNCボタンをShift+クリックしてください。`);
      }
    });
  }

  window.CockpidGoogleCalendar = {
    syncThreeMonths,
    readCache,
    calendarSlug,
    clearCache() { localStorage.removeItem(CACHE_KEY); },
    resetClientId() { localStorage.removeItem(CLIENT_ID_KEY); }
  };

  bindSyncButton();
})();
