import './task-markdown.js';
import './task-ui-actions.js';
import './taskliner-date.js';
import './template-core.js';
import './daily-integration.js';
import './task-note-pull.js';
import './techo-import.js';
import './sync.js';
import './github-client.js';
import {createTaskApp} from './app.mjs';
import {createTemplateStore} from './template-store.mjs';
import appMarkup from './app-markup.mjs';
import viewMarkup from './view-markup.mjs';

let instance;
export function mount(container,{mode='normal'}={}){
  if(!instance)instance=createInstance(container.ownerDocument);
  container.replaceChildren(instance.element);
  instance.setLayoutMode(mode);
  instance.setVisible(true);
  return instance;
}

function createInstance(ownerDocument){
  const element=ownerDocument.createElement('div');
  element.style.cssText='height:100%;min-height:0;display:block';
  element.dataset.taskliner='native';
  const root=element.attachShadow({mode:'open'});
  const styles=['app.css','view.css'].map(file=>`<link rel="stylesheet" href="${new URL(file+'?v=20261114-fit',import.meta.url)}">`).join('');
  root.innerHTML=styles+`<div class="tl-body">${viewMarkup}</div>`;
  const body=root.querySelector('.tl-body'),$=id=>root.getElementById(id);
  $('tlAppContent').innerHTML=appMarkup;
  // Running controls occupy their own row, so they cannot cover text or the keyboard.
  body.append($('mobileRunningDock'));
  const scroll=root.querySelector('.tl-scroll');
  let rememberedScrollTop=0;
  const document=new Proxy(ownerDocument,{get(target,key){
    if(key==='body'||key==='documentElement'||key==='head')return body;
    if(key==='activeElement')return root.activeElement;
    if(key==='getElementById')return id=>root.getElementById(id);
    if(key==='querySelector')return selector=>root.querySelector(selector);
    if(key==='querySelectorAll')return selector=>root.querySelectorAll(selector);
    if(key==='addEventListener')return root.addEventListener.bind(root);
    if(key==='removeEventListener')return root.removeEventListener.bind(root);
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  // Same GitHub Pages origin: retain TaskLiner keys and use Workbench's token if needed.
  const storage={getItem(key){const value=localStorage.getItem(key);return key==='taskliner_github_sync_token_v1'&&!value?localStorage.getItem('zen-note-github-token'):value},setItem:(key,value)=>localStorage.setItem(key,value),removeItem:key=>localStorage.removeItem(key)};
  const request=globalThis.TaskLinerGithubClient.createGithubFetch({storage,fetch:globalThis.fetch.bind(globalThis)});
  const messages=new EventTarget();let visible=true,suppressDirty=false,app,timer=null,navigating=false;
  const callbacks={document,top:{location:globalThis.location},location:globalThis.location,
    TaskLinerMarkdown:globalThis.TaskLinerMarkdown,TaskLinerTaskUIActions:globalThis.TaskLinerTaskUIActions,TaskLinerDate:globalThis.TaskLinerDate,TaskLinerTemplates:globalThis.TaskLinerTemplates,
    TaskLinerHostBridge:{postToSyncShell(_window,message){queueMicrotask(()=>handleMessage(message));return true}},
    addEventListener:(type,fn)=>messages.addEventListener(type,fn),removeEventListener:(type,fn)=>messages.removeEventListener(type,fn),
    postMessage(message){messages.dispatchEvent(new MessageEvent('message',{data:message}))},
    open:globalThis.open.bind(globalThis),confirm:globalThis.confirm.bind(globalThis),prompt:globalThis.prompt.bind(globalThis)
  };
  callbacks.self=callbacks;const window=callbacks;
  const status=text=>{$('tlStatus').textContent=text};
  const labels={saved:'保存済み',dirty:'未保存',saving:'保存中…',loading:'読込中…',conflict:'保存競合',error:'保存失敗'};
  const sync=globalThis.TaskLinerSync.createSync({storage,fetch:request,onState(date,state,error){
    if(app&&date!==app.getDate())return;
    $('tlSaveState').textContent=labels[state]||state;$('tlSaveState').dataset.state=state;
    $('tlForceSave').hidden=state!=='conflict';
    if(error)status(error.message);
    if(state==='dirty')scheduleSave();
  }});
  // Match the former source bridge, preserving template-specific settings.
  try{const source=JSON.parse(storage.getItem('cockpid.sources.v1')||'{}').taskliner;
    if(source){const patch={};if(source.repo)patch.repo=source.repo.includes('/')?source.repo:`plzsayyes3/${source.repo}`;if(source.dir!==undefined)patch.folder=source.dir;sync.setConfig(patch)}
  }catch(error){status('保存先設定を読み込めませんでした。設定を確認してください。')}
  const coreOptions={storage,setTimeout:globalThis.setTimeout.bind(globalThis),clearTimeout:globalThis.clearTimeout.bind(globalThis),setInterval(fn,delay){return globalThis.setInterval(()=>{if(visible&&element.isConnected)fn()},delay)},requestAnimationFrame:globalThis.requestAnimationFrame.bind(globalThis),MutationObserver:globalThis.MutationObserver,prompt:window.prompt,confirm:window.confirm};
  app=createTaskApp(document,window,coreOptions);
  function scheduleSave(){clearTimeout(timer);if(!app||!sync.config().token)return;timer=setTimeout(()=>{if(sync.isDirty(app.getDate()))save().catch(()=>{})},60000)}
  function snapshot(){return{date:app.getDate(),text:app.exportMarkdown()}}
  async function save(force=false){const current=snapshot();if(!sync.isDirty(current.date)&&!force)return true;const result=await sync.save(current.date,current.text,{force});if(!sync.isDirty(current.date))status(`${current.date} を保存しました`);return result}
  function handleMessage(message){
    if(message.type==='tasks-updated'){if(!suppressDirty)sync.markDirty(message.date);return}
    if(message.type==='date-changed'){const date=app.getDate();$('tlSaveState').textContent=sync.isDirty(date)?'未保存':'保存済み';status('日付を切り替えました。GitHubから読み込む場合は pull を押してください。');scheduleSave();return}
    if(message.type!=='navigation-request')return;
    const reply=type=>window.postMessage({source:'taskliner-host',type,targetDate:message.targetDate});
    if(navigating){reply('navigation-cancel');return}
    navigating=true;
    (async()=>{try{if(sync.isDirty(message.fromDate)){await save();if(sync.isDirty(message.fromDate))throw new Error('保存中に編集されたため、日付は変更しませんでした。')}reply('navigation-continue')}catch(error){status(error.message);reply('navigation-cancel')}finally{navigating=false}})();
  }
  async function pull(){
    const date=app.getDate();
    if(sync.isDirty(date)&&!window.confirm('未保存の変更があります。破棄してGitHubからpullしますか？'))return;
    const before=app.exportMarkdown(),result=await sync.pull(date);
    if(!result){status(`${date} のGitHubファイルはまだありません。`);return}
    if(app.getDate()!==date||app.exportMarkdown()!==before){status('日付または内容が変わったため、Pull結果を反映しませんでした。');return}
    // Import emits asynchronously; the suppression is attached to that queued notification.
    suppressDirty=true;
    try{app.importMarkdown(result.text);await Promise.resolve();sync.acceptPull(result);status(`${date} を読み込みました。`)}finally{suppressDirty=false}
  }
  const perform=fn=>async()=>{try{await fn()}catch(error){status(error.message)}};
  $('tlPull').onclick=perform(pull);$('tlSave').onclick=perform(()=>save());
  $('tlForceSave').onclick=perform(async()=>{
    if(window.confirm('GitHub側の内容を、現在のローカルの内容で上書きしますか？'))await save(true);
  });
  const menu=$('tlMenu'),toggle=$('tlMenuToggle');
  toggle.onclick=()=>{menu.hidden=!menu.hidden;toggle.setAttribute('aria-expanded',String(!menu.hidden))};
  root.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){menu.hidden=true;toggle.setAttribute('aria-expanded','false');$('tlNote').hidden=true}});
  root.addEventListener('click',event=>{if(!menu.hidden&&!menu.contains(event.target)&&event.target!==toggle){menu.hidden=true;toggle.setAttribute('aria-expanded','false')}});
  function displayConfig(){const c=sync.config();$('tlRepo').value=c.repo;$('tlBranch').value=c.branch;$('tlFolder').value=c.folder;$('tlToken').value=c.token}
  displayConfig();
  $('tlConfigSave').onclick=()=>{sync.setConfig({repo:$('tlRepo').value.trim(),branch:$('tlBranch').value.trim()||'main',folder:$('tlFolder').value.trim(),token:$('tlToken').value.trim()});status('同期設定を保存しました。');scheduleSave()};
  for(const [name,key,css] of [['Font','taskliner_today_font_scale_v1','--tl-font'],['Button','taskliner_today_button_scale_v1','--tl-button'],['Header','taskliner_today_menu_scale_v1','--tl-header']]){
    const input=$('tl'+name),output=$('tl'+name+'Value'),stored=Number(storage.getItem(key));
    input.value=stored>=Number(input.min)&&stored<=Number(input.max)?stored:100;
    const apply=()=>{body.style.setProperty(css,Number(input.value)/100);output.textContent=input.value+'%';storage.setItem(key,input.value);app.refresh()};input.oninput=apply;apply();
  }
  $('tlTheme').value=storage.getItem('taskliner_theme_v1')||'soft';
  const applyTheme=()=>{body.classList.toggle('terminal',$('tlTheme').value==='terminal');storage.setItem('taskliner_theme_v1',$('tlTheme').value)};applyTheme();$('tlTheme').onchange=applyTheme;
  const templates=createTemplateStore(window,storage,request);
  const TL=globalThis.TaskLinerTemplates,DI=globalThis.TaskLinerDailyIntegration;
  let masters=templates.readMasterCache(),selectedMaster='';
  const suggestions=ownerDocument.createElement('div');suggestions.className='tl-suggestions';$('newTitle').parentElement.append(suggestions);
  const prepareMaster=()=>{
    const title=$('newTitle').value.trim();if(!title)return;
    let master=masters.find(x=>x.id===selectedMaster);if(master&&TL.norm(master.title)!==TL.norm(title))master=null;
    master=master||TL.findExactMaster(title,masters);
    if(!master){master={id:TL.id('task'),title,aliases:[],status:'active',estimate:Math.max(0,Math.round(Number($('newEstimate').value)||0))};masters.push(master);const saved=master;
      templates.saveMaster(saved).then(()=>templates.createReviewFor(saved,masters)).catch(error=>status(`Master保存失敗: ${error.message}`));}
    templates.markRecent(master.id);window.__tasklinerPendingMasterId=master.id;selectedMaster='';suggestions.replaceChildren();
  };
  $('newTitle').addEventListener('input',()=>{selectedMaster='';suggestions.replaceChildren();const query=$('newTitle').value.trim();if(!query)return;for(const master of TL.suggestMasters(query,masters,3)){const button=ownerDocument.createElement('button');button.type='button';button.textContent=`${TL.displayTitle(master.title)} · ${master.estimate||0}m`;button.onclick=()=>{$('newTitle').value=master.title;$('newEstimate').value=master.estimate||0;selectedMaster=master.id;suggestions.replaceChildren()};suggestions.append(button)}});
  $('addTask').addEventListener('click',prepareMaster,true);
  for(const id of ['newTitle','newEstimate'])$(id).addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing)prepareMaster()},true);
  $('tlMasterPull').onclick=perform(async()=>{masters=await templates.pullMasters();status(`Master Pull完了 / ${masters.length}件`)});
  let generating=false;
  $('tlGenerate').onclick=perform(async()=>{if(generating)return;generating=true;const date=app.getDate();try{const [freshMasters,repeats]=await Promise.all([templates.pullMasters(),templates.loadRepeats()]);masters=freshMasters;if(date!==app.getDate())throw new Error('日付が変わったため生成を中止しました。');const text=app.exportMarkdown(),items=TL.generateDailyInstances(date,masters,repeats,DI.existingInstances(text,masters));if(items.length)app.importMarkdown(DI.mergeGeneratedIntoMarkdown(text,items));status(items.length?`${items.length}件を追加しました。`:'未生成のRepeatはありません。')}finally{generating=false}});
  $('tlTecho').onclick=perform(async()=>{const date=app.getDate(),file=await templates.readFile(`02_techo/${date.slice(0,7)}.md`);if(date!==app.getDate())throw new Error('日付が変わったため取込を中止しました。');if(!file?.text)throw new Error('手帳ファイルがありません。');const MD=globalThis.TaskLinerMarkdown,key=item=>[item.title,item.section,item.planned_at||item.plannedAt||''].join('|'),text=app.exportMarkdown(),existing=new Set(MD.parseMarkdown(text).tasks.map(key));const items=globalThis.TaskLinerTechoImport.extractDateTasks(file.text,date).filter(item=>!existing.has(key(item)));if(items.length)app.importMarkdown(DI.mergeGeneratedIntoMarkdown(text,items));status(items.length?`手帳から${items.length}件を追加しました。`:'追加できる新しいタスクはありません。')});
  async function openNote(raw){
    const NP=globalThis.TaskLinerNotePull;let path=NP.normalizeTarget(raw);
    if(!path.includes('/')){const c=sync.config(),response=await request(`https://api.github.com/repos/${c.repo}/git/trees/${encodeURIComponent(c.branch)}?recursive=1`,{cache:'no-store',headers:{Authorization:`Bearer ${c.token}`}});if(!response.ok)throw new Error(`GitHub API ${response.status}`);const tree=await response.json(),resolved=NP.resolvePath(path,(tree.tree||[]).filter(x=>x.type==='blob').map(x=>x.path));if(!resolved.path)throw new Error(resolved.candidates.length>1?'同名ノートが複数あります。':'ノートが見つかりません。');path=resolved.path;}
    // Read notes from the daily-task repository, not the optional template repository.
    const c=sync.config(),response=await request(`https://api.github.com/repos/${c.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(c.branch)}`,{cache:'no-store',headers:{Authorization:`Bearer ${c.token}`}});if(!response.ok)throw new Error(`GitHub API ${response.status}`);const data=await response.json(),content=await sync.readText(c,data);
    NP.cache(storage,{repo:c.repo,branch:c.branch,path,sha:data.sha,content});$('tlNoteTitle').textContent=path;$('tlNoteBody').innerHTML=NP.renderMarkdown(content);$('tlNote').hidden=false;$('tlNoteClose').focus();
  }
  const activateNote=event=>{const link=event.target.closest?.('.task-wikilink');if(!link||event.type==='keydown'&&!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();openNote(link.title.replace(/^\[\[/,'').replace(/\]\]$/,'')).catch(error=>status(error.message))};root.addEventListener('click',activateNote,true);root.addEventListener('keydown',activateNote,true);$('tlNoteClose').onclick=()=>{$('tlNote').hidden=true};
  let startY=null;scroll.addEventListener('touchstart',event=>{startY=event.touches.length===1&&scroll.scrollTop<=0?event.touches[0].clientY:null},{passive:true});scroll.addEventListener('touchend',event=>{const end=event.changedTouches[0]?.clientY;if(startY!==null&&end-startY>=120)pull().catch(error=>status(error.message));startY=null},{passive:true});
  ownerDocument.addEventListener('visibilitychange',()=>{if(ownerDocument.visibilityState==='hidden'&&sync.isDirty(app.getDate()))save().catch(()=>{});else if(visible)scheduleSave()});
  new ResizeObserver(()=>{if(visible)app.refresh()}).observe(element);
  scroll.addEventListener('scroll',()=>{if(visible)rememberedScrollTop=scroll.scrollTop},{passive:true});
  const api={element,root,setLayoutMode(mode){body.dataset.layout=mode;},getDate:app.getDate,navigate:app.navigate,exportMarkdown:app.exportMarkdown,setVisible(value){if(!value&&visible&&element.isConnected)rememberedScrollTop=scroll.scrollTop;visible=value;if(value){scroll.scrollTop=rememberedScrollTop;requestAnimationFrame(()=>{if(visible){scroll.scrollTop=rememberedScrollTop;app.refresh()}});scheduleSave()}},save,pull};
  if(sync.isDirty(app.getDate())){$('tlSaveState').textContent='未保存';scheduleSave()}
  return api;
}
