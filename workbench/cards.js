(() => {
  'use strict';
  const M=window.COCKPID_SCRAP_MODEL;
  const $=id=>document.getElementById(id);
  const store=window.COCKPID_SCRAP_STORE.createStore({token,fetch:window.fetch.bind(window),inboxSource:()=>window.COCKPID_SOURCES.get('inbox'),dailySource:()=>window.COCKPID_SOURCES.get('daily')});
  const PIN_KEY='cockpid.cards.pins.v1',DRAFT_KEY='cockpid.cards.inbox-draft.v1';
  const readLocal=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const saveLocal=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Draft remains in input. */}};
  let pins=readLocal(PIN_KEY,[]);if(!Array.isArray(pins))pins=[];
  const state={captures:[],ideas:[],selected:[],context:'',handled:false,loading:false,queue:[],uploading:false,detail:null,detailBusy:false,inboxBusy:false,inboxAttempt:null,warnings:[]};
  const imageUrls=new Map(),imageRequests=new Map();
  let toastTimer;
  const safeText=value=>String(value??'');
  function node(tag,className,text) {const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
  function button(text,handler,className='') {const b=node('button',className,text);b.type='button';b.addEventListener('click',handler);return b;}
  function message(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
  function setStatus(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
  function plain(markdown) {
    return safeText(markdown).replace(/^---\n[\s\S]*?\n---\n?/,'').replace(/```[\s\S]*?```/g,'').replace(/^#{1,6}\s+/gm,'').replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').trim();
  }
  function reportSources() {
    const summary=state.context.trim()?'Ideaは最近2週間の記録から選んでいます。':'最近の記録がないため、Ideaはランダムに選んでいます。';
    setStatus('sourceStatus',[summary,...state.warnings].join('\n'),Boolean(state.warnings.length));
  }
  function selectIdeas(){state.selected=M.selectIdeas(state.ideas,state.context,{limit:10,pinned:pins});}
  async function getImage(card) {
    if(imageUrls.has(card.image_path))return imageUrls.get(card.image_path);
    if(!imageRequests.has(card.image_path))imageRequests.set(card.image_path,store.image(card).then(blob=>{
      const url=URL.createObjectURL(blob);imageUrls.set(card.image_path,url);return url;
    }).finally(()=>imageRequests.delete(card.image_path)));
    return imageRequests.get(card.image_path);
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);entry.target.loadImage?.();}});
  },{rootMargin:'200px'}):null;
  function imageElement(card,detail=false) {
    const holder=node('div',detail?'':'card-image');
    const placeholder=node('span','image-placeholder','画像を読込中…');
    const target=detail?holder:button('',()=>openDetail(card));
    if(!detail)holder.append(target);
    target.append(placeholder);
    const load=async()=>{
      try{const url=await getImage(card);const img=node('img',detail?'detail-image':'');img.alt=card.title||'画像メモ';img.src=url;img.decoding='async';target.replaceChildren(img);}
      catch{placeholder.textContent='画像を再読込';const retry=button('再読込',()=>{target.replaceChildren(placeholder);load();});if(detail)target.replaceChildren(retry);else {placeholder.textContent='画像を開いて再読込';}}
    };
    holder.loadImage=load;
    if(detail||!observer)load();else observer.observe(holder);
    return holder;
  }
  function replaceCapture(card){const i=state.captures.findIndex(c=>c.id===card.id);if(i>=0)state.captures[i]=card;else state.captures.unshift(card);}
  async function toggleHandled(card,input) {
    input.disabled=true;
    try {const next=await store.updateCapture(card.path,{handled:input.checked});replaceCapture(next);render();message(next.handled?'チェック済みに片付けました。':'未チェックに戻しました。');}
    catch(e){input.checked=card.handled;message(`変更できませんでした。${e.message}`);}
    finally{input.disabled=false;}
  }
  function captureCard(card) {
    const article=node('article','card capture-card');article.append(imageElement(card));
    const content=node('div','card-content'),meta=node('div','card-meta');
    meta.append(node('span','','画像メモ'),node('span','',card.handled?'チェック済み':'手元に'));
    content.append(meta,button(card.title||'画像メモ',()=>openDetail(card),'card-title'));
    if(card.memo)content.append(node('p','card-text',card.memo));
    const bottom=node('div','card-bottom'),label=node('label','handled-control');
    label.title='必要なことを済ませた／もう残さなくてよい';
    const input=document.createElement('input');input.type='checkbox';input.checked=card.handled;input.setAttribute('aria-label',`${card.title||'画像メモ'}を${card.handled?'未チェックに戻す':'チェック済みにする'}`);input.addEventListener('change',()=>toggleHandled(card,input));
    label.append(input,node('span','',card.handled?'未チェックに戻す':'扱い終えた'));
    bottom.append(label,node('span','card-date',card.created_at.slice(0,10).replace(/-/g,'.')));content.append(bottom);article.append(content);return article;
  }
  function ideaCard(idea) {
    const article=node('article','card idea-card'),content=node('div','card-content'),meta=node('div','card-meta');
    meta.append(node('span','','IDEA'),node('span','',idea.reason));
    content.append(meta,button(idea.title||'Idea',()=>openDetail(idea,true),'card-title'),node('p','card-text',plain(idea.body_markdown)));
    const bottom=node('div','card-bottom');
    const pin=button(pins.includes(idea.id)?'固定中':'固定する',()=>{
      pins=pins.includes(idea.id)?pins.filter(id=>id!==idea.id):[...pins,idea.id];saveLocal(PIN_KEY,pins);
      // Pin does not reshuffle other cards.
      state.selected=state.selected.map(i=>i.id===idea.id?{...i,reason:pins.includes(i.id)?'固定':i.score?'最近の記録と関連':'ランダム'}:i);render();
    },'pin-button');pin.setAttribute('aria-pressed',String(pins.includes(idea.id)));
    bottom.append(node('span','match-label',idea.matched?.length?idea.matched.join('・'):'思いがけない寄り道'),pin);content.append(bottom);article.append(content);return article;
  }
  function render() {
    observer?.disconnect();
    const captures=M.visibleCaptures(state.captures,state.handled);
    $('openCount').textContent=state.captures.filter(c=>!c.handled).length;
    $('unhandledTab').setAttribute('aria-pressed',String(!state.handled));$('handledTab').setAttribute('aria-pressed',String(state.handled));
    $('boardCaption').textContent=state.handled?'扱い終えたカード。いつでも手元に戻せます。':'撮ったままのスクショに、もう一度出会う。';
    const fragment=document.createDocumentFragment();
    const ideas=state.handled?[]:[...state.selected];
    captures.forEach((card,index)=>{fragment.append(captureCard(card));if((index+1)%3===0 && ideas.length)fragment.append(ideaCard(ideas.shift()));});
    ideas.forEach(idea=>fragment.append(ideaCard(idea)));
    $('cardGrid').replaceChildren(fragment);
    $('emptyState').hidden=Boolean(captures.length+ideas.length)||state.loading;
    if(state.handled && !captures.length){$('emptyState').hidden=false;$('emptyState').querySelector('h2').textContent='チェック済みのカードはありません。';}
    else $('emptyState').querySelector('h2').textContent='気になったものを、ここへ。';
    $('refreshIdeas').hidden=state.handled;
  }
  function closeDetail() {if(!state.detailBusy)$('detailDialog').close();}
  async function openDetail(item,isIdea=false) {
    state.detail=item;
    const body=$('detailBody'),actions=$('detailActions');body.replaceChildren();actions.replaceChildren();setStatus('detailStatus','');
    $('detailHeading').textContent=isIdea?item.title:'画像メモ';
    if(isIdea){body.append(node('p','match-label',item.reason),node('div','detail-prose',item.body_markdown||item.title));actions.append(button('閉じる',closeDetail));}
    else {
      body.append(imageElement(item,true));
      const fields=node('div','detail-fields'),titleLabel=node('label','','タイトル'),memoLabel=node('label','','メモ');
      titleLabel.htmlFor='detailTitle';memoLabel.htmlFor='detailMemo';
      const title=node('input');title.type='text';title.id='detailTitle';title.maxLength=300;title.value=item.title;
      const memo=node('textarea');memo.id='detailMemo';memo.value=item.memo;
      fields.append(titleLabel,title,memoLabel,memo);body.append(fields);
      actions.append(button('閉じる',closeDetail));
      const save=button('変更を保存',async()=>{
        if(state.detailBusy)return;state.detailBusy=true;save.disabled=true;$('closeDetail').disabled=true;
        const edits=M.captureEdits(item,{title:title.value.trim(),memo:memo.value});
        try{const next=await store.updateCapture(item.path,edits);replaceCapture(next);render();$('detailDialog').close();message('メモを保存しました。');}
        catch(e){setStatus('detailStatus',`保存できませんでした。入力は残っています。${e.message}`,true);}
        finally{state.detailBusy=false;save.disabled=false;$('closeDetail').disabled=false;}
      },'primary');actions.append(save);
    }
    $('detailDialog').showModal();
  }
  function fileBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('画像を読み込めませんでした。'));reader.readAsDataURL(file);});}
  function addFiles(files) {
    if(state.uploading){message('保存が終わってから画像を追加できます。');return;}
    const errors=[];
    for(const file of Array.from(files)) {
      try {
        M.validateFile(file);
        const id=crypto.randomUUID();
        const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'})[file.type];
        state.queue.push({file,url:URL.createObjectURL(file),card:{id,title:file.name.replace(/\.[^.]+$/,''),memo:'',created_at:new Date().toISOString(),handled:false,image_path:`03_scrap/assets/${id}.${ext}`,image_type:file.type},saved:false,error:''});
      }catch(e){errors.push(`${file.name}: ${e.message}`);}
    }
    if(!state.queue.length){message(errors.join('\n')||'画像を選んでください。');return;}
    renderUploads();setStatus('uploadStatus',errors.join('\n'),errors.length>0);
    if(!$('uploadDialog').open)$('uploadDialog').showModal();
  }
  function renderUploads() {
    const list=$('uploadItems');list.replaceChildren();
    state.queue.forEach(q=>{
      const row=node('section',`upload-item${q.saved?' upload-done':''}`),img=node('img');img.src=q.url;img.alt=q.file.name;
      const fields=node('div'),label=node('label','','タイトル'),title=node('input');title.type='text';title.value=q.card.title;title.maxLength=300;title.disabled=q.saved||state.uploading;title.setAttribute('aria-label',`${q.file.name}のタイトル`);title.addEventListener('input',()=>q.card.title=title.value);
      const memo=node('textarea');memo.value=q.card.memo;memo.placeholder='気になった理由・あとでやりたいこと';memo.setAttribute('aria-label',`${q.file.name}のメモ`);memo.disabled=q.saved||state.uploading;memo.addEventListener('input',()=>q.card.memo=memo.value);
      fields.append(label,title,memo,node('p','upload-name',q.saved?'保存済み':`${q.file.name} · ${(q.file.size/1024/1024).toFixed(1)} MB`));
      if(q.error)fields.append(node('p','upload-error',q.error));row.append(img,fields);list.append(row);
    });
  }
  async function saveUploads() {
    if(state.uploading)return;state.uploading=true;$('saveUploads').disabled=true;$('closeUpload').disabled=true;
    renderUploads();
    const total=state.queue.filter(q=>!q.saved).length;let done=0,failed=0;
    try {
      for(const q of state.queue.filter(q=>!q.saved)) {
        q.error='';setStatus('uploadStatus',`保存中 ${++done} / ${total} …`);
        try {
          const base64=await fileBase64(q.file);
          let saved=await store.createCapture({...q.card,title:q.card.title.trim()},base64);
          const retryEdits=M.captureEdits(saved,{title:q.card.title.trim(),memo:q.card.memo});
          if(Object.keys(retryEdits).length)saved=await store.updateCapture(saved.path,retryEdits);
          q.saved=true;replaceCapture(saved);
        }catch(e){failed++;q.error=`保存できませんでした。同じカードで再試行できます。${e.message}`;}
      }
      renderUploads();render();
      if(!failed){state.queue.forEach(q=>URL.revokeObjectURL(q.url));state.queue=[];$('uploadDialog').close();message(`${total}枚のカードを追加しました。`);}
      else setStatus('uploadStatus',`${failed}枚は未保存です。「カードを保存」で再試行できます。`,true);
    } finally {state.uploading=false;renderUploads();$('saveUploads').disabled=false;$('closeUpload').disabled=false;}
  }
  async function submitInbox(event) {
    event?.preventDefault();if(state.inboxBusy)return;
    const input=$('inboxText'),text=input.value.trim();if(!text)return;
    if(!state.inboxAttempt || state.inboxAttempt.text!==text)state.inboxAttempt={text,name:`${legacyMemoStamp()}.md`};
    const attempt=state.inboxAttempt;
    state.inboxBusy=true;$('sendInbox').disabled=true;setStatus('inboxStatus','保存しています…');
    try {
      await store.saveInbox(text,{name:attempt.name});
      if(input.value.trim()===text){input.value='';saveLocal(DRAFT_KEY,'');}
      state.inboxAttempt=null;setStatus('inboxStatus','INBOXへ追加しました。');input.focus();
    }catch(e){setStatus('inboxStatus',`保存できませんでした。入力は残っています。${e.message}`,true);}
    finally{state.inboxBusy=false;$('sendInbox').disabled=false;}
  }
  $('addImages').addEventListener('click',()=>state.queue.length?$('uploadDialog').showModal():$('imageFiles').click());
  $('emptyAdd').addEventListener('click',()=>$('imageFiles').click());
  $('imageFiles').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
  $('saveUploads').addEventListener('click',saveUploads);
  $('closeUpload').addEventListener('click',()=>{if(!state.uploading)$('uploadDialog').close();});
  $('uploadDialog').addEventListener('cancel',event=>{if(state.uploading)event.preventDefault();});
  $('closeDetail').addEventListener('click',closeDetail);
  $('detailDialog').addEventListener('cancel',event=>{if(state.detailBusy)event.preventDefault();});
  $('unhandledTab').addEventListener('click',()=>{state.handled=false;render();});
  $('handledTab').addEventListener('click',()=>{state.handled=true;render();});
  $('refreshIdeas').addEventListener('click',async()=>{
    const b=$('refreshIdeas');if(b.disabled)return;b.disabled=true;
    try {
      const results=await Promise.allSettled([store.loadIdeas(),store.recentContext()]);
      const warnings=[];
      if(results[0].status==='fulfilled')state.ideas=results[0].value;else warnings.push('Ideaを更新できませんでした。前の表示を残しています。');
      if(results[1].status==='fulfilled'){state.context=results[1].value.text;if(results[1].value.warnings.length)warnings.push('最近の記録の一部を読み込めませんでした。');}else warnings.push('最近の記録を更新できませんでした。');
      state.warnings=warnings;selectIdeas();render();reportSources();
    }finally{b.disabled=false;}
  });
  $('toggleInbox').addEventListener('click',()=>{const open=document.body.classList.toggle('inbox-open');$('toggleInbox').setAttribute('aria-expanded',String(open));if(open)$('inboxText').focus();});
  $('inboxText').value=readLocal(DRAFT_KEY,'');
  $('inboxText').addEventListener('input',()=>saveLocal(DRAFT_KEY,$('inboxText').value));
  $('inboxText').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)&&!e.isComposing){e.preventDefault();submitInbox();}});
  $('inboxForm').addEventListener('submit',submitInbox);
  document.addEventListener('paste',event=>{
    if($('uploadDialog').open || $('detailDialog').open)return;
    const images=Array.from(event.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));
    if(images.length){event.preventDefault();addFiles(images);}
  });
  let dragDepth=0;
  document.addEventListener('dragenter',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files')){event.preventDefault();dragDepth++;document.body.classList.add('drag-over');}});
  document.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();});
  document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;document.body.classList.remove('drag-over');}});
  document.addEventListener('drop',event=>{dragDepth=0;document.body.classList.remove('drag-over');if(event.dataTransfer?.files.length){event.preventDefault();if(!$('detailDialog').open)addFiles(event.dataTransfer.files);}});
  window.addEventListener('beforeunload',event=>{if(state.uploading||state.queue.some(q=>!q.saved)){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{for(const url of imageUrls.values())URL.revokeObjectURL(url);imageUrls.clear();});
  async function boot() {
    if(!token()){setStatus('sourceStatus','作業台の設定でGitHub tokenを設定してください。',true);render();return;}
    state.loading=true;$('refreshIdeas').disabled=true;
    const results=await Promise.allSettled([store.list(),store.loadIdeas(),store.recentContext()]);
    if(results[0].status==='fulfilled'){state.captures=results[0].value.cards;if(results[0].value.warnings.length)state.warnings.push('一部の画像カードを読み込めませんでした。再読込で確認してください。');}
    else state.warnings.push(`画像カードを読み込めませんでした。${results[0].reason.message}`);
    if(results[1].status==='fulfilled')state.ideas=results[1].value;else state.warnings.push(`Ideaを読み込めませんでした。${results[1].reason.message}`);
    if(results[2].status==='fulfilled'){state.context=results[2].value.text;if(results[2].value.warnings.length)state.warnings.push('最近の記録の一部を読み込めませんでした。');}
    else state.warnings.push('最近の記録を読み込めませんでした。Ideaはランダムで選びます。');
    state.loading=false;$('refreshIdeas').disabled=false;selectIdeas();render();reportSources();
  }
  boot();
})();
