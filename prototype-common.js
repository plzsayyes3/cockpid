const OWNER='plzsayyes3',REPO='my-storage-note',NOTE_OWNER='plzsayyes3',NOTE_REPO='mynotebook',STORAGE_KEY='zen-note-github-token';
const $=id=>document.getElementById(id);
const token=()=>localStorage.getItem(STORAGE_KEY)||'';
function jst(d=new Date()){const s=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);return new Date(`${s.find(x=>x.type==='year').value}-${s.find(x=>x.type==='month').value}-${s.find(x=>x.type==='day').value}T00:00:00+09:00`)}
function fmt(d){return d.toISOString().slice(0,10)}
function label(n){return n===1?'昨日':n===2?'一昨日':`${n}日前`}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function decode(v){const b=atob(v.replace(/\n/g,''));return new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0)))}
async function gh(path,repo=REPO){const r=await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path}?ref=main`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token()}`}});if(r.status===404)return null;if(!r.ok)throw Error(`${repo} ${r.status}`);return r.json()}
async function load(path){const j=await gh(path,REPO);return j?JSON.parse(decode(j.content)):null}
async function days(type,n=14){const base=jst(),out=[];for(let i=1;i<=n;i++){const d=new Date(base);d.setDate(d.getDate()-i);const date=fmt(d);const data=await load(`extracted/${type}/${date}.json`);if(data?.items?.length)out.push({i,date,items:data.items})}return out}
function flattenDays(rows,type){return rows.flatMap(r=>r.items.map((item,index)=>({...item,_type:type,_date:r.date,_distance:r.i,_index:index}))).sort((a,b)=>String(b._date).localeCompare(String(a._date)))}
function randomPick(items,n){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,Math.min(n,a.length))}
async function writeDailyMemo(text,date=fmt(jst())){const path=`01_Daily/${date}.md`;const old=await gh(path,NOTE_REPO);const body=old?decode(old.content):'';const block=`\n\n## COCKPID MEMO / ZEN V2\n\n${text.trim()}\n`;const content=body+block;const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(content)));const url=`https://api.github.com/repos/${NOTE_OWNER}/${NOTE_REPO}/contents/${path}`;const payload={message:`COCKPID memo: ${date}`,content:encoded,branch:'main'};if(old)payload.sha=old.sha;const r=await fetch(url,{method:'PUT',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token()}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw Error(`mynotebook write ${r.status}`);return r.json()}
async function boot(mode){if(!token()){$('status')&&($('status').textContent='TOKEN REQUIRED');$('dialog')?.showModal?.()}$('save')?.addEventListener('click',()=>{localStorage.setItem(STORAGE_KEY,$('tokenInput').value.trim());location.reload()});try{const[t,i,a]=await Promise.all([days('theme'),days('idea'),days('action')]);$('themes')&&($('themes').innerHTML=accord('THEMES',t));$('ideas')&&($('ideas').innerHTML=accord('IDEAS',i));$('actions')&&($('actions').innerHTML=accord('ACTIONS',a));const c=await load('connections/semantic.json');$('connections')&&($('connections').innerHTML='<h2>SERENDIPITY / CONNECTIONS</h2>'+((c?.connections||[]).slice().sort((x,y)=>(y.score||0)-(x.score||0)).slice(0,6).map(x=>`<article class="item"><strong>${Math.round(x.score*100)}% CONNECTION</strong><p>${esc(x.reason)}</p><span class="meta">${esc(x.from)} → ${esc(x.to)}</span></article>`).join('')||'<p class="meta">No connections</p>'));$('status')&&($('status').textContent='LIVE · PREVIOUS DAY / LAST 14 DAYS')}catch(e){$('status')&&($('status').textContent=e.message)}}

(() => {
  'use strict';
  const SOURCE_STORAGE_KEY = 'cockpid.sources.v1';
  const SOURCE_DEFAULTS = Object.freeze({
    daily: Object.freeze({ repo: 'mynotebook', dir: '01_Daily' }),
    techo: Object.freeze({ repo: 'mynotebook', dir: '02_techo' }),
    inbox: Object.freeze({ repo: 'mynotebook', dir: '00_inbox' }),
    memo: Object.freeze({ repo: 'mynotebook', dir: '00_inbox' }),
    projects: Object.freeze({ repo: 'gpts', dir: 'projects' }),
    taskliner: Object.freeze({ repo: 'mynotebook', dir: '09_taskchute' })
  });

  const copy = (value) => JSON.parse(JSON.stringify(value));
  const cleanDir = (value) => String(value ?? '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');

  function validate(entry) {
    const repo = String(entry?.repo ?? '').trim();
    const dir = cleanDir(entry?.dir);
    if (!/^[A-Za-z0-9._-]+$/.test(repo)) return { ok: false, error: 'Repository名が不正です。' };
    if (!dir) return { ok: false, error: 'Folderを指定してください。' };
    if (dir.split('/').some((part) => !part || part === '.' || part === '..')) return { ok: false, error: 'Folderに . または .. は使えません。' };
    if (/[?#]/.test(dir)) return { ok: false, error: 'Folderに ? または # は使えません。' };
    return { ok: true, value: { repo, dir } };
  }

  function readStored() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SOURCE_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function get(name) {
    const fallback = SOURCE_DEFAULTS[name];
    if (!fallback) return null;
    const result = validate({ ...fallback, ...(readStored()[name] || {}) });
    return result.ok ? result.value : { ...fallback };
  }

  function all() {
    return Object.fromEntries(Object.keys(SOURCE_DEFAULTS).map((name) => [name, get(name)]));
  }

  function saveAll(next) {
    const normalized = {};
    for (const name of Object.keys(SOURCE_DEFAULTS)) {
      const result = validate(next?.[name] || SOURCE_DEFAULTS[name]);
      if (!result.ok) throw new Error(`${name}: ${result.error}`);
      normalized[name] = result.value;
    }
    localStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('cockpid:sources-changed', { detail: { sources: copy(normalized) } }));
    return copy(normalized);
  }

  function join(name, child = '') {
    const source = get(name);
    if (!source) return String(child || '').replace(/^\/+/, '');
    const tail = String(child || '').trim().replace(/^\/+/, '');
    return tail ? `${source.dir}/${tail}` : source.dir;
  }

  window.COCKPID_SOURCES = Object.freeze({
    storageKey: SOURCE_STORAGE_KEY,
    get,
    all,
    defaults: () => copy(SOURCE_DEFAULTS),
    validate,
    saveAll,
    join
  });
})();
