(() => {
  const nativeSetInterval = window.__cockpidNativeSetInterval || window.setInterval.bind(window);
  const list = document.getElementById('todayList');
  const dateButton = document.getElementById('todayDateBtn');
  const dateNode = document.getElementById('todayDate');
  const timeNode = document.getElementById('todayTime');

  function updateClock() {
    if (dateNode) dateNode.textContent = new Intl.DateTimeFormat('ja-JP', {
      timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit', weekday:'short'
    }).format(new Date());
    if (timeNode) timeNode.textContent = new Intl.DateTimeFormat('ja-JP', {
      timeZone:'Asia/Tokyo', hour:'2-digit', minute:'2-digit', hour12:false
    }).format(new Date());
  }
  updateClock();
  nativeSetInterval(updateClock, 30000);

  if (!list || !dateButton) return;
  let stableHtml = '';
  let stableDateLabel = '';
  let restoring = false;

  const isLoading = () => /Techoを読んでいます/.test(list.textContent || '');
  const observer = new MutationObserver(() => {
    if (restoring) { restoring = false; return; }
    if (isLoading()) {
      if (stableHtml && dateButton.textContent === stableDateLabel) {
        restoring = true;
        list.innerHTML = stableHtml;
      }
      return;
    }
    stableHtml = list.innerHTML;
    stableDateLabel = dateButton.textContent;
  });
  observer.observe(list, { childList:true, subtree:true, characterData:true });
})();
