import {SECOND_MS} from './units.js';
import {family_modelState} from './family_model.js';
import {archiveCategory, eventDetail, eventKind, eventKindName, eventText} from './event_model.js';
import {t, formatNumber} from './strings.js';
import {resetCamera} from './camera.js';
import {chart} from './charts.js';
import {cockpitState, renderDiversity, updateCockpitState} from './cockpit.js';
import {hasEarlierEvents, journal, loadEarlierEvents, loadJournal} from './journal_model.js';
import {el, syncChildren, text, uiIcon} from './dom.js';
import {evolutionState, focusLineage, renderSpecies, setView} from './evolution.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishPreviewPose} from './fish_organs.js';
import {paintFishGlyph} from './fish_painter.js';
import {command, matchesObservation, observationContext, sessionState} from './session.js';
import {sceneState} from './state.js';
import {beginEggPlacement} from './world.js';
export const event_viewState = {};
const EVENT_VIEW = Object.freeze({
  portrait_width : 400,
  portrait_height : 200,
  span : 3,
  page : 200,
  live : 12,
  top : 8,
  tank : 3
});

export function resetJournalRequests() { event_viewState.pageRequest = null; }

const shownEvents = (events, important) =>
    important ? events.filter(e => e.important ?? e.milestone) : events;

function renderEggCards() {
  const box = el('egg-cards'), signature = JSON.stringify(journal().archive.map(
                                   a => [a.id, a.name, a.categories, a.recent, a.labels]));
  if (signature === cockpitState.archiveSignature)
    return;
  updateCockpitState({archiveSignature : signature});
  box.replaceChildren();
  for (const [recent, title] of [[ false, t('event_view.rekordhalter') ],
                                 [ true, t('event_view.zuletztErfolgreicheSpezies') ]]) {
    const entries = journal().archive.filter(a => recent ? a.recent : a.categories.length);
    if (!entries.length)
      continue;
    const h = document.createElement('h2');
    h.textContent = title;
    box.appendChild(h);
    for (const e of entries) {
      const card = document.createElement('div'), button = document.createElement('button'),
            head = document.createElement('div'), name = document.createElement('span'),
            c = document.createElement('canvas'), tags = document.createElement('div'),
            place = document.createElement('button'), actions = document.createElement('div');
      card.className = 'species-card';
      head.className = 'species-card-head';
      name.textContent = e.name;
      head.append(name);
      c.width = EVENT_VIEW.portrait_width;
      c.height = EVENT_VIEW.portrait_height;
      c.className = 'species-specimens';
      const g = c.getContext('2d', {willReadFrequently : true});
      g.save();
      const fit = fishPreviewPose(e.portrait, c.width, c.height,
                                  EVENT_VIEW.span * fishRenderRadius(e.portrait));
      g.translate(fit.x, fit.y);
      paintFishGlyph(g, e.portrait, fit.r, 0, 0, 1, null, false, 1, fit.a);
      g.restore();
      tags.className = 'trait-tags';
      for (const label of e.labels) {
        const tag = document.createElement('span');
        tag.textContent = label;
        tags.append(tag);
      }
      button.append(head, c, tags);
      button.title = e.categories.map(archiveCategory).join(' · ');
      place.className = 'species-details-button';
      place.textContent = t('event_view.eierEinsetzen');
      place.onclick = button.onclick = () => {
        beginEggPlacement({saved : e.id});
        for (const other of box.querySelectorAll('.species-card'))
          other.classList.toggle('active', other === card);
      };
      actions.className = 'species-card-actions';
      actions.append(place);
      card.append(button, actions);
      box.appendChild(card);
    }
  }
}

export function renderWorlds() {
  const auto = el('autosave-list'), saved = el('saved-world-list');
  auto.replaceChildren();
  saved.replaceChildren();
  for (const e of journal().autosaves || []) {
    const button = document.createElement('button');
    button.textContent =
        e.name + ' · ' + new Date(e.saved * SECOND_MS).toLocaleTimeString(t('units.locale'));
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

function eventRow(e) {
  const row = document.createElement('div');
  row.className = 'event-line ' + e.kind;
  const icon = document.createElement('i');
  icon.className = 'event-symbol';
  icon.innerHTML = uiIcon(eventKind(e).icon);
  icon.title = eventKindName(e);
  row.appendChild(icon);
  const time = document.createElement('span');
  time.textContent = formatNumber(e.step);
  time.title = t('event_view.schritt');
  row.appendChild(time);
  const body = document.createElement('div'), button = document.createElement('button');
  const detail = eventDetail(e);
  button.textContent = eventText(e);
  button.title = button.textContent + (detail ? ' · ' + detail : '');
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

function updateEventBox(box, events) {
  const signature = JSON.stringify(events.map(e => [e.id, e.wording, e.data, e.milestone]));
  if (signature === box.eventSignature)
    return;
  box.eventSignature = signature;
  const oldTop = box.scrollTop || 0, oldHeight = box.scrollHeight, atTop = oldTop < EVENT_VIEW.top,
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
  const all = [...journal().events ].reverse(),
        filtered = shownEvents(all, el('event-filter').value === 'important');
  event_viewState.eventOffset =
      Math.min(event_viewState.eventOffset, Math.max(0, filtered.length - 1));
  if (evolutionState.activeView === 'events') {
    updateEventBox(
        el('event-console'),
        filtered.slice(event_viewState.eventOffset, event_viewState.eventOffset + EVENT_VIEW.page));
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
                         Math.min(EVENT_VIEW.page, filtered.length - event_viewState.eventOffset);
      event_viewState.pageRequest = token;
      older.disabled = true;
      let current = filtered;
      try {
        while (nextOffset >= current.length) {
          const more = await loadEarlierEvents(context);
          if (more === null || important !== (el('event-filter').value === 'important'))
            return;
          if (!more)
            break;
          current = shownEvents([...journal().events ].reverse(), important);
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
    if (filtered.length > event_viewState.eventOffset + EVENT_VIEW.page || hasEarlierEvents())
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
  updateEventBox(el('live-event-list'), all.slice(0, EVENT_VIEW.live));
  renderTankEvents(all);
  const fresh = journal().total_events || all.length,
        atTop = (el('event-console').scrollTop || 0) < EVENT_VIEW.top;
  el('event-new').hidden = atTop || fresh <= cockpitState.eventSeen;
  text('event-new', t('event_view.newEvents', {n : fresh - cockpitState.eventSeen}));
  if (atTop)
    updateCockpitState({eventSeen : fresh});
}

function renderTankEvents(events) {
  const box = el('tank-events'), latest = shownEvents(events, true).slice(0, EVENT_VIEW.tank),
        shown = new Map([...box.children ].map(item => [item.dataset.eventId, item])),
        filled = box.children.length > 0;
  box.onclick ??= () => setView('events');
  syncChildren(box, latest.map(e => {
    const old = shown.get(String(e.id));
    if (old)
      return old;
    const item = document.createElement('li'), icon = document.createElement('i'),
          body = document.createElement('span');
    item.dataset.eventId = String(e.id);
    item.className = e.kind + (filled ? ' thought-enter' : '');
    icon.innerHTML = uiIcon(eventKind(e).icon);
    body.textContent = eventText(e);
    item.title = t('event_view.tankEvent', {step : formatNumber(e.step), text : body.textContent});
    item.append(icon, body);
    return item;
  }));
  box.hidden = !latest.length;
}

export async function refreshJournal() {
  try {
    const added = await loadJournal(() => event_viewState.eventOffset > 0);
    if (!added)
      return;
    if (event_viewState.eventOffset)
      event_viewState.eventOffset +=
          shownEvents(added, el('event-filter').value === 'important').length;
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
      updateCockpitState({eventSeen : journal().total_events});
      el('event-new').hidden = true;
    };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
