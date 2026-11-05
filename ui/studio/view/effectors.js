import {ANATOMY, ATELIER_LIMITS, BODY_UNIT, FIN, MOTOR_KIND} from '../../schema.js';
import {finVolumeOf, jawReach, lipWidth, tailFinSize, toothForm} from '../../fish_organs.js';
import {jawLeverage, mouthShare, organSize} from '../../fish_forms.js';
import {ORGAN_BY_KEY, functionFor} from '../model/organs.js';
import {findOrgan, muscleTrait} from '../model/document.js';
import {absorptionColour, fishBodyColour, pigmentAbsorption} from '../model/pigment.js';
import {finSizes} from './frame.js';
import {escapeText} from './markup.js';
import {t} from '../../strings.js';

// An organ that recruits nodes as what it does: a muscle as the tail fin it beats, the side fin
// it steers with, the mouth it sucks with or the jaw it bites with, drawn as the Aquarium grows
// them; spines on the skin; pigment as the colour of the fish. Its nodes lie as bundles on a rail;
// the handle after the last bundle adds or takes nodes, the one on top of it sets each node's
// strength. What the muscles of a function shape for the whole fish (how it swims, how long and
// toothed its jaw is) has a handle of its own.
const n = value => Number(value).toFixed(1);
const label = (key, values) => t('studio.muscle.' + key, values);
const FRAME = Object.freeze({width : 300, height : 170, middle : 85});
// Each function's rail: first bundle at X, STEP apart, at Y (or OFFSET from the middle towards
// the muscle's side), LEAST to MOST high at no to full strength.
const RAIL = Object.freeze({
  [MOTOR_KIND.forward] : {x : 56, step : 12, offset : 15, least : 3, most : 9},
  [MOTOR_KIND.turn] : {x : 40, step : 20, y : 38, least : 3, most : 12},
  [MOTOR_KIND.suction] : {x : 152, step : 17, offset : 30, least : 3, most : 10},
  [MOTOR_KIND.aggression] : {x : 224, step : 9, y : 118, least : 3, most : 7},
  [MOTOR_KIND.defense] : {x : 34, step : 32, y : 50, least : 3, most : 11},
  [MOTOR_KIND.pigment] : {x : 20, step : 11, y : 112, least : 2, most : 5}
});
// Handles: their radius, and how far the strength handle stands above its bundle.
const HANDLE = Object.freeze({radius : 5.5, above : 3});
const railY = (code, side) => RAIL[code].y ?? FRAME.middle + side * RAIL[code].offset;
const bundleHeight = (code, copies) =>
    RAIL[code].least + (RAIL[code].most - RAIL[code].least) * copies / ATELIER_LIMITS.max_copies;
const bundleX = (code, index) => RAIL[code].x + index * RAIL[code].step;
const handle = (name, x, y, title) => '<circle class="aid-graphic-handle aid-muscle-handle ' +
                                      name.replace(':', '-') + '" data-effector-handle="' + name +
                                      '" cx="' + n(x) + '" cy="' + n(y) + '" r="' + HANDLE.radius +
                                      '"><title>' + escapeText(title) + '</title></circle>';
// A muscle's nodes as bundles, the muscle's own with handles for their number and strength.
function rail(code, side, centers, own) {
  const y = railY(code, side);
  let html = '';
  centers.forEach((center, index) => {
    html += '<ellipse class="aid-muscle-bundle' + (own ? ' own' : '') + '" cx="' +
            n(bundleX(code, index)) + '" cy="' + n(y) + '" rx="' + n(RAIL[code].step * .42) +
            '" ry="' + n(bundleHeight(code, center.copies)) + '"/>';
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
  return trait ? {trait : trait.key, value : Math.max(0, Math.min(1, trait.at(x, y)))} : null;
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
  const body = 'M0 ' + n(M - TAIL.body[0]) + ' L' + R + ' ' + n(M - TAIL.body[1]) + ' L' + R + ' ' +
               n(M + TAIL.body[1]) + ' L0 ' + n(M + TAIL.body[0]) + 'Z';
  const lobe = sign => 'M' + R + ' ' + n(M + sign * TAIL.body[1] * .6) + ' Q' + n(R + length * .4) +
                       ' ' + n(M + sign * width * .55) + ' ' + n(end) + ' ' + n(M + sign * width) +
                       ' L' + n(R + length * TAIL.fork) + ' ' + M + ' L' + R + ' ' + M + 'Z';
  // One ray of the fin per node on its side, as thick as the node is strong.
  const rays = (sign, nodes, own) =>
      nodes
          .map((center, k) => {
            const share = (k + 1) / (nodes.length + 1);
            return '<line class="aid-muscle-ray' + (own ? ' own' : '') + '" x1="' + R + '" y1="' +
                   M + '" x2="' + n(R + length * (TAIL.fork + (1 - TAIL.fork) * share)) + '" y2="' +
                   n(M + sign * width * share) + '" stroke-width="' +
                   n(1 + 3 * center.copies / ATELIER_LIMITS.max_copies) + '"/>';
          })
          .join('');
  const W = TAIL.wave, points = Array.from({length : W.steps + 1}, (_, k) => {
    const x = end * k / W.steps;
    return n(x) + ' ' + n(M - swing(undulation, x / end) * Math.sin(2 * Math.PI * x / W.length));
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
  const k = organ.side < 0 ? 0 : 1, size = finSizes(state.anatomy?.fins).sides[k];
  const S = SIDE, sweep = S.sweep * size.length, out = S.out * size.out;
  const tip = [ S.root + S.base / 2 + sweep, S.skin + out ];
  const fin = 'M' + S.root + ' ' + S.skin + ' Q' + n(S.root + sweep / 2) + ' ' + n(S.skin + out) +
              ' ' + n(tip[0]) + ' ' + n(tip[1]) + ' Q' + n(S.root + S.base) + ' ' +
              n(S.skin + out / 2) + ' ' + (S.root + S.base) + ' ' + S.skin + 'Z';
  const rays = centers
                   .map((center, index) => {
                     const share = (index + 1) / (centers.length + 1);
                     const x2 = S.root + S.base * (1 - share) + sweep * share * .9,
                           y2 = S.skin + out * (.45 + .55 * share);
                     return '<line class="aid-muscle-ray own" x1="' + n(S.root + S.base * .3) +
                            '" y1="' + S.skin + '" x2="' + n(x2) + '" y2="' + n(y2) +
                            '" stroke-width="' +
                            n(1 + 3 * center.copies / ATELIER_LIMITS.max_copies) + '"/>';
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
    flow += '<path class="aid-muscle-flow" d="M' + n(from[0]) + ' ' + n(from[1]) + ' Q' +
            n((from[0] + to[0]) / 2) + ' ' + n(y) + ' ' + n(to[0]) + ' ' + n(to[1]) + ' l-' +
            P.flow.head + ' -' + P.flow.head / 2 + ' M' + n(to[0]) + ' ' + n(to[1]) + ' l-' +
            P.flow.head + ' ' + P.flow.head / 2 + '"/>';
  }
  const lips = P.lip * lipWidth(suction) / lipWidth(0);
  return '<path class="aid-muscle-body" d="' + head + '"/>' + flow +
         '<ellipse class="aid-muscle-mouth" cx="' + n(mouth) + '" cy="' + M + '" rx="' + n(rx) +
         '" ry="' + n(ry) + '" stroke-width="' + n(lips) + '"/>' +
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
  const power = organSize(columns[ANATOMY.attack_left + (organ.side < 0 ? 0 : 1)]) || 1,
        form = toothForm(power, bluntness), full = toothForm(1, bluntness).reach;
  const height = JAW.tooth[1] * form.reach / full * form.height, half = JAW.tooth[0] / 2;
  let teeth = '';
  for (const [[ x0, y0 ], [ x1, y1 ]] of [upper, lower]) {
    const sign = y1 < hy ? 1 : -1;
    for (let i = 0; i < form.count; ++i) {
      const share = (i + .5) / form.count * .85, x = x1 + (x0 - x1) * share,
            y = y1 + (y0 - y1) * share;
      teeth += '<path class="aid-muscle-tooth" d="M' + n(x - half) + ' ' + n(y) + ' L' +
               n(x - half * form.flat) + ' ' + n(y + sign * height) + ' L' +
               n(x + half * form.flat) + ' ' + n(y + sign * height) + ' L' + n(x + half) + ' ' +
               n(y) + 'Z"/>';
    }
  }
  // The head runs over the forehead to the upper jaw's tip, into the mouth to the hinge, out to
  // the lower jaw's tip and back under the throat.
  const head = 'M' + W + ' ' + (hy - up) + ' C' + (hx + 30) + ' ' + (hy - up - 6) + ' ' +
               n(tip + 34) + ' ' + (hy - wide - 30) + ' ' + n(tip) + ' ' + (hy - wide) + ' L' + hx +
               ' ' + (hy - open) + ' L' + hx + ' ' + (hy + open) + ' L' + n(lower[1][0]) + ' ' +
               (hy + wide) + ' C' + n(tip + 40) + ' ' + (hy + down) + ' ' + (hx + 30) + ' ' +
               (hy + down) + ' ' + W + ' ' + (hy + down - 4) + 'Z';
  const T = JAW.sample, sample = toothForm(1, bluntness), top = T.y - T.height * sample.height;
  const jaw = ([ a, b ]) => 'M' + n(a[0]) + ' ' + n(a[1]) + ' L' + n(b[0]) + ' ' + n(b[1]);
  const style = bluntness < 1 / 3 ? 'sharp' : bluntness > 2 / 3 ? 'blunt' : 'mixed';
  return '<path class="aid-muscle-body" d="' + head + '"/><circle class="aid-muscle-eye" cx="' +
         JAW.eye[0] + '" cy="' + JAW.eye[1] + '" r="' + JAW.eye[2] + '"/>' + teeth +
         '<path class="aid-muscle-jaw" d="' + jaw(upper) + ' ' + jaw(lower) + '"/>' +
         '<path class="aid-muscle-tooth sample" d="M' + (T.x - T.base) + ' ' + T.y + ' L' +
         n(T.x - T.base * sample.flat) + ' ' + n(top) + ' L' + n(T.x + T.base * sample.flat) + ' ' +
         n(top) + ' L' + (T.x + T.base) + ' ' + T.y + 'Z"/>' +
         rail(MOTOR_KIND.aggression, organ.side, centers, true) +
         handle('trait:q2', tip, hy - wide, label('jaw.handle')) +
         handle('trait:q1', T.x, top, label('teeth.handle')) + '<text x="' + (T.x + T.base + 8) +
         '" y="' + (T.y - 4) + '">' + label('teeth.' + style) + '</text>';
}
// What the handles on traits set, from where they are dragged to.
const TRAIT_HANDLES = Object.freeze({
  [MOTOR_KIND.forward] : {'trait:q1' : {key : 'undulation', at : undulationAt}},
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
            return '<path class="aid-muscle-spine" d="M' + n(x - S.base) + ' ' + S.skin + ' L' +
                   n(x + S.base * .3) + ' ' + n(S.skin + reach) + ' L' + n(x + S.base) + ' ' +
                   S.skin + 'Z"/>';
          })
          .join('');
  return '<path class="aid-muscle-body" d="M0 0 H' + FRAME.width + ' V' + S.skin + ' H0Z"/>' +
         spines + rail(code, organ.side, centers, true);
}
// Pigment as the colour it gives the fish: a strip of skin in the body's colour at rest, with the
// nodes as scales on it in the hue they absorb least (their colour at full depth, HUE_DEPTH
// times their own absorption).
const SKIN = Object.freeze({top : 18, bottom : 140, hue_depth : 100});
function pigmentGraphic(state, organ, centers) {
  const half = state.capabilities?.pigmentHalf;
  const body = fishBodyColour(state.document, state.stale ? null : state.report, half);
  const hue =
      absorptionColour(pigmentAbsorption(centers[0]).map(value => value * SKIN.hue_depth), half);
  return '<rect class="aid-pigment-skin" x="0" y="' + SKIN.top + '" width="' + FRAME.width +
         '" height="' + (SKIN.bottom - SKIN.top) + '" rx="14" fill="' + body + '"/>' +
         '<text x="12" y="' + (SKIN.top + 18) + '">' + escapeText(label('pigment.body')) +
         '</text>' +
         '<g style="--scale:' + hue + '">' + rail(MOTOR_KIND.pigment, organ.side, centers, true) +
         '</g>';
}

// The readout under a muscle's graphic: its nodes and strength, and what its function does.
function readout(state, code, centers) {
  const strength = centers.reduce((sum, c) => sum + c.copies, 0) / ATELIER_LIMITS.max_copies;
  let html = label('readout', {
    nodes : centers.length,
    strength : strength.toLocaleString('de-DE', {maximumFractionDigits : 2})
  });
  if (code === MOTOR_KIND.aggression) {
    const jaw =
        muscleTrait(state.document, code, 'jaw_length', state.sites) ?? BODY_UNIT.trait_middle;
    html +=
        ' · ' + label('jaw.lever',
                      {n : jawLeverage(jaw).toLocaleString('de-DE', {maximumFractionDigits : 2})});
  }
  return '<p class="aid-muscle-readout">' + escapeText(html) + '</p><p class="aid-hint">' +
         escapeText(label('hint.' + code)) + '</p>';
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
    [MOTOR_KIND.defense] : defenseGraphic,
    [MOTOR_KIND.pigment] : pigmentGraphic
  }[code];
  if (!draw)
    return '';
  return '<div class="aid-effector-block" data-effector-block="' + escapeText(organ.id) + '">' +
         '<svg class="aid-effector-graphic" viewBox="0 0 ' + FRAME.width + ' ' + FRAME.height +
         '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' + code +
         '" data-effector-side="' + (organ.side < 0 ? -1 : 1) + '" role="img" aria-label="' +
         escapeText(label('title.' + code)) + '">' + draw(state, organ, organ.centers, twin) +
         '</svg>' + readout(state, code, organ.centers) + '</div>';
}
