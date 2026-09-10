(() => {
  const selector = '.event-title';

  function toTextEmoji(value) {
    return String(value || '')
      .replace(/\uFE0F/g, '\uFE0E')
      .replace(/(\p{Extended_Pictographic})(?![\uFE0E\uFE0F])/gu, '$1\uFE0E');
  }

  function normalize(root = document) {
    root.querySelectorAll(selector).forEach((node) => {
      const next = toTextEmoji(node.textContent);
      if (node.textContent !== next) node.textContent = next;
    });
  }

  const observer = new MutationObserver(() => normalize());
  observer.observe(document.body, { childList: true, subtree: true });
  normalize();
})();
