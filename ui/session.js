import {format, formatNumber, t, textArea} from './strings.js';
import {text} from './dom.js';
export const sessionState = {};

export function setObservation(key, force = false) {
  if (!force && sessionState.observationKey === key)
    return false;
  sessionState.observationKey = key;
  sessionState.observationGeneration = (sessionState.observationGeneration || 0) + 1;
  return true;
}

export function observationContext() {
  return {
    session : sessionState.sessionId,
    key : sessionState.observationKey || 'live',
    generation : sessionState.observationGeneration || 0
  };
}

export function matchesObservation(context, response = {}) {
  const current = observationContext();
  return context.session === current.session && context.key === current.key &&
         context.generation === current.generation &&
         (!response.session || response.session === current.session) &&
         (!response.observation || response.observation === current.key);
}

export async function request(url, options = {}, timeout = 15000) {
  const controller = new AbortController(), parent = options.signal;
  const abort = () => controller.abort();
  if (parent?.aborted)
    abort();
  parent?.addEventListener('abort', abort, {once : true});
  const bounded = async operation => {
    let timer;
    try {
      return await Promise.race([
        operation(), new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Error(t('session.dieAnfrageDauertZu')));
          }, timeout);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    const response = await bounded(() => fetch(url, {...options, signal : controller.signal}));
    const result = {ok : response.ok, status : response.status, headers : response.headers};
    for (const method of ['json', 'text', 'arrayBuffer'])
      result[method] = () => bounded(() => response[method]())
                                 .finally(() => parent?.removeEventListener('abort', abort));
    return result;
  } catch (error) {
    parent?.removeEventListener('abort', abort);
    throw error;
  }
}

// Server and engine replies carry a wording key with values; other text arrives already phrased
// and is shown as it is. A wording may count things (removed fish, eggs …): only those present
// are listed after it.
export function serverText(reply) {
  if (!reply || typeof reply !== 'object')
    return String(reply ?? '');
  // Counts are shown in the interface's number format.
  const counts = reply.values || {},
        values = Object.fromEntries(Object.entries(counts).map(
            ([ name, value ]) => [name, typeof value === 'number' ? formatNumber(value) : value])),
        list = textArea('server').lists?.[reply.key],
        items = Object.entries(list?.items || {})
                    .filter(([ name ]) => counts[name] > 0)
                    .map(([ name, template ]) => format(template, {n : values[name]}));
  return t('server.' + reply.key, values) +
         (items.length ? format(list.intro, {list : items.join(', ')}) : '');
}

export async function command(op, extra = {}) {
  try {
    const r = await request('/command', {
      method : 'POST',
      headers : {'Content-Type' : 'application/json', 'X-Fish-Token' : window.FISH_TOKEN},
      body : JSON.stringify({command : op, ...extra})
    });
    const d = await r.json();
    if (!r.ok)
      throw Error(serverText(d.error));
    text('error', '');
    if (d.message) {
      text('feedback', serverText(d.message));
      const version = ++sessionState.feedbackVersion;
      setTimeout(() => {
        if (version === sessionState.feedbackVersion)
          text('feedback', '');
      }, 5000);
    }
    return true;
  } catch (e) {
    text('error', e.message);
    return false;
  }
}

// A tempo other than the visitor's own is a view tempo (a zoomed fish runs slower); the server
// lets it lapse unless it is renewed, so a page closed mid-zoom does not leave the tank slow.
export const VIEW_TEMPO_RENEW = 2000;
export function requestTempo(value, base) {
  return value === base ? command('delay', {value}) : command('view-delay', {value, base});
}

export function updateSessionState(patch) {
  Object.assign(sessionState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "neuronFocus" : () => { sessionState.neuronFocus = -1; },
  "historyData" : () => { sessionState.historyData = null; },
  "historyBusy" : () => { sessionState.historyBusy = false; },
  "lastHistory" : () => { sessionState.lastHistory = 0; },
  "sessionId" : () => { sessionState.sessionId = null; },
  "busy" : () => { sessionState.busy = false; },
  "feedbackVersion" : () => { sessionState.feedbackVersion = 0; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
