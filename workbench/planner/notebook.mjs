import {createDailyView} from './daily-view.mjs';
import './inbox-store.js';
export function createNotebook(container){
 const doc=container.ownerDocument,element=doc.createElement('div');element.style.cssText='height:100%;min-height:0';const root=element.attachShadow({mode:'open'});
 root.innerHTML=`<link rel="stylesheet" href="${new URL('./notebook.css?v=20261114-menu400',import.meta.url)}"><section class="notebook"><main><section id="write"><header><strong>Inboxに書く</strong><span id="state" role="status">端末に下書き</span></header><textarea id="editor" aria-label="Inboxのメモ" placeholder="思いついたことを、ここへ。" spellcheck="false"></textarea><footer><span id="message" role="status">⌘ / Ctrl + Enter で送信</span><button id="send">Inboxへ送る</button></footer></section><section id="inbox" hidden><header><strong>Inbox</strong><button id="refresh">更新</button></header><div id="entries"></div><pre id="preview"></pre></section><section id="daily" hidden></section><section id="display" hidden><header><strong>表示調整 · v3</strong><button id="resetLayout" type="button">初期値に戻す</button></header><div class="tune-help">数値をスクリーンショットで共有できます。変更は即時反映・保存されます。</div><label>手帳全体を右へ <output id="shiftValue"></output><input id="shift" aria-label="手帳全体を右へ" type="range" min="0" max="120" step="4"></label><label>右側メニューを下へ <output id="railTopValue"></output><input id="railTop" aria-label="右側メニューを下へ" type="range" min="0" max="400" step="4"></label><label>右端の余白 <output id="insetValue"></output><input id="inset" aria-label="右端の余白" type="range" min="0" max="96" step="4"></label><p>現在値：<strong id="layoutValues"></strong></p><p>メニューがOSの表示に近づく場合は右端の余白を増やしてください。</p></section></main><nav aria-label="右ページの切替"><button type="button" data-mode="write" aria-label="書く"><span class="rail-icon" aria-hidden="true">✎</span><span class="rail-text">書く</span></button><button type="button" data-mode="inbox" aria-label="Inbox"><span class="rail-icon" aria-hidden="true">☷</span><span class="rail-text">Inbox</span></button><button type="button" data-mode="daily" aria-label="Daily"><span class="rail-icon" aria-hidden="true">▤</span><span class="rail-text">Daily</span></button><button type="button" data-mode="display" aria-label="表示調整"><span class="rail-icon" aria-hidden="true">⚙</span><span class="rail-text">調整</span></button></nav></section>`;
 container.append(element);const $=id=>root.getElementById(id),editor=$('editor');let mode='write',daily=null,visible=true,composing=false,pendingMode=null,pendingClear=null,listGeneration=0;
 const store=globalThis.DuoInboxStore.createStore({storage:localStorage,fetch:globalThis.fetch.bind(globalThis),source:()=>globalThis.COCKPID_SOURCES?.get('inbox')||{repo:'mynotebook',dir:'00_inbox'},token:()=>localStorage.getItem('zen-note-github-token')||''});
 try{editor.value=store.draft().text}catch(error){$('message').textContent=error.message}
 editor.addEventListener('input',()=>{try{store.edit(editor.value);$('state').textContent='端末に下書き'}catch{$('state').textContent='端末保存に失敗・画面を閉じずコピーしてください'}});
 async function send(){if(composing)return;const sentText=editor.value;$('send').disabled=true;try{store.edit(editor.value);$('state').textContent='送信中…';const result=await store.send();if(result.remaining===''){if(composing)pendingClear=sentText;else if(editor.value===sentText)editor.value='';}$('state').textContent='Inboxに保存しました';$('message').textContent='送信済みのメモはInboxで確認できます。'}catch(error){$('state').textContent='未送信';$('message').textContent=error.message}finally{$('send').disabled=false}}
 $('send').onclick=send;editor.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)&&!event.isComposing){event.preventDefault();send()}});
 async function loadList(){const generation=++listGeneration;$('entries').textContent='読込中…';$('preview').textContent='';try{const rows=await store.list();if(generation!==listGeneration)return;$('entries').replaceChildren();if(!rows.length)$('entries').textContent='未整理のメモはありません。';for(const row of rows){const button=doc.createElement('button');button.className='entry';button.textContent=row.name.replace('.md','');button.onclick=async()=>{const readGeneration=++listGeneration;$('preview').textContent='読込中…';try{const text=await store.read(row);if(readGeneration===listGeneration)$('preview').textContent=text}catch(error){if(readGeneration===listGeneration)$('preview').textContent=error.message}};$('entries').append(button)}}catch(error){if(generation===listGeneration)$('entries').textContent=error.message}}
 function changeMode(next){if(composing||daily?.isComposing()){pendingMode=next;(root.activeElement?.shadowRoot?.activeElement||root.activeElement)?.blur();return}mode=next;for(const name of ['write','inbox','daily','display'])$(name).hidden=name!==mode;for(const button of root.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));if(mode==='daily'&&!daily)daily=createDailyView($('daily'));daily?.setVisible(visible&&mode==='daily');if(mode==='inbox')loadList()}
 for(const button of root.querySelectorAll('[data-mode]'))button.onclick=()=>changeMode(button.dataset.mode);
 root.addEventListener('compositionstart',()=>{composing=true});root.addEventListener('compositionend',()=>{composing=false;if(pendingClear!==null){if(editor.value===pendingClear)editor.value='';pendingClear=null;try{store.edit(editor.value)}catch{}}if(pendingMode){const next=pendingMode;pendingMode=null;queueMicrotask(()=>changeMode(next))}});
 $('refresh').onclick=loadList;
 const controls=[
  {id:'shift',key:'cockpid.planner.horizontal-shift.v1',css:'--planner-shift-x',max:120},
  {id:'railTop',key:'cockpid.planner.rail-top.v1',css:'--planner-rail-top',max:400},
  {id:'inset',key:'cockpid.planner.right-inset.v1',css:'--planner-extra-right',max:96}
 ];
 function clamp(value,max){const number=Number(value);return Number.isFinite(number)?Math.min(max,Math.max(0,Math.round(number/4)*4)):0}
 function applyLayout(){
  for(const control of controls){
   const value=clamp($(control.id).value,control.max);
   $(control.id).value=String(value);
   doc.documentElement.style.setProperty(control.css,value+'px');
   $(control.id+'Value').textContent=value+'px';
   try{localStorage.setItem(control.key,String(value))}catch{}
  }
  $('layoutValues').textContent='右へ '+$('shift').value+'px ／ メニュー下 '+$('railTop').value+'px ／ 右余白 '+$('inset').value+'px';
 }
 for(const control of controls){
  let value=0;try{value=clamp(localStorage.getItem(control.key),control.max)}catch{}
  $(control.id).value=String(value);
  $(control.id).addEventListener('input',applyLayout);
 }
 $('resetLayout').onclick=()=>{for(const control of controls)$(control.id).value='0';applyLayout()};
 applyLayout();changeMode(mode);
 return{element,getDate:()=>daily?.getDate(),isComposing:()=>composing||!!daily?.isComposing(),setVisible(value){visible=value;daily?.setVisible(value&&mode==='daily')}};
}
