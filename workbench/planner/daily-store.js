(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DuoDailyStore=api})(globalThis,function(){
 'use strict';
 const PREFIX='cockpid.planner.daily.v1:';
 function createStore({storage,fetch,source,token,onChange=()=>{}}){
   const records=new Map(),queues=new Map();
   const error=(message,code)=>Object.assign(new Error(message),{code});
   function target(date){
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw error('日付が不正です。','DAILY_DATE');
     const parsed=new Date(date+'T12:00:00Z');if(!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==date)throw error('実在する日付を選んでください。','DAILY_DATE');
     const raw=source()||{},repo=raw.repo?.includes('/')?raw.repo:`plzsayyes3/${raw.repo||'mynotebook'}`,dir=String(raw.dir??'01_Daily').replace(/^\/+|\/+$/g,'');
     if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||dir.split('/').some(part=>['.','..'].includes(part)))throw error('Dailyの保存先設定を確認してください。','DAILY_SOURCE');
     const branch=raw.branch||'main',path=(dir?dir+'/':'')+date+'.md',key=`${repo}|${branch}|${path}`;return{date,repo,branch,path,key};
   }
   function persist(record){
     const {text,baseSha,baseText,loaded,exists,dirty,revision,scrollTop,selectionStart,selectionEnd}=record;
     try{storage.setItem(PREFIX+record.key,JSON.stringify({text,baseSha,baseText,loaded,exists,dirty,revision,scrollTop,selectionStart,selectionEnd}));record.localError=''}catch(e){record.localError='端末への下書き保存に失敗しました。画面を閉じずに保存してください。'}
   }
   function emit(record){onChange(record)}
   function get(date){
     const t=target(date);if(records.has(t.key))return records.get(t.key);
     let saved={};try{saved=JSON.parse(storage.getItem(PREFIX+t.key)||'{}')}catch{}
     const record={...t,text:typeof saved.text==='string'?saved.text:'',baseSha:typeof saved.baseSha==='string'?saved.baseSha:null,baseText:typeof saved.baseText==='string'?saved.baseText:'',loaded:!!saved.loaded,exists:!!saved.exists,dirty:!!saved.dirty,revision:Number(saved.revision)||0,scrollTop:Number(saved.scrollTop)||0,selectionStart:Number(saved.selectionStart)||0,selectionEnd:Number(saved.selectionEnd)||0,status:saved.dirty?'dirty':'idle',error:'',localError:'',epoch:0};
     records.set(t.key,record);return record;
   }
   function headers(){const value=token();if(!value)throw error('GitHubの接続設定が必要です。入力はこの端末に残ります。','DAILY_TOKEN');return{Accept:'application/vnd.github+json',Authorization:`Bearer ${value}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'}}
   const endpoint=r=>`https://api.github.com/repos/${r.repo}/contents/${r.path.split('/').map(encodeURIComponent).join('/')}`;
   const decode=text=>new TextDecoder().decode(Uint8Array.from(atob(String(text||'').replace(/\s/g,'')),c=>c.charCodeAt(0)));
   const encode=text=>{let binary='';for(const byte of new TextEncoder().encode(text))binary+=String.fromCharCode(byte);return btoa(binary)};
   async function remote(record){
     const response=await fetch(endpoint(record)+'?ref='+encodeURIComponent(record.branch),{cache:'no-store',headers:headers()});
     if(response.status===404)return null;if(!response.ok)throw error((await response.json()).message||`GitHub API ${response.status}`,'DAILY_NETWORK');
     const file=await response.json();if(!file.sha||Array.isArray(file))throw error('Dailyの本文を取得できませんでした。','DAILY_NETWORK');return file;
   }
   async function content(record,file){
     let encoded=file.content;
     if(typeof encoded!=='string'||(!encoded&&Number(file.size)>0)){
       const response=await fetch(`https://api.github.com/repos/${record.repo}/git/blobs/${encodeURIComponent(file.sha)}`,{cache:'no-store',headers:headers()});
       if(!response.ok)throw error(`本文の取得に失敗しました (${response.status})。`,'DAILY_NETWORK');encoded=(await response.json()).content;
       if(typeof encoded!=='string')throw error('Dailyの本文を取得できませんでした。','DAILY_NETWORK');
     }
     return decode(encoded);
   }
   function enqueue(record,operation){const next=(queues.get(record.key)||Promise.resolve()).catch(()=>{}).then(operation);queues.set(record.key,next);return next;}
   function fail(record,e){record.status=e.code==='DAILY_CONFLICT'?'conflict':'error';record.error=e.message;persist(record);emit(record);throw e;}
   function load(record,{discard=false}={}){
     if(record.dirty&&!discard)return Promise.resolve(record);
     const revision=record.revision;
     return enqueue(record,async()=>{
       record.status='loading';record.error='';emit(record);
       try{
         const file=await remote(record),text=file?await content(record,file):'';
         if(record.revision!==revision){record.status='dirty';record.error='読込中に入力されたため、入力内容を残しました。';emit(record);return record;}
         record.epoch++;record.text=text;record.baseText=text;record.baseSha=file?.sha||null;record.exists=!!file;record.loaded=true;record.dirty=false;record.status=file?'saved':'new';record.error='';persist(record);emit(record);return record;
       }catch(e){return fail(record,e)}
     });
   }
   function edit(record,text){
     if(record.text===text)return;
     record.text=String(text);record.revision++;record.dirty=true;record.status='dirty';record.error='';persist(record);emit(record);
   }
   function save(record,{allowEmpty=false}={}){
     if(!record.dirty)return Promise.resolve(record);
     const text=record.text,revision=record.revision,epoch=record.epoch;
     return enqueue(record,async()=>{
       // A discard reload supersedes snapshots captured before it completed.
       if(record.epoch!==epoch)return record;
       record.status='saving';record.error='';emit(record);
       try{
         if(!allowEmpty&&!text.trim()&&record.baseText.trim())throw error('Dailyの全文が空です。空にして保存する場合は保存ボタンから確認してください。','DAILY_EMPTY');
         const file=await remote(record);
         if(file&&(!record.loaded||record.baseSha!==file.sha)||!file&&record.exists)throw error('GitHub側のDailyが更新されています。入力をコピーするか、再読込して確認してください。','DAILY_CONFLICT');
         const body={message:`Workbench Daily: ${record.date}`,content:encode(text),branch:record.branch};if(file)body.sha=file.sha;
         const response=await fetch(endpoint(record),{method:'PUT',headers:headers(),body:JSON.stringify(body)});
         if(!response.ok){const info=await response.json().catch(()=>({}));throw error(info.message||`保存に失敗しました (${response.status})。`,response.status===409?'DAILY_CONFLICT':'DAILY_NETWORK');}
         const saved=await response.json();if(!saved.content?.sha)throw error('保存結果を確認できませんでした。再読込前に入力をコピーしてください。','DAILY_NETWORK');
         record.baseSha=saved.content.sha;record.baseText=text;record.loaded=true;record.exists=true;
         record.dirty=record.revision!==revision;record.status=record.dirty?'dirty':'saved';record.error='';persist(record);emit(record);return record;
       }catch(e){return fail(record,e)}
     });
   }
   function rememberView(record,state){for(const key of ['scrollTop','selectionStart','selectionEnd'])if(Number.isFinite(state[key]))record[key]=state[key];persist(record);}
   return{get,load,edit,save,rememberView,all:()=>[...records.values()]};
 }
 return{createStore,PREFIX};
});
