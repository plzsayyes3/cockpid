(() => {
  const appWindow=document.getElementById('appWindow');
  const appTitle=document.getElementById('appTitle');
  const appContent=document.getElementById('appContent');
  if(!appWindow||!appTitle||!appContent)return;
  function openOnHand(){
    appTitle.textContent='6 / ON HAND';
    appContent.innerHTML='<iframe src="onhand.html" title="6 / ON HAND"></iframe>';
    appWindow.classList.add('open');
    appWindow.setAttribute('aria-hidden','false');
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-app="onhand"]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();openOnHand();
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='6')return;
    if(/INPUT|TEXTAREA/.test(document.activeElement?.tagName||''))return;
    event.preventDefault();event.stopImmediatePropagation();openOnHand();
  },true);
})();
