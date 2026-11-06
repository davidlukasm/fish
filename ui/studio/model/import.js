import {MOTOR_KIND, SENSE_KIND, HORMONES} from '../../schema.js';
import {contactTopology, defaults, newDocument, validateDocument} from './document.js';
import {ORGAN_BY_KEY, nerve, nerveKind} from './organs.js';
import {latticeBearing, retinalBins} from './retina.js';

const PRECISION = 1e-5;
const near = (a, b) => Math.abs(a - b) < PRECISION;
const traitKey = values => JSON.stringify(values.map(v => Math.round(v / PRECISION)));
function kind(g) {
  if (g.role === 1)
    return 'brain';
  const kinds = g.role === 0 ? {
    [SENSE_KIND.light] : 'eye',
    [SENSE_KIND.proximity] : 'proximity',
    [SENSE_KIND.inner_pressure] : 'gut'
  }
                             : {
                                 [MOTOR_KIND.forward] : 'muscle',
                                 [MOTOR_KIND.turn] : 'muscle',
                                 [MOTOR_KIND.suction] : 'muscle',
                                 [MOTOR_KIND.aggression] : 'muscle',
                                 [MOTOR_KIND.pigment] : 'pigment',
                                 [MOTOR_KIND.gland] : 'gland',
                                 [MOTOR_KIND.eggs] : 'eggs',
                                 [MOTOR_KIND.sperm] : 'sperm'
                               };
  if (!kinds[g.function])
    throw new Error('studio.errors.invalidDocument');
  return kinds[g.function];
}
function importWires(doc, centers, connections) {
  const remaining = new Set(connections.map(([ a, b ]) => `${centers[a].id}/${centers[b].id}`));
  const endpoints = doc.organs.filter(o => o.type !== 'brain' && o.centers.length > 1)
                        .map(o => ({id : o.id, centers : o.centers}));
  endpoints.push(...centers.map(c => ({id : c.id, centers : [ c ]})));
  endpoints.sort((a, b) => b.centers.length - a.centers.length);
  for (const from of endpoints.filter(e => e.centers.every(c => c.role !== 'motor')))
    for (const to of endpoints.filter(e => e.centers.every(c => c.role !== 'sensor'))) {
      const pairs = from.centers.flatMap(a => to.centers.map(b => `${a.id}/${b.id}`));
      if (!pairs.every(p => remaining.has(p)))
        continue;
      doc.wires.push({
        id : `start-wire-${doc.wires.length}`,
        from : from.id,
        to : to.id,
        spread : 0,
        pairing : null
      });
      pairs.forEach(p => remaining.delete(p));
    }
  if (remaining.size)
    throw new Error('studio.errors.invalidDocument');
}
export function startDocument(source, sites, name) {
  const doc = newDocument(name), imported = [], bins = retinalBins(sites);
  for (const [index, entry] of source.groups.entries()) {
    const g = entry.cell, type = kind(g);
    const site = sites.find(s => s.zone === g.zone && s.side === g.side && near(s.u, g.u0) &&
                                 near(s.v, g.v0) && near(s.w, g.w0));
    if (!site)
      throw new Error('studio.errors.invalidSite');
    const definition = ORGAN_BY_KEY[type];
    const single = type === 'brain' || definition.scope === 'single';
    const family = type === 'muscle'  ? g.function
                   : type === 'gland' ? traitKey([ g.q1, g.q2, g.qwidth ])
                                      : '';
    const id = type === 'brain' ? 'brain' : `start-${type}-${family}-${single ? 0 : g.side}`;
    let organ = doc.organs.find(o => o.id === id);
    if (!organ) {
      organ = {id, type, side : single ? 0 : g.side, centers : [], linked : false};
      doc.organs.push(organ);
    }
    const desc = type === 'brain' ? {...nerve(nerveKind(g), g.copies, null), surface : 'any'}
                 : type === 'gut' ? definition.centers.find(c => c.key === 'fullness')
                 : [ 'eggs', 'sperm' ].includes(type)
                     ? definition.centers.find(c => c.key === (site.outer ? 'release' : 'growth'))
                     : definition.centers[0];
    const center = defaults(desc, site);
    for (const key of ['copies', 'threshold', 'tau', 'field', 'q1', 'q2', 'qwidth', 'sign', 'mode',
                       'pace', 'modulator', 'crossing', 'range'])
      center[key] = Math.max([ 'copies', 'tau', 'field', 'qwidth', 'range' ].includes(key) ? 0 : -1,
                             Math.min(key === 'copies' ? g.copies : 1, g[key]));
    center.id = `start-cell-${index}`;
    center.receptors = structuredClone(entry.receptors);
    center.contact = [...entry.address ];
    organ.centers.push(center);
    imported.push(center);
  }
  for (const organ of doc.organs) {
    const groups = new Map();
    if ([ 'eye', 'proximity', 'pigment' ].includes(organ.type)) {
      for (const center of organ.centers) {
        const key = traitKey([ center.q1, center.q2, center.qwidth, center.threshold ]);
        if (!groups.has(key))
          groups.set(key, {
            id : `type-${groups.size}`,
            q1 : center.q1,
            q2 : center.q2,
            qwidth : center.qwidth,
            threshold : center.threshold
          });
        center.profile = groups.get(key).id;
      }
    }
    if ([ 'eye', 'proximity' ].includes(organ.type)) {
      const covered = organ.centers.map(
          c => bins.find(b => b.angle === latticeBearing(sites.find(s => s.id === c.site))));
      organ.centers.forEach((c, i) => { c.id = `${organ.id}:${c.profile}:${covered[i].index}`; });
      organ.field = {
        lo : Math.min(...covered.map(b => b.lo)),
        hi : Math.max(...covered.map(b => b.hi)),
        density : Math.max(...organ.centers.map(c => c.copies)),
        resolution : organ.centers[0].field,
        profiles : [...groups.values() ],
        sampled : true
      };
    }
    if (organ.side) {
      const other = doc.organs.find(o => o.type === organ.type && o.side === -organ.side &&
                                         o.id.slice(0, -String(o.side).length) ===
                                             organ.id.slice(0, -String(organ.side).length));
      if (other) {
        organ.pair = other.id;
        organ.linked = true;
      }
    }
  }
  const substances = new Set([ source.growth, ...imported.flatMap(c => c.receptors) ]
                                 .filter(r => r.active && r.substance < HORMONES.levels)
                                 .map(r => r.substance));
  doc.substances =
      [...substances ].sort().map(index => ({id : `start-substance-${index}`, index, name : ''}));
  doc.growth = structuredClone(source.growth);
  importWires(doc, imported, source.connections);
  doc.source = {
    development : source.development,
    variation : source.variation,
    topology : contactTopology(doc)
  };
  validateDocument(doc);
  return doc;
}
