import {updateBrainState} from './brain.js';
import {brainClamp, brainState, brainWrap} from './brain.js';
import {rgb} from './dom.js';
import {TankPath} from './renderer.js';
export const brain_modelState = {};
export let sensorNames;

export let motorNames;

export let brainSenseColors;

export let scentNames;

export let scentColors;

export function brainScentWeights(n, r) {
  if (r?.[14]?.length === 8)
    return r[14];
  const width = brainClamp(n[20]?.[4] ?? .25), sigma = 12 + 168 * width * width, wide = width ** 4,
        height = brainClamp(n[20]?.[3] ?? 0, -1, 1),
        phi = Math.PI * (brainClamp(n[20]?.[2] ?? 0, -1, 1) + 1),
        rad = Math.sqrt(1 - height * height), lat = [ 90, 35, 35, 35, 35, -10, -60, -60 ],
        lon = [ 0, -25, 25, 155, 205, 180, 90, 270 ];
  return lat.map((v, k) => {
    const a = v * Math.PI / 180, b = lon[k] * Math.PI / 180,
          dot = rad * Math.cos(phi) * Math.cos(a) * Math.cos(b) +
                rad * Math.sin(phi) * Math.cos(a) * Math.sin(b) + height * Math.sin(a),
          angle = Math.acos(brainClamp(dot, -1, 1)) * 180 / Math.PI;
    return wide + (1 - wide) * Math.exp(-angle * angle / (2 * sigma * sigma));
  });
}

export function brainScentRGB(weights) {
  const hex = scentColors[weights.indexOf(Math.max(...weights))] || scentColors[0];
  return [ 1, 3, 5 ].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
}

export function scentDescription(r) {
  return (r[14] || []).map((v, k) => scentNames[k] + ' ' + Math.round(100 * v) + ' %').join(' · ');
}

export let brainMotorColors;

export function brainConnectivity(b) {
  if (brainState.brainWiringCache?.edges === b.edges)
    return brainState.brainWiringCache.counts;
  const counts = new Map(b.neurons.map(n => [n[5], [ 0, 0 ]]));
  for (const e of b.edges) {
    if (counts.has(e[0]))
      counts.get(e[0])[1]++;
    if (counts.has(e[1]))
      counts.get(e[1])[0]++;
  }
  updateBrainState({brainWiringCache : {edges : b.edges, counts}});
  return counts;
}

export let brainContext;

export let brainReduced;

export function brainHSV(h) {
  const f = (n, k = (n + h / 60) % 6) => 1 - Math.max(0, Math.min(k, 4 - k, 1));
  return [ f(5), f(3), f(1) ];
}

export function brainOrganRGB(n) {
  const p = n[20] || [], h = 180 * ((p[2] ?? 0) + 1), width = p[4] ?? .25,
        sigma = 12 + 168 * width * width, wide = width ** 4, absorb = [ 0, 120, 240 ].map(c => {
          const d = brainWrap((h - c) * Math.PI / 180) * 180 / Math.PI;
          return wide + (1 - wide) * Math.exp(-d * d / (2 * sigma * sigma));
        }),
        total = absorb.reduce((a, b) => a + b, 0);
  return absorb.map(v => 1 - v / total);
}

export function dominantCellPart(n) {
  const parts = [ [ 'internal', n[12] || 0 ] ];
  (n[13] || []).forEach((value, index) => parts.push([ 's' + index, value ]));
  (n[14] || []).forEach((value, index) => parts.push([ 'm' + index, value ]));
  return parts.reduce((a, b) => b[1] > a[1] ? b : a)[0];
}

export function cellParts(n) {
  const parts = [];
  if (n[12] > 0)
    parts.push([ 'Verarbeitung', n[12] ]);
  for (let k = 0; k < Math.max(sensorNames.length, motorNames.length); k++) {
    if (n[13]?.[k] > 0)
      parts.push([ sensorNames[k], n[13][k] ]);
    if (n[14]?.[k] > 0)
      parts.push([ motorNames[k], n[14][k] ]);
  }
  return parts.sort((a, b) => b[1] - a[1]);
}

export function partShare(n, key) {
  return key === 'internal' ? n[12]
         : key?.[0] === 's' ? n[13]?.[Number(key.slice(1))]
                            : n[14]?.[Number(key?.slice(1))];
}

export function neuronName(n, key = '') {
  return key && key !== 'all' ? (key === 'internal' ? 'Verarbeitung'
                                 : key[0] === 's'   ? sensorNames[Number(key.slice(1))]
                                                    : motorNames[Number(key.slice(1))])
                              : cellParts(n)[0]?.[0] || 'Zelle';
}

export function cellColor(n) {
  if (n[12] > .5)
    return '#b1bec4';
  const s = n[13] || [], m = n[14] || [], si = s.indexOf(Math.max(...s)),
        mi = m.indexOf(Math.max(...m));
  return (s[si] || 0) >= (m[mi] || 0) ? si === 1 ? rgb(brainScentRGB(brainScentWeights(n)))
                                        : si === 0
                                            ? 'hsl(' + 180 * ((n[20]?.[2] ?? 0) + 1) + ',65%,65%)'
                                            : brainSenseColors[si]
         : mi === 7 ? rgb(brainHSV(180 * ((n[20]?.[2] ?? 0) + 1)))
                                      : brainMotorColors[mi];
}

export function cellDescription(n, b) {
  const r = b.receptors.find(r => r[0] === n[5]);
  return '#' + n[6] + ' · ' + [ 'Gesicht', 'Kopf', 'Brust', 'Hinterteil' ][n[24] ?? 0] + ' · ' +
         cellParts(n)
             .map(([ name, share ]) => name + ' ' + Math.round(share * 100) + ' %')
             .join(' · ') +
         ' · Nutzbar ' + Math.round(100 * (n[21] ?? 1)) + ' %' +
         ((n[23] ?? 1) < 1
              ? ' · Grundrollengrenze: ' + Math.round(100 * (1 - n[23])) + ' % gedämpft'
              : '') +
         (n[12] > 0 || !r ? ' · Bias ' + (n[15] || 0).toFixed(3) : '') +
         (n[12] > 0 ? ' · Zeitkonstante ' + Math.round(n[16] || 0) + ' Schritte' : '') +
         (r ? ' · Signal: ' + sensorNames[r[1]] + ' · Richtung ' +
                  Math.round(r[2] * 180 / Math.PI) + '° · Schwelle ' +
                  (r[[ 0, 1, 2, 5, 6, 10 ].includes(r[1]) ? 13 : 4] || .001).toPrecision(3)
            : '') +
         (n[10] ? ' · stummgeschaltet' : '');
}

const initializers = {
  "sensorNames" : () => {
    sensorNames = [
      'Helligkeit', 'Geruch', 'Seitenlinie', 'Berührung', 'Nähe', 'Aufnahme', 'Gewebeschaden',
      'Blasendruck', 'Gonadendruck', 'Innendruck', 'Blutwerte'
    ];
  },
  "motorNames" : () => {
    motorNames = [
      'Vortrieb', 'Drehung', 'Saugen', 'Ei', 'Sperma', 'Beißen', 'Abwehr', 'Pigment',
      'Schwimmblase', 'Drüse'
    ];
  },
  "brainSenseColors" : () => {
    brainSenseColors = [
      '#e9c185', '#b6a5df', '#80c6db', '#dbb58a', '#dbca74', '#b5c580', '#ed8b8d', '#80a8c9',
      '#c7b978', '#db8d9d', '#c7aceb'
    ];
  },
  "scentNames" : () => {
    scentNames =
        [ 'Futter', 'Algen', 'Pflanzen', 'Bodentiere', 'Plankton', 'Aas', 'Eier', 'Sperma' ];
  },
  "scentColors" : () => {
    scentColors =
        [ '#ed9c75', '#58a849', '#a7cf59', '#dca57e', '#e7ba77', '#b27c77', '#c293df', '#8a9ef0' ];
  },
  "brainMotorColors" : () => {
    brainMotorColors = [
      '#a2d9c6', '#e9c185', '#8dc8d4', '#d6ba83', '#b6a5df', '#df9c8d', '#80c6db', '#b5b9c6',
      '#93cbd5', '#bc9fe4'
    ];
  },
  "brainContext" : () => { brainContext = new TankPath(); },
  "brainReduced" : () => {
    brainReduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
