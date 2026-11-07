import {ANATOMY, ATELIER_LIMITS, BODY_UNIT, FIN, MOTOR_KIND} from '../../schema.js';
import {
  finVolumeOf,
  gutTurns,
  jawReach,
  lipWidth,
  tailFinSize,
  toothForm
} from '../../fish_organs.js';
import {mouthShare, organSize} from '../../fish_forms.js';
import {functionFor, nodeLimit, organFunction} from '../model/organs.js';
import {centerIndex, findOrgan, muscleTrait} from '../model/document.js';
import {findSite, sideIndex, sideOf} from '../model/layout.js';
import {fieldFish, fieldPoint, finSizes} from './frame.js';
import {escapeText, fixed, namedTrack, plainTrack, trackShare} from './markup.js';
import {formatNumber, percent, t, textArea} from '../../strings.js';
import {clamp, degrees, radians, wrapAngle} from '../../units.js';
import {restLevel} from './drive.js';
import {biasScale} from './panels.js';
import {contactFieldOf, contactHalfAngle} from '../../tuning.js';

const label = (key, values) => t('studio.muscle.' + key, values);
const FRAME = Object.freeze({width : 300, height : 170, middle : 85});
const HANDLE = Object.freeze({radius : 5.5});
const handle = (name, x, y, title) =>
    '<circle class="aid-graphic-handle aid-muscle-handle ' + name.replace(':', '-') +
    '" data-effector-handle="' + name + '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
    HANDLE.radius + '"><title>' + escapeText(title) + '</title></circle>';
const RAY = Object.freeze({least : 1, span : 3});
const rayWidth = copies => RAY.least + RAY.span * copies / ATELIER_LIMITS.max_copies;
const CONTROLS =
    Object.freeze({width : 300, height : 92, track : [ 10, 290 ], rows : [ 34, 78 ], title : 14});
const countShare = (count, most) => most > 1 ? (count - 1) / (most - 1) : null;
function nodeControls(organ, code, most) {
  const C = CONTROLS, count = organ.centers.length, copies = organ.centers[0]?.copies ?? 1;
  const row = (y, name, share, text, title) =>
      '<text class="aid-control-title" x="' + C.track[0] + '" y="' + (y - C.title) + '">' +
      escapeText(text) + '</text>' +
      plainTrack(C.track, y, share, 'data-effector-handle="' + name + '"', title);
  return '<svg class="aid-effector-controls" viewBox="0 0 ' + C.width + ' ' + C.height +
         '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' + code +
         '" data-effector-side="' + sideOf(organ) + '">' +
         row(C.rows[0], 'nodes', countShare(count, most), label('nodes', {count, most}),
             label('nodesHandle')) +
         row(C.rows[1], 'strength', copies / ATELIER_LIMITS.max_copies,
             label('strength', {share : percent(copies / ATELIER_LIMITS.max_copies)}),
             label('strengthHandle')) +
         '</svg>';
}
export function effectorPatch(code, name, fx, fy, most) {
  if (name === 'nodes' || name === 'strength') {
    const share = trackShare(fx * CONTROLS.width, CONTROLS.track);
    return name === 'nodes' ? {nodes : 1 + Math.round(share * Math.max(0, most - 1))}
                            : {copies : Math.max(1, Math.round(share * ATELIER_LIMITS.max_copies))};
  }
  if (name.startsWith(CHART_HANDLE)) {
    const spec = DIET_CHARTS[name.slice(CHART_HANDLE.length)];
    return spec?.trait ? {
      trait : spec.trait,
      value : trackShare(fx * CHART.width, [ CHART.left, CHART.right ])
    }
                       : null;
  }
  const trait = TRAIT_HANDLES[code]?.[name];
  return trait ? {trait : trait.key, value : clamp(trait.at(fx * FRAME.width, fy * FRAME.height))}
               : null;
}

const TAIL = Object.freeze({
  root : 150,
  body : [ 60, 24 ],
  unit : 230,
  most : [ 145, 80 ],
  fork : .55,
  lobe : {root : .6, along : .4, out : .55},
  wave : {amplitude : 22, at : 22, stiff : 3, base : .35, steps : 48, length : 105},
  caption : [ 10, 160 ]
});
const TRAIT_THIRD = 1 / 3;
const traitStyle = (value, [ low, middle, high ]) => value < TRAIT_THIRD       ? low
                                                     : value > 1 - TRAIT_THIRD ? high
                                                                               : middle;
const tailTip = volume => {
  const size = tailFinSize(volume);
  return [
    Math.min(TAIL.most[0], TAIL.unit * size.length), Math.min(TAIL.most[1], TAIL.unit * size.width)
  ];
};
const swing = (undulation, along) =>
    TAIL.wave.amplitude * ((1 - undulation) * along ** TAIL.wave.stiff +
                           undulation * (TAIL.wave.base + (1 - TAIL.wave.base) * along));
function tailGraphic(state, organ, centers, twin) {
  const fin = state.anatomy?.fins?.[FIN.tail];
  const volume = fin ? finVolumeOf(fin.cells, fin.strength) : 1;
  const [length, width] = tailTip(volume), M = FRAME.middle, R = TAIL.root, side = organ.side;
  const end = R + length;
  const undulation = muscleTrait(state.document, MOTOR_KIND.forward, 'undulation', state.sites) ??
                     BODY_UNIT.trait_middle;
  const body = 'M0 ' + fixed(M - TAIL.body[0]) + ' L' + R + ' ' + fixed(M - TAIL.body[1]) + ' L' +
               R + ' ' + fixed(M + TAIL.body[1]) + ' L0 ' + fixed(M + TAIL.body[0]) + 'Z';
  const L = TAIL.lobe;
  const lobe = sign => 'M' + R + ' ' + fixed(M + sign * TAIL.body[1] * L.root) + ' Q' +
                       fixed(R + length * L.along) + ' ' + fixed(M + sign * width * L.out) + ' ' +
                       fixed(end) + ' ' + fixed(M + sign * width) + ' L' +
                       fixed(R + length * TAIL.fork) + ' ' + M + ' L' + R + ' ' + M + 'Z';
  const rays = (sign, nodes, own) =>
      nodes
          .map((center, k) => {
            const share = (k + 1) / (nodes.length + 1);
            return '<line class="aid-muscle-ray' + (own ? ' own' : '') + '" x1="' + R + '" y1="' +
                   M + '" x2="' + fixed(R + length * (TAIL.fork + (1 - TAIL.fork) * share)) +
                   '" y2="' + fixed(M + sign * width * share) + '" stroke-width="' +
                   fixed(rayWidth(center.copies)) + '"/>';
          })
          .join('');
  const W = TAIL.wave, points = Array.from({length : W.steps + 1}, (_, k) => {
    const x = end * k / W.steps;
    return fixed(x) + ' ' +
           fixed(M - swing(undulation, x / end) * Math.sin(2 * Math.PI * x / W.length));
  });
  const at = W.at, handleY = M - swing(undulation, at / end);
  const style = traitStyle(undulation, [ 'beat', 'mixed', 'wave' ]);
  return '<path class="aid-muscle-body" d="' + body + '"/>' +
         '<path class="aid-muscle-fin" d="' + lobe(-1) + lobe(1) + '"/>' +
         rays(side, centers, true) + rays(-side, twin, false) +
         '<path class="aid-muscle-wave" d="M' + points.join(' L') + '"/>' +
         handle('trait:q1', at, handleY, label('undulation.handle')) + '<text x="' +
         TAIL.caption[0] + '" y="' + TAIL.caption[1] + '">' + label('undulation.' + style) +
         '</text>';
}
const undulationAt = (x, y) => {
  const along = TAIL.wave.at / TAIL.root, low = swing(0, along), high = swing(1, along);
  return (FRAME.middle - y - low) / (high - low);
};

const SIDE = Object.freeze({
  skin : 74,
  root : 96,
  base : 60,
  sweep : 92,
  out : 62,
  ray : {foot : .3, sweep : .9, least : .45}
});
function sideGraphic(state, organ, centers) {
  const k = sideIndex(organ.side), size = finSizes(state.anatomy?.fins).sides[k];
  const S = SIDE, sweep = S.sweep * size.length, out = S.out * size.out;
  const tip = [ S.root + S.base / 2 + sweep, S.skin + out ];
  const fin = 'M' + S.root + ' ' + S.skin + ' Q' + fixed(S.root + sweep / 2) + ' ' +
              fixed(S.skin + out) + ' ' + fixed(tip[0]) + ' ' + fixed(tip[1]) + ' Q' +
              fixed(S.root + S.base) + ' ' + fixed(S.skin + out / 2) + ' ' + (S.root + S.base) +
              ' ' + S.skin + 'Z';
  const rays = centers
                   .map((center, index) => {
                     const share = (index + 1) / (centers.length + 1);
                     const x2 = S.root + S.base * (1 - share) + sweep * share * S.ray.sweep,
                           y2 = S.skin + out * (S.ray.least + (1 - S.ray.least) * share);
                     return '<line class="aid-muscle-ray own" x1="' +
                            fixed(S.root + S.base * S.ray.foot) + '" y1="' + S.skin + '" x2="' +
                            fixed(x2) + '" y2="' + fixed(y2) + '" stroke-width="' +
                            fixed(rayWidth(center.copies)) + '"/>';
                   })
                   .join('');
  return '<path class="aid-muscle-body" d="M0 0 H' + FRAME.width + ' V' + S.skin + ' H0Z"/>' +
         '<path class="aid-muscle-fin" d="' + fin + '"/>' + rays;
}

const MOUTH = Object.freeze({
  snout : 96,
  head : 66,
  mouth : [ 8, 22 ],
  lip : 2.4,
  cheek : 80,
  flow : {lines : 5, spread : 15, least : 16, span : 70, head : 6, off : 6, fan : .15, aim : .35}
});
function suctionGraphic(state, organ, centers, twin) {
  const columns = state.anatomy?.anatomy ?? [], M = FRAME.middle, P = MOUTH;
  const jaw = columns[ANATOMY.jaw_length] ?? BODY_UNIT.trait_middle,
        middle = BODY_UNIT.trait_middle, suction = organSize(columns[ANATOMY.suction_strength]);
  const rx = P.mouth[0] * jawReach(jaw) / jawReach(middle),
        ry = P.mouth[1] * mouthShare(jaw) / mouthShare(middle), mouth = P.snout + rx;
  const head = 'M' + P.snout + ' ' + M + ' C' + P.snout + ' ' + (M - P.head) + ' ' +
               (P.snout + P.cheek) + ' ' + (M - P.head) + ' ' + FRAME.width + ' ' + (M - P.head) +
               ' V' + (M + P.head) + ' C' + (P.snout + P.cheek) + ' ' + (M + P.head) + ' ' +
               P.snout + ' ' + (M + P.head) + ' ' + P.snout + ' ' + M + 'Z';
  const reach = P.flow.least + P.flow.span * suction;
  let flow = '';
  for (let k = 0; k < P.flow.lines; ++k) {
    const y = M + (k - (P.flow.lines - 1) / 2) * P.flow.spread;
    const F = P.flow, from = [ P.snout - F.off - reach, y + (y - M) * F.fan ],
          to = [ P.snout - F.off, M + (y - M) * F.aim ];
    flow += '<path class="aid-muscle-flow" d="M' + fixed(from[0]) + ' ' + fixed(from[1]) + ' Q' +
            fixed((from[0] + to[0]) / 2) + ' ' + fixed(y) + ' ' + fixed(to[0]) + ' ' +
            fixed(to[1]) + ' l-' + P.flow.head + ' -' + P.flow.head / 2 + ' M' + fixed(to[0]) +
            ' ' + fixed(to[1]) + ' l-' + P.flow.head + ' ' + P.flow.head / 2 + '"/>';
  }
  const lips = P.lip * lipWidth(suction) / lipWidth(0);
  return '<path class="aid-muscle-body" d="' + head + '"/>' + flow +
         '<ellipse class="aid-muscle-mouth" cx="' + fixed(mouth) + '" cy="' + M + '" rx="' +
         fixed(rx) + '" ry="' + fixed(ry) + '" stroke-width="' + fixed(lips) + '"/>';
}

const JAW = Object.freeze({
  hinge : [ 212, 86 ],
  unit : 380,
  gap : [ 3, 14 ],
  head : [ 74, 64 ],
  eye : [ 252, 48, 10 ],
  tooth : [ 6, 22 ],
  sample : {x : 40, y : 158, base : 10, height : 30},
  row : .85,
  drop : 4,
  brow : {hinge : 30, tip : 34, throat : 40, rise : 6, lift : 30, tuck : 4},
  caption : {gap : 8, lift : 4}
});
const jawTip = trait => JAW.hinge[0] - JAW.unit * jawReach(trait);
function jawGraphic(state, organ, centers) {
  const columns = state.anatomy?.anatomy ?? [], [ hx, hy ] = JAW.hinge,
        middle = BODY_UNIT.trait_middle, W = FRAME.width;
  const length =
            muscleTrait(state.document, MOTOR_KIND.aggression, 'jaw_length', state.sites) ?? middle,
        bluntness =
            muscleTrait(state.document, MOTOR_KIND.aggression, 'blunt_teeth', state.sites) ??
            middle;
  const tip = jawTip(length), [ open, wide ] = JAW.gap, [ up, down ] = JAW.head;
  const upper = [ [ hx, hy - open ], [ tip, hy - wide ] ],
        lower = [ [ hx, hy + open ], [ tip + JAW.drop, hy + wide ] ];
  const power = organSize(columns[ANATOMY.attack_left + sideIndex(organ.side)]) || 1,
        form = toothForm(power, bluntness), full = toothForm(1, bluntness).reach;
  const height = JAW.tooth[1] * form.reach / full * form.height, half = JAW.tooth[0] / 2;
  let teeth = '';
  for (const [[ x0, y0 ], [ x1, y1 ]] of [upper, lower]) {
    const sign = y1 < hy ? 1 : -1;
    for (let i = 0; i < form.count; ++i) {
      const share = (i + .5) / form.count * JAW.row, x = x1 + (x0 - x1) * share,
            y = y1 + (y0 - y1) * share;
      teeth += '<path class="aid-muscle-tooth" d="M' + fixed(x - half) + ' ' + fixed(y) + ' L' +
               fixed(x - half * form.flat) + ' ' + fixed(y + sign * height) + ' L' +
               fixed(x + half * form.flat) + ' ' + fixed(y + sign * height) + ' L' +
               fixed(x + half) + ' ' + fixed(y) + 'Z"/>';
    }
  }
  const B = JAW.brow;
  const head = 'M' + W + ' ' + (hy - up) + ' C' + (hx + B.hinge) + ' ' + (hy - up - B.rise) + ' ' +
               fixed(tip + B.tip) + ' ' + (hy - wide - B.lift) + ' ' + fixed(tip) + ' ' +
               (hy - wide) + ' L' + hx + ' ' + (hy - open) + ' L' + hx + ' ' + (hy + open) + ' L' +
               fixed(lower[1][0]) + ' ' + (hy + wide) + ' C' + fixed(tip + B.throat) + ' ' +
               (hy + down) + ' ' + (hx + B.hinge) + ' ' + (hy + down) + ' ' + W + ' ' +
               (hy + down - B.tuck) + 'Z';
  const T = JAW.sample, sample = toothForm(1, bluntness), top = T.y - T.height * sample.height;
  const jaw = ([ a, b ]) =>
      'M' + fixed(a[0]) + ' ' + fixed(a[1]) + ' L' + fixed(b[0]) + ' ' + fixed(b[1]);
  const style = traitStyle(bluntness, [ 'sharp', 'mixed', 'blunt' ]);
  return '<path class="aid-muscle-body" d="' + head + '"/><circle class="aid-muscle-eye" cx="' +
         JAW.eye[0] + '" cy="' + JAW.eye[1] + '" r="' + JAW.eye[2] + '"/>' + teeth +
         '<path class="aid-muscle-jaw" d="' + jaw(upper) + ' ' + jaw(lower) + '"/>' +
         '<path class="aid-muscle-tooth sample" d="M' + (T.x - T.base) + ' ' + T.y + ' L' +
         fixed(T.x - T.base * sample.flat) + ' ' + fixed(top) + ' L' +
         fixed(T.x + T.base * sample.flat) + ' ' + fixed(top) + ' L' + (T.x + T.base) + ' ' + T.y +
         'Z"/>' + handle('trait:q2', tip, hy - wide, label('jaw.handle')) +
         handle('trait:q1', T.x, top, label('teeth.handle')) + '<text x="' +
         (T.x + T.base + JAW.caption.gap) + '" y="' + (T.y - JAW.caption.lift) + '">' +
         label('teeth.' + style) + '</text>';
}
const TRAIT_HANDLES = Object.freeze({
  [MOTOR_KIND.forward] : {'trait:q1' : {key : 'undulation', at : undulationAt}},
  [MOTOR_KIND.suction] : {'trait:q1' : {key : 'gut_length', at : x => trackShare(x, GUT.track)}},
  [MOTOR_KIND.aggression] : {
    'trait:q2' : {key : 'jaw_length', at : x => (jawTip(0) - x) / (jawTip(0) - jawTip(1))},
    'trait:q1' : {
      key : 'blunt_teeth',
      at : (x, y) => {
        const T = JAW.sample, top = b => T.y - T.height * toothForm(1, b).height;
        return (y - top(0)) / (top(1) - top(0));
      }
    }
  }
});

// A stretch of skin with one spine per node, spread over it: solid as it stands at rest, dashed
// as far as it rises when the node fires. Strength lengthens both, the rest drive the solid one.
const SPINE =
    Object.freeze({skin : 54, arc : 14, base : 10, least : 18, most : 84, lean : .3, samples : 12});
function defenseGraphic(state, organ, centers) {
  const S = SPINE, W = FRAME.width, scale = biasScale(state);
  const skinY = x => S.skin + S.arc * (1 - ((2 * x) / W - 1) ** 2);
  const spine = (x, reach, cls) => {
    const y = skinY(x);
    return '<path class="' + cls + '" d="M' + fixed(x - S.base) + ' ' + fixed(y) + ' L' +
           fixed(x + S.base * S.lean) + ' ' + fixed(y + reach) + ' L' + fixed(x + S.base) + ' ' +
           fixed(y) + 'Z"/>';
  };
  const spines =
      centers
          .map((center, index) => {
            const x = W * (index + .5) / centers.length;
            const strength = center.copies / ATELIER_LIMITS.max_copies;
            const raised = S.least + (S.most - S.least) * strength;
            const rest = S.least + (raised - S.least) * Math.max(0, restLevel(center, scale));
            return spine(x, raised, 'aid-spine-raised') + spine(x, rest, 'aid-muscle-spine');
          })
          .join('');
  const skin = Array
                   .from({length : S.samples + 1},
                         (_, k) => {
                           const x = W * (1 - k / S.samples);
                           return fixed(x) + ' ' + fixed(skinY(x));
                         })
                   .join(' L');
  return '<path class="aid-muscle-body" d="M0 0 H' + W + ' L' + skin + 'Z"/>' + spines;
}
const SPINE_RING =
    Object.freeze({width : 300, height : 170, cx : 150, cy : 85, inner : 30, outer : 80});
export function spinePatch(fx, fy, aim) {
  const R = SPINE_RING, angle = Math.atan2(fy * R.height - R.cy, R.cx - fx * R.width);
  return {field : contactFieldOf(degrees(Math.abs(wrapAngle(angle - aim))))};
}
const SPINE_FISH = Object.freeze({scale : .068, dot : 3.5});
export function spineField(state, organ) {
  const {spinesRest : rest, spinesRaised : raised, spineAims : aims} = state.anatomy ?? {};
  const first = organ.centers[0];
  const aimOf = center => aims?.[centerIndex(state.document, center.id)];
  const aim = aimOf(first), block = '<div data-spine-block="' + escapeText(organ.id) + '">';
  if (!rest?.length || !raised?.length || !Number.isFinite(aim))
    return block + '</div>';
  const R = SPINE_RING, F = SPINE_FISH;
  const point = (angle, radius) => fieldPoint(R, angle, radius);
  const xy = p => fixed(p.x) + ' ' + fixed(p.y);
  const around = values =>
      'M' +
      values
          .map((value, k) => xy(point(-Math.PI + (k + .5) * 2 * Math.PI / values.length,
                                      R.inner + (R.outer - R.inner) * value)))
          .join(' L') +
      'Z';
  const half = radians(contactHalfAngle(first.field));
  const sector = half >= Math.PI ? '<circle class="aid-spine-spread" cx="' + R.cx + '" cy="' +
                                       R.cy + '" r="' + R.inner + '"/>'
                                 : '<path class="aid-spine-spread" d="M' + R.cx + ' ' + R.cy +
                                       ' L' + xy(point(aim - half, R.inner)) + ' A' + R.inner +
                                       ' ' + R.inner + ' 0 ' + (half > Math.PI / 2 ? 1 : 0) +
                                       ' 0 ' + xy(point(aim + half, R.inner)) + 'Z"/>';
  const fish = fieldFish(R, F.scale, 'aid-spine-fish');
  const dots = organ.centers.map(aimOf)
                   .filter(Number.isFinite)
                   .map(a => {
                     const p = point(a, R.inner);
                     return '<circle class="aid-spine-node" cx="' + fixed(p.x) + '" cy="' +
                            fixed(p.y) + '" r="' + F.dot + '"/>';
                   })
                   .join('');
  const edge = point(aim + half, R.inner);
  return block + '<section class="aid-eye-section"><h4>' + escapeText(label('spines.title')) +
         '</h4>' +
         '<svg class="aid-spine-field" viewBox="0 0 ' + R.width + ' ' + R.height +
         '" data-spine-pad="' + escapeText(first.id) + '" data-spine-aim="' + aim +
         '" role="img" aria-label="' + escapeText(label('spines.title')) + '">' +
         '<circle class="aid-spine-limit" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.outer +
         '"/><circle class="aid-spine-limit" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.inner +
         '"/>' + sector + '<path class="aid-spine-raised" d="' + around(raised) +
         '"/><path class="aid-spine-rest" d="' + around(rest) + '"/>' + fish + dots +
         '<circle class="aid-graphic-handle" data-graphic-handle="spread" cx="' + fixed(edge.x) +
         '" cy="' + fixed(edge.y) + '" r="' + HANDLE.radius + '"><title>' +
         escapeText(label('spines.spreadHandle')) + '</title></circle>' + legend() +
         '</svg></section></div>';
}
const LEGEND = Object.freeze({x : 6, y : 14, step : 16, swatch : 14, gap : 5, baseline : 4});
const legend = () => [[ 'aid-spine-rest', 'rest' ], [ 'aid-spine-raised', 'raised' ]]
                         .map(([ name, key ], k) => {
                           const L = LEGEND, y = L.y + k * L.step;
                           return '<path class="aid-spine-swatch ' + name + '" d="M' + L.x + ' ' +
                                  y + ' h' + L.swatch + '"/><text class="aid-spine-legend" x="' +
                                  (L.x + L.swatch + L.gap) + '" y="' + (y + L.baseline) + '">' +
                                  escapeText(label('spines.' + key)) + '</text>';
                         })
                         .join('');
const GUT = Object.freeze({
  from : 24,
  to : 276,
  middle : 70,
  amplitude : 30,
  tube : 14,
  steps : 96,
  track : [ 40, 260 ],
  track_y : 146,
  cell : 3.2
});
export function gutGraphic(state, organ, selected) {
  const G = GUT, code = MOTOR_KIND.suction;
  const length = muscleTrait(state.document, code, 'gut_length', state.sites);
  const turns = gutTurns(length ?? BODY_UNIT.trait_middle);
  const along = k => G.from + (G.to - G.from) * k / G.steps,
        across = k => G.middle + G.amplitude * Math.sin(2 * Math.PI * turns * k / G.steps);
  const points =
      Array.from({length : G.steps + 1}, (_, k) => fixed(along(k)) + ' ' + fixed(across(k)));
  const find = key => organ.centers.find(c => c.key === key);
  const part = (center, body) =>
      center ? '<g class="aid-sac-part' + (selected?.id === center.id ? ' selected' : '') +
                   '" data-select-center="' + escapeText(center.id) + '">' + body + '</g>'
             : '';
  const food = find('food'), fullness = find('fullness');
  const dots = food ? Array
                          .from({length : food.copies},
                                (_, i) => {
                                  const k = Math.round((i + .5) / food.copies * G.steps);
                                  return '<circle class="aid-gut-cell" cx="' + fixed(along(k)) +
                                         '" cy="' + fixed(across(k) - G.tube / 2) + '" r="' +
                                         G.cell + '"/>';
                                })
                          .join('')
                    : '';
  return effectorBlock(
      organ, code, 1, label('gut.title'),
      '<path class="aid-gut-tube" d="M' + points.join(' L') + '" stroke-width="' + G.tube + '"/>' +
          part(fullness, '<path class="aid-gut-stretch" d="M' + points.join(' L') + '"/>') +
          part(food, dots) +
          namedTrack(G.track, G.track_y, length ?? BODY_UNIT.trait_middle,
                     'data-effector-handle="trait:q1"', label('gut.handle'),
                     [ label('gut.short'), label('gut.long') ]),
      dietChart(state, 'gut', organ));
}

const effectorBlock = (organ, code, side, title, graphic, below) =>
    '<div class="aid-effector-block" data-effector-block="' + escapeText(organ.id) + '">' +
    '<svg class="aid-effector-graphic" viewBox="0 0 ' + FRAME.width + ' ' + FRAME.height +
    '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' + code +
    '" data-effector-side="' + side + '" role="img" aria-label="' + escapeText(title) + '">' +
    graphic + '</svg>' + below + '</div>';
function muscleHint(code) {
  const hint = textArea('studio').muscle?.hint?.[code];
  return hint ? '<p class="aid-hint">' + escapeText(hint) + '</p>' : '';
}

const CHART = Object.freeze({
  width : 300,
  height : 118,
  left : 14,
  right : 176,
  top : 10,
  base : 92,
  gap : 6,
  axis : 14,
  room : 1.1,
  baseline : 4,
  dot : 3.5
});
const DIET_CHARTS = Object.freeze({
  gut : {
    source : 'gut',
    trait : 'gut_length',
    code : MOTOR_KIND.suction,
    curves : [ [ 'plant', 'share' ], [ 'meat', 'share' ] ],
    readout : [ 'size', 'factor' ]
  },
  teeth : {
    source : 'teeth',
    trait : 'blunt_teeth',
    code : MOTOR_KIND.aggression,
    curves : [ [ 'hard', 'share' ], [ 'soft', 'share' ] ]
  },
  jaw : {
    source : 'jaw',
    trait : 'jaw_length',
    code : MOTOR_KIND.aggression,
    curves : [ [ 'aperture', 'factor' ], [ 'lever', 'factor' ] ]
  },
  suction : {source : 'suction', code : MOTOR_KIND.suction, curves : [ [ 'gulp', 'factor' ] ]}
});
const suctionStrength = (doc, sites) =>
    doc.organs.filter(o => o.type === 'muscle')
        .flatMap(o => o.centers)
        .filter(c => {
          const site = findSite(sites, c.site);
          return site && functionFor(c, site) === MOTOR_KIND.suction;
        })
        .reduce((sum, c) => sum + c.copies / ATELIER_LIMITS.max_copies, 0);
const CHART_HANDLE = 'chart:';
function dietChart(state, kind, organ = null) {
  const spec = DIET_CHARTS[kind], data = state.capabilities?.diet?.[spec.source], C = CHART;
  if (!data)
    return '';
  const at = spec.trait ? muscleTrait(state.document, spec.code, spec.trait, state.sites)
                        : suctionStrength(state.document, state.sites) / data.most;
  const most = C.room * Math.max(...spec.curves.flatMap(([ key ]) => data[key]));
  const x = share => C.left + (C.right - C.left) * share,
        y = value => C.base - (C.base - C.top) * value / most;
  const valueAt = values => {
    const pos = clamp(at) * (values.length - 1), k = Math.floor(pos);
    return values[k] + (values[Math.min(values.length - 1, k + 1)] - values[k]) * (pos - k);
  };
  const shown = (value, form) =>
      form === 'share' ? percent(value) : t('units.times', {n : formatNumber(value, 2)});
  const words = key => label('diet.' + kind + '.' + key);
  const curves =
      spec.curves
          .map(([ key, form ]) => {
            const values = data[key];
            const d =
                'M' + values.map((v, k) => fixed(x(k / (values.length - 1))) + ' ' + fixed(y(v)))
                          .join(' L');
            const name =
                at === null ? words(key)
                            : t('units.joined', {a : words(key), b : shown(valueAt(values), form)});
            return '<path class="aid-diet-curve k-' + key + ' ' + form + '" d="' + d +
                   '"/><text class="aid-diet-name k-' + key + '" x="' + (C.right + C.gap) +
                   '" y="' + fixed(y(values.at(-1)) + C.baseline) + '">' + escapeText(name) +
                   '</text>' +
                   (at === null
                        ? ''
                        : '<circle class="aid-diet-dot k-' + key + '" cx="' + fixed(x(at)) +
                              '" cy="' + fixed(y(valueAt(values))) + '" r="' + C.dot + '"/>');
          })
          .join('');
  const marker = at === null ? ''
                             : '<line class="aid-diet-marker" x1="' + fixed(x(at)) + '" y1="' +
                                   C.top + '" x2="' + fixed(x(at)) + '" y2="' + C.base + '"/>';
  const held = organ && spec.trait && at !== null;
  const grip = held ? ' data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
                          spec.code + '" data-effector-side="' + sideOf(organ) + '"'
                    : '';
  const knob = held ? '<rect class="aid-diet-hit" data-effector-handle="' + CHART_HANDLE + kind +
                          '" x="' + C.left + '" y="' + C.top + '" width="' + (C.right - C.left) +
                          '" height="' + (C.base - C.top) + '"><title>' +
                          escapeText(words('handle')) + '</title></rect><circle ' +
                          'class="aid-graphic-handle" cx="' + fixed(x(at)) + '" cy="' + C.top +
                          '" r="' + HANDLE.radius + '"/>'
                    : '';
  const readout = spec.readout && at !== null
                      ? '<p class="aid-diet-readout">' + escapeText(t('units.joined', {
                          a : words(spec.readout[0]),
                          b : shown(valueAt(data[spec.readout[0]]), spec.readout[1])
                        })) +
                            '</p>'
                      : '';
  return '<section class="aid-eye-section"><h4>' + escapeText(words('title')) + '</h4>' +
         '<svg class="aid-diet-chart' + (held ? ' held' : '') + '" viewBox="0 0 ' + C.width + ' ' +
         C.height + '"' + grip + ' role="img" aria-label="' + escapeText(words('title')) + '">' +
         '<line class="aid-diet-axis" x1="' + C.left + '" y1="' + C.base + '" x2="' + C.right +
         '" y2="' + C.base + '"/>' + marker + curves + '<text class="aid-diet-end" x="' + C.left +
         '" y="' + (C.base + C.axis) + '">' + escapeText(words('low')) +
         '</text><text class="aid-diet-end" x="' + C.right + '" y="' + (C.base + C.axis) +
         '" text-anchor="end">' + escapeText(words('high')) + '</text>' + knob + '</svg>' +
         readout + '</section>';
}
export function effectorGraphic(state, organ) {
  const code = organFunction(organ, state.sites);
  const twinOrgan = findOrgan(state.document, organ.pair);
  const twin = twinOrgan?.type === 'muscle' ? twinOrgan.centers : [];
  const draw = {
    [MOTOR_KIND.forward] : tailGraphic,
    [MOTOR_KIND.turn] : sideGraphic,
    [MOTOR_KIND.suction] : suctionGraphic,
    [MOTOR_KIND.aggression] : jawGraphic,
    [MOTOR_KIND.defense] : defenseGraphic
  }[code];
  if (!draw)
    return '';
  return effectorBlock(organ, code, sideOf(organ), label('title.' + code),
                       draw(state, organ, organ.centers, twin),
                       nodeControls(organ, code, nodeLimit(organ, state.sites)) + muscleHint(code) +
                           (code === MOTOR_KIND.aggression
                                ? dietChart(state, 'teeth', organ) + dietChart(state, 'jaw', organ)
                            : code === MOTOR_KIND.suction ? dietChart(state, 'suction', organ)
                                                          : ''));
}
