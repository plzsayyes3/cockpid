(() => {
  'use strict';

  const transcript = document.getElementById('stanTranscript');
  if (!transcript) return;

  let frame = null;

  function scrollToLatest() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      const overflowing = transcript.scrollWidth > transcript.clientWidth + 1;
      transcript.classList.toggle('is-overflowing', overflowing);
      transcript.scrollLeft = overflowing ? transcript.scrollWidth : 0;
    });
  }

  const observer = new MutationObserver(scrollToLatest);
  observer.observe(transcript, {
    childList: true,
    characterData: true,
    subtree: true
  });

  window.addEventListener('resize', scrollToLatest);
  scrollToLatest();

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    window.removeEventListener('resize', scrollToLatest);
    if (frame) cancelAnimationFrame(frame);
  }, { once: true });
})();