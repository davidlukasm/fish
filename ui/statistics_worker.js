import {decodeState, connectionState, initialize as initializeConnection} from './connection.js';
import {initialize as initializeTransport} from './transport.js';

let session, reset, controller;
let speciesFingerprints = new Map();
function clear() {
  speciesFingerprints.clear();
  connectionState.speciesProfiles = {};
  initializeConnection([
    'stateVersion', 'cachedBrainLayout', 'profileKey', 'cachedIndividualProfile', 'renderAssets',
    'renderAssetsKey'
  ]);
  initializeTransport([ 'rawScene', 'sceneKey', 'lightCache' ]);
}
clear();
self.onmessage = async ({data}) => {
  if (data.cancel) {
    controller?.abort();
    return;
  }
  controller = new AbortController();
  try {
    if (reset !== data.reset) {
      clear();
      reset = data.reset;
    }
    const start = performance.now(), response = await fetch(data.url, {signal : controller.signal});
    if (!response.ok)
      throw Error('Verbindung unterbrochen');
    const body = await response.text(), downloadedAt = performance.now(), result = JSON.parse(body),
          parsedAt = performance.now();
    if (session !== result.session) {
      clear();
      session = result.session;
    }
    if (result.frame || result.frame_patches) {
      result.prepared_frame = decodeState(result, false);
      const species = result.prepared_frame.species || [];
      result.species_order = species.map(s => s.id);
      result.species_updates = [];
      const next = new Map();
      for (const s of species) {
        const before = speciesFingerprints.get(s.id) || {}, hashes = {}, change = {id : s.id};
        for (const [key, value] of Object.entries(s)) {
          hashes[key] = JSON.stringify(value);
          if (before[key] !== hashes[key])
            change[key] = value;
        }
        for (const key of Object.keys(before))
          if (!(key in hashes))
            change[key] = null;
        if (Object.keys(change).length > 1)
          result.species_updates.push(change);
        next.set(s.id, hashes);
      }
      speciesFingerprints = next;
      delete result.prepared_frame.species;
      // Transfer each value once and retain unchanged species fields on the UI thread.
      for (const key of ['frame', 'frame_patches', 'render_assets', 'asset_ids', 'brain_layout',
                         'species_profiles', 'species_profile_ids', 'individual_profile'])
        delete result[key];
    }
    self.postMessage({
      ticket : data.ticket,
      result,
      bytes : Number(response.headers.get('Content-Length')),
      timing : {
        download_ms : downloadedAt - start,
        worker_json_ms : parsedAt - downloadedAt,
        worker_decode_ms : performance.now() - parsedAt
      }
    });
  } catch (error) {
    self.postMessage({ticket : data.ticket, error : error.message, name : error.name});
  }
};
