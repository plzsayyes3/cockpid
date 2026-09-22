(() => {
  'use strict';

  const TYPES = ['projects', 'assignments', 'tasks'];

  function records(value) {
    return Array.isArray(value) ? value : [];
  }

  function emptyGroup() {
    return { projects: [], assignments: [], tasks: [] };
  }

  function groupItems(view) {
    const source = view && typeof view === 'object' ? view : {};
    const areas = records(source.areas);
    const groups = areas.map((area) => ({
      area,
      ...TYPES.reduce((bucket, type) => {
        bucket[type] = records(area?.[type]);
        return bucket;
      }, {})
    }));
    const byId = new Map(groups.map((group) => [String(group.area?.id || ''), group]));
    const loose = unassigned(source);

    TYPES.forEach((type) => {
      records(source[type]).forEach((record) => {
        const group = byId.get(String(record?.area_id || ''));
        if (group) group[type].push(record);
        else loose[type].push(record);
      });
    });

    return groups;
  }

  function unassigned(view) {
    const source = view && typeof view === 'object' ? view : {};
    const bucket = source.unassigned;
    return TYPES.reduce((result, type) => {
      result[type] = records(bucket?.[type]);
      return result;
    }, emptyGroup());
  }

  const api = { groupItems, unassigned };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.COCKPID_AREA_MODEL = Object.freeze(api);
})();
