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

  function allRecords(view, type) {
    const source = view && typeof view === 'object' ? view : {};
    const nested = records(source.areas).flatMap((area) => records(area?.[type]));
    return nested.concat(records(source.unassigned?.[type]), records(source[type]));
  }

  function validation(view) {
    const source = view && typeof view === 'object' ? view : {};
    return TYPES.reduce((result, type) => {
      result[type] = records(source.validation?.[type]);
      return result;
    }, emptyGroup());
  }

  function findRecord(view, type, id) {
    if (id == null || id === '') return null;
    return allRecords(view, type).find((record) => String(record?.id || '') === String(id)) || null;
  }

  function findArea(view, areaId) {
    if (areaId == null || areaId === '') return null;
    const source = view && typeof view === 'object' ? view : {};
    return records(source.areas).find((area) => String(area?.id || '') === String(areaId)) || null;
  }

  function areaForRecord(view, record) {
    if (!record) return null;
    const direct = findArea(view, record.area_id);
    if (direct) return direct;
    for (const type of TYPES) {
      const match = allRecords(view, type).find((candidate) => candidate === record || String(candidate?.id || '') === String(record.id || ''));
      if (match?.area_id) return findArea(view, match.area_id);
    }
    return null;
  }

  const AreaContext = Object.freeze({
    resolve(item, view) {
      const source = item && typeof item === 'object' ? item : {};
      const project = source.project_id
        ? findRecord(view, 'projects', source.project_id)
        : (source.type === 'project' || source.object_type === 'project' ? findRecord(view, 'projects', source.id) : null);
      const assignment = source.assignment_id
        ? findRecord(view, 'assignments', source.assignment_id)
        : (source.type === 'assignment' || source.object_type === 'assignment' ? findRecord(view, 'assignments', source.id) : null);
      const area = findArea(view, source.area_id) || areaForRecord(view, project) || areaForRecord(view, assignment) || areaForRecord(view, source);
      return { area, project, assignment };
    }
  });

  const api = { groupItems, unassigned, validation, AreaContext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.COCKPID_AREA_MODEL = Object.freeze(api);
    window.COCKPID_AREA_CONTEXT = AreaContext;
    window.AreaContext = AreaContext;
  }
})();
