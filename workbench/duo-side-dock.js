(() => {
  'use strict';
  const KEY='cockpid.workbench.side-dock.v1';
  const body=document.body,extra=document.getElementById('dockExtra'),dock=document.getElementById('appDock');
  if(!body||!dock||!extra)return;
  let stored=null;
  try{stored=localStorage.getItem(KEY)}catch{}
  const touch=matchMedia('(pointer:coarse)').matches;
  // Explicit user preference beats heuristics; default to the Duo-style side
  // navigation on touch screens. Other pointers keep the existing bottom dock.
  let side=stored==='side'||(stored!=='bottom'&&touch);
  function paint(){
    body.classList.toggle('wb-side-dock',side);
    button.setAttribute('aria-pressed',String(side));
    button.querySelector('.dock-label').textContent=side?'下部へ':'右側へ';
    button.setAttribute('aria-label',side?'メニューを下部に移す':'メニューを右側に移す');
  }
  const button=document.createElement('button');
  button.type='button';
  button.className='app-btn';
  button.id='dockPositionToggle';
  button.innerHTML='<span class="dock-top" aria-hidden="true"><span class="dock-key">⇆</span></span><span class="dock-label"></span>';
  button.addEventListener('click',()=>{
    side=!side;
    try{localStorage.setItem(KEY,side?'side':'bottom')}catch{}
    paint();
    dock.classList.remove('wb-open');
    document.getElementById('dockToggle')?.setAttribute('aria-expanded','false');
    document.body.classList.remove('wb-dock-expanded');
  });
  extra.append(button);
  paint();
})();
