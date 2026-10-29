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
            reject(Error('Die Anfrage dauert zu lange. Bitte den Status prüfen.'));
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

export async function command(op, extra = {}) {
  try {
    const r = await request('/command', {
      method : 'POST',
      headers : {'Content-Type' : 'application/json', 'X-Fish-Token' : window.FISH_TOKEN},
      body : JSON.stringify({command : op, ...extra})
    });
    const d = await r.json();
    if (!r.ok)
      throw Error(d.error);
    text('error', '');
    if (d.message) {
      text('feedback', d.message);
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
