(() => {
  const pet = document.getElementById('pet');
  const say = document.getElementById('petSay');
  if (!pet || !say) return;

  const sync = () => pet.classList.toggle('is-speaking', say.classList.contains('show'));
  const observer = new MutationObserver(sync);
  observer.observe(say, { attributes: true, attributeFilter: ['class'] });
  sync();
})();
