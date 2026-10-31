// Who descends from whom: a record per fish ever seen (species, mother or template, father,
// generation, birth, origin, death), the living fish of the current frame, and the species known
// from the run's history. Views (family diagrams, the species tree, the mobile cards) read it.
import {FISH} from './schema.js';
import {t} from './strings.js';
export const family_modelState = {};

export function resetFamilyRecords() {
  family_modelState.familyRecords.clear();
  family_modelState.familyLive.clear();
  family_modelState.speciesHistory.clear();
}

export function rememberFamilies(f) {
  const prior = family_modelState.familyLive;
  family_modelState.familyLive =
      new Map(f.fish.filter(p => p[FISH.hatched]).map(p => [p[FISH.id], p]));
  for (const [id, p] of prior)
    if (!family_modelState.familyLive.has(id)) {
      const record = family_modelState.familyRecords.get(id);
      if (record)
        record.p = p;
    }
  for (const p of family_modelState.familyLive.values()) {
    const old = family_modelState.familyRecords.get(p[FISH.id]);
    family_modelState.familyRecords.set(p[FISH.id], {
      id : p[FISH.id],
      species : p[FISH.species],
      parent : p[FISH.parent],
      father : p[FISH.father],
      depth : p[FISH.depth],
      generation : p[FISH.generation],
      born : p[FISH.born] || 0,
      origin : p[FISH.origin],
      clonal : p[FISH.clonal],
      first : old?.first ?? f.step,
      seen : f.step,
      p
    });
  }
  for (const [id, cause, step] of f.recent_deaths || []) {
    const record = family_modelState.familyRecords.get(id);
    if (record) {
      record.death_cause = cause;
      record.death_step = step;
    }
  }
  if (family_modelState.familyRecords.size > 5000) {
    const protectedIds = new Set([
      ...family_modelState.familyLive.keys(),
      ...f.fish.flatMap(p => [p[FISH.parent], p[FISH.father]])
    ]);
    for (const id of family_modelState.familyRecords.keys()) {
      if (family_modelState.familyRecords.size <= 5000)
        break;
      if (!protectedIds.has(id))
        family_modelState.familyRecords.delete(id);
    }
  }
}

// Rows of a journal answer; a saved world on screen only takes the rows of its own observation.
export function loadFamilyHistory(rows, species, observation, frame) {
  if (frame?.historical && (!observation || observation !== frame.observation?.key))
    return;
  for (const s of species)
    family_modelState.speciesHistory.set(s.id, s);
  for (const row of rows) {
    const old = family_modelState.familyRecords.get(row[0]);
    family_modelState.familyRecords.set(row[0], {
      id : row[0],
      species : row[1],
      parent : row[2],
      father : row[3],
      depth : row[4],
      generation : row[5],
      born : row[6],
      origin : row[7],
      clonal : row[8],
      first : row[9],
      seen : row[10],
      death_cause : row[11],
      death_step : row[12],
      p : old?.p
    });
  }
}

export function familyRecord(id, f) {
  const record = family_modelState.familyRecords.get(id);
  return record &&
                 (!f?.historical || record.first <= f.step || family_modelState.familyLive.has(id))
             ? record
             : null;
}

export function familyParents(record) {
  if (!record)
    return [];
  const result = [];
  if (record.parent && record.parent !== record.id)
    result.push({
      id : record.parent,
      role : record.origin === 1 ? t('lineage.mutter') : t('lineage.vorlage'),
      dashed : record.origin !== 1 || !!record.clonal
    });
  if (record.father && record.father !== record.id) {
    const same = result.find(item => item.id === record.father);
    if (same)
      same.role = t('lineage.mutterUndVater');
    else
      result.push({id : record.father, role : t('lineage.vater'), dashed : false});
  }
  return result;
}

export function familyChildren(id, f) {
  return [...family_modelState.familyRecords.values() ]
      .filter(record => record.id !== id && (record.parent === id || record.father === id) &&
                        (!f?.historical || record.first <= f.step ||
                         family_modelState.familyLive.has(record.id)))
      .sort((a, b) => Number(family_modelState.familyLive.has(b.id)) -
                          Number(family_modelState.familyLive.has(a.id)) ||
                      b.born - a.born || b.id - a.id);
}

const initializers = {
  "familyRecords" : () => { family_modelState.familyRecords = new Map(); },
  "familyLive" : () => { family_modelState.familyLive = new Map(); },
  "speciesHistory" : () => { family_modelState.speciesHistory = new Map(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
