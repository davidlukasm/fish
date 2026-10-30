import {family_modelState} from './family_model.js';
import {t, formatNumber} from './strings.js';
import {updateCockpitState} from './cockpit.js';
import {request} from './session.js';
import {resetCamera} from './camera.js';
import {chart} from './charts.js';
import {cockpitState, mergeJournalEvents, renderDiversity} from './cockpit.js';
import {el, text, uiIcon} from './dom.js';
import {evolutionState, focusLineage, renderSpecies, setView} from './evolution.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishPreviewPose} from './fish_organs.js';
import {paintFishGlyph} from './fish_painter.js';
import {loadFamilyHistory} from './family_model.js';
import {command, matchesObservation, observationContext, sessionState} from './session.js';
import {sceneState} from './state.js';
import {beginEggPlacement} from './world.js';
export const event_viewState = {};

export function resetJournalRequests() {
  event_viewState.pageRequest = null;
  updateCockpitState({journalBusy : false});
}

export function renderEggCards() {
  const box = el('egg-cards'), signature = JSON.stringify(cockpitState.journalData.archive.map(
                                   a => [a.id, a.name, a.categories, a.recent, a.labels]));
  if (signature === cockpitState.archiveSignature)
    return;
  updateCockpitState({archiveSignature : signature});
  box.replaceChildren();
  for (const [recent, title] of [[ false, t('event_view.rekordhalter') ],
                                 [ true, t('event_view.zuletztErfolgreicheSpezies') ]]) {
    const entries =
        cockpitState.journalData.archive.filter(a => recent ? a.recent : a.categories.length);
    if (!entries.length)
      continue;
    const h = document.createElement('h2');
    h.textContent = title;
    box.appendChild(h);
    for (const e of entries) {
      const button = document.createElement('button');
      button.className = 'egg-card';
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 70;
      const g = c.getContext('2d', {willReadFrequently : true});
      g.save();
      const fit = fishPreviewPose(e.portrait, c.width, c.height, 3 * fishRenderRadius(e.portrait));
      g.translate(fit.x, fit.y);
      paintFishGlyph(g, e.portrait, fit.r, 0, 0, 1, null, false, 1, fit.a);
      g.restore();
      button.appendChild(c);
      const name = document.createElement('strong');
      name.textContent = e.name;
      button.appendChild(name);
      const labels = document.createElement('span');
      labels.textContent = e.labels.join(' · ');
      button.appendChild(labels);
      button.title = e.categories.join(' · ');
      button.onclick = () => {
        beginEggPlacement({saved : e.id});
        for (const b of box.children)
          b.classList?.toggle('active', b === button);
      };
      box.appendChild(button);
    }
  }
}

export function renderWorlds() {
  const auto = el('autosave-list'), saved = el('saved-world-list');
  auto.replaceChildren();
  saved.replaceChildren();
  for (const e of cockpitState.journalData.autosaves || []) {
    const button = document.createElement('button');
    button.textContent =
        e.name + ' · ' + new Date(e.saved * 1000).toLocaleTimeString(t('units.locale'));
    button.onclick = async () => {
      if (await command('load-autosave', {id : e.id})) {
        el('worlds-dialog').close();
        resetCamera();
      }
    };
    auto.appendChild(button);
  }
  for (const m of sessionState.historyData?.milestones || []) {
    const button = document.createElement('button');
    button.textContent = t('event_view.savedWorld', {step : formatNumber(m.step)});
    button.disabled = !m.complete_state;
    button.title = m.complete_state ? t('event_view.vollstaendigeWeltLaden')
                                    : t('event_view.fuerDiesenEintragIst');
    button.onclick = async () => {
      if (await command('observe', {session : m.session, id : m.id}))
        el('worlds-dialog').close();
    };
    saved.appendChild(button);
  }
}

export function eventRow(e) {
  const row = document.createElement('div');
  row.className = 'event-line ' + e.kind;
  const icon = document.createElement('i');
  icon.className = 'event-symbol';
  icon.innerHTML = uiIcon(({
                            trait : 'trait',
                            record : 'record',
                            species : 'species',
                            warning : 'warning',
                            reproduction : 'eggs',
                            population : 'species',
                            ecology : 'grass'
                          })[e.kind] ||
                          'chart');
  icon.title = ({
                 trait : t('event_view.merkmal'),
                 record : t('event_view.rekord'),
                 species : t('event_view.artGattung'),
                 warning : t('event_view.beobachtung'),
                 reproduction : t('event_view.fortpflanzung'),
                 ecology : t('event_view.oekosystem')
               })[e.kind] ||
               t('event_view.entwicklung');
  row.appendChild(icon);
  const time = document.createElement('span');
  time.textContent = e.step.toLocaleString(t('units.locale'));
  time.title = t('event_view.schritt');
  row.appendChild(time);
  const body = document.createElement('div'), button = document.createElement('button');
  button.textContent =
      e.text.replace(t('event_view.erstmalsImBeckenBestaetigt'), t('event_view.erstmals'))
          .replace(t('event_view.zeigtJetzt'), t('event_view.nowShows'));
  if (e.kind === 'trait' && e.detail === 'Profil über mindestens 400 Schritte bestätigt.')
    button.textContent = e.text.replace(': ', t('event_view.nowShows'));
  button.title = button.textContent + (e.detail ? ' · ' + e.detail : '');
  const known = !e.species_id || sceneState.frame?.species.some(s => s.id === e.species_id) ||
                family_modelState.speciesHistory.has(e.species_id);
  button.disabled = !known;
  if (!known)
    button.title = t('event_view.dieseArtIstNicht');
  button.onclick = () => {
    if (e.species_id)
      focusLineage(e.species_id);
    else
      text('feedback', button.textContent);
  };
  body.appendChild(button);
  if (e.milestone) {
    const tag = document.createElement('small');
    tag.className = 'milestone-tag';
    tag.textContent = '◆';
    tag.title = t('event_view.meilenstein');
    body.appendChild(tag);
  }
  row.appendChild(body);
  return row;
}

export function updateEventBox(box, events) {
  const signature = JSON.stringify(events.map(e => [e.id, e.text, e.detail, e.milestone]));
  if (signature === box.eventSignature)
    return;
  box.eventSignature = signature;
  const oldTop = box.scrollTop || 0, oldHeight = box.scrollHeight, atTop = oldTop < 8,
        anchor = Array.from(box.children).find(row => row.offsetTop + row.offsetHeight > oldTop),
        anchorId = anchor?.dataset.eventId, offset = anchor ? oldTop - anchor.offsetTop : 0;
  box.replaceChildren();
  if (!events.length) {
    const empty = document.createElement('p');
    empty.className = 'caption';
    empty.textContent = el('event-filter').value === 'important'
                            ? t('event_view.nochKeineWichtigenEreignisse')
                            : t('event_view.nochKeineEreignisse');
    box.appendChild(empty);
  }
  for (const e of events) {
    const row = eventRow(e);
    row.dataset.eventId = String(e.id);
    box.appendChild(row);
  }
  const found = anchorId && Array.from(box.children).find(row => row.dataset.eventId === anchorId);
  box.scrollTop = atTop   ? 0
                  : found ? found.offsetTop + offset
                          : oldTop + box.scrollHeight - oldHeight;
}

export function renderEvents() {
  const all = [...cockpitState.journalData.events ].reverse(),
        special = all.filter(e => e.important ?? e.milestone),
        filtered = el('event-filter').value === 'important' ? special : all;
  event_viewState.eventOffset =
      Math.min(event_viewState.eventOffset, Math.max(0, filtered.length - 1));
  if (evolutionState.activeView === 'events') {
    updateEventBox(el('event-console'),
                   filtered.slice(event_viewState.eventOffset, event_viewState.eventOffset + 200));
    const box = el('event-console');
    for (const b of box.querySelectorAll?.('button.event-page') || [])
      b.remove();
    const older = document.createElement('button');
    older.className = 'event-page';
    older.textContent = t('event_view.aeltereEreignisse');
    older.disabled = !!event_viewState.pageRequest;
    older.onclick = async () => {
      if (event_viewState.pageRequest)
        return;
      const context = observationContext(), token = {},
            important = el('event-filter').value === 'important',
            nextOffset = event_viewState.eventOffset +
                         Math.min(200, filtered.length - event_viewState.eventOffset);
      event_viewState.pageRequest = token;
      older.disabled = true;
      let current = filtered;
      try {
        while (nextOffset >= current.length && cockpitState.journalData.events[0]?.id > 1) {
          const before = cockpitState.journalData.events[0].id,
                r = await request('/journal?before=' + before);
          if (!r.ok)
            break;
          const d = await r.json();
          if (!matchesObservation(context, d) ||
              important !== (el('event-filter').value === 'important'))
            return;
          if (!d.events?.length || d.events[0].id >= before)
            break;
          mergeJournalEvents(d.events);
          current = [...cockpitState.journalData.events ].reverse().filter(
              e => !important || (e.important ?? e.milestone));
        }
        if (!matchesObservation(context))
          return;
        if (nextOffset < current.length)
          event_viewState.eventOffset = nextOffset;
        box.eventSignature = '';
        box.scrollTop = 0;
      } catch (error) {
        text('error', error.message);
      } finally {
        if (event_viewState.pageRequest === token)
          event_viewState.pageRequest = null;
        if (matchesObservation(context))
          renderEvents();
      }
    };
    if (filtered.length > event_viewState.eventOffset + 200 ||
        cockpitState.journalData.events[0]?.id > 1)
      box.appendChild(older);
    if (event_viewState.eventOffset) {
      const newer = document.createElement('button');
      newer.className = 'event-page';
      newer.textContent = t('event_view.neuesteEreignisse');
      newer.onclick = () => {
        event_viewState.eventOffset = 0;
        box.eventSignature = '';
        renderEvents();
      };
      box.appendChild(newer);
    }
  }
  updateEventBox(el('live-event-list'), all.slice(0, 12));
  const fresh = cockpitState.journalData.total_events || all.length,
        atTop = (el('event-console').scrollTop || 0) < 8;
  el('event-new').hidden = atTop || fresh <= cockpitState.eventSeen;
  text('event-new', t('event_view.newEvents', {n : fresh - cockpitState.eventSeen}));
  if (atTop)
    updateCockpitState({eventSeen : fresh});
}

export async function refreshJournal() {
  const context = observationContext(), token = {};
  if ((sceneState.frame?.observation?.key || 'live') !== context.key)
    return;
  if (cockpitState.journalBusy)
    return;
  updateCockpitState({journalBusy : token});
  try {
    const r = await request('/journal?after=' + (cockpitState.journalData.events.at(-1)?.id || 0));
    if (!r.ok)
      throw Error(t('event_view.ereignisseNichtErreichbar'));
    const d = await r.json();
    if (!matchesObservation(context, d))
      return;
    const old = cockpitState.journalData.events || [], seen = new Set(old.map(e => e.id)),
          added = (d.events || []).filter(e => !seen.has(e.id));
    if (event_viewState.eventOffset)
      event_viewState.eventOffset += el('event-filter').value === 'important'
                                         ? added.filter(e => e.important ?? e.milestone).length
                                         : added.length;
    updateCockpitState({
      journalData : {
        ...d,
        events : event_viewState.eventOffset ? [...old, ...added ]
                                             : [...old, ...added ].slice(-4096)
      }
    });
    loadFamilyHistory(d.ancestry || [], d.species_ancestry || [], d.observation || 'live');
    renderEvents();
    renderEggCards();
    renderWorlds();
    if (sceneState.frame) {
      renderDiversity(sceneState.frame);
      if (evolutionState.activeView === 'species')
        renderSpecies(sceneState.frame, true);
      if (sessionState.historyData)
        chart(sessionState.historyData);
    }
  } catch (e) {
    text('error', e.message);
  } finally {
    if (matchesObservation(context))
      updateCockpitState({lastJournal : Date.now()});
    if (cockpitState.journalBusy === token)
      updateCockpitState({journalBusy : false});
  }
}

export function updateEventViewState(patch) {
  Object.assign(event_viewState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "eventOffset" : () => { event_viewState.eventOffset = 0; },
  "event_filter_onchange" : () => {
    el('event-filter').onchange = () => {
      event_viewState.eventOffset = 0;
      el('event-console').scrollTop = 0;
      renderEvents();
    };
  },
  "open_event_log_onclick" : () => { el('open-event-log').onclick = () => setView('events'); },
  "event_new_onclick" : () => {
    el('event-new').onclick = () => {
      event_viewState.eventOffset = 0;
      renderEvents();
      el('event-console').scrollTop = 0;
      updateCockpitState({eventSeen : cockpitState.journalData.total_events});
      el('event-new').hidden = true;
    };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
