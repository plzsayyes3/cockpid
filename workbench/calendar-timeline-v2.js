(() => {
  'use strict';

  const PALETTE = ['#7e8fd7','#d47b55','#77a687','#b083c4','#c7a958','#78a7c7','#ce7070'];
  const DAY_MS = 86400000;
  let activeAbort = null;
  let savedScale = 62;

  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const logLerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);

  function toDate(parts) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  }
  function fromDate(date) {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  }
  function addDays(parts, amount) {
    const date = toDate(parts);
    date.setUTCDate(date.getUTCDate() + amount);
    return fromDate(date);
  }
  function dateKey(parts) {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }
  function monthKey(parts) {
    return `${parts.year}-${pad(parts.month)}`;
  }
  function colorFor(item) {
    const seed = `${item.title || ''}|${item.start ?? ''}|${item.end ?? ''}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(hash) % PALETTE.length];
  }
  function minutesLabel(value) {
    if (!Number.isFinite(value)) return '';
    return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
  }

  const STOPS = [
    { z: 0.00, days: 365 },
    { z: 0.17, days: 30 },
    { z: 0.39, days: 14 },
    { z: 0.57, days: 7 },
    { z: 0.76, days: 4 },
    { z: 0.84, days: 2.6 }
  ];

  function visibleDaysFor(z) {
    const zz = Math.min(z, .84);
    for (let i = 0; i < STOPS.length - 1; i += 1) {
      const a = STOPS[i], b = STOPS[i + 1];
      if (zz >= a.z && zz <= b.z) return logLerp(a.days, b.days, (zz - a.z) / (b.z - a.z));
    }
    return zz <= 0 ? 365 : 2.6;
  }
  function sizeMorphFor(z) {
    return smooth(.82, .975, z);
  }
  function modeFor(z) {
    if (z >= .93) return 'DAY';
    if (z >= .76) return 'DAYS';
    if (z >= .57) return 'WEEK';
    if (z >= .39) return 'WEEKS';
    if (z >= .17) return 'MONTH';
    return 'YEAR';
  }
  function rangeFor(z) {
    const mode = modeFor(z);
    if (mode === 'DAY') return '1 DAY';
    if (mode === 'WEEK') return '7 DAYS';
    if (mode === 'YEAR') return '1 YEAR';
    return `${Math.round(visibleDaysFor(z))} DAYS`;
  }

  async function buildDays(anchor, loadMonth, signal) {
    // Enough data for a full YEAR view plus a small scroll buffer.
    const start = addDays(anchor, -205);
    const end = addDays(anchor, 205);
    const monthKeys = [];
    let cursor = { year: start.year, month: start.month, day: 1 };
    const endMonth = monthKey(end);
    while (true) {
      monthKeys.push(monthKey(cursor));
      if (monthKey(cursor) === endMonth) break;
      const next = new Date(Date.UTC(cursor.year, cursor.month, 1));
      cursor = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: 1 };
    }

    const monthData = new Map();
    const anchorMonth = monthKey(anchor);
    await Promise.all(monthKeys.map(async (key) => {
      if (signal.aborted) return;
      const [year, month] = key.split('-').map(Number);
      try {
        const data = await loadMonth({ year, month, day: 1 });
        monthData.set(key, data);
      } catch (error) {
        // Sparse Techo history/future months are valid for the timeline.
        // Only the anchor month is essential; missing surrounding months become empty.
        if (key === anchorMonth) throw error;
        console.info('Timeline 2 month unavailable', key);
        monthData.set(key, null);
      }
    }));
    if (signal.aborted) return [];

    const days = [];
    for (let parts = start; ; parts = addDays(parts, 1)) {
      const data = monthData.get(monthKey(parts));
      const rawItems = data?.days?.get(parts.day) || [];
      const seen = new Set();
      const items = rawItems.filter((item) => {
        const key = [item.start ?? '', item.end ?? '', item.title || '', item.checked ? 1 : 0, item.task ? 1 : 0].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((item) => ({ ...item, color: colorFor(item) }));
      days.push({ parts, key: dateKey(parts), items });
      if (dateKey(parts) === dateKey(end)) break;
    }
    return days;
  }

  async function render({ container, anchor, loadMonth, onScale, isCurrent }) {
    activeAbort?.abort();
    const abort = new AbortController();
    activeAbort = abort;

    container.innerHTML = '<div class="timeline2-loading">READING TIMELINE…</div>';

    let days;
    try {
      days = await buildDays(anchor, loadMonth, abort.signal);
    } catch (error) {
      if (abort.signal.aborted) return;
      console.error('Timeline 2 data load failed', error);
      container.innerHTML = '<div class="timeline2-error">TIMELINEを読み込めませんでした。</div>';
      throw error;
    }
    if (abort.signal.aborted || !isCurrent()) return;

    container.innerHTML = `
      <div class="timeline2-root">
        <div class="timeline2-viewport">
          <div class="timeline2-surface"><svg class="timeline2-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>
        </div>
        <div class="timeline2-center"></div>
        <div class="timeline2-scale">SCALE ${savedScale}</div>
      </div>`;

    const root = container.querySelector('.timeline2-root');
    const viewport = container.querySelector('.timeline2-viewport');
    const surface = container.querySelector('.timeline2-surface');
    const svg = container.querySelector('.timeline2-svg');
    const centerLine = container.querySelector('.timeline2-center');
    const scaleNode = container.querySelector('.timeline2-scale');
    const signal = abort.signal;

    let zoom = clamp(savedScale / 100, 0, 1);
    let targetZoom = zoom;
    let visualZoom = zoom;
    let pinch = null;
    let raf = 0;
    const PINCH_GAIN = .19;

    function timelineRowHeight(z) {
      return viewport.clientHeight / visibleDaysFor(z);
    }
    function dayBlockHeight(z) {
      const hour = lerp(30, 46, smooth(.90, 1, z));
      return 40 + 24 * hour;
    }
    function unitHeightFor(z) {
      return lerp(timelineRowHeight(z), dayBlockHeight(z), sizeMorphFor(z));
    }
    // Current tuned behavior from the accepted prototype:
    // by 3 DAYS the time axis has already completed its turn.
    function axisMorphFor(z) {
      const visibleDays = visibleDaysFor(z);
      return 1 - smooth(3.60, 4.20, visibleDays);
    }
    function setSurfaceHeight(z) {
      surface.style.height = `${days.length * unitHeightFor(z) + viewport.clientHeight * .35}px`;
    }
    function setCenter(y, visible) {
      centerLine.style.top = `${Math.max(0, y)}px`;
      centerLine.classList.toggle('is-visible', !!visible);
    }
    function distance(a, b) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function centerY(a, b) {
      const rect = viewport.getBoundingClientRect();
      return ((a.clientY + b.clientY) / 2) - rect.top;
    }
    function rectLerp(a, b, t) {
      return { x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t), w:lerp(a.w,b.w,t), h:lerp(a.h,b.h,t), r:lerp(a.r||0,b.r||0,t) };
    }
    function pointLerp(a, b, t) {
      return { x:lerp(a.x,b.x,t), y:lerp(a.y,b.y,t) };
    }

    function updateScale(z) {
      savedScale = Math.round(z * 100);
      scaleNode.textContent = `SCALE ${savedScale}`;
      onScale?.({ scale: savedScale, mode: modeFor(z), range: rangeFor(z) });
    }

    function draw(z) {
      if (signal.aborted) return;
      const w = viewport.clientWidth;
      const hv = viewport.clientHeight;
      const u = unitHeightFor(z);
      const scroll = viewport.scrollTop;
      const p = axisMorphFor(z);
      const sizeP = sizeMorphFor(z);
      const first = clamp(Math.floor(scroll / u) - 2, 0, days.length - 1);
      const last = clamp(Math.ceil((scroll + hv) / u) + 2, 0, days.length - 1);

      svg.style.height = `${hv}px`;
      svg.setAttribute('viewBox', `0 0 ${w} ${hv}`);
      svg.setAttribute('width', w);
      svg.setAttribute('height', hv);

      const railW = 27, dateW = 40, allDayW = 40;
      const timeLeft = railW + dateW + allDayW;
      const right = 7;
      const timeW = Math.max(90, w - timeLeft - right);
      const dayLeft = railW + dateW + 8;
      const dayMainW = w - dayLeft - 8;
      const dayHeader = 40;
      const out = [`<rect width="${w}" height="${hv}" fill="#171819"/>`];

      for (let i = first; i <= last; i += 1) {
        const day = days[i];
        const d = toDate(day.parts);
        const dow = d.getUTCDay();
        const base = i * u - scroll;
        if (base > hv || base + u < 0) continue;

        const timed = day.items.filter((item) => Number.isFinite(item.start)).sort((a,b) => a.start - b.start || a.end - b.end);
        const anytime = day.items.filter((item) => !Number.isFinite(item.start));
        const monthStart = day.parts.day === 1;
        const rowAlpha = lerp(.11, .18, p) + .04 * sizeP;

        out.push(`<line x1="${railW}" y1="${base}" x2="${w}" y2="${base}" stroke="rgba(255,255,255,${monthStart ? .24 : rowAlpha})" stroke-width="1"/>`);

        const dateFrom = { x:railW+7, y:base + Math.min(u*.55,16) };
        const dateTo = { x:railW+7, y:base+17 };
        const dp = pointLerp(dateFrom, dateTo, p);
        const dateColor = day.key === dateKey(anchor) ? '#b8665d' : (dow === 0 ? '#c8736c' : dow === 6 ? '#759ac5' : '#e4e4df');
        const dateAlpha = clamp(lerp(smooth(.08,.25,z),1,p),0,1);
        out.push(`<text x="${dp.x}" y="${dp.y}" fill="${dateColor}" opacity="${dateAlpha}" font-size="${lerp(lerp(8,15,smooth(.18,.62,z)),17,p)}" font-family="-apple-system,sans-serif">${day.parts.day}</text>`);

        const weekdays = ['日','月','火','水','木','金','土'];
        out.push(`<text x="${railW+30}" y="${lerp(base+15,base+16,p)}" fill="#91928f" opacity="${smooth(.55,.90,z)}" font-size="7" font-family="-apple-system,sans-serif">(${weekdays[dow]})</text>`);

        for (let hour = 0; hour <= 24; hour += 3) {
          const xN = timeLeft + timeW * (hour / 24);
          const n1 = { x:xN, y:base }, n2 = { x:xN, y:base+u };
          const yD = base + dayHeader + (u-dayHeader) * (hour/24);
          const d1 = { x:dateW, y:yD }, d2 = { x:w, y:yD };
          const l1 = pointLerp(n1,d1,p), l2 = pointLerp(n2,d2,p);
          out.push(`<line x1="${l1.x}" y1="${l1.y}" x2="${l2.x}" y2="${l2.y}" stroke="rgba(255,255,255,.11)" stroke-width="1"/>`);
          if (hour < 24) {
            const tlFrom = { x:xN+2, y:base+9 };
            const tlTo = { x:dayLeft-7, y:yD+8 };
            const tp = pointLerp(tlFrom,tlTo,p);
            out.push(`<text x="${tp.x}" y="${tp.y}" fill="#9d9e9b" opacity="${lerp(smooth(.32,.58,z),1,p)}" font-size="7" text-anchor="${p>.55?'end':'start'}" font-family="ui-monospace,monospace">${pad(hour)}:00</text>`);
          }
        }

        if (monthStart || p > .72) {
          const ma = monthStart ? lerp(.72,.35,p) : smooth(.72,.96,p)*.28;
          const my = base + Math.min(u*.5,34);
          out.push(`<text x="${railW*.42}" y="${my}" fill="#8e8f8d" opacity="${ma}" font-size="${lerp(9,7,p)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${railW*.42} ${my})" font-family="ui-monospace,monospace">${day.parts.year}.${pad(day.parts.month)}</text>`);
        }

        anytime.slice(0,2).forEach((item,j) => {
          const from = { x:railW+dateW+3, y:base+u*.18+j*7, w:allDayW-6, h:6, r:2 };
          const to = { x:dayLeft+34+j*(dayMainW*.31), y:base+5, w:dayMainW*.27, h:13, r:2 };
          const rr = rectLerp(from,to,p);
          const opacity = item.checked ? .35 : .92;
          out.push(`<rect x="${rr.x}" y="${rr.y}" width="${rr.w}" height="${rr.h}" rx="${rr.r}" fill="${item.color}" opacity="${opacity}"/>`);
          if (rr.h > 9) out.push(`<text x="${rr.x+3}" y="${rr.y+rr.h-3}" fill="#efefeb" opacity="${smooth(.68,.90,z)}" font-size="7" font-family="-apple-system,sans-serif">${esc(item.title)}</text>`);
        });

        const eventH = Math.max(1.4, Math.min(12,u*.18));
        const gap = Math.max(.6, Math.min(1.2,eventH*.12));
        const contentH = Math.max(1,timed.length)*eventH + Math.max(0,timed.length-1)*gap;
        const cols = Math.min(3, Math.max(1,timed.length));
        const dayColW = (dayMainW-6)/cols;

        timed.forEach((item,j) => {
          const xN = timeLeft + timeW * (item.start/1440);
          const wN = Math.max(2, timeW * ((item.end-item.start)/1440));
          const yN = base + Math.max(1,(u-contentH)/2) + j*(eventH+gap);
          const nonDay = { x:xN, y:yN, w:wN, h:eventH, r:Math.min(2,eventH/2) };

          const sy = base + dayHeader + (item.start/1440)*(u-dayHeader);
          const ey = base + dayHeader + (item.end/1440)*(u-dayHeader);
          const col = j%cols;
          const dayRect = { x:dayLeft+col*dayColW, y:sy, w:dayColW-4, h:Math.max(9,ey-sy), r:2 };
          const rr = rectLerp(nonDay,dayRect,p);
          const opacity = (item.checked ? .35 : 1) * lerp(.94,.32,p);
          out.push(`<rect x="${rr.x}" y="${rr.y}" width="${rr.w}" height="${rr.h}" rx="${rr.r}" fill="${item.color}" opacity="${opacity}"/>`);
          if (p > .18) out.push(`<rect x="${rr.x}" y="${rr.y}" width="${lerp(0,3,p)}" height="${rr.h}" rx="1.5" fill="${item.color}" opacity="${p}"/>`);

          const labelFrom = { x:nonDay.x+3, y:nonDay.y+Math.min(nonDay.h-1,8) };
          const labelTo = { x:dayRect.x+7, y:dayRect.y+11 };
          const lp = pointLerp(labelFrom,labelTo,p);
          if (rr.w > 25 && rr.h > 4) out.push(`<text x="${lp.x}" y="${lp.y}" fill="#efefeb" opacity="${clamp(lerp(smooth(.34,.58,z),1,p),0,1)}" font-size="${lerp(6.4,8,p)}" font-family="-apple-system,sans-serif">${esc(item.title)}</text>`);
        });
      }

      svg.innerHTML = out.join('');
      updateScale(z);
    }

    function scheduleDraw() {
      if (raf || signal.aborted) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        draw(visualZoom);
      });
    }
    function startPinch(event) {
      const ay = centerY(event.touches[0], event.touches[1]);
      const u = unitHeightFor(zoom);
      pinch = {
        startDist: distance(event.touches[0], event.touches[1]),
        startZoom: zoom,
        anchorY: ay,
        anchorIndex: (viewport.scrollTop + ay) / u
      };
      targetZoom = zoom;
      visualZoom = zoom;
      setCenter(ay,true);
    }
    function updatePinch(event) {
      const ay = centerY(event.touches[0], event.touches[1]);
      const ratio = distance(event.touches[0], event.touches[1]) / pinch.startDist;
      targetZoom = clamp(pinch.startZoom + Math.log(ratio)*PINCH_GAIN,0,1);
      visualZoom = targetZoom;
      const u = unitHeightFor(visualZoom);
      setSurfaceHeight(visualZoom);
      viewport.scrollTop = clamp(pinch.anchorIndex*u-ay,0,Math.max(0,surface.offsetHeight-viewport.clientHeight));
      pinch.anchorY = ay;
      setCenter(ay,true);
      scheduleDraw();
    }
    function finishPinch() {
      if (!pinch) return;
      zoom = targetZoom;
      visualZoom = zoom;
      setSurfaceHeight(zoom);
      viewport.scrollTop = clamp(pinch.anchorIndex*unitHeightFor(zoom)-pinch.anchorY,0,Math.max(0,surface.offsetHeight-viewport.clientHeight));
      pinch = null;
      setCenter(0,false);
      draw(zoom);
    }

    viewport.addEventListener('touchstart', (event) => {
      if (event.touches.length === 2) startPinch(event);
    }, { passive:true, signal });
    viewport.addEventListener('touchmove', (event) => {
      if (event.touches.length === 2 && pinch) {
        event.preventDefault();
        updatePinch(event);
      }
    }, { passive:false, signal });
    viewport.addEventListener('touchend', (event) => {
      if (pinch && event.touches.length < 2) finishPinch();
    }, { passive:true, signal });
    viewport.addEventListener('touchcancel', () => {
      pinch = null;
      targetZoom = zoom;
      visualZoom = zoom;
      setCenter(0,false);
      draw(zoom);
    }, { passive:true, signal });
    viewport.addEventListener('scroll', () => {
      if (!pinch) scheduleDraw();
    }, { passive:true, signal });
    window.addEventListener('resize', () => {
      if (signal.aborted) return;
      setSurfaceHeight(zoom);
      draw(zoom);
    }, { signal });

    setSurfaceHeight(zoom);
    requestAnimationFrame(() => {
      if (signal.aborted) return;
      const anchorIndex = days.findIndex((day) => day.key === dateKey(anchor));
      viewport.scrollTop = Math.max(0, anchorIndex*unitHeightFor(zoom)-viewport.clientHeight*.30);
      draw(zoom);
    });
  }

  function destroy() {
    activeAbort?.abort();
    activeAbort = null;
  }

  window.COCKPID_TIMELINE_V2 = Object.freeze({ render, destroy });
})();
