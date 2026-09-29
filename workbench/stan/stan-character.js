const CHARACTER_KEY = 'cockpid.stan.character.v1';

const stage = document.getElementById('stanStage');
const stanFace = document.getElementById('stanFace');
const radyPet = document.getElementById('radyPet');
const mood = document.getElementById('stanMood');
const chooseStan = document.getElementById('chooseStan');
const chooseRady = document.getElementById('chooseRady');
const cameraToggle = document.getElementById('cameraToggle');

function readCharacter() {
  try {
    return localStorage.getItem(CHARACTER_KEY) === 'rady' ? 'rady' : 'stan';
  } catch {
    return 'stan';
  }
}

function saveCharacter(character) {
  try {
    localStorage.setItem(CHARACTER_KEY, character);
  } catch {}
}

function applyCharacter(character, { persist = true } = {}) {
  const next = character === 'rady' ? 'rady' : 'stan';
  if (persist) saveCharacter(next);

  stage.dataset.character = next;
  stanFace.setAttribute('aria-hidden', next === 'stan' ? 'false' : 'true');
  radyPet.setAttribute('aria-hidden', next === 'rady' ? 'false' : 'true');
  chooseStan.classList.toggle('is-active', next === 'stan');
  chooseRady.classList.toggle('is-active', next === 'rady');
  chooseStan.setAttribute('aria-pressed', String(next === 'stan'));
  chooseRady.setAttribute('aria-pressed', String(next === 'rady'));

  if (next === 'rady') {
    // Camera tracking belongs to STAN. If it is active, turn it off when
    // switching pets; voice capture remains available from the stage.
    if (cameraToggle?.getAttribute('aria-pressed') === 'true') cameraToggle.click();
    if (mood) mood.textContent = 'のんびりしてる';
  } else if (mood) {
    mood.textContent = cameraToggle?.dataset.mode === 'found'
      ? 'みつけた'
      : cameraToggle?.dataset.mode === 'on' || cameraToggle?.dataset.mode === 'loading'
        ? 'みてるよ'
        : '待ってるよ';
  }

  window.dispatchEvent(new CustomEvent('stan:character-change', { detail: { character: next } }));
}

chooseStan?.addEventListener('click', () => applyCharacter('stan'));
chooseRady?.addEventListener('click', () => applyCharacter('rady'));

applyCharacter(readCharacter(), { persist: false });

// stan.js can restore a previously enabled camera shortly after load.
// RADY does not use camera tracking, so shut it back down if needed.
window.setTimeout(() => {
  if (stage.dataset.character === 'rady' && cameraToggle?.getAttribute('aria-pressed') === 'true') {
    cameraToggle.click();
    if (mood) mood.textContent = 'のんびりしてる';
  }
}, 650);

window.STAN_CHARACTER = Object.freeze({
  get: () => stage.dataset.character || 'stan',
  set: (character) => applyCharacter(character)
});
