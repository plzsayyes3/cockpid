(function(root, factory) {
  const model = typeof module === 'object' && module.exports ? require('./scrap-model.js') : root.COCKPID_SCRAP_MODEL;
  const api=factory(model);
  if(typeof module === 'object' && module.exports) module.exports=api;
  else root.COCKPID_SCRAP_STORE=api;
})(typeof window !== 'undefined' ? window : globalThis, M => {
  'use strict';
  const BASE='03_scrap';
  const encode=text=>{
    const bytes=new TextEncoder().encode(text);let s='';
    for(const b of bytes)s+=String.fromCharCode(b);
    return btoa(s);
  };
  const decode=base64=>new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\n/g,'')),c=>c.charCodeAt(0)));
  const validId=id=>/^[a-zA-Z0-9_-]{1,100}$/.test(id);
  function validCard(card) {
    return card && validId(card.id) && typeof card.title==='string' && typeof card.memo==='string' && typeof card.created_at==='string' && typeof card.handled==='boolean' && new RegExp(`^${BASE}/assets/[a-zA-Z0-9_-]+\\.(png|jpg|webp|gif)$`).test(card.image_path) && ['image/png','image/jpeg','image/webp','image/gif'].includes(card.image_type);
  }
  async function mapLimit(items,worker,limit=4) {
    const out=new Array(items.length);let index=0;
    await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
      while(index<items.length){const i=index++;out[i]=await worker(items[i],i);}
    }));return out;
  }
  function createStore({fetch:request=globalThis.fetch,token,inboxSource=()=>({repo:'mynotebook',dir:'00_inbox'}),dailySource=()=>({repo:'mynotebook',dir:'01_Daily'})}) {
    async function api(repo,path,init={}) {
      if(!token())throw Error('作業台の設定でGitHub tokenを設定してください。');
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
      try {
        const url=`https://api.github.com/repos/plzsayyes3/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=main&_=${Date.now()}`;
        const r=await request(url,{...init,signal:controller.signal,cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token()}`,...init.headers}});
        if(r.status===404 && !init.method)return null;
        if(!r.ok){const e=Error(`保存先にアクセスできません (${r.status})。権限と接続を確認してください。`);e.status=r.status;throw e;}
        return init.raw?r.blob():r.json();
      } finally {clearTimeout(timer);}
    }
    async function read(repo,path) {
      const p=await api(repo,path);if(!p)return null;
      if(!p.content)throw Error(`${path} の内容を読み込めませんでした。`);
      return {value:JSON.parse(decode(p.content)),sha:p.sha};
    }
    async function put(repo,path,base64,sha) {
      const body={message:`workbench: save ${path}`,branch:'main',content:base64};if(sha)body.sha=sha;
      return api(repo,path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    }
    async function list() {
      const entries=await api('mynotebook',`${BASE}/cards`)||[];
      if(!Array.isArray(entries))throw Error('カード一覧の形式が不正です。');
      const warnings=[];
      const cards=await mapLimit(entries.filter(e=>/^[a-zA-Z0-9_-]+\.json$/.test(e.name)),async entry=>{
        const path=`${BASE}/cards/${entry.name}`;
        try {const p=await read('mynotebook',path);if(!validCard(p?.value)||entry.name!==`${p.value.id}.json`)throw Error('形式が不正');return {...p.value,path};}
        catch(e){warnings.push(`${entry.name}: ${e.message}`);return null;}
      });
      return {cards:cards.filter(Boolean),warnings};
    }
    async function createCapture(card,base64) {
      if(!validCard(card))throw Error('画像カードの形式が不正です。');
      const path=`${BASE}/cards/${card.id}.json`;
      const existing=await read('mynotebook',path);
      if(existing){if(!validCard(existing.value))throw Error('同じIDのカードが不正です。');return {...existing.value,path};}
      // Stable ID and immutable asset let retries recover from either lost response.
      if(!await api('mynotebook',card.image_path)) await put('mynotebook',card.image_path,base64);
      await put('mynotebook',path,encode(JSON.stringify(card,null,2)+'\n'));
      return {...card,path};
    }
    async function updateCapture(path,patch) {
      if(!/^03_scrap\/cards\/[a-zA-Z0-9_-]+\.json$/.test(path))throw Error('カードの保存先が不正です。');
      const edits=Object.fromEntries(Object.entries(patch).filter(([k])=>['title','memo','handled'].includes(k)));
      for(let attempt=0;attempt<3;attempt++) {
        const latest=await read('mynotebook',path);
        if(!validCard(latest?.value))throw Error('元のカードが見つかりません。再読込してください。');
        const next={...latest.value,...edits,updated_at:new Date().toISOString()};
        if(!validCard(next))throw Error('カードの内容が不正です。');
        try {await put('mynotebook',path,encode(JSON.stringify(next,null,2)+'\n'),latest.sha);return {...next,path};}
        catch(e){if(e.status!==409 || attempt===2)throw e;}
      }
    }
    async function loadIdeas() {
      const p=await read('my-storage-note','views/ideas.json');
      if(!Array.isArray(p?.value?.ideas))throw Error('Idea一覧を読み込めませんでした。');
      return p.value.ideas;
    }
    async function recentContext(now=new Date()) {
      const ds=M.dates(now,14),inbox=inboxSource(),daily=dailySource(),warnings=[];
      const work=ds.map(d=>({repo:daily.repo,path:`${daily.dir}/${d}.md`}));
      try {
        const entries=await api(inbox.repo,inbox.dir)||[];
        const cutoff=ds.at(-1).replace(/-/g,''),today=ds[0].replace(/-/g,'');
        if(!Array.isArray(entries))throw Error('INBOXの形式が不正です');
        entries.filter(e=>/^\d{14}(?:\d{3})?\.md$/.test(e.name) && e.name.slice(0,8)>=cutoff && e.name.slice(0,8)<=today).sort((a,b)=>b.name.localeCompare(a.name)).slice(0,30).forEach(e=>work.push({repo:inbox.repo,path:`${inbox.dir}/${e.name}`}));
      }catch(e){warnings.push(`INBOX: ${e.message}`);}
      const texts=await mapLimit(work,async f=>{
        try {const p=await api(f.repo,f.path);if(!p)return '';if(!p.content)throw Error('内容なし');return decode(p.content).slice(0,20000);}
        catch(e){warnings.push(`${f.path}: ${e.message}`);return '';}
      });
      return {text:texts.join('\n'),warnings};
    }
    async function image(card) {
      if(!validCard(card))throw Error('画像の保存先が不正です。');
      const blob=await api('mynotebook',card.image_path,{headers:{Accept:'application/vnd.github.raw+json'},raw:true});
      if(!blob)throw Error('画像が見つかりません。');
      return new Blob([blob],{type:card.image_type});
    }
    async function saveInbox(text,{name}={}) {
      if(!String(text||'').trim())throw Error('メモを入力してください。');
      const s=inboxSource();
      // Match existing Inbox → Daily filename convention; preserve ID on retry.
      if(!name){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));name=`${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}${String(new Date().getMilliseconds()).padStart(3,'0')}.md`;}
      if(!/^\d{17}\.md$/.test(name))throw Error('メモ名が不正です。');
      const path=`${s.dir}/${name}`,body=String(text).trim()+'\n';
      const old=await api(s.repo,path);
      if(old){if(old.content && decode(old.content)===body)return {name,path};throw Error('同じ時刻の別メモがあります。再読込して確認してください。');}
      await put(s.repo,path,encode(body));return {name,path};
    }
    return Object.freeze({list,createCapture,updateCapture,loadIdeas,recentContext,image,saveInbox});
  }
  return Object.freeze({createStore});
});
