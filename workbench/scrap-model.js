(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.COCKPID_SCRAP_MODEL = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';
  function dates(now = new Date(), count = 14) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
    const base = Date.UTC(+p.year,+p.month-1,+p.day);
    return Array.from({length:count},(_,i)=>new Date(base-i*86400000).toISOString().slice(0,10));
  }
  function visibleCaptures(cards, handled = false) {
    return cards.filter(c=>Boolean(c.handled)===handled).slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  }
  const ignored = new Set(['する','した','して','いる','ある','こと','もの','ため','よう','これ','それ','から','ので','です','ます','ない','なる','the','and','with','idea','http','https']);
  function terms(text) {
    const input = String(text||'').normalize('NFKC').toLowerCase();
    const out = [];
    if (typeof Intl.Segmenter === 'function') {
      for (const part of new Intl.Segmenter('ja',{granularity:'word'}).segment(input)) {
        if(part.isWordLike && part.segment.length>=2 && !ignored.has(part.segment)) out.push(part.segment);
      }
    } else {
      out.push(...(input.match(/[a-z0-9]{2,}|[\p{Script=Han}\p{Script=Katakana}]{2,}/gu)||[]));
    }
    return [...new Set(out)];
  }
  function shuffle(items,rng) {
    const a=[...items];
    for(let i=a.length-1;i>0;i--) {const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }
  function selectIdeas(ideas, context, {limit=10,rng=Math.random,pinned=[]}={}) {
    const seen=new Set();
    const active=ideas.filter(i=>i?.id && !seen.has(i.id) && seen.add(i.id) && !['archived','completed','discarded','rejected'].includes(i.status));
    const contextTerms=new Set(terms(context));
    const ranked=active.map(i=>{
      const heading=terms([i.title,...(i.tags||[]),...(i.aliases||[])].join(' '));
      const body=terms(String(i.body_markdown||'').slice(0,6000));
      const matches=heading.filter(t=>contextTerms.has(t));
      const score=matches.length*4+body.filter(t=>contextTerms.has(t)).length;
      return {...i,score,matched:matches.slice(0,3)};
    }).sort((a,b)=>b.score-a.score || String(a.id).localeCompare(String(b.id)));
    const fixed=ranked.filter(i=>pinned.includes(i.id)).map(i=>({...i,reason:'固定'}));
    const fixedIds=new Set(fixed.map(i=>i.id));
    const remaining=ranked.filter(i=>!fixedIds.has(i.id));
    const slots=Math.max(0,limit-fixed.length);
    const relevant=remaining.filter(i=>i.score>0).slice(0,Math.ceil(slots*.7)).map(i=>({...i,reason:'最近の記録と関連'}));
    const used=new Set([...fixed,...relevant].map(i=>i.id));
    const random=shuffle(remaining.filter(i=>!used.has(i.id)),rng).slice(0,Math.max(0,slots-relevant.length)).map(i=>({...i,reason:'ランダム'}));
    return [...fixed,...relevant,...random];
  }
  function captureEdits(original, draft) {
    return Object.fromEntries(['title','memo'].filter(key=>original[key]!==draft[key]).map(key=>[key,draft[key]]));
  }
  function validateFile(file) {
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file?.type)) throw Error('PNG・JPEG・WebP・GIFの画像を選んでください。HEICはJPEGなどに書き出して追加できます。');
    if(!file.size || file.size>15*1024*1024) throw Error('画像は1枚15 MBまでです。');
    return true;
  }
  return Object.freeze({dates,visibleCaptures,selectIdeas,validateFile,captureEdits,terms});
});
