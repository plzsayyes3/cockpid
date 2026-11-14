(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TaskLinerDate = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  function parts(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? match.slice(1).map(Number) : null;
  }

  function utcDate(year, month, day) {
    const date = new Date(0);
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date;
  }

  function isValidDate(value) {
    const valueParts = parts(value);
    if (!valueParts) return false;
    const [year, month, day] = valueParts;
    const date = utcDate(year, month, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function shiftDate(value, delta) {
    if (!isValidDate(value) || !Number.isInteger(delta)) throw new RangeError('Invalid calendar date or day offset');
    const [year, month, day] = parts(value);
    const date = utcDate(year, month, day);
    date.setUTCDate(date.getUTCDate() + delta);
    const pad = number => String(number).padStart(2, '0');
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  function createNavigationQueue(getCurrentDate, sendRequest) {
    let queuedTarget = null;
    let inFlightTarget = null;

    function dispatch() {
      if (inFlightTarget || !queuedTarget) return;
      const target = queuedTarget;
      queuedTarget = null;
      inFlightTarget = target;
      try {
        if (sendRequest(target) === false) {
          inFlightTarget = null;
          queuedTarget = null;
        }
      } catch (error) {
        inFlightTarget = null;
        queuedTarget = null;
        throw error;
      }
    }

    return {
      request(target) {
        if (!isValidDate(target)) return false;
        queuedTarget = target;
        dispatch();
        return inFlightTarget === target || queuedTarget === target;
      },
      targetDate() {
        return queuedTarget || inFlightTarget || getCurrentDate();
      },
      acknowledge(target, commit) {
        if (target !== inFlightTarget) return false;
        inFlightTarget = null;
        if (typeof commit === 'function') commit();
        if (queuedTarget === getCurrentDate()) queuedTarget = null;
        dispatch();
        return true;
      },
      cancel(target) {
        if (target !== inFlightTarget) return false;
        inFlightTarget = null;
        queuedTarget = null;
        return true;
      }
    };
  }

  async function loadForDate(date, { currentDate, load, apply }) {
    const result = await load(date);
    if (currentDate() !== date) return false;
    apply(result);
    return true;
  }

  return { isValidDate, shiftDate, createNavigationQueue, loadForDate };
});
