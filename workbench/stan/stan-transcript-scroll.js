(() => {
  'use strict';

  const transcript = document.getElementById('stanTranscript');
  if (!transcript) return;

  let frame = null;

  function scrollToLatest() {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      transcript.scrollTop = transcript.scrollHeight;
    });
  }

  const observer = new MutationObserver(scrollToLatest);
  observer.observe(transcript, {
    childList: true,
    characterData: true,
    subtree: true
  });

  scrollToLatest();

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  }, { once: true });
})();