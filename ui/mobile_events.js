import {fishLabel} from './fish_names.js';
import {zoomToSpecimen} from './camera.js';
import {journal} from './journal_model.js';
import {eventText} from './event_model.js';
import {thoughtBubbles} from './mind.js';
import {sceneState} from './state.js';
import {selectFish} from './fish_choice.js';
import {formatNumber, t} from './strings.js';
export const mobile_eventsState = {
  queue : []
};

const TICKER_LIFE = 5000, TOAST_LIFE = 4800, TOAST_GAP = 400, TOASTS_KEPT = 4, CHRONICLE = 40;
const TOAST_BUZZ = Object.freeze([ 10, 60, 10 ]);

function make(tag, className, text = '') {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
}

export function buildEvents() {
  const ticker = make('button', 'thought-ticker'), toast = make('button', 'event-toast');
  ticker.type = toast.type = 'button';
  ticker.hidden = toast.hidden = true;
  ticker.onclick = () => mobile_eventsState.tickerFish && selectFish(mobile_eventsState.tickerFish);
  toast.onclick = () => {
    showSpeciesOf(mobile_eventsState.toastSpecies);
    toast.hidden = true;
  };
  document.body.append(ticker, toast);
  Object.assign(mobile_eventsState, {ticker, toast});
}

function updateTicker(now) {
  const s = mobile_eventsState, chosen = sceneState.frame?.selected;
  let newest = null;
  for (const [id, bubble] of thoughtBubbles())
    if (id !== chosen && (!newest || bubble.at > newest.at))
      newest = {id, ...bubble};
  const show = newest && now - newest.at < TICKER_LIFE;
  if (show && s.tickerAt !== newest.at) {
    s.tickerAt = newest.at;
    s.tickerFish = newest.id;
    s.ticker.textContent = t('mobile.ticker', {fish : fishLabel(newest.id), text : newest.text});
    s.ticker.classList.remove('fresh');
    void s.ticker.offsetWidth;
    s.ticker.classList.add('fresh');
  }
  s.ticker.hidden = !show;
}

function updateToasts(now) {
  const s = mobile_eventsState, events = journal().events;
  const newest = events.at(-1)?.id || 0;
  if (s.seen === undefined) {
    s.seen = newest;
    return;
  }
  for (const e of events)
    if (e.id > s.seen && (e.important ?? e.milestone))
      s.queue.push(e);
  s.seen = Math.max(s.seen, newest);
  s.queue = s.queue.slice(-TOASTS_KEPT);
  if (now < (s.toastUntil || 0) + TOAST_GAP || !s.queue.length) {
    if (now > (s.toastUntil || 0))
      s.toast.hidden = true;
    return;
  }
  const e = s.queue.shift();
  s.toastSpecies = e.species_id || 0;
  s.toast.textContent = (e.milestone ? '★ ' : '✦ ') + eventText(e);
  s.toast.hidden = false;
  s.toastUntil = now + TOAST_LIFE;
  navigator.vibrate?.(TOAST_BUZZ);
}

function showSpeciesOf(id) {
  const species = (sceneState.frame?.species || []).find(s => s?.id === id);
  if (!species?.typical_fish)
    return false;
  zoomToSpecimen(species.typical_fish);
  return true;
}

export function renderChronicle(view, onVisit) {
  const events = journal().events, newest = events.at(-1);
  view.line.textContent = newest ? eventText(newest) : t('mobile.chronicleEmpty');
  if (view.newest === (newest?.id ?? 0))
    return;
  view.newest = newest?.id ?? 0;
  const list = make('ol', 'deck-chronicle');
  for (const e of events.slice(-CHRONICLE).reverse()) {
    const row = make('li', e.milestone ? 'milestone' : e.important ? 'important' : '');
    row.append(make('span', 'deck-chronicle-mark',
                    e.milestone   ? '★'
                    : e.important ? '✦'
                                  : '·'),
               make('span', 'deck-chronicle-text', eventText(e)),
               make('small', '', t('mobile.chronicleStep', {step : formatNumber(e.step)})));
    if (e.species_id) {
      row.classList.add('visit');
      row.onclick = () => showSpeciesOf(e.species_id) && onVisit();
    }
    list.append(row);
  }
  view.body.replaceChildren(events.length ? list
                                          : make('p', 'deck-hint', t('mobile.chronicleEmpty')));
}

export function updateEvents() {
  const now = performance.now();
  updateTicker(now);
  updateToasts(now);
}
