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
import {ORGAN_BY_KEY, functionFor} from '../model/organs.js';
import {centerIndex, findOrgan, muscleTrait} from '../model/document.js';
import {BODY_FRAME, sideIndex, sideOf} from '../model/layout.js';
import {bodyDirection, finSizes, fishPath} from './frame.js';
import {escapeText, fixed, namedTrack, trackShare} from './markup.js';
import {formatNumber, percent, t, textArea} from '../../strings.js';
import {clamp, degrees, radians, wrapAngle} from '../../units.js';
import {contactFieldOf, contactHalfAngle} from '../../tuning.js';

// An organ that recruits nodes as what it does: a muscle as the tail fin it beats, the side fin
// it steers with, the mouth it sucks with or the jaw it bites with, drawn as the Aquarium grows
// them; spines on the skin. Its nodes lie as bundles on a rail;
// the handle after the last bundle adds or takes nodes, the one on top of it sets each node's
// strength. What the muscles of a function shape for the whole fish (how it swims, how long and
// toothed its jaw is) has a handle of its own.
const label = (key, values) => t('studio.muscle.' + key, values);
const FRAME = Object.freeze({width : 300, height : 170, middle : 85});
// Each function's rail: first bundle at X, STEP apart, at Y (or OFFSET from the middle towards
// the muscle's side), LEAST to MOST high at no to full strength.
const RAIL = Object.freeze({
  [MOTOR_KIND.forward] : {x : 56, step : 12, offset : 15, least : 3, most : 9},
  [MOTOR_KIND.turn] : {x : 40, step : 20, y : 38, least : 3, most : 12},
  [MOTOR_KIND.suction] : {x : 152, step : 17, offset : 30, least : 3, most : 10},
  [MOTOR_KIND.aggression] : {x : 224, step : 9, y : 118, least : 3, most : 7},
  [MOTOR_KIND.defense] : {x : 34, step : 32, y : 50, least : 3, most : 11}
});
// Handles: their radius, and how far the strength handle stands above its bundle.
const HANDLE = Object.freeze({radius : 5.5, above : 3});
const railY = (code, side) => RAIL[code].y ?? FRAME.middle + side * RAIL[code].offset;
const bundleHeight = (code, copies) =>
    RAIL[code].least + (RAIL[code].most - RAIL[code].least) * copies / ATELIER_LIMITS.max_copies;
const bundleX = (code, index) => RAIL[code].x + index * RAIL[code].step;
const handle = (name, x, y, title) =>
    '<circle class="aid-graphic-handle aid-muscle-handle ' + name.replace(':', '-') +
    '" data-effector-handle="' + name + '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
    HANDLE.radius + '"><title>' + escapeText(title) + '</title></circle>';
// A muscle's nodes as bundles, the muscle's own with handles for their number and strength.
function rail(code, side, centers, own) {
  const y = railY(code, side);
  let html = '';
  centers.forEach((center, index) => {
    html += '<ellipse class="aid-muscle-bundle' + (own ? ' own' : '') + '" cx="' +
            fixed(bundleX(code, index)) + '" cy="' + fixed(y) + '" rx="' +
            fixed(RAIL[code].step * .42) + '" ry="' + fixed(bundleHeight(code, center.copies)) +
            '"/>';
  });
  if (!own || !centers.length)
    return html;
  const last = centers.length - 1, x = bundleX(code, last);
  return html + handle('nodes', x + RAIL[code].step * .5 + HANDLE.radius, y, label('nodesHandle')) +
         handle('strength', x, y - bundleHeight(code, centers[last].copies) - HANDLE.above,
                label('strengthHandle'));
}
// A handle of an organ of a type moved to (fx, fy), fractions of the graphic: the organ's
// nodes, their strength or a trait of the fish.
export function effectorPatch(type, code, side, name, fx, fy) {
  const x = fx * FRAME.width, y = fy * FRAME.height, R = RAIL[code];
  const most = ORGAN_BY_KEY[type]?.nodes ?? 1;
  if (name === 'nodes')
    return {
      nodes : Math.max(1, Math.min(most, Math.round((x - HANDLE.radius - R.x) / R.step + .5)))
    };
  if (name === 'strength') {
    const share = (Math.abs(y - railY(code, side)) - HANDLE.above - R.least) / (R.most - R.least);
    return {
      copies : Math.max(
          1, Math.min(ATELIER_LIMITS.max_copies, Math.round(share * ATELIER_LIMITS.max_copies)))
    };
  }
  const trait = TRAIT_HANDLES[code]?.[name];
  return trait ? {trait : trait.key, value : clamp(trait.at(x, y))} : null;
}

// The tail: the body's end to its ROOT, BODY half high at its start and the root, and the tail
// fin as long and wide as the Aquarium grows it (UNIT pixels per body radius, at most MOST). A
// line WAVE.amplitude high at most shows how the body swings: from the tail alone (its swing
// grows with the STIFF power along) to the whole body (BASE of it at the front).
const TAIL = Object.freeze({
  root : 150,
  body : [ 60, 24 ],
  unit : 230,
  most : [ 145, 80 ],
  fork : .55,
  wave : {amplitude : 22, at : 22, stiff : 3, base : .35, steps : 48, length : 105},
  caption : [ 10, 160 ]
});
const tailTip = volume => {
  const size = tailFinSize(volume);
  return [
    Math.min(TAIL.most[0], TAIL.unit * size.length), Math.min(TAIL.most[1], TAIL.unit * size.width)
  ];
};
// How far the body swings at x along the graphic (0 at the front, 1 at the fin's tip).
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
  const lobe = sign => 'M' + R + ' ' + fixed(M + sign * TAIL.body[1] * .6) + ' Q' +
                       fixed(R + length * .4) + ' ' + fixed(M + sign * width * .55) + ' ' +
                       fixed(end) + ' ' + fixed(M + sign * width) + ' L' +
                       fixed(R + length * TAIL.fork) + ' ' + M + ' L' + R + ' ' + M + 'Z';
  // One ray of the fin per node on its side, as thick as the node is strong.
  const rays = (sign, nodes, own) =>
      nodes
          .map((center, k) => {
            const share = (k + 1) / (nodes.length + 1);
            return '<line class="aid-muscle-ray' + (own ? ' own' : '') + '" x1="' + R + '" y1="' +
                   M + '" x2="' + fixed(R + length * (TAIL.fork + (1 - TAIL.fork) * share)) +
                   '" y2="' + fixed(M + sign * width * share) + '" stroke-width="' +
                   fixed(1 + 3 * center.copies / ATELIER_LIMITS.max_copies) + '"/>';
          })
          .join('');
  const W = TAIL.wave, points = Array.from({length : W.steps + 1}, (_, k) => {
    const x = end * k / W.steps;
    return fixed(x) + ' ' +
           fixed(M - swing(undulation, x / end) * Math.sin(2 * Math.PI * x / W.length));
  });
  const at = W.at, handleY = M - swing(undulation, at / end);
  const style = undulation < 1 / 3 ? 'beat' : undulation > 2 / 3 ? 'wave' : 'mixed';
  return '<path class="aid-muscle-body" d="' + body + '"/>' +
         '<path class="aid-muscle-fin" d="' + lobe(-1) + lobe(1) + '"/>' +
         rays(side, centers, true) + rays(-side, twin, false) +
         '<path class="aid-muscle-wave" d="M' + points.join(' L') + '"/>' +
         rail(MOTOR_KIND.forward, side, centers, true) +
         rail(MOTOR_KIND.forward, -side, twin, false) +
         handle('trait:q1', at, handleY, label('undulation.handle')) + '<text x="' +
         TAIL.caption[0] + '" y="' + TAIL.caption[1] + '">' + label('undulation.' + style) +
         '</text>';
}
// How swinging the body is at a handle's height.
const undulationAt = (x, y) => {
  const along = TAIL.wave.at / TAIL.root, low = swing(0, along), high = swing(1, along);
  return (FRAME.middle - y - low) / (high - low);
};

// A side fin: the flank down to its SKIN, the fin from its ROOT along the skin, swept back and
// standing out as far as the body's own side fins (FIN of the Atelier's outline, SCALE times).
const SIDE = Object.freeze({skin : 74, root : 96, base : 60, sweep : 92, out : 62});
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
                     const x2 = S.root + S.base * (1 - share) + sweep * share * .9,
                           y2 = S.skin + out * (.45 + .55 * share);
                     return '<line class="aid-muscle-ray own" x1="' + fixed(S.root + S.base * .3) +
                            '" y1="' + S.skin + '" x2="' + fixed(x2) + '" y2="' + fixed(y2) +
                            '" stroke-width="' +
                            fixed(1 + 3 * center.copies / ATELIER_LIMITS.max_copies) + '"/>';
                   })
                   .join('');
  return '<path class="aid-muscle-body" d="M0 0 H' + FRAME.width + ' V' + S.skin + ' H0Z"/>' +
         '<path class="aid-muscle-fin" d="' + fin + '"/>' + rays +
         rail(MOTOR_KIND.turn, organ.side, centers, true);
}

// The mouth from above: the snout at SNOUT, a mouth as wide and deep as the jaw is long (the
// Atelier's mouth, SCALE times), lips as thick as the suction; water drawn in along FLOW lines,
// the longer the stronger it sucks.
const MOUTH = Object.freeze({
  snout : 96,
  head : 66,
  mouth : [ 8, 22 ],
  lip : 2.4,
  flow : {lines : 5, spread : 15, least : 16, span : 70, head : 6}
});
function suctionGraphic(state, organ, centers, twin) {
  const columns = state.anatomy?.anatomy ?? [], M = FRAME.middle, P = MOUTH;
  const jaw = columns[ANATOMY.jaw_length] ?? BODY_UNIT.trait_middle,
        middle = BODY_UNIT.trait_middle, suction = organSize(columns[ANATOMY.suction_strength]);
  const rx = P.mouth[0] * jawReach(jaw) / jawReach(middle),
        ry = P.mouth[1] * mouthShare(jaw) / mouthShare(middle), mouth = P.snout + rx;
  const head = 'M' + P.snout + ' ' + M + ' C' + P.snout + ' ' + (M - P.head) + ' ' +
               (P.snout + 80) + ' ' + (M - P.head) + ' ' + FRAME.width + ' ' + (M - P.head) + ' V' +
               (M + P.head) + ' C' + (P.snout + 80) + ' ' + (M + P.head) + ' ' + P.snout + ' ' +
               (M + P.head) + ' ' + P.snout + ' ' + M + 'Z';
  const reach = P.flow.least + P.flow.span * suction;
  let flow = '';
  for (let k = 0; k < P.flow.lines; ++k) {
    const y = M + (k - (P.flow.lines - 1) / 2) * P.flow.spread;
    const from = [ P.snout - 6 - reach, y * 1.15 - M * .15 ],
          to = [ P.snout - 6, M + (y - M) * .35 ];
    flow += '<path class="aid-muscle-flow" d="M' + fixed(from[0]) + ' ' + fixed(from[1]) + ' Q' +
            fixed((from[0] + to[0]) / 2) + ' ' + fixed(y) + ' ' + fixed(to[0]) + ' ' +
            fixed(to[1]) + ' l-' + P.flow.head + ' -' + P.flow.head / 2 + ' M' + fixed(to[0]) +
            ' ' + fixed(to[1]) + ' l-' + P.flow.head + ' ' + P.flow.head / 2 + '"/>';
  }
  const lips = P.lip * lipWidth(suction) / lipWidth(0);
  return '<path class="aid-muscle-body" d="' + head + '"/>' + flow +
         '<ellipse class="aid-muscle-mouth" cx="' + fixed(mouth) + '" cy="' + M + '" rx="' +
         fixed(rx) + '" ry="' + fixed(ry) + '" stroke-width="' + fixed(lips) + '"/>' +
         rail(MOTOR_KIND.suction, organ.side, centers, true) +
         rail(MOTOR_KIND.suction, -organ.side, twin, false);
}

// The jaw from the side: the head cut open by the mouth from the jaw's HINGE to its tip, the jaw
// reaching UNIT pixels per body radius of the Aquarium's reach forward from the hinge, its tip
// GAP apart at the hinge and the tip; teeth on both jaws as many, long and blunt as the Aquarium
// grows them (TOOTH: base and full reach); a larger tooth (SAMPLE) shows their shape.
const JAW = Object.freeze({
  hinge : [ 212, 86 ],
  unit : 380,
  gap : [ 3, 14 ],
  head : [ 74, 64 ],
  eye : [ 252, 48, 10 ],
  tooth : [ 6, 22 ],
  sample : {x : 40, y : 158, base : 10, height : 30}
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
        lower = [ [ hx, hy + open ], [ tip + 4, hy + wide ] ];
  const power = organSize(columns[ANATOMY.attack_left + sideIndex(organ.side)]) || 1,
        form = toothForm(power, bluntness), full = toothForm(1, bluntness).reach;
  const height = JAW.tooth[1] * form.reach / full * form.height, half = JAW.tooth[0] / 2;
  let teeth = '';
  for (const [[ x0, y0 ], [ x1, y1 ]] of [upper, lower]) {
    const sign = y1 < hy ? 1 : -1;
    for (let i = 0; i < form.count; ++i) {
      const share = (i + .5) / form.count * .85, x = x1 + (x0 - x1) * share,
            y = y1 + (y0 - y1) * share;
      teeth += '<path class="aid-muscle-tooth" d="M' + fixed(x - half) + ' ' + fixed(y) + ' L' +
               fixed(x - half * form.flat) + ' ' + fixed(y + sign * height) + ' L' +
               fixed(x + half * form.flat) + ' ' + fixed(y + sign * height) + ' L' +
               fixed(x + half) + ' ' + fixed(y) + 'Z"/>';
    }
  }
  // The head runs over the forehead to the upper jaw's tip, into the mouth to the hinge, out to
  // the lower jaw's tip and back under the throat.
  const head = 'M' + W + ' ' + (hy - up) + ' C' + (hx + 30) + ' ' + (hy - up - 6) + ' ' +
               fixed(tip + 34) + ' ' + (hy - wide - 30) + ' ' + fixed(tip) + ' ' + (hy - wide) +
               ' L' + hx + ' ' + (hy - open) + ' L' + hx + ' ' + (hy + open) + ' L' +
               fixed(lower[1][0]) + ' ' + (hy + wide) + ' C' + fixed(tip + 40) + ' ' + (hy + down) +
               ' ' + (hx + 30) + ' ' + (hy + down) + ' ' + W + ' ' + (hy + down - 4) + 'Z';
  const T = JAW.sample, sample = toothForm(1, bluntness), top = T.y - T.height * sample.height;
  const jaw = ([ a, b ]) =>
      'M' + fixed(a[0]) + ' ' + fixed(a[1]) + ' L' + fixed(b[0]) + ' ' + fixed(b[1]);
  const style = bluntness < 1 / 3 ? 'sharp' : bluntness > 2 / 3 ? 'blunt' : 'mixed';
  return '<path class="aid-muscle-body" d="' + head + '"/><circle class="aid-muscle-eye" cx="' +
         JAW.eye[0] + '" cy="' + JAW.eye[1] + '" r="' + JAW.eye[2] + '"/>' + teeth +
         '<path class="aid-muscle-jaw" d="' + jaw(upper) + ' ' + jaw(lower) + '"/>' +
         '<path class="aid-muscle-tooth sample" d="M' + (T.x - T.base) + ' ' + T.y + ' L' +
         fixed(T.x - T.base * sample.flat) + ' ' + fixed(top) + ' L' +
         fixed(T.x + T.base * sample.flat) + ' ' + fixed(top) + ' L' + (T.x + T.base) + ' ' + T.y +
         'Z"/>' + rail(MOTOR_KIND.aggression, organ.side, centers, true) +
         handle('trait:q2', tip, hy - wide, label('jaw.handle')) +
         handle('trait:q1', T.x, top, label('teeth.handle')) + '<text x="' + (T.x + T.base + 8) +
         '" y="' + (T.y - 4) + '">' + label('teeth.' + style) + '</text>';
}
// What the handles on traits set, from where they are dragged to.
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

// Spines out of the skin at SKIN, one at each node, as long as it is strong (LEAST to MOST).
const SPINE = Object.freeze({skin : 96, base : 9, least : 10, most : 52});
function defenseGraphic(state, organ, centers) {
  const S = SPINE, code = MOTOR_KIND.defense;
  const spines =
      centers
          .map((center, index) => {
            const x = bundleX(code, index),
                  reach = S.least + (S.most - S.least) * center.copies / ATELIER_LIMITS.max_copies;
            return '<path class="aid-muscle-spine" d="M' + fixed(x - S.base) + ' ' + S.skin + ' L' +
                   fixed(x + S.base * .3) + ' ' + fixed(S.skin + reach) + ' L' + fixed(x + S.base) +
                   ' ' + S.skin + 'Z"/>';
          })
          .join('');
  return '<path class="aid-muscle-body" d="M0 0 H' + FRAME.width + ' V' + S.skin + ' H0Z"/>' +
         spines + rail(code, organ.side, centers, true);
}
// How the spines shield the body all round, as the engine finds it: around a small fish (snout
// left, side +1 below, as on the canvas) the shield in each direction at rest (filled) and
// fully raised (dashed), from the INNER ring (none) to the OUTER (full); the organ's nodes as
// dots on the inner ring in the directions their spines centre on, and the spread of the first
// node's spines, which all its nodes share, as a sector with a handle on its edge. The fish is
// FISH of its frame size.
const SPINE_RING =
    Object.freeze({width : 300, height : 170, cx : 150, cy : 85, inner : 30, outer : 80});
// The spines' spread the pointer (fractions of the ring) sets: how far its direction lies from
// where they centre (aim).
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
  const point = (angle, radius) => {
    const d = bodyDirection(angle);
    return {x : R.cx + d.x * radius, y : R.cy + d.y * radius};
  };
  const xy = p => fixed(p.x) + ' ' + fixed(p.y);
  const around = values =>
      'M' +
      values
          .map((value, k) => xy(point(-Math.PI + (k + .5) * 2 * Math.PI / values.length,
                                      R.inner + (R.outer - R.inner) * value)))
          .join(' L') +
      'Z';
  const half = radians(contactHalfAngle(first.field));
  // Directions grow counter-clockwise on screen, so the sector sweeps that way.
  const sector = half >= Math.PI ? '<circle class="aid-spine-spread" cx="' + R.cx + '" cy="' +
                                       R.cy + '" r="' + R.inner + '"/>'
                                 : '<path class="aid-spine-spread" d="M' + R.cx + ' ' + R.cy +
                                       ' L' + xy(point(aim - half, R.inner)) + ' A' + R.inner +
                                       ' ' + R.inner + ' 0 ' + (half > Math.PI / 2 ? 1 : 0) +
                                       ' 0 ' + xy(point(aim + half, R.inner)) + 'Z"/>';
  const middle = {x : (BODY_FRAME.snout + BODY_FRAME.tail) / 2, y : BODY_FRAME.middle};
  const fish = '<path class="aid-spine-fish" d="' + fishPath() + '" transform="translate(' +
               fixed(R.cx - middle.x * F.scale) + ' ' + fixed(R.cy - middle.y * F.scale) +
               ') scale(' + F.scale + ')"/>';
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
// The field's legend at its upper left: a swatch for each line and what it shows.
const LEGEND = Object.freeze({x : 6, y : 14, step : 16, swatch : 14, gap : 5});
const legend = () => [[ 'aid-spine-rest', 'rest' ], [ 'aid-spine-raised', 'raised' ]]
                         .map(([ name, key ], k) => {
                           const L = LEGEND, y = L.y + k * L.step;
                           return '<path class="aid-spine-swatch ' + name + '" d="M' + L.x + ' ' +
                                  y + ' h' + L.swatch + '"/><text class="aid-spine-legend" x="' +
                                  (L.x + L.swatch + L.gap) + '" y="' + (y + 4) + '">' +
                                  escapeText(label('spines.' + key)) + '</text>';
                         })
                         .join('');
// The gut as long as the suction muscles make it (their trait, the engine's and the Aquarium's
// loops for it): a tube coiling AMPLITUDE across from FROM to TO, its food cells as dots on its
// wall and its stretch cells as a band inside, each choosing its node; a handle on the TRACK
// below sets the length, from short (meat) to long (plants), where suction muscles exist.
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
  return '<div class="aid-effector-block" data-effector-block="' + escapeText(organ.id) + '">' +
         '<svg class="aid-effector-graphic" viewBox="0 0 ' + FRAME.width + ' ' + FRAME.height +
         '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' + code +
         '" data-effector-side="1" role="img" aria-label="' + escapeText(label('gut.title')) +
         '">' +
         '<path class="aid-gut-tube" d="M' + points.join(' L') + '" stroke-width="' + G.tube +
         '"/>' + part(fullness, '<path class="aid-gut-stretch" d="M' + points.join(' L') + '"/>') +
         part(food, dots) +
         namedTrack(G.track, G.track_y, length, 'data-effector-handle="trait:q1"',
                    label('gut.handle'), [ label('gut.short'), label('gut.long') ]) +
         '</svg>' +
         (length === null ? '<p class="aid-hint">' + escapeText(label('gut.noMuscle')) + '</p>'
                          : '') +
         dietChart(state, 'gut') + '</div>';
}

// The readout under a muscle's graphic: its nodes and strength, and a hint where one helps.
function readout(state, code, centers) {
  const strength = centers.reduce((sum, c) => sum + c.copies, 0) / ATELIER_LIMITS.max_copies;
  const html = label('readout', {nodes : centers.length, strength : formatNumber(strength, 2)});
  const hint = textArea('studio').muscle?.hint?.[code];
  return '<p class="aid-muscle-readout">' + escapeText(html) + '</p>' +
         (hint ? '<p class="aid-hint">' + escapeText(hint) + '</p>' : '');
}

// How a trait the muscles shape serves each kind of food, as the engine reckons it (the
// capabilities' diet, sampled over the trait from 0 to 1): a curve for each, named at its right
// end with its value where the fish stands, which a line marks. CHART: the frame, the plot's
// ends, its top and baseline, the gap before the names and below the axis. Shares show as
// percent, factors against a middle trait as times.
const CHART = Object.freeze({
  width : 300,
  height : 118,
  left : 14,
  right : 176,
  top : 10,
  base : 92,
  gap : 6,
  axis : 14,
  room : 1.1
});
const DIET_CHARTS = Object.freeze({
  gut : {
    source : 'gut',
    trait : 'gut_length',
    code : MOTOR_KIND.suction,
    curves :
        [ [ 'plant', 'share' ], [ 'meat', 'share' ], [ 'sediment', 'share' ], [ 'size', 'factor' ] ]
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
// The suction muscles' strength in all, as the engine sums their capacities.
const suctionStrength = (doc, sites) =>
    doc.organs.filter(o => o.type === 'muscle')
        .flatMap(o => o.centers)
        .filter(c => {
          const site = sites.find(s => s.id === c.site);
          return site && functionFor(c, site) === MOTOR_KIND.suction;
        })
        .reduce((sum, c) => sum + c.copies / ATELIER_LIMITS.max_copies, 0);
function dietChart(state, kind) {
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
            const name = words(key) + (at === null ? '' : ' ' + shown(valueAt(values), form));
            return '<path class="aid-diet-curve k-' + key + ' ' + form + '" d="' + d +
                   '"/><text class="aid-diet-name k-' + key + '" x="' + (C.right + C.gap) +
                   '" y="' + fixed(y(values.at(-1)) + 4) + '">' + escapeText(name) + '</text>' +
                   (at === null ? ''
                                : '<circle class="aid-diet-dot k-' + key + '" cx="' + fixed(x(at)) +
                                      '" cy="' + fixed(y(valueAt(values))) + '" r="3.5"/>');
          })
          .join('');
  const marker = at === null ? ''
                             : '<line class="aid-diet-marker" x1="' + fixed(x(at)) + '" y1="' +
                                   C.top + '" x2="' + fixed(x(at)) + '" y2="' + C.base + '"/>';
  return '<section class="aid-eye-section"><h4>' + escapeText(words('title')) + '</h4>' +
         '<svg class="aid-diet-chart" viewBox="0 0 ' + C.width + ' ' + C.height +
         '" role="img" aria-label="' + escapeText(words('title')) + '">' +
         '<line class="aid-diet-axis" x1="' + C.left + '" y1="' + C.base + '" x2="' + C.right +
         '" y2="' + C.base + '"/>' + marker + curves + '<text class="aid-diet-end" x="' + C.left +
         '" y="' + (C.base + C.axis) + '">' + escapeText(words('low')) +
         '</text><text class="aid-diet-end" x="' + C.right + '" y="' + (C.base + C.axis) +
         '" text-anchor="end">' + escapeText(words('high')) + '</text></svg></section>';
}
// The graphic of an organ that recruits nodes, by its function, with its readout; empty for one
// without a function here.
export function effectorGraphic(state, organ) {
  const first = organ.centers[0], site = state.sites.find(s => s.id === first?.site);
  const code = site ? functionFor(first, site) : -1;
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
  return '<div class="aid-effector-block" data-effector-block="' + escapeText(organ.id) + '">' +
         '<svg class="aid-effector-graphic" viewBox="0 0 ' + FRAME.width + ' ' + FRAME.height +
         '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' + code +
         '" data-effector-side="' + sideOf(organ) + '" role="img" aria-label="' +
         escapeText(label('title.' + code)) + '">' + draw(state, organ, organ.centers, twin) +
         '</svg>' + readout(state, code, organ.centers) +
         (code === MOTOR_KIND.aggression ? dietChart(state, 'teeth') + dietChart(state, 'jaw')
          : code === MOTOR_KIND.suction  ? dietChart(state, 'suction')
                                         : '') +
         '</div>';
}
