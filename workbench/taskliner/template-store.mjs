export function createTemplateStore(window,localStorage,fetch){
(()=>{'use strict';
const TL=window.TaskLinerTemplates;
const CONFIG_KEY='taskliner_github_sync_config_v1',TOKEN_KEY='taskliner_github_sync_token_v1';
const RECENT_KEY='taskliner_master_recent_v1';
const MASTER_CACHE_KEY='taskliner_master_cache_v1',MASTER_CACHE_META_KEY='taskliner_master_cache_meta_v1';
function cfg(){let saved={};try{saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')}catch{};return{repo:String(saved.templateRepo||'plzsayyes3/mynotebook'),branch:String(saved.templateBranch||'main'),folder:String(saved.templateFolder||'09_taskchute').replace(/^\/+|\/+$/g,''),token:String(localStorage.getItem(TOKEN_KEY)||'')}}
function splitRepo(repo){const p=repo.split('/').filter(Boolean);if(p.length!==2)throw new Error('Repository設定は owner/repo 形式が必要です');return p}
function headers(){const c=cfg(),h={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};if(c.token)h.Authorization=`Bearer ${c.token}`;return h}
function endpoint(path){const c=cfg(),[o,r]=splitRepo(c.repo);return`https://api.github.com/repos/${encodeURIComponent(o)}/${encodeURIComponent(r)}${path}`}
function decode(text){const bin=atob(String(text||'').replace(/\s/g,'')),bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)}
function encode(text){const bytes=new TextEncoder().encode(text);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin)}
async function gh(path,options={}){const method=String(options.method||'GET').toUpperCase(),request={...options,headers:{...headers(),...(options.headers||{})}};if(method==='GET')request.cache='no-store';const r=await fetch(endpoint(path),request);if(r.status===404)return null;if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.message||`GitHub API ${r.status}`)}return r.status===204?{}:r.json()}
function base(){return`${cfg().folder}/templates`}
function apiPath(path){return`/contents/${path.split('/').map(encodeURIComponent).join('/')}`}
async function listDir(path){const c=cfg();return await gh(`${apiPath(path)}?ref=${encodeURIComponent(c.branch)}`)||[]}
async function readFile(path){const c=cfg(),d=await gh(`${apiPath(path)}?ref=${encodeURIComponent(c.branch)}`);return d?.sha?{text:decode(d.content||''),sha:d.sha}:null}
async function putFile(path,content,message,options={}){const c=cfg();if(!c.token)throw new Error('TaskLiner設定のGitHub Tokenが必要です');const current=await readFile(path),hasExpected=Object.prototype.hasOwnProperty.call(options,'expectedSha'),currentSha=current?.sha||'',expectedSha=String(options.expectedSha||'');if(hasExpected&&currentSha!==expectedSha)throw new Error('GitHub側のファイルが更新されています。再読込してからもう一度実行してください。');const body={message,content:encode(content),branch:c.branch};if(current?.sha)body.sha=current.sha;return gh(apiPath(path),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
async function deleteFile(path,message){const c=cfg();if(!c.token)throw new Error('TaskLiner設定のGitHub Tokenが必要です');const current=await readFile(path);if(!current?.sha)return false;await gh(apiPath(path),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,sha:current.sha,branch:c.branch})});return true}
async function loadCollection(sub,parser,options={}){const label=String(options.label||sub),strict=!!options.strict,list=await listDir(`${base()}/${sub}`);if(!Array.isArray(list))throw new Error(`${label}一覧を取得できませんでした`);const files=list.filter(x=>x.type==='file'&&/\.md$/i.test(x.name||'')),out=[],failures=[];for(const item of files){try{const file=await readFile(item.path);if(!file)throw new Error('ファイルが見つかりません');const obj=parser(file.text||'');if(!obj.id)throw new Error('idがありません');out.push({...obj,_path:item.path,_sha:file.sha})}catch(e){console.warn(item.path,e);failures.push({path:item.path,message:e?.message||String(e)})}}if(strict&&failures.length){const detail=failures.slice(0,3).map(x=>x.path.split('/').pop()).join(', '),more=failures.length>3?` ほか${failures.length-3}件`:'';throw new Error(`${label} ${files.length}件中${failures.length}件の読込に失敗しました: ${detail}${more}`)}return out}
function readMasterCache(){try{const x=JSON.parse(localStorage.getItem(MASTER_CACHE_KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
function writeMasterCache(masters,meta={}){const clean=(Array.isArray(masters)?masters:[]).filter(m=>m&&m.id&&m.title).map(m=>({id:String(m.id),title:String(m.title),aliases:Array.isArray(m.aliases)?m.aliases.map(String):[],status:String(m.status||'active'),estimate:Math.max(0,Math.round(Number(m.estimate)||0))}));localStorage.setItem(MASTER_CACHE_KEY,JSON.stringify(clean));localStorage.setItem(MASTER_CACHE_META_KEY,JSON.stringify({...meta,count:clean.length,pulled_at:new Date().toISOString()}));return clean}
function getMasterCacheMeta(){try{return JSON.parse(localStorage.getItem(MASTER_CACHE_META_KEY)||'{}')}catch{return{}}}
async function pullMasters(){const f=await readFile(`${base()}/master-index.json`);if(!f?.text)throw new Error('master-index.json がありません');let payload;try{payload=JSON.parse(f.text)}catch{throw new Error('master-index.json を解析できません')};const masters=Array.isArray(payload)?payload:Array.isArray(payload?.masters)?payload.masters:[];return writeMasterCache(masters,{generated_at:payload?.generated_at||'',version:payload?.version||1,source:'github-index'})}
async function loadMasters(){const cached=readMasterCache();if(cached.length)return cached;try{return await pullMasters()}catch(e){console.warn('Master index pull failed; fallback to individual Markdown',e);const fallback=await loadCollection('masters',TL.parseMasterMarkdown);return writeMasterCache(fallback,{source:'github-fallback'})}}
async function loadRepeats(){return loadCollection('repeats',TL.parseRepeatMarkdown,{strict:true,label:'Repeat'})}
async function saveMaster(master){const result=await putFile(`${base()}/masters/${master.id}.md`,TL.serializeMaster(master),`TaskLiner master: ${master.title}`);const cached=readMasterCache(),i=cached.findIndex(x=>x.id===master.id),next={id:master.id,title:master.title,aliases:master.aliases||[],status:master.status||'active',estimate:Math.max(0,Math.round(Number(master.estimate)||0))};if(i>=0)cached[i]=next;else cached.push(next);writeMasterCache(cached,{...getMasterCacheMeta(),source:'local-after-save'});return result}
async function deleteMaster(masterId){if(!masterId)throw new Error('Master IDがありません');const deleted=await deleteFile(`${base()}/masters/${masterId}.md`,`Delete TaskLiner master: ${masterId}`);const cached=readMasterCache().filter(x=>x.id!==masterId);writeMasterCache(cached,{...getMasterCacheMeta(),source:'local-after-delete'});const recent=recentIds().filter(x=>x!==masterId);localStorage.setItem(RECENT_KEY,JSON.stringify(recent));return deleted}
async function saveRepeat(repeat,options={}){return putFile(`${base()}/repeats/${repeat.id}.md`,TL.serializeRepeat(repeat),`TaskLiner repeat: ${repeat.id}`,options)}
function reviewMarkdown(review){return`---\ntype: task-master-review\nid: ${JSON.stringify(review.id)}\nsource_master_id: ${JSON.stringify(review.source_master_id)}\nstatus: ${JSON.stringify(review.status||'pending')}\ntarget_master_id: ${JSON.stringify(review.target_master_id||'')}\nlast_merged_master_id: ${JSON.stringify(review.last_merged_master_id||'')}\ncandidate_master_ids:\n${(review.candidate_master_ids||[]).map(x=>`  - ${JSON.stringify(x)}`).join('\n')}\n---\n`}
function parseReview(text,path=''){
  const id=(text.match(/^id:\s*"?([^"\n]+)"?/m)||[])[1]||path.split('/').pop()?.replace(/\.md$/,'')||'';
  const source=(text.match(/^source_master_id:\s*"?([^"\n]+)"?/m)||[])[1]||'';
  const status=(text.match(/^status:\s*"?([^"\n]+)"?/m)||[])[1]||'pending';
  const target=(text.match(/^target_master_id:\s*"?([^"\n]*)"?/m)||[])[1]||'';
  const lastMerged=(text.match(/^last_merged_master_id:\s*"?([^"\n]*)"?/m)||[])[1]||'';
  const block=(text.match(/^candidate_master_ids:\s*\n((?:\s+-.*\n?)*)/m)||[])[1]||'';
  let ids=[...block.matchAll(/^\s*-\s*"?([^"\n]+)"?/gm)].map(m=>m[1].trim()).filter(Boolean);
  if(!ids.length){
    const fmEnd=String(text||'').indexOf('\n---',4),body=fmEnd>=0?String(text||'').slice(fmEnd+4):'';
    ids=[...body.matchAll(/^\s*-\s*"?([^"\n]+)"?/gm)].map(m=>m[1].trim()).filter(Boolean);
  }
  return{id:id.trim(),source_master_id:source.trim(),status:status.trim(),target_master_id:target.trim(),last_merged_master_id:lastMerged.trim(),candidate_master_ids:[...new Set(ids)],_path:path}
}
async function loadReviews(){let list=[];try{list=await listDir(`${base()}/review`)}catch{return[]};if(!Array.isArray(list))return[];const out=[];for(const item of list.filter(x=>x.type==='file'&&/\.md$/i.test(x.name||''))){const f=await readFile(item.path);if(f?.text)out.push(parseReview(f.text,item.path))}return out}
async function saveReview(review){return putFile(`${base()}/review/${review.id}.md`,reviewMarkdown(review),`TaskLiner review: ${review.id}`)}
async function mergeMasters(target,absorbed,repeats=[],review=null){
  if(!target?.id||!absorbed?.id||target.id===absorbed.id)throw new Error('Merge対象が正しくありません');
  const merged=TL.mergeMasterRecords(target,absorbed);
  await saveMaster(merged);
  const moved=[];
  for(const repeat of (Array.isArray(repeats)?repeats:[]).filter(r=>r.master_id===absorbed.id)){
    const next={...repeat,master_id:merged.id};await saveRepeat(next);moved.push(next);
  }
  const archived={...absorbed,status:'archived'};await saveMaster(archived);
  let savedReview=review;
  if(review){
    const remaining=(review.candidate_master_ids||[]).filter(id=>id!==absorbed.id&&id!==merged.id);
    savedReview={...review,source_master_id:merged.id,candidate_master_ids:remaining,target_master_id:merged.id,last_merged_master_id:absorbed.id,status:remaining.length?'pending':'merged'};
    await saveReview(savedReview);
  }
  return{target:merged,absorbed:archived,repeats:moved,review:savedReview};
}
function recentIds(){try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]')}catch{return[]}}
function markRecent(masterId){if(!masterId)return;const ids=[masterId,...recentIds().filter(x=>x!==masterId)].slice(0,500);localStorage.setItem(RECENT_KEY,JSON.stringify(ids))}
function sortMastersRecent(masters){const pos=new Map(recentIds().map((id,i)=>[id,i]));return[...masters].sort((a,b)=>(pos.get(a.id)??999999)-(pos.get(b.id)??999999)||String(a.title).localeCompare(String(b.title),'ja'))}
async function createReviewFor(master,masters){const candidates=TL.findSimilarMasters(master.title,masters.filter(x=>x.id!==master.id)).slice(0,5);if(!candidates.length)return null;const review={id:TL.id('review'),source_master_id:master.id,status:'pending',candidate_master_ids:candidates.map(x=>x.master.id)};await saveReview(review);return review}
function wikiDisplayText(value){return String(value??'').replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,(_,target,label)=>String(label||target).trim())}
const wikiRoots=new WeakSet();
function installWikiDisplay(root){
  if(!root||wikiRoots.has(root))return;wikiRoots.add(root);
  const doc=root.nodeType===9?root:root.ownerDocument;if(!doc)return;
  const blocked=el=>el?.closest?.('script,style,textarea,input,select,option,pre,code,[contenteditable="true"]');
  const cleanText=node=>{if(node?.nodeType!==3||blocked(node.parentElement))return;const before=node.nodeValue||'';if(!before.includes('[['))return;const after=wikiDisplayText(before);if(after!==before)node.nodeValue=after};
  const attachFrame=frame=>{if(!frame||frame.tagName!=='IFRAME')return;const attach=()=>{try{if(frame.contentDocument)installWikiDisplay(frame.contentDocument)}catch{}};frame.addEventListener('load',attach);attach()};
  const scan=node=>{if(!node)return;if(node.nodeType===3){cleanText(node);return}if(node.nodeType!==1&&node.nodeType!==9&&node.nodeType!==11)return;if(node.nodeType===1&&blocked(node))return;if(node.nodeType===1&&node.tagName==='IFRAME')attachFrame(node);const walker=doc.createTreeWalker(node,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let n;while((n=walker.nextNode())){if(n.nodeType===3)cleanText(n);else if(n.tagName==='IFRAME')attachFrame(n)}};
  const target=doc.body||doc.documentElement;if(!target)return;scan(target);
  const observer=new MutationObserver(records=>{for(const rec of records){if(rec.type==='characterData')cleanText(rec.target);for(const node of rec.addedNodes||[])scan(node)}});observer.observe(target,{subtree:true,childList:true,characterData:true});
}

window.TaskLinerTemplateStore={cfg,base,listDir,readFile,putFile,deleteFile,loadMasters,pullMasters,readMasterCache,writeMasterCache,getMasterCacheMeta,loadRepeats,saveMaster,deleteMaster,saveRepeat,loadReviews,saveReview,mergeMasters,markRecent,sortMastersRecent,createReviewFor,wikiDisplayText,installWikiDisplay};
})();
return window.TaskLinerTemplateStore;
}
