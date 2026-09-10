(() => {
  const nativeSetInterval = window.setInterval.bind(window);
  let calendarIntervalAdjusted = false;
  window.setInterval = (fn, delay, ...args) => {
    if (!calendarIntervalAdjusted && delay === 30000) {
      calendarIntervalAdjusted = true;
      return nativeSetInterval(fn, 300000, ...args);
    }
    return nativeSetInterval(fn, delay, ...args);
  };
  window.__cockpidNativeSetInterval = nativeSetInterval;
})();
