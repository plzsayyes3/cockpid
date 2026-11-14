(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TaskLinerSync=api;})(globalThis,function(){
  'use strict';
  const CONFIG='taskliner_github_sync_config_v1',TOKEN='taskliner_github_sync_token_v1',DIRTY='taskliner_github_dirty_dates_v1',SHA='taskliner_github_known_sha_v1';
  function createSync({storage,fetch,onState=()=>{}}){
    const json=(key,fallback)=>{try{return JSON.parse(storage.getItem(key)||'null')||fallback}catch{return fallback}};
    const dirty=new Set(json(DIRTY,[])),known=json(SHA,{}),versions=new Map(),listeners=new Set();let queue=Promise.resolve();
    function config(){const c=json(CONFIG,{});return{...c,repo:c.repo||'plzsayyes3/mynotebook',branch:!c.branch||c.branch==='task-data'?'main':c.branch,folder:c.folder??'09_taskchute',token:storage.getItem(TOKEN)||''}}
    function setConfig(patch){const {token,...rest}=patch;storage.setItem(CONFIG,JSON.stringify({...json(CONFIG,{}),...rest}));if(token!==undefined)storage.setItem(TOKEN,token);}
    function emit(date,state,error){onState(date,state,error);for(const listener of listeners)listener(date,state,error)}
    function persist(){storage.setItem(DIRTY,JSON.stringify([...dirty]));storage.setItem(SHA,JSON.stringify(known))}
    function target(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('日付が不正です');const c=config();if(!/^[^/]+\/[^/]+$/.test(c.repo))throw new Error('Repositoryは owner/repo 形式が必要です');const folder=c.folder.replace(/^\/+|\/+$/g,'');const path=(folder?folder+'/':'')+date+'.md';return{...c,date,path,key:`${c.repo}|${c.branch}|${path}`}}
    function headers(c){if(!c.token)throw new Error('GitHub Tokenを設定してください');return{Accept:'application/vnd.github+json',Authorization:`Bearer ${c.token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}}
    const encode=text=>{const bytes=new TextEncoder().encode(text);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary)};
    const decode=text=>new TextDecoder().decode(Uint8Array.from(atob(String(text||'').replace(/\s/g,'')),c=>c.charCodeAt(0)));
    const endpoint=c=>`https://api.github.com/repos/${c.repo}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`;
    async function read(c){const r=await fetch(endpoint(c)+'?ref='+encodeURIComponent(c.branch),{headers:headers(c),cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw new Error((await r.json()).message||`GitHub API ${r.status}`);return r.json()}
    function conflict(message){const e=new Error(message);e.code='TASKLINER_SAVE_CONFLICT';return e}
    async function readText(c,data){let content=data.content;if(!content&&data.sha){const response=await fetch(`https://api.github.com/repos/${c.repo}/git/blobs/${encodeURIComponent(data.sha)}`,{headers:headers(c),cache:'no-store'});if(!response.ok)throw new Error(`GitHub API ${response.status}`);content=(await response.json()).content;}return decode(content)}
    function isDirty(date){return dirty.has(date)}
    function markDirty(date){dirty.add(date);versions.set(date,(versions.get(date)||0)+1);persist();emit(date,'dirty')}
    function markClean(date){dirty.delete(date);persist();emit(date,'saved')}
    function pull(date){const c=target(date),version=versions.get(date)||0;const operation=queue.catch(()=>{}).then(async()=>{emit(date,'loading');try{const data=await read(c);if(!data){emit(date,isDirty(date)?'dirty':'saved');return null}const text=await readText(c,data);if(!text.trim()){delete known[c.key];persist();throw new Error('GitHub側の本文が空です。ローカルは変更していません。')}return{date,text,sha:data.sha,key:c.key,version}}catch(error){emit(date,'error',error);throw error}});queue=operation;return operation}
    // The caller applies a pull only if its date and edit version are still current.
    function acceptPull(result){if(!result||result.version!==(versions.get(result.date)||0))return false;known[result.key]=result.sha;markClean(result.date);return true}
    function save(date,text,{force=false}={}){
      const c=target(date),version=versions.get(date)||0,snapshot=String(text);
      const operation=queue.catch(()=>{}).then(async()=>{emit(date,'saving');try{
        const current=await read(c),sha=known[c.key];
        if(current?.sha&&!force){if(!sha)throw conflict('既存データがあります。保存前にPullしてください。');if(current.sha!==sha)throw conflict('GitHub側が更新されています。先にPullしてください。');if(!snapshot.trim()&&Number(current.size||0)>0)throw conflict('空の本文で既存データを上書きできません。');}
        const body={message:`TaskLiner sync: ${date}`,content:encode(snapshot),branch:c.branch};if(current?.sha)body.sha=current.sha;
        const response=await fetch(endpoint(c),{method:'PUT',headers:headers(c),body:JSON.stringify(body)});
        if(!response.ok){const message=(await response.json()).message||`GitHub API ${response.status}`;if(response.status===409)throw conflict(message);throw new Error(message)}
        const saved=await response.json();known[c.key]=saved.content?.sha||'';
        if((versions.get(date)||0)===version)markClean(date);else{persist();emit(date,'dirty')}
        return true;
      }catch(error){emit(date,error.code==='TASKLINER_SAVE_CONFLICT'?'conflict':'error',error);throw error}});
      queue=operation;return operation;
    }
    return{config,setConfig,markDirty,markClean,isDirty,pull,acceptPull,save,readText,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}};
  }
  return{createSync};
});
