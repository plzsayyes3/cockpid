import {mount as mountTaskliner} from '../taskliner/controller.mjs?v=20261114-fit';
import {createNotebook} from './notebook.mjs?v=20261114-calibration2';
import './layout.js';

let instance;
export function mount(container){
  if(!instance)instance=createPlanner(container.ownerDocument);
  container.replaceChildren(instance.element);
  instance.attachTaskliner();instance.setVisible(true);return instance;
}
function createPlanner(ownerDocument){
  const element=ownerDocument.createElement('div');element.dataset.planner='native';element.style.cssText='height:100%;min-height:0';
  const root=element.attachShadow({mode:'open'});
  root.innerHTML=`<link rel="stylesheet" href="${new URL('./planner.css',import.meta.url)}"><div class="planner" aria-label="システム手帳"><section class="planner-panel" data-side="tasks" aria-label="タスクのページ"><div class="page-content" id="tasks"></div><button class="page-band" id="taskBand" type="button" aria-label="タスクを大きく開く" aria-expanded="false"><span>タスク</span><span aria-hidden="true">‹</span></button></section><section class="planner-panel" data-side="memo" aria-label="メモのページ"><div class="page-content" id="memo"></div><button class="page-band" id="memoBand" type="button" aria-label="メモを大きく開く" aria-expanded="false"><span>メモ</span><span aria-hidden="true">›</span></button></section></div>`;
  const $=id=>root.getElementById(id),book=root.querySelector('.planner'),panels=[...root.querySelectorAll('.planner-panel')];
  const daily=createNotebook($('memo'));let taskliner=null,visible=false,focus='tasks',composing=false,pendingFocus=null;
  try{focus=localStorage.getItem('cockpid.planner.focus.v1')==='memo'?'memo':'tasks'}catch{}
  function draw(){
    const width=element.getBoundingClientRect().width;
    const state=globalThis.DuoPlannerLayout.layout(width,focus);
    taskliner?.setVisible(visible&&state.collapsed!=='tasks');daily.setVisible(visible&&state.collapsed!=='memo');
    book.dataset.mode=state.mode;book.dataset.focus=focus;book.style.gridTemplateColumns=state.columns;
    for(const panel of panels){
      const side=panel.dataset.side,collapsed=state.collapsed===side,content=panel.querySelector('.page-content'),band=panel.querySelector('.page-band');
      panel.classList.toggle('collapsed',collapsed);content.inert=collapsed;content.setAttribute('aria-hidden',String(collapsed));band.hidden=!collapsed;band.setAttribute('aria-expanded',String(!collapsed));
    }
  }
  function setFocus(side){
    focus=side==='memo'?'memo':'tasks';try{localStorage.setItem('cockpid.planner.focus.v1',focus)}catch{}draw();
  }
  function switchPage(side){
    if(composing||daily.isComposing()){
      pendingFocus=side;
      const path=root.activeElement?.shadowRoot?.activeElement;path?.blur();
      return;
    }
    setFocus(side);
    const target=side==='memo'?daily.element:taskliner?.element;
    // Focus the page container without opening a keyboard just to switch pages.
    if(target){target.tabIndex=-1;target.focus({preventScroll:true})}
  }
  $('taskBand').onclick=()=>switchPage('tasks');$('memoBand').onclick=()=>switchPage('memo');
  root.addEventListener('compositionstart',()=>{composing=true});
  root.addEventListener('compositionend',()=>{composing=false;if(pendingFocus){const side=pendingFocus;pendingFocus=null;queueMicrotask(()=>switchPage(side))}});
  root.addEventListener('focusin',event=>{
    const panel=event.composedPath().find(node=>node?.classList?.contains('planner-panel'));
    if(panel&&!panel.classList.contains('collapsed')&&focus!==panel.dataset.side)setFocus(panel.dataset.side);
  });
  root.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'&&!composing&&!event.composedPath().some(node=>/^(TEXTAREA|INPUT|SELECT)$/.test(node?.tagName||'')||node?.isContentEditable))ownerDocument.getElementById('appClose')?.click();
  });
  // Only width participates in layout. Viewport height is handled by the outer app shell.
  new ResizeObserver(draw).observe(element);
  return{element,attachTaskliner(){taskliner=mountTaskliner($('tasks'),{mode:'planner'});draw()},setVisible(value){visible=value;draw()},getDailyDate:daily.getDate};
}
