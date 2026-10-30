// The nervous system as a metro map: senses at the head, centres in the middle, organs towards
// the tail. Each line bundles all synapses between two stations; trains show the running signal
// flow. Below: the hormone weather and a liveblog of thoughts composed from the live signals.
import {brainMotorColors, brainSenseColors, scentNames} from './brain_model.js';
import {el} from './dom.js';
import {hormoneColors, hormoneName} from './hormones.js';
import {ORGAN_ICONS} from './organs.js';
import {command} from './session.js';
export const nerve_mapState = {};

const NS = 'http://www.w3.org/2000/svg';
const BODY = 'M150 10C214 12 266 88 281 186C292 268 252 398 178 518L214 594Q150 566 86 594' +
             'L122 518C48 398 8 268 19 186C34 88 86 12 150 10Z';
// id: [x, y, name, icon, Viennese accusative phrase for thoughts]
const STATIONS = {
  suck : [ 118, 32, 'Saugen', 'm2', 'mein Saugapparat' ],
  bite : [ 182, 32, 'Kiefer', 'm5', 'mein Kiefer' ],
  noseL : [ 88, 66, 'Nase links', 's1', 'mei linkes Nasnloch' ],
  noseR : [ 212, 66, 'Nase rechts', 's1', 'mei rechtes Nasnloch' ],
  touch : [ 150, 86, 'Haut', 's3', 'mei Haut' ],
  eyeL : [ 62, 118, 'Auge links', 's0', 'mei linkes Aug' ],
  eyeR : [ 238, 118, 'Auge rechts', 's0', 'mei rechtes Aug' ],
  seeC : [ 98, 192, 'Sehzentrum', 'internal', 'mei Sehzentrum' ],
  smellC : [ 202, 192, 'Riechzentrum', 'internal', 'mei Riechzentrum' ],
  latL : [ 32, 232, 'Seitenlinie links', 's2', 'mei linke Seitnlinie' ],
  latR : [ 268, 232, 'Seitenlinie rechts', 's2', 'mei rechte Seitnlinie' ],
  steer : [ 150, 262, 'Steuerzentrale', 'internal', 'mei Steuerzentrale' ],
  turnL : [ 52, 320, 'Drehflosse links', 'm1', 'mei linke Drehflossn' ],
  turnR : [ 248, 320, 'Drehflosse rechts', 'm1', 'mei rechte Drehflossn' ],
  gut : [ 98, 346, 'Bauchgefühl', 's4', 'mei Bauchgfühl' ],
  hsense : [ 202, 346, 'Hormonsinn', 's10', 'mein Hormonsinn' ],
  hind : [ 150, 382, 'Hinterhirn', 'internal', 'mei Hinterhirn' ],
  spines : [ 70, 420, 'Stacheln', 'm6', 'mei Stacheln' ],
  pigment : [ 230, 420, 'Pigment', 'm7', 'mei Pigmente' ],
  bladder : [ 116, 446, 'Schwimmblase', 'm8', 'mei Schwimmblasn' ],
  gland : [ 184, 446, 'Hirndrüse', 'm9', 'mei Hirndrüsn' ],
  egg : [ 124, 500, 'Ei', 'm3', 'mei Ei-Organ' ],
  sperm : [ 176, 500, 'Sperma', 'm4', 'mei Sperma-Organ' ],
  tail : [ 150, 560, 'Schwanzflosse', 'm0', 'mei Schwanzflossn' ]
};
const MOTOR_STATIONS =
    [ 'tail', 'turn', 'suck', 'egg', 'sperm', 'bite', 'spines', 'pigment', 'bladder', 'gland' ];
const HORMONE_SPOTS = [ [ 92, 150 ], [ 208, 150 ], [ 104, 420 ], [ 196, 420 ] ];
const EFFECTS = [
  [ '⚡', 'Erregung' ], [ '✎', 'Lernen' ], [ '⚔', 'Konkurrenz' ], [ '∿', 'Nachklang' ],
  [ '♪', 'Rhythmus' ], [ '◉', 'Netzhaut' ]
];

const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
const clamp = (x, a = 0, b = 1) => {
  x = Number(x);
  return x !== x ? a : Math.max(a, Math.min(b, x));
};
const percent = x => Math.round(100 * clamp(x)) + ' %';
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

function stationColor(id) {
  if (id === 'seeC')
    return brainSenseColors[0];
  if (id === 'smellC')
    return brainSenseColors[1];
  if (id === 'steer')
    return '#a7b6d5';
  if (id === 'hind')
    return '#c9a7d5';
  const icon = STATIONS[id][3], k = Number(icon.slice(1));
  return icon[0] === 's' ? brainSenseColors[k] : brainMotorColors[k];
}

// The dominant share decides the station: sense cells by organ and side, motor cells by organ,
// processing cells by the body band they sit in.
function stationOf(n) {
  if (!n[4])
    return '';
  let best = n[12] || 0, kind = 'i', k = -1;
  (n[13] || []).forEach((v, j) => {
    if (v > best)
      [best, kind, k] = [ v, 's', j ];
  });
  (n[14] || []).forEach((v, j) => {
    if (v > best)
      [best, kind, k] = [ v, 'm', j ];
  });
  const left = n[0] < 0;
  if (kind === 's')
    return k === 0    ? (left ? 'eyeL' : 'eyeR')
           : k === 1  ? (left ? 'noseL' : 'noseR')
           : k === 2  ? (left ? 'latL' : 'latR')
           : k === 3  ? 'touch'
           : k === 10 ? 'hsense'
                      : 'gut';
  if (kind === 'm')
    return k === 1 ? (left ? 'turnL' : 'turnR') : MOTOR_STATIONS[k] || '';
  const band = Math.round((.875 - n[1]) / .25);
  return band <= 0 || band === 2    ? 'seeC'
         : band === 1 || band === 3 ? 'smellC'
         : band === 4               ? 'steer'
                                    : 'hind';
}

// Octilinear like a metro map: straight, one diagonal, straight again.
function route(a, b, offset) {
  const [ax, ay] = a, [ bx, by ] = b, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1,
             ox = -dy / len * offset, oy = dx / len * offset;
  let points;
  if (Math.abs(dy) >= Math.abs(dx)) {
    const s = Math.sign(dy) * (Math.abs(dy) - Math.abs(dx)) / 2;
    points = [ [ ax, ay ], [ ax, ay + s ], [ bx, by - s ], [ bx, by ] ];
  } else {
    const s = Math.sign(dx) * (Math.abs(dx) - Math.abs(dy)) / 2;
    points = [ [ ax, ay ], [ ax + s, ay ], [ bx - s, by ], [ bx, by ] ];
  }
  return 'M' + points.map(p => (p[0] + ox).toFixed(1) + ' ' + (p[1] + oy).toFixed(1)).join('L');
}

function node(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {}))
    e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

function buildPlan(b, svg) {
  const station = new Map(), members = new Map(), lines = new Map();
  for (const n of b.neurons) {
    const s = stationOf(n);
    if (!s)
      continue;
    station.set(n[5], s);
    if (!members.has(s))
      members.set(s, []);
    members.get(s).push(n[5]);
  }
  const loops = new Map();
  b.edges.forEach((e, i) => {
    const a = station.get(e[0]), c = station.get(e[1]);
    if (!a || !c)
      return;
    if (a === c) {
      loops.set(a, (loops.get(a) || 0) + Math.abs(e[2]));
      return;
    }
    const key = a + '>' + c;
    let l = lines.get(key);
    if (!l)
      lines.set(key, l = {key, from : a, to : c, edges : [], sum : 0, plus : 0});
    l.edges.push(i);
    l.sum += Math.abs(e[2]);
    if (e[2] >= 0)
      l.plus += e[2];
  });
  const all = [...lines.values() ].sort((p, q) => q.sum - p.sum), max = all[0]?.sum || 1,
        shown = all.filter((l, i) => i < 70 && l.sum > .015 * max);
  svg.replaceChildren();
  const defs = node('defs', {}, svg);
  node('path', {d : BODY}, node('clipPath', {id : 'nm-clip'}, defs));
  hormoneColors.forEach((color, k) => {
    const g = node('radialGradient', {id : 'nm-h' + k}, defs);
    node('stop', {offset : '0', 'stop-color' : color, 'stop-opacity' : '.75'}, g);
    node('stop', {offset : '1', 'stop-color' : color, 'stop-opacity' : '0'}, g);
  });
  node('path', {d : BODY, class : 'nm-body'}, svg);
  const weather = node('g', {'clip-path' : 'url(#nm-clip)'}, svg),
        clouds = HORMONE_SPOTS.map(
            ([ x, y ], k) => node(
                'circle', {cx : x, cy : y, r : 60, fill : `url(#nm-h${k})`, opacity : 0}, weather));
  node('path', {d : 'M150 30V575', class : 'nm-spine'}, svg);
  const lineLayer = node('g', {}, svg), stationLayer = node('g', {}, svg);
  for (const l of shown) {
    const a = STATIONS[l.from], c = STATIONS[l.to], back = lines.has(l.to + '>' + l.from),
          d = route(a, c, back ? (l.from < l.to ? 2.4 : -2.4) : 0),
          width = 1.1 + 4.4 * Math.sqrt(l.sum / max), color = stationColor(l.from),
          g = node('g', {class : 'nm-route'}, lineLayer);
    l.inhibitory = l.plus < l.sum / 2;
    l.width = width;
    l.learnPath = node('path', {d, class : 'nm-learn', 'stroke-width' : width}, g);
    l.path = node('path', {
      d,
      class : 'nm-line' + (l.inhibitory ? ' nm-inhibitory' : ''),
      stroke : color,
      'stroke-width' : width
    },
                  g);
    l.train = node('path', {d, class : 'nm-train', 'stroke-width' : Math.max(1.6, width * .8)}, g);
    l.group = g;
    l.offset = 0;
    l.flow = 0;
    l.learned = 0;
    g.addEventListener('pointerenter', () => hoverLine(l));
    g.addEventListener('pointerleave', () => hoverStation(''));
  }
  const stations = new Map();
  let biggest = 1;
  for (const ids of members.values())
    biggest = Math.max(biggest, ids.length);
  for (const [id, ids] of members) {
    const [x, y, name, icon] = STATIONS[id], color = stationColor(id),
                       r = 7 + 5 * Math.sqrt(ids.length / biggest),
                       g = node(
                           'g',
                           {class : 'nm-station', transform : `translate(${x} ${y})`, tabindex : 0},
                           stationLayer);
    g.style.setProperty('--station', color);
    const pulse = node('circle', {r, class : 'nm-pulse'}, g),
          ring = node('circle', {r, class : 'nm-ring', stroke : color}, g),
          core = node('circle', {r : r - 2.2, class : 'nm-core', fill : color, opacity : .15}, g),
          scale = (r * 1.25) / 24;
    node('path', {
      d : ORGAN_ICONS[icon] || ORGAN_ICONS.internal,
      class : 'nm-icon',
      transform : `scale(${scale.toFixed(3)}) translate(-12 -12)`,
      'stroke-width' : (1.3 / scale).toFixed(2)
    },
         g);
    node('text', {y : r + 9}, g).textContent = name.replace(/ (links|rechts)$/, '');
    const title = node('title', {}, g);
    stations.set(id,
                 {id, g, ring, core, pulse, title, ids, activity : 0, loop : loops.get(id) || 0});
    g.addEventListener('pointerenter', () => hoverStation(id));
    g.addEventListener('pointerleave', () => hoverStation(''));
    g.addEventListener('click', () => pokeStation(id));
    g.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ')
        pokeStation(id);
    });
  }
  const slots = new Map();
  b.edges.forEach((e, i) => slots.set(e[3], i));
  return {
    fish : b.id,
    layout : b.layout_id,
    count : b.edges.length,
    station,
    members,
    lines : shown,
    hidden : all.length - shown.length,
    stations,
    clouds,
    slots,
    max
  };
}

function names(ids) { return ids.map(id => STATIONS[id]?.[2]).filter(Boolean); }

function hoverStation(id) {
  nerve_mapState.hover = id ? {stations : new Set([ id ]), lines : null} : null;
  const plan = nerve_mapState.plan, s = plan?.stations.get(id);
  if (!s) {
    el('nerve-map-info').textContent = 'Station antippen: Reiz durch ihre Zellen schicken.';
    return;
  }
  const out = plan.lines.filter(l => l.from === id).map(l => l.to),
        into = plan.lines.filter(l => l.to === id).map(l => l.from);
  el('nerve-map-info').textContent = STATIONS[id][2] + ' · ' + s.ids.length + ' Zellen · ' +
                                     percent(s.activity) + ' aktiv' +
                                     (into.length ? ' · ← ' + names(into).join(', ') : '') +
                                     (out.length ? ' · → ' + names(out).join(', ') : '');
}

function hoverLine(l) {
  nerve_mapState.hover = {stations : new Set([ l.from, l.to ]), lines : new Set([ l ])};
  el('nerve-map-info').textContent =
      STATIONS[l.from][2] + ' → ' + STATIONS[l.to][2] + ' · ' + l.edges.length + ' Synapsen · ' +
      Math.round(100 * l.plus / (l.sum || 1)) + ' % erregend · Fluss ' + (l.flow >= 0 ? '+' : '−') +
      percent(Math.abs(l.flow)) + (l.learned > .001 ? ' · gelernt ' + percent(l.learned) : '');
}

async function pokeStation(id) {
  const plan = nerve_mapState.plan, s = plan?.stations.get(id), b = nerve_mapState.brain;
  if (!s || !b)
    return;
  const nodes = nerve_mapState.nodes,
        ids = s.ids.filter(i => nodes.get(i)?.[4] && nodes.get(i)?.[7] && !nodes.get(i)?.[10]);
  if (!ids.length)
    return;
  s.pulse.classList.remove('nm-poke');
  void s.pulse.getBBox?.();
  s.pulse.classList.add('nm-poke');
  if (await command('stimulate', {neurons : ids, amount : 1}))
    nerve_mapState.poked = {id, at : performance.now()};
}

function highlight(plan, now) {
  const h =
      nerve_mapState.hover ||
      (nerve_mapState.focus && now < nerve_mapState.focus.until ? nerve_mapState.focus : null);
  const key = h ? [...h.stations ].join() + (h.lines ? ':' + [...h.lines ].length : '') : '';
  if (plan.highlightKey === key)
    return;
  plan.highlightKey = key;
  for (const s of plan.stations.values())
    s.g.classList.toggle('nm-dim', !!h && !h.stations.has(s.id));
  for (const l of plan.lines) {
    const a = h?.stations.has(l.from), c = h?.stations.has(l.to),
          shown = !h || (h.lines                         ? h.lines.has(l)
                         : h.pair && h.stations.size > 1 ? a && c
                                                         : a || c);
    l.group.classList.toggle('nm-dim', !shown);
  }
}

function updateLive(b, plan, now) {
  const state = b.neuron_state, act = new Map();
  for (const n of b.neurons)
    act.set(n[5], state?.[n[5]]?.[0] ?? n[3] ?? 0);
  for (const s of plan.stations.values()) {
    let sum = 0;
    for (const i of s.ids)
      sum += Math.abs(act.get(i) || 0);
    s.activity = s.ids.length ? sum / s.ids.length : 0;
    s.core.setAttribute('opacity', (.12 + .88 * clamp(s.activity * 1.4)).toFixed(2));
    s.title.textContent =
        STATIONS[s.id][2] + ' · ' + s.ids.length + ' Zellen · ' + percent(s.activity) + ' aktiv';
  }
  const learned = b.learning?.weights?.length ? new Map(b.learning.weights) : null;
  for (const l of plan.lines) {
    let flow = 0, change = 0;
    for (const i of l.edges) {
      const e = b.edges[i];
      flow += (act.get(e[0]) || 0) * e[2];
      if (learned?.has(e[3]))
        change += Math.abs(learned.get(e[3]) - e[2]);
    }
    l.flow = flow / (l.sum || 1);
    l.learned = change / (l.sum || 1);
    const strength = clamp(Math.abs(l.flow) * 2.5);
    l.train.setAttribute('opacity', (strength > .06 ? .15 + .75 * strength : 0).toFixed(2));
    l.train.classList.toggle('nm-brake', l.flow < 0);
    l.learnPath.setAttribute('stroke-width', (l.width + 9 * clamp(l.learned * 4)).toFixed(1));
    l.learnPath.setAttribute('opacity', l.learned > .002 ? .25 + .6 * clamp(l.learned * 4) : 0);
  }
  const levels = b.hormones?.levels || [];
  plan.clouds.forEach((c, k) => {
    const v = clamp(levels[k]);
    c.setAttribute('r', (45 + 95 * v).toFixed(0));
    c.setAttribute('opacity', (.08 + .7 * v).toFixed(2));
  });
  nerve_mapState.activity = act;
}

function moveTrains(plan, now) {
  const dt = Math.min(.1, (now - (plan.movedAt || now)) / 1000);
  plan.movedAt = now;
  for (const l of plan.lines) {
    l.offset -= Math.sign(l.flow || 1) * (8 + 70 * clamp(Math.abs(l.flow) * 2.5)) * dt;
    l.train.setAttribute('stroke-dashoffset', (l.offset % 1000).toFixed(1));
  }
}

// ---------------------------------------------------------------------- hormone weather
function hormoneEffects(b) {
  const sum = [ 0, 0, 0, 0, 0, 0 ];
  let count = 0;
  for (const n of b.neurons)
    if (n[4] && n[12] > 0 && n[27]?.length) {
      n[27].forEach((v, k) => sum[k] += v);
      count++;
    }
  return count ? sum.map(v => v / count) : sum;
}

function renderWeather(b, effects) {
  const box = el('nerve-weather'), h = b.hormones;
  if (!box)
    return;
  box.hidden = !h;
  if (!h)
    return;
  if (box.children.length !== 5) {
    box.replaceChildren();
    for (let k = 0; k < 4; k++) {
      const chip = document.createElement('span');
      chip.className = 'nerve-front';
      chip.style.setProperty('--hormone', hormoneColors[k]);
      chip.append(document.createElement('b'), document.createElement('small'));
      box.append(chip);
    }
    const effect = document.createElement('small');
    effect.className = 'nerve-effects';
    box.append(effect);
  }
  const mind = nerve_mapState.mind;
  for (let k = 0; k < 4; k++) {
    const v = clamp(h.levels?.[k]), trend = v - (mind.hormoneSlow[k] ?? v), chip = box.children[k],
          sky = v < .15   ? '○'
                : v < .4  ? '◔'
                : v < .65 ? '◑'
                : v < .85 ? '◕'
                          : '●';
    chip.children[0].textContent = sky + ' ' + hormoneName(h, k);
    chip.children[1].textContent = percent(v) + (trend > .01 ? ' ↑' : trend < -.01 ? ' ↓' : ' →');
    chip.title = hormoneName(h, k) +
                 (h.names?.[k]?.description ? ' · ' + h.names[k].description : '') +
                 ' · Ausschüttung ' + (h.secretion?.[k] || 0).toPrecision(2) + ' · Abbau ' +
                 (h.binding?.[k] || 0).toPrecision(2);
  }
  const shifted = effects.map((v, k) => [k, v]).filter(([, v ]) => Math.abs(v) > .03);
  box.children[4].textContent =
      shifted.length
          ? shifted
                .map(([ k, v ]) => EFFECTS[k][0] + ' ' + EFFECTS[k][1] + ' ' + (v > 0 ? '+' : '−') +
                                   Math.round(100 * Math.abs(v)) + ' %')
                .join('  ')
          : 'Hormone wirken gerade kaum auf die Nervenzellen.';
}

// ---------------------------------------------------------------------- thoughts
// The fish thinks in Viennese; the controls around it stay standard German.
const SCENT_SAY = [
  [ 'Futter', 'was Guates', 'was zum Essen', 'Futterbrocken' ],
  [ 'Algen', 'Algenrasen', 'Grünzeug am Stein' ], [ 'Pflanzen', 'Grünzeug', 'Blattlwerk' ],
  [ 'Bodentiere', 'Würmerl', 'Gwurl im Boden' ], [ 'Plankton', 'Schwebfutter', 'Gwurl' ],
  [ 'Aas', 'was Totes', 'Verwesung' ], [ 'Eier', 'Laich', 'Eierduft' ],
  [ 'Sperma', 'Milch', 'Paarungsduft' ]
];
const SIDE = {
  links : [ 'links', 'links', 'auf der linken Seitn', 'backbord' ],
  rechts : [ 'rechts', 'rechts', 'auf der rechten Seitn', 'steuerbord' ],
  vorn : [ 'vorn', 'grad vor mir', 'rundherum', 'irgendwo da' ]
};
const MOODS = {
  daschreckt : [ '😱', [ 'Au weh!', 'Jessas!', 'Hilfe!', 'Na servas!' ] ],
  'ang’fressen' : [ '😠', [ 'Geh bitte.', 'Heast!', 'Schleich di!', 'Na wart.' ] ],
  verfressen : [ '🤤', [ 'Hunger!', 'Mahlzeit!', 'Gusto!', 'Her damit!' ] ],
  grantig : [ '😒', [ 'Mah.', 'Na geh.', 'Na bravo.', 'Typisch.' ] ],
  verschossen : [ '😍', [ 'Hach.', 'Jö.', 'Oh mei.', 'Ach, des Leben.' ] ],
  fürwitzig : [ '🤔', [ 'Nanu?', 'Schau, schau.', 'Ui?', 'Wart amal.' ] ],
  gscheit : [ '🧐', [ 'Aha!', 'Interessant.', 'So is des.', 'Ah, jetzt hab i’s.' ] ],
  zfrieden : [ '😌', [ 'Ah.', 'Schön.', 'Leiwand.', 'Herrlich.' ] ],
  tramhapert : [ '😴', [ 'Hm …', 'Blubb.', 'Tja.', 'Gähn.' ] ],
  aufdraht : [ '⚡', [ 'Heast!', 'Auf geht’s!', 'Ui!', 'Juhu!' ] ]
};
const FEEL = [
  [
    [ 'i werd ganz zappelig', 'alles kribbelt', 'hellwach!', 'Strom auf allen Leitungen' ],
    [ 'alles wird ruhig', 'i werd a bissl lahm', 'gedämpfte Stimmung', 'Ruh in die Bahnen' ]
  ],
  [
    [ 'jetzt merk i ma alles', 'Lernlaune!', 'alles is auf amal wichtig' ],
    [ 'heut lern i nix mehr', 'Kopf zu', 'bleibt eh alles, wie’s is' ]
  ],
  [
    [ 'a Gedanke druckt den andern weg', 'nur mehr oans zählt', 'Tunnelblick' ],
    [ 'alles gleichzeitig', 'a Pallawatsch im Kopf', 'alles irgendwie wichtig' ]
  ],
  [
    [ 'des hallt lang nach', 'i vergiss ned so schnell', 'des bleibt hängen' ],
    [ 'alles rauscht vorbei', 'kurzes Gedächtnis heut', 'scho wieder vergessen' ]
  ],
  [
    [ 'mei Takt wird schneller', 'alles im Rhythmus', 'Puls auf hundert' ],
    [ 'mei Takt wird langsam', 'alles zieht si', 'gemächlich' ]
  ],
  [
    [ 'die Farben san kräftiger', 'i siech schärfer', 'die Welt leuchtet' ],
    [ 'alles schaut blass aus', 'die Augen werden müd', 'grau in grau' ]
  ]
];

function sideOf(l, r, from = false) {
  const d = (r - l) / (Math.abs(l) + Math.abs(r) + 1e-6), side = d > .2    ? 'rechts'
                                                                 : d < -.2 ? 'links'
                                                                           : 'vorn';
  return from ? 'von ' + (side === 'vorn' ? pick([ 'vorn', 'überall' ]) : side) : pick(SIDE[side]);
}
function intensity(x, words) { return pick(words[x < .33 ? 0 : x < .66 ? 1 : 2]); }

function freshMind(b) {
  return {
    fish : b.id,
    slow : {},
    peak : {},
    last : {},
    recent : [],
    topics : [],
    quietSince : performance.now(),
    hormoneSlow : [],
    effects : null,
    changed : b.learning?.changed || 0,
    prev : {},
    count : 0
  };
}

// Slow baselines turn levels into news: a thought arises from what changed.
function track(m, key, value, rate = .08) {
  const old = m.slow[key] ?? value;
  m.slow[key] = old + (value - old) * rate;
  m.peak[key] = Math.max(Math.abs(value), (m.peak[key] || 1e-6) * .997);
  return {value, rise : value - old, norm : Math.abs(value) / (m.peak[key] || 1)};
}

function moodOf(f) {
  if (f.pain > .2 || f.health < .3)
    return 'daschreckt';
  if (f.aggression > .3)
    return 'ang’fressen';
  if (f.hunger > .7)
    return f.excite > .05 || f.thrust > .6 ? 'verfressen' : 'grantig';
  if (f.ready > .85)
    return 'verschossen';
  if (f.learning > .5)
    return 'gscheit';
  if (f.novelty > .45)
    return 'fürwitzig';
  if (f.excite > .1)
    return 'aufdraht';
  if (f.fullness > .5)
    return 'zfrieden';
  return f.thrust < .2 ? 'tramhapert' : 'zfrieden';
}

function think(b, plan, now) {
  const m = nerve_mapState.mind, st = id => plan.stations.get(id)?.activity || 0,
        has = id => plan.stations.has(id), c = [];
  const cool = (topic, span) => clamp((now - (m.last[topic] || -1e9)) / (span * 1000));
  const add = (topic, salience, text, stations, icon, span = 8) => {
    const s = salience * cool(topic, span) * (m.topics.includes(topic) ? .45 : 1);
    if (s > 0 && text)
      c.push({topic, s, text, stations, icon});
  };
  const effects = hormoneEffects(b), levels = b.hormones?.levels || [];
  const f = {
    hunger : 0,
    fullness : clamp(b.satiety),
    condition : b.peak_tissue > b.tissue_floor
                    ? clamp((b.tissue - b.tissue_floor) / (b.peak_tissue - b.tissue_floor))
                    : 1,
    pain : clamp(b.pain),
    health : b.health ?? 1,
    aggression : clamp(b.aggression),
    defense : clamp(Math.max(b.defense || 0, b.active_defense || 0)),
    ready : Math.max(b.egg_readiness || 0, b.sperm_readiness || 0) * clamp(b.gonad_filling),
    excite : effects[0],
    learning : clamp(((b.learning?.changed || 0) - m.changed) / 5),
    thrust : track(m, 'thrust', Math.abs(b.thrust || 0)).norm,
    novelty : 0
  };
  f.hunger = clamp(.6 * (1 - f.fullness) + .4 * (1 - f.condition));
  // Senses: rises above the slow baseline are news.
  const eye = [ track(m, 'eyeL', st('eyeL')), track(m, 'eyeR', st('eyeR')) ],
        lat = [ track(m, 'latL', st('latL')), track(m, 'latR', st('latR')) ],
        skin = track(m, 'touch', st('touch')),
        contact = track(m, 'contact', Math.abs(b.contact || 0), .2);
  const seen = Math.max(...eye.map(e => Math.abs(e.rise))) * 6;
  f.novelty = clamp(seen + Math.max(...lat.map(e => e.rise)) * 6);
  if (has('eyeL') || has('eyeR')) {
    const side = sideOf(Math.abs(eye[0].rise), Math.abs(eye[1].rise)),
          brighter = eye[0].rise + eye[1].rise > 0;
    add('sight', clamp(seen), pick([
          `Da rührt si was ${side}.`, `${cap(side)} wird’s ${brighter ? 'heller' : 'finsterer'}.`,
          `Was ${brighter ? 'glitzert' : 'huscht'} da ${side}?`,
          `Mei Augen melden was Neues ${side}.`, `A ${brighter ? 'Glitzern' : 'Schatten'} ${side}?`,
          `Sehzentrum feuert – ${percent(st('seeC'))} aktiv.`, 'I siech was, was du ned siehst …'
        ]),
        [ eye[0].rise > eye[1].rise ? 'eyeL' : 'eyeR', 'seeC' ], '👁', 5);
  }
  if (has('latL') || has('latR')) {
    const wave = clamp(Math.max(lat[0].rise, lat[1].rise) * 7),
          from = sideOf(lat[0].value, lat[1].value, true),
          side = sideOf(lat[0].value, lat[1].value);
    add('lateral', wave, pick([
          `Druckwelle ${from} – schwimmt da wer vorbei?`, `Des Wasser zittert ${side}.`,
          `Strömung ${from}.`, 'Mei Seitenlinie kribbelt.', `A Wirbel ${side}.`,
          `Wellen ${from}. Groß oder klein?`
        ]),
        [ lat[0].value > lat[1].value ? 'latL' : 'latR', 'steer' ], '〰', 7);
  }
  if (contact.rise > .05 || skin.rise > .08)
    add('touch', clamp(Math.max(contact.rise * 3, skin.rise * 6)), pick([
          'Hoppala, Berührung!', 'I renn wo an.', 'Da is was Hartes.', 'Kontakt!',
          'Wer remplt mi da an?', 'Hautkontakt – Haberer oder Feind?'
        ]),
        [ 'touch' ], '✋', 6);
  // Smell: strongest channel relative to its own recent peak, side from both nostrils.
  const nose = b.nose_samples || [];
  let scent = -1, scentNews = 0, scentLevel = 0;
  for (let k = 0; k < 8; k++) {
    const l = nose[0]?.[3 + k] || 0, r = nose[1]?.[3 + k] || 0,
          t = track(m, 'scent' + k, Math.max(l, r), .05),
          news = clamp(t.rise / ((m.peak['scent' + k] || 1e-6)) * 4) * .8 + t.norm * .15;
    if (news > scentNews)
      [scent, scentNews, scentLevel] = [ k, news, t.norm ];
  }
  if (scent >= 0 && (has('noseL') || has('noseR'))) {
    const l = nose[0]?.[3 + scent] || 0, r = nose[1]?.[3 + scent] || 0, x = pick(SCENT_SAY[scent]),
          side = sideOf(l, r), edible = scent <= 4;
    const follow =
        edible
            ? (f.hunger > .5
                   ? pick([ 'Nix wie hin!', 'Des wü i!', 'Kurs setzen.', 'Mei Magen knurrt scho.' ])
                   : pick([ 'Später vielleicht.', 'Bin eh satt.', 'Merk i ma für nachher.' ]))
        : scent === 5
            ? (f.hunger > .6 ? pick([ 'Besser als nix.', 'Is des no guat?' ])
                             : pick([ 'Pfui Teufl.', 'Na danke.', 'Da hat’s wen derwischt.' ]))
        : scent === 6
            ? pick([ 'Ob da Nachwuchs liegt?', 'Gusto oder Familie?', 'Hoffentlich ned meine.' ])
            : (b.egg_readiness > .8 ? pick([ 'A Manderl in der Näh!', 'Zeit zum Laichen?' ])
                                    : pick([ 'Da balzt wer.', 'A Manderl war da.' ]));
    add('smell', scentNews, pick([
          `I riach ${
              intensity(scentLevel,
                        [
                          [ 'ganz leicht', 'an Hauch', 'von weit weg' ], [ 'deutlich', 'klar' ],
                          [ 'ur stark', 'gewaltig', 'unverkennbar' ]
                        ])} ${x} – ${side}.`,
          `${cap(x)}? Die Nasn sagt: ${side}.`, `In der Strömung: ${x}, ${side}.`,
          `Riechzentrum meldet ${x}. ${follow}`, `Hm, ${x} … ${follow}`,
          `${cap(x)} ${side}. ${follow}`
        ]),
        [ l > r ? 'noseL' : 'noseR', 'smellC' ], '👃', 12);
  }
  // Drives.
  if (f.hunger > .55)
    add('hunger', (f.hunger - .5) * 1.2, pick([
          'Mei Bauch is leer.', 'Hunger …', 'Der Magen knurrt.', 'Wann gibt’s was?',
          `Darm nur ${percent(f.fullness)} voll.`, `I könnt ${pick([
            'an ganzen Wurm', 'a ganzes Algenfeld', 'a Wolkn Plankton', 'einfach alles'
          ])} verdrucken.`,
          `I hätt an Gusto auf ${pick([ 'a Würmerl', 'Algen', 'Plankton', 'irgendwas' ])}.`,
          `Die Energie wird knapp – ${
              pick([ 'Futter suchen!', 'sparsam schwimmen.', 'i muss was essen.' ])}`
        ]),
        [ 'gut', 'hind' ], '🍽', 25);
  const eating = Math.max(b.eat_signal || 0, b.bite_signal || 0, b.mouth_opening || 0);
  if (eating > .05 && eating > (m.prev.eating || 0))
    add('eat', .9, pick([
          'Schnapp!', 'Mahlzeit!', 'Goschn auf!', 'Kauen, kauen, kauen.', 'Zubeißen!',
          b.pump_flow > 0 ? `I saug ${pick([ 'kräftig', 'alles ein', 'am Boden' ])}.` : 'Happs!',
          scent >= 0 && scent <= 4 ? `Schmeckt nach ${SCENT_SAY[scent][0]}.` : 'Was war denn des?'
        ]),
        [ b.bite_signal > b.eat_signal ? 'bite' : 'suck', 'steer' ], '😋', 3);
  if (f.fullness > .7 && f.fullness > (m.prev.fullness || 0) + .02)
    add('full', .6, pick([
          'Voll bis obenhin.', 'Satt bis zu de Kiemen.', 'Verdauen … bitte ned stören.',
          `${percent(f.fullness)} Darmfüllung – passt.`, 'Ma, war des guat.'
        ]),
        [ 'gut' ], '😌', 30);
  if (f.pain > .03 && f.pain > (m.prev.pain || 0) + .01)
    add('pain', 1.5 + f.pain, pick([
          'Au!', 'Au weh, des hat weh tan!', 'Mi hat’s derwischt.', 'Nix wie weg!',
          'Mei Schmerzsensoren schrein.', 'Autsch – des merk i ma.'
        ]),
        [ 'gut', 'steer' ], '❗', 2);
  if (f.health < .5)
    add('health', (.6 - f.health), pick([
          'I bin ganz marod.', `Nur mehr ${percent(f.health)} Gesundheit …`, 'I muss mi schonen.',
          'Mir is ned guat.'
        ]),
        [ 'gut', 'hind' ], '❤', 40);
  const fast = track(m, 'speed', Math.abs(b.thrust || 0), .05);
  if (fast.rise > .02 && fast.norm > .6)
    add('move', clamp(fast.rise * 8),
        pick([ 'Volle Kraft voraus!', 'Schneller!', 'Flossn, los!', 'Auf geht’s!', 'Sprint!' ]),
        [ 'steer', 'tail' ], '➤', 10);
  else if (fast.norm < .15 && (m.prev.speed || 0) > .3)
    add('move', .4,
        pick([ 'I lass mi treiben.', 'Gemütlich dahin.', 'Kurze Pause.', 'A bissl schweben …' ]),
        [ 'tail' ], '〰', 15);
  const turn = track(m, 'turn', Math.abs(b.turn || 0), .1);
  if (turn.rise > .05 && turn.norm > .6)
    add('turn', clamp(turn.rise * 5), pick([
          'Kurswechsel!', 'I drah ab.', 'A elegante Kurvn.', 'Umdrahn, schnell!', 'Hart am Wind!'
        ]),
        [ 'steer', st('turnL') > st('turnR') ? 'turnL' : 'turnR' ], '↻', 8);
  if (f.ready > .8)
    add('ready', (f.ready - .7) * 1.2, pick(b.egg_readiness >= b.sperm_readiness ? [
          'Mei Eier san reif.', 'Es wird Zeit für Nachwuchs.', 'Wo is a guter Laichplatz?',
          'I spür den Laichdrang.'
        ] : [ 'I bin bereit.', 'Wo san die Gelege?', 'Bereit für die Balz.' ]),
        [ b.egg_readiness >= b.sperm_readiness ? 'egg' : 'sperm', 'hind' ], '🥚', 45);
  if (b.egg_laying && !m.prev.egg_laying)
    add('laying', 2,
        pick([ 'Laichen! Jetzt!', 'Eier abgelegt – alles Gute, Kinder.', 'Geschafft: a Gelege.' ]),
        [ 'egg' ], '🥚', 5);
  if (b.sperm_laying && !m.prev.sperm_laying)
    add('laying', 2, pick([ 'Milch abgegeben.', 'Befruchtet – hoffentlich.', 'Für die Zukunft!' ]),
        [ 'sperm' ], '💧', 5);
  if (f.aggression > .3 && f.aggression > (m.prev.aggression || 0))
    add('fight', f.aggression + .3, pick([
          'Komm ma ned zu nah!', 'Des is MEI Revier.', 'Angriff!', 'Dir zeig i’s!', 'Schleich di!'
        ]),
        [ 'bite', 'steer' ], '⚔', 6);
  if (f.defense > .3 && f.defense > (m.prev.defense || 0))
    add('defense', f.defense + .2,
        pick([ 'Stacheln raus!', 'Verteidigen!', 'I mach mi groß.', 'Kan Schritt weiter!' ]),
        [ 'spines' ], '🛡', 6);
  if (b.bladder_capacity > 0) {
    const air = track(m, 'bladder', clamp(b.bladder_fill / b.bladder_capacity), .1);
    if (Math.abs(air.rise) > .03)
      add('bladder', clamp(Math.abs(air.rise) * 8),
          air.rise > 0 ? pick([ 'A bissl Luft in die Blasn – auffi.', 'Auftrieb!', 'I steig.' ])
                       : pick([ 'Luft auslassn, abtauchen.', 'Obi geht’s.', 'I sink.' ]),
          [ 'bladder' ], '○', 12);
  }
  for (const [id, words, icon] of [
           [ 'pigment', [ 'I zeig Farb.', 'Farbwechsel!', 'Schau mi an!' ], '🎨' ],
           [ 'gland', [ 'Mei Hirndrüsn schüttet aus.', 'Botenstoffe unterwegs.' ], '⚗' ]]) {
    const t = track(m, id, st(id), .1);
    if (has(id) && t.rise > .08)
      add(id, clamp(t.rise * 4), pick(words), [ id ], icon, 15);
  }
  // Hormones: the largest effect shift colours the feeling.
  const shift = effects.map((v, k) => [k, v - (m.effectSlow?.[k] ?? v)])
                    .sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0];
  m.effectSlow = effects.map((v, k) => (m.effectSlow?.[k] ?? v) * .9 + v * .1);
  for (let k = 0; k < Math.min(4, levels.length); k++) {
    const v = clamp(levels[k]), old = m.hormoneSlow[k] ?? v, trend = v - old;
    m.hormoneSlow[k] = old + (v - old) * .05;
    if (Math.abs(trend) > .04) {
      const feel = shift && Math.abs(shift[1]) > .01
                       ? pick(FEEL[shift[0]][shift[1] > 0 ? 0 : 1])
                       : pick([ 'irgendwas tut si', 'i spür’s überall', 'komisch' ]);
      add('hormone' + k, clamp(Math.abs(trend) * 6),
          `${hormoneName(b.hormones, k)} ${
              trend > 0 ? pick([ 'steigt', 'flutet an', 'legt zu' ])
                        : pick([ 'sinkt', 'ebbt ab', 'lasst nach' ])} – ${feel}.`,
          [ 'hsense', 'gland' ], '☁', 12);
    }
  }
  if (levels.length >= 2) {
    const order = levels.map((v, k) => [k, v]).sort((p, q) => q[1] - p[1]), hi = order[0],
          lo = order[order.length - 1];
    if (hi[1] - lo[1] > .25)
      add('weather', .3, pick([
            `Hormonwetter: ${hormoneName(b.hormones, hi[0])} hoch, ${
                hormoneName(b.hormones, lo[0])} tief – ${moodOf(f)}.`,
            `Innen ${pick([ 'bewölkt', 'heiter', 'schwül',
                            'stürmisch' ])}: viel ${hormoneName(b.hormones, hi[0])}.`,
            `Wetterlage im Kopf: ${hormoneName(b.hormones, hi[0])} gibt den Ton an.`
          ]),
          [ 'hsense' ], '☁', 50);
  }
  // Learning: new connections and surprises.
  const changed = b.learning?.changed || 0;
  if (changed > m.changed) {
    const best = plan.lines.reduce((p, l) => l.learned > (p?.learned || 0) ? l : p, null),
          from = best && STATIONS[best.from][2], to = best && STATIONS[best.to][2];
    add('learn', .8 + clamp((changed - m.changed) / 10), pick(best ? [
          'Aha! Des merk i ma.', `Neue Verknüpfung: ${from} ↔ ${to}.`,
          `Die Bahn wird stärker: ${from} → ${to}.`, `Jetzt kapier i’s: ${from} ghört zu ${to}.`,
          `${changed - m.changed} Synapsen umbaut.`
        ] : [ 'Aha! Des merk i ma.', `${changed - m.changed} Synapsen umbaut.` ]),
        best ? [ best.from, best.to ] : [], '✦', 8);
    m.changed = changed;
  }
  const surprise = b.learning?.surprise;
  if (surprise?.length) {
    let top = 0, where = '';
    for (const n of b.neurons) {
      const v = Math.abs(surprise[n[5]]?.[0] || 0);
      if (v > top)
        [top, where] = [ v, plan.station.get(n[5]) || '' ];
    }
    const t = track(m, 'surprise', top, .05);
    if (where && t.rise > 0 && t.norm > .8)
      add('surprise', clamp(t.rise / (m.peak.surprise || 1) * 3), pick([
            `Überraschung bei ${STATIONS[where][2]}!`, 'Des hätt i ma ned erwartet.',
            'Hoppala, anders als gedacht.', `${STATIONS[where][2]} wundert si.`
          ]),
          [ where ], '❕', 10);
  }
  // Pathways: the busiest line of the network map, announced like the Vienna underground.
  const busiest = plan.lines.reduce((p, l) => Math.abs(l.flow) * Math.sqrt(l.sum) >
                                                      (p ? Math.abs(p.flow) * Math.sqrt(p.sum) : 0)
                                                  ? l
                                                  : p,
                                    null);
  if (busiest && Math.abs(busiest.flow) > .05) {
    const from = STATIONS[busiest.from][2], to = STATIONS[busiest.to][2],
          key = busiest.key + (busiest.flow < 0);
    if (key !== m.prev.route)
      add('route', .35 + clamp(Math.abs(busiest.flow)), pick(busiest.flow > 0 ? [
            `Linie ${from} – ${to}: Hochbetrieb.`, `Stoßzeit zwischen ${from} und ${to}.`,
            `Signalzug ${from} → ${to} fahrt im Takt.`, `Nächste Station: ${to}.`,
            `Zurückbleiben, bitte! ${from} → ${to}.`,
            busiest.to === 'steer' ? 'Alle Züg fahren zur Steuerzentrale.' : `${from} funkt an ${to}.`
          ] : [
            `${from} bremst ${to}.`, `Halt, ${to}! – sagt ${from}.`,
            `Signal ${from} → ${to}: rot.`, `${to} wird ausbremst.`,
            `Betriebsstörung zwischen ${from} und ${to}.`
          ]),
          [ busiest.from, busiest.to ], busiest.flow > 0 ? '🚇' : '⛔', 9);
    m.prev.route = key;
  }
  // The visitor's own stimuli.
  const poked = nerve_mapState.poked;
  if (poked && poked.at > (m.last.poke || 0))
    add('poke', 3, pick([
          `Wer kitzelt da ${STATIONS[poked.id][4]}?`, `A Stromstoß durch ${STATIONS[poked.id][4]}!`,
          `Hoppala – wer reizt ${STATIONS[poked.id][4]}?`,
          `Wer drückt da auf ${STATIONS[poked.id][4]}?`
        ]),
        [ poked.id ], '👆', 0);
  const probe = b.probe;
  if (probe?.remaining > 0 && !(m.prev.probe > 0)) {
    const hue = probe.color ? Math.atan2(Math.sqrt(3) * (probe.color[1] - probe.color[2]),
                                         2 * probe.color[0] - probe.color[1] - probe.color[2]) *
                                  180 / Math.PI
                            : 0,
          colour =
              [
                'rot', 'orange', 'gelb', 'grün', 'grün', 'türkis', 'blau', 'blau', 'violett',
                'pink', 'rot', 'rot'
              ][Math.floor(((hue + 360) % 360) / 30)],
          smell = probe.scents ? probe.scents.indexOf(Math.max(...probe.scents)) : 0;
    add('probe', 2.5,
        probe.kind === 0 ? pick([
          'A Licht! Woher kommt des?', `Was leuchtet da so ${colour}?`,
          `${cap(colour)}es Licht – kann ma des essen?`
        ])
        : probe.kind === 1
            ? pick([ 'A Duft aus dem Nix …', `Riecht nach ${SCENT_SAY[smell][0]} – aber woher?` ])
            : pick([ 'Komisches Gfühl im Körper …', 'Da stimmt was ned mit mir.' ]),
        [ probe.kind === 0   ? 'seeC'
          : probe.kind === 1 ? 'smellC'
                             : 'gut' ],
        '💡', 0);
  }
  m.prev = {
    ...m.prev,
    eating,
    fullness : f.fullness,
    pain : f.pain,
    speed : fast.norm,
    egg_laying : b.egg_laying,
    sperm_laying : b.sperm_laying,
    aggression : f.aggression,
    defense : f.defense,
    probe : probe?.remaining || 0
  };
  const mood = moodOf(f);
  nerve_mapState.mood = mood;
  c.sort((p, q) => q.s - p.s);
  let best = c.find(t => !m.recent.includes(t.text) && t.s > .3);
  if (!best && now - m.quietSince > 9000) {
    const lazy = [...plan.stations.values() ].sort((p, q) => q.activity - p.activity)[0];
    best = {
      topic : 'idle',
      text : pick([
        'I schwimm, also bin i.',
        `${b.neuron_count} Zellen, ${
            (b.edge_count || 0).toLocaleString('de-AT')} Verbindungen – und trotzdem ka Plan.`,
        'Was wohl hinterm nächsten Stein liegt?', 'Ruhige Zeiten.', 'Blubb.', 'Schau ma mal.',
        'Passt eh.', 'Ob die andern a so viel denken?', 'A guter Tag zum Schwimmen.',
        `Am liabsten tät i ${
            pick([ 'Algen zupfen', 'im Kies wühlen', 'einfach treiben', 'wem nachjagen' ])}.`,
        lazy ? `${STATIONS[lazy.id][2]} hackelt heut fleißig.` : 'Alles still.',
        `I denk an ${pick([ 'Futter', 'Eier', 'gar nix', 'den großen Fisch von vorhin' ])}.`,
        mood === 'zfrieden'      ? 'Alles im Fluss.'
        : mood === 'grantig'     ? 'Nix los da. Fad is.'
        : mood === 'verschossen' ? 'I tram vom Laichen.'
                                 : 'Hm.'
      ]),
      stations : lazy ? [ lazy.id ] : [],
      icon : '💭'
    };
  }
  if (!best || now - (m.postedAt || 0) < 2200 && best.s < 1.5)
    return;
  m.postedAt = now;
  let text = best.text;
  if (chance(.3))
    text = pick(MOODS[mood][1]) + ' ' + text;
  const second = c.find(t => t !== best && t.topic !== best.topic && t.s > .45 * best.s &&
                             !m.recent.includes(t.text));
  if (second && chance(.35)) {
    text += ' ' + pick([ 'Außerdem:', 'Und:', 'Nebenbei:', 'Und dann no:' ]) + ' ' + second.text;
    m.last[second.topic] = now;
  }
  m.last[best.topic] = now;
  m.quietSince = now;
  m.recent = [ best.text, ...m.recent ].slice(0, 14);
  m.topics = [ best.topic, ...m.topics ].slice(0, 3);
  postThought(text, best.icon, [...new Set([...best.stations, ...(second?.stations || []) ]) ]);
}

function postThought(text, icon, stations) {
  const list = el('nerve-thoughts');
  if (!list)
    return;
  const item = document.createElement('li'), time = document.createElement('time'),
        body = document.createElement('span'), tags = document.createElement('span');
  time.textContent = new Date().toLocaleTimeString(
      'de', {hour : '2-digit', minute : '2-digit', second : '2-digit'});
  body.textContent = icon + ' ' + text;
  tags.className = 'nerve-tags';
  for (const id of stations.filter(id => STATIONS[id])) {
    const dot = document.createElement('i');
    dot.style.background = stationColor(id);
    dot.title = STATIONS[id][2];
    tags.append(dot);
  }
  item.style.setProperty('--thought', stationColor(stations.find(id => STATIONS[id]) || 'steer'));
  item.append(time, body, tags);
  item.title = 'Antippen: beteiligte Stationen im Plan zeigen';
  item.onclick = () => {
    nerve_mapState.focus =
        {stations : new Set(stations), lines : null, pair : true, until : performance.now() + 5000};
  };
  list.prepend(item);
  while (list.children.length > 40)
    list.lastChild.remove();
  nerve_mapState.mind.count++;
}

export function renderNerveMap(f) {
  const svg = el('nerve-map'), b = f?.brain;
  if (!svg || !b?.neurons?.length || !b.edges?.length || !globalThis.document?.createElementNS)
    return;
  const now = performance.now();
  let plan = nerve_mapState.plan;
  if (!plan || plan.fish !== b.id || plan.layout !== b.layout_id || plan.count !== b.edges.length) {
    plan = nerve_mapState.plan = buildPlan(b, svg);
    if (nerve_mapState.mind?.fish !== b.id) {
      nerve_mapState.mind = freshMind(b);
      el('nerve-thoughts').replaceChildren();
      postThought(`Servus, i bin Fisch #${b.id}: ${b.neuron_count} Zellen, ${
                      plan.stations.size} Stationen, ${plan.lines.length} Linien.`,
                  '🐟', [ 'steer' ]);
    }
    hoverStation('');
  }
  nerve_mapState.brain = b;
  if (now - (plan.liveAt || 0) > 100) {
    plan.liveAt = now;
    nerve_mapState.nodes = new Map(b.neurons.map(n => [n[5], n]));
    updateLive(b, plan, now);
  }
  moveTrains(plan, now);
  highlight(plan, now);
  if (now - (plan.thoughtAt || 0) > 700 && f.step !== plan.thoughtStep) {
    plan.thoughtAt = now;
    plan.thoughtStep = f.step;
    think(b, plan, now);
    renderWeather(b, hormoneEffects(b));
    const mood = MOODS[nerve_mapState.mood];
    el('nerve-mood').textContent = mood ? mood[0] + ' ' + nerve_mapState.mood : '';
  }
  el('nerve-learned').onclick ??= () => {
    const box = el('nerve-plan'), on = !box.classList.contains('nm-learned');
    box.classList.toggle('nm-learned', on);
    el('nerve-learned').setAttribute('aria-pressed', String(on));
  };
}
