import './daily-store.js';
import '../taskliner/taskliner-date.js';
import '../taskliner/github-client.js';

export function createDailyView(container){
  const ownerDocument=container.ownerDocument,element=ownerDocument.createElement('div');element.dataset.daily='native';element.style.cssText='height:100%;min-height:0';
  const root=element.attachShadow({mode:'open'});
  root.innerHTML=`<link rel="stylesheet" href="${new URL('./daily.css',import.meta.url)}"><section class="daily"><header class="daily-head"><div class="daily-title"><strong>デイリーノート</strong><span id="state" role="status" aria-live="polite"></span></div><div class="daily-date"><button id="prev" type="button" aria-label="メモの前日">‹</button><input id="date" type="date" aria-label="メモの日付"><button id="next" type="button" aria-label="メモの翌日">›</button><button id="today" type="button">今日</button></div><div class="daily-actions"><button id="save" type="button">保存</button><button id="reload" type="button">再読込</button><button id="copy" type="button">コピー</button><button id="connect" type="button">接続設定</button></div></header><p id="message" class="daily-message" role="status"></p><textarea id="editor" class="daily-editor" aria-label="デイリーノートの本文" spellcheck="false" placeholder="この日のメモを書く…"></textarea><footer><span id="path"></span><span>Markdown · ⌘ / Ctrl + S で保存</span></footer></section>`;
  container.append(element);const $=id=>root.getElementById(id),editor=$('editor');
  const request=globalThis.TaskLinerGithubClient.createGithubFetch({storage:localStorage,fetch:globalThis.fetch.bind(globalThis)});
  const token=()=>localStorage.getItem('zen-note-github-token')||'';
  const source=()=>globalThis.COCKPID_SOURCES?.get('daily')||{repo:'mynotebook',dir:'01_Daily'};
  let current,composing=false,pendingDate=null,visible=true,viewGeneration=0;const timers=new Map();
  const labels={idle:'未読込',loading:'読込中…',new:'新しい日',saved:'保存済み',dirty:'未保存',saving:'保存中…',conflict:'保存競合',error:'保存失敗'};
  const store=globalThis.DuoDailyStore.createStore({storage:localStorage,fetch:request,source,token,onChange(record){
    if(record.key===current?.key)render(record);
    if(record.status==='dirty')scheduleSave(record);
  }});
  function render(record){
    $('state').textContent=record.localError?'端末保存失敗':labels[record.status]||record.status;$('state').dataset.state=record.status;
    $('message').textContent=record.localError||record.error||(!record.exists&&record.loaded?'この日のDailyはまだありません。入力した内容を保存すると作成します。':'');
    $('path').textContent=`${record.repo} / ${record.path}`;$('date').value=record.date;
    if(editor.value!==record.text){const focused=root.activeElement===editor,start=editor.selectionStart,end=editor.selectionEnd,top=editor.scrollTop;editor.value=record.text;if(focused){editor.setSelectionRange(Math.min(start,record.text.length),Math.min(end,record.text.length));editor.scrollTop=top;}}
    $('save').disabled=!record.dirty||record.status==='saving';
  }
  function remember(){if(current)store.rememberView(current,{scrollTop:editor.scrollTop,selectionStart:editor.selectionStart,selectionEnd:editor.selectionEnd})}
  function scheduleSave(record){
    clearTimeout(timers.get(record.key));if(!token())return;
    timers.set(record.key,setTimeout(()=>{timers.delete(record.key);if(record===current&&composing){scheduleSave(record);return}if(record.dirty)store.save(record).catch(()=>{})},5000));
  }
  function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
  async function show(date){
    if(!globalThis.TaskLinerDate.isValidDate(date)){$('date').value=current?.date||today();return}
    if(composing){pendingDate=date;editor.blur();return}
    remember();const generation=++viewGeneration;current=store.get(date);render(current);
    const target=current;editor.setSelectionRange(Math.min(target.selectionStart,target.text.length),Math.min(target.selectionEnd,target.text.length));editor.scrollTop=target.scrollTop;
    try{await store.load(target)}catch{}
    if(generation!==viewGeneration)return;render(target);
    // Loading may resize the text; restore only if the editor was not used while loading.
    if(!target.dirty&&root.activeElement!==editor)editor.scrollTop=target.scrollTop;
  }
  async function saveManual(){
    if(composing){editor.blur();await Promise.resolve();if(composing)return}
    const record=current;if(!record?.dirty)return;
    try{await store.save(record)}catch(error){if(error.code==='DAILY_EMPTY'&&globalThis.confirm('このDailyの全文を空にして保存しますか？'))await store.save(record,{allowEmpty:true}).catch(()=>{})}
  }
  editor.addEventListener('input',()=>{if(current)store.edit(current,editor.value)});
  editor.addEventListener('scroll',remember,{passive:true});editor.addEventListener('select',remember);
  editor.addEventListener('compositionstart',()=>{composing=true});
  editor.addEventListener('compositionend',()=>{composing=false;if(current)store.edit(current,editor.value);if(pendingDate){const date=pendingDate;pendingDate=null;queueMicrotask(()=>show(date))}else if(current?.dirty)scheduleSave(current)});
  editor.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveManual()}});
  $('prev').onclick=()=>show(globalThis.TaskLinerDate.shiftDate(current.date,-1));$('next').onclick=()=>show(globalThis.TaskLinerDate.shiftDate(current.date,1));$('date').onchange=()=>show($('date').value);$('today').onclick=()=>show(today());$('save').onclick=saveManual;
  $('reload').onclick=()=>{const record=current;if(record.dirty&&!globalThis.confirm('この日の未保存内容を破棄して、GitHubから再読込しますか？先にコピーで退避できます。'))return;clearTimeout(timers.get(record.key));timers.delete(record.key);store.load(record,{discard:true}).catch(()=>{})};
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(current.text);$('message').textContent='本文をコピーしました。'}catch{editor.focus();editor.select();$('message').textContent='本文を選択しました。コピーしてください。'}};
  $('connect').onclick=()=>ownerDocument.getElementById('systemOpen')?.click();
  ownerDocument.addEventListener('visibilitychange',()=>{if(ownerDocument.visibilityState==='hidden'){remember();for(const record of store.all())if(record.dirty&&token()&&!composing)store.save(record).catch(()=>{})}});
  globalThis.addEventListener('beforeunload',event=>{if(store.all().some(record=>record.dirty)){event.preventDefault();event.returnValue=''}});
  show(today());
  return{element,getDate:()=>current?.date,navigate:show,remember,setVisible(value){visible=value;if(!value)remember();else if(current?.dirty)scheduleSave(current)},focus(){editor.focus()},isComposing:()=>composing};
}
