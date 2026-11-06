import {ROUTE} from './schema.js';
import {loadFamilyHistory} from './family_model.js';
import {matchesObservation, observationContext, request} from './session.js';
import {sceneState} from './state.js';
import {t} from './strings.js';

const KEPT_EVENTS = 4096;
const emptyJournal = () => ({events : [], archive : [], traces : {}, records : {}, autosaves : []});
export const journal_modelState = {
  journal : emptyJournal(),
  loadedAt : 0,
  busy : false
};

export function journal() { return journal_modelState.journal; }

export function resetJournal() {
  Object.assign(journal_modelState, {journal : emptyJournal(), loadedAt : 0, busy : false});
}

function mergeJournalEvents(events) {
  const s = journal_modelState, byId = new Map(s.journal.events.map(event => [event.id, event]));
  for (const event of events)
    byId.set(event.id, event);
  s.journal = {...s.journal, events : [...byId.values() ].sort((a, b) => a.id - b.id)};
}

export function hasEarlierEvents() { return journal_modelState.journal.events[0]?.id > 1; }

export async function loadJournal(keepOlder = () => false) {
  const s = journal_modelState, context = observationContext(), token = {};
  if ((sceneState.frame?.observation?.key || 'live') !== context.key || s.busy)
    return null;
  s.busy = token;
  try {
    const r = await request(ROUTE.journal + '?after=' + (s.journal.events.at(-1)?.id || 0));
    if (!r.ok)
      throw Error(t('journal_model.unreachable'));
    const d = await r.json();
    if (!matchesObservation(context, d))
      return null;
    const old = s.journal.events, seen = new Set(old.map(e => e.id)),
          added = (d.events || []).filter(e => !seen.has(e.id)), events = [...old, ...added ];
    s.journal = {...d, events : keepOlder() ? events : events.slice(-KEPT_EVENTS)};
    loadFamilyHistory(d.ancestry || [], d.species_ancestry || [], d.observation || 'live',
                      sceneState.frame);
    return added;
  } finally {
    if (matchesObservation(context))
      s.loadedAt = Date.now();
    if (s.busy === token)
      s.busy = false;
  }
}

export async function loadEarlierEvents(context) {
  const before = journal_modelState.journal.events[0]?.id;
  if (!(before > 1))
    return false;
  const r = await request(ROUTE.journal + '?before=' + before);
  if (!r.ok)
    return false;
  const d = await r.json();
  if (!matchesObservation(context, d))
    return null;
  if (!d.events?.length || d.events[0].id >= before)
    return false;
  mergeJournalEvents(d.events);
  return true;
}
