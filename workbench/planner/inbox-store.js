(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DuoInboxStore=api})(globalThis,function(){
 'use strict';
 const PREFIX='cockpid.planner.inbox.v1:',NAME=/^\d{14}(?:\d{3})?\.md$/;
 function createStore({storage,fetch,source,token,now=()=>new Date(),onChange=()=>{}}){
   const records=new Map();let flight=null,lastStamp='';
   function context(){const s=source()||{},repo=s.repo?.includes('/')?s.repo:`plzsayyes3/${s.repo||'mynotebook'}`,dir=String(s.dir??'00_inbox').replace(/^\/+|\/+$/g,''),branch=s.branch||'main';if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||dir.split('/').some(x=>x==='.'||x==='..'))throw Error('Inboxの保存先設定を確認してください。');return{repo,dir,branch,key:`${repo}|${branch}|${dir}`}}
   function persist(r){storage.setItem(PREFIX+r.key,JSON.stringify({text:r.text,pending:r.pending}));onChange(r)}
   function draft(){const c=context();if(records.has(c.key))return records.get(c.key);let data={};try{data=JSON.parse(storage.getItem(PREFIX+c.key)||'{}')}catch{}const r={...c,text:typeof data.text==='string'?data.text:'',pending:data.pending&&NAME.test(data.pending.name)&&typeof data.pending.text==='string'&&typeof data.pending.body==='string'?data.pending:null};records.set(c.key,r);if(r.pending?.name)lastStamp=r.pending.name.replace(/\.md$/,'');return r;}
   function edit(text){const r=draft();r.text=String(text);persist(r);return r;}
   function stamp(){const date=now(),parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date),value=type=>parts.find(x=>x.type===type).value;let name=`${value('year')}${value('month')}${value('day')}${value('hour')}${value('minute')}${value('second')}${String(date.getMilliseconds()).padStart(3,'0')}`;if(lastStamp&&name<=lastStamp)name=String(BigInt(lastStamp)+1n);lastStamp=name;return name+'.md';}
   const decode=text=>new TextDecoder().decode(Uint8Array.from(atob(String(text||'').replace(/\s/g,'')),x=>x.charCodeAt(0)));
   const encode=text=>{let binary='';for(const b of new TextEncoder().encode(text))binary+=String.fromCharCode(b);return btoa(binary)};
   function join(c,name){return(c.dir?c.dir+'/':'')+name}
   async function api(c,path,opts={}){
     const value=token();if(!value)throw Error('GitHubの接続設定が必要です。入力はこの端末に残ります。');
     const endpoint=`https://api.github.com/repos/${c.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
     const response=await fetch(endpoint+(opts.method?'':'?ref='+encodeURIComponent(c.branch)),{...opts,cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${value}`,'Content-Type':'application/json'}});
     if(response.status===404&&!opts.method)return null;
     if(!response.ok){const info=await response.json().catch(()=>({}));throw Object.assign(Error(info.message||`Inboxへのアクセスに失敗しました (${response.status})。`),{status:response.status})}return response.json();
   }
   async function fileText(c,file){if(typeof file.content==='string'&&(file.content||!file.size))return decode(file.content);const value=token(),response=await fetch(`https://api.github.com/repos/${c.repo}/git/blobs/${encodeURIComponent(file.sha)}`,{cache:'no-store',headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${value}`}});if(!response.ok)throw Error('Inboxの本文を取得できませんでした。');return decode((await response.json()).content);}
   async function stored(c,pending){const file=await api(c,join(c,pending.name));if(!file)return'missing';return await fileText(c,file)===pending.body?'same':'different';}
   function collision(){return Object.assign(Error('同名の別メモがあります。上書きしていません。もう一度送信すると別名で保存します。'),{code:'INBOX_COLLISION'})}
   function send(){
     if(flight)return flight;
     const record=draft();if(!record.pending&&!record.text.trim())return Promise.reject(Error('メモを入力してください。'));
     if(!record.pending){const text=record.text;record.pending={name:stamp(),text,body:text.endsWith('\n')?text:text+'\n'};persist(record);}
     const pending=record.pending,c={repo:record.repo,branch:record.branch,dir:record.dir};
     // Persist the immutable attempt before sending; a reload retries this exact target.
     flight=(async()=>{
       let confirmed=false;
       try{
         const state=await stored(c,pending);
         if(state==='different'){record.pending=null;persist(record);throw collision()}
         if(state==='same')confirmed=true;
         else{
           try{await api(c,join(c,pending.name),{method:'PUT',body:JSON.stringify({message:`Workbench Inbox: ${pending.name}`,branch:c.branch,content:encode(pending.body)})});confirmed=true;}
           catch(error){let verification;try{verification=await stored(c,pending)}catch{}if(verification==='same')confirmed=true;else if(verification==='different'){record.pending=null;persist(record);throw collision()}else throw error;}
         }
         if(confirmed){if(record.text===pending.text)record.text='';record.pending=null;persist(record);return{name:pending.name,path:join(c,pending.name),remaining:record.text};}
       }finally{flight=null}
     })();return flight;
   }
   async function list(){const c=context(),rows=await api(c,c.dir);if(rows===null)return[];if(!Array.isArray(rows))throw Error('Inbox一覧を取得できませんでした。');return rows.filter(x=>x.type==='file'&&NAME.test(x.name)).sort((a,b)=>b.name.localeCompare(a.name)).map(x=>({name:x.name,context:c}));}
   async function read(row){if(!NAME.test(row.name))throw Error('Inboxのファイル名が不正です。');const c=row.context||context(),file=await api(c,join(c,row.name));if(!file)throw Error('このメモは移動または整理済みです。一覧を更新してください。');return fileText(c,file);}
   return{draft,edit,send,list,read};
 }
 return{createStore,PREFIX};
});
