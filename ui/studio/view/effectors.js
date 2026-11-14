import {musclePatch, musclePictures} from './muscle_effect.js';
import {glandPatch} from './gland_effect.js';
import {commandPatch} from './command_line.js';
import {liftPatch} from './sacs.js';
import {pigmentPatch} from './pigments.js';
import {gutSensePictures} from './gut_sense.js';
import {
  ANATOMY,
  ATELIER_LIMITS,
  BODY_UNIT,
  FIN_STROKE,
  MOTOR_KIND,
  SIDE_FIN
} from '../../schema.js';
import {
  gutTurns,
  jawReach,
  lipWidth,
  rakerPassage,
  rakerRetention,
  rakerSifting,
  toothForm,
} from '../../fish_organs.js';
import {mouthShare, organSize} from '../../fish_forms.js';
import {isPelvicMuscle, kindLimit, organFunction} from '../model/organs.js';
import {
  antagonistOf,
  centerIndex,
  findOrgan,
  finAngle,
  finStroke,
  gillRakers,
  gutLength,
  muscleTrait
} from '../model/document.js';
import {sideIndex, sideOf} from '../model/layout.js';
import {fieldFish, fieldPoint, finSizes} from './frame.js';
import {escapeText, fixed} from './markup.js';
import {formatNumber, percent, t, textArea} from '../../strings.js';
import {clamp, degrees, radians, wrapAngle} from '../../units.js';
import {contactFieldOf, contactHalfAngle} from '../../tuning.js';
import {organCommand} from './preview.js';
import {handleWord} from './sense_marks.js';
import {gutMealRows} from './gut_meal.js';
import {ecologyIconSvg, FOOD_COLORS} from '../../feeding_view.js';
import {FOOD_SLOT} from '../../nutrition_model.js';

const label = (key, values) => t('studio.muscle.' + key, values);
// The gut, the gills and the gut muscle are no muscle organs; their handles carry their own codes.
export const GUT_TRAIT = 'gut_length', GUT_CODE = -1, GILL_TRAIT = 'gill_rakers', GILL_CODE = -2,
             GUT_MUSCLE_CODE = -3, FIN_ANGLE_TRAIT = 'fin_angle';
const FRAME = Object.freeze({width : 300, height : 170, middle : 85});
const HANDLE = Object.freeze({radius : 5.5});
const handle = (name, x, y, title, shown = '') =>
    (shown ? handleWord({x, y}, shown) : '') +
    '<circle class="aid-graphic-handle aid-muscle-handle ' + name.replaceAll(':', '-') +
    '" data-effector-handle="' + name + '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
    HANDLE.radius + '"><title>' + escapeText(title) + '</title></circle>';
const RAY = Object.freeze({least : 1, span : 3});
const rayWidth = copies => RAY.least + RAY.span * copies / ATELIER_LIMITS.max_copies;
// What the muscle's settings do follows in pictures of their own below what it moves.
const musclePicture = (state, organ, code, side) =>
    musclePictures(state, organ, code, side, kindLimit(organ, state.sites), gateField(organ));
// The gate is set like a sense's sensitivity, by the working cells it belongs to.
const gateField = organ => organ.centers[0]?.role === 'motor'
                               ? ' data-sense-field="' + escapeText(organ.centers[0].id) +
                                     '" data-sense-redraw="refreshEffectors"'
                               : '';
const STROKE_ICON = Object.freeze({width : 30, height : 16, shaft : 10, head : 5});
// The arrow shows where the fin drives the water: toward the tail on the back stroke.
function strokeIcon(stroke) {
  const I = STROKE_ICON, y = I.height / 2, x = I.width / 2;
  const toTail = stroke === FIN_STROKE.back ? 1 : -1, tip = x + toTail * I.shaft;
  return '<svg class="aid-stroke" viewBox="0 0 ' + I.width + ' ' + I.height +
         '" aria-hidden="true"><path d="M' + (x - toTail * I.shaft) + ' ' + y + 'H' + tip + 'M' +
         (tip - toTail * I.head) + ' ' + (y - I.head) + 'L' + tip + ' ' + y + 'L' +
         (tip - toTail * I.head) + ' ' + (y + I.head) + '"/></svg>';
}
function strokeChooser(state, organ) {
  return '<div class="aid-contrast-choices aid-stroke-choices">' +
         Object.entries(FIN_STROKE)
             .map(([ key, stroke ]) => {
               const chosen = finStroke(organ) === stroke;
               return '<button data-fin-stroke="' + stroke + '" data-organ-id="' +
                      escapeText(organ.id) + '" class="' + (chosen ? 'active' : '') +
                      '" aria-pressed="' + chosen + '" title="' +
                      escapeText(label('stroke.' + key + 'Title')) + '">' + strokeIcon(stroke) +
                      '</button>';
             })
             .join('') +
         (antagonistOf(state.document, organ, state.sites)
              ? ''
              : '<button data-fin-antagonist="' + escapeText(organ.id) + '" title="' +
                    escapeText(label('stroke.antagonistTitle')) + '">' +
                    strokeIcon(FIN_STROKE.back) + strokeIcon(FIN_STROKE.front) + '</button>') +
         '</div>';
}
export function effectorPatch(code, name, fx, fy, most, organ, marks = {}) {
  if ([ 'nodes', 'strength', 'sprint', 'fibre' ].includes(name)) {
    const [width, height] = marks.frame.split(',').map(Number);
    return musclePatch(name, {x : fx * width, y : fy * height}, marks, most, organ);
  }
  if (name.startsWith('pigment:')) {
    const [width, height] = marks.frame.split(',').map(Number);
    return pigmentPatch(name, {x : fx * width, y : fy * height}, marks);
  }
  if (name === 'lift:cells') {
    const [width, height] = marks.frame.split(',').map(Number);
    return liftPatch({x : fx * width, y : fy * height}, marks);
  }
  if (name === 'command:gate') {
    const [width, height] = marks.frame.split(',').map(Number);
    return commandPatch({x : fx * width, y : fy * height}, marks);
  }
  if (name.startsWith('gland:')) {
    const [width, height] = marks.frame.split(',').map(Number);
    return glandPatch(name, {x : fx * width, y : fy * height}, marks);
  }
  const trait = TRAIT_HANDLES[code]?.[name];
  return trait ? {trait : trait.key, value : clamp(trait.at(fx * FRAME.width, fy * FRAME.height))}
               : null;
}

const TRAIT_THIRD = 1 / 3;
const traitStyle = (value, [ low, middle, high ]) => value < TRAIT_THIRD       ? low
                                                     : value > 1 - TRAIT_THIRD ? high
                                                                               : middle;

const SIDE = Object.freeze({
  skin : 74,
  root : 96,
  base : 60,
  sweep : 92,
  out : 62,
  ray : {foot : .3, sweep : .9, least : .45},
  // The dial of the stroke: the line along which the fin beats, through a point in the water
  // beside the fin, and the arrow of this muscle's stroke along it.
  dial : {x : 150, y : 112, reach : 44, head : 6}
});
// The angle of a fin's beat against straight back (or forward), in degrees: outward positive.
const beatDegrees = angle => SIDE_FIN.angle * (2 * angle - 1);
// A back stroke drives the water along its beat line; the antagonist drives it the other way.
const strokeSense = stroke => stroke === FIN_STROKE.front ? -1 : 1;
function strokeArrow(angle, stroke) {
  const D = SIDE.dial, a = radians(beatDegrees(angle)), sense = strokeSense(stroke);
  return {
    x : D.x + sense * D.reach * Math.cos(a),
    y : D.y + sense * D.reach * Math.sin(a),
    a,
    sense
  };
}
const angleAt = stroke => (x, y) => {
  const D = SIDE.dial, sense = strokeSense(stroke);
  const a = Math.atan2(sense * (y - D.y), Math.max(0, sense * (x - D.x)));
  return (degrees(a) / SIDE_FIN.angle + 1) / 2;
};
function sideGraphic(state, organ, centers) {
  const k = sideIndex(organ.side), sizes = finSizes(state.anatomy?.fins),
        size = (isPelvicMuscle(organ) ? sizes.pelvic[k] : null) ?? sizes.sides[k];
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
  const D = S.dial, angle = finAngle(organ), stroke = finStroke(organ),
        arrow = strokeArrow(angle, stroke);
  const back = {x : 2 * D.x - arrow.x, y : 2 * D.y - arrow.y},
        wing = side => ({
          x : arrow.x - arrow.sense * D.head * Math.cos(arrow.a + side * Math.PI / 4),
          y : arrow.y - arrow.sense * D.head * Math.sin(arrow.a + side * Math.PI / 4)
        });
  const xy = p => fixed(p.x) + ' ' + fixed(p.y);
  // The caption names where this stroke drives the water: outward or inward of the fin.
  const turned = beatDegrees(angle), style = traitStyle((1 + arrow.sense * (2 * angle - 1)) / 2,
                                                        [ 'inward', 'straight', 'outward' ]);
  return '<path class="aid-muscle-body" d="M0 0 H' + FRAME.width + ' V' + S.skin + ' H0Z"/>' +
         '<path class="aid-muscle-fin" d="' + fin + '"/>' + rays +
         '<path class="aid-muscle-beat" d="M' + xy(back) + ' L' + xy(arrow) + '"/>' +
         '<path class="aid-muscle-stroke" d="M' + D.x + ' ' + D.y + ' L' + xy(arrow) + ' M' +
         xy(wing(-1)) + ' L' + xy(arrow) + ' L' + xy(wing(1)) + '"/>' +
         handle('trait:q1:' + stroke, arrow.x, arrow.y,
                label('angle.' + style, {degrees : formatNumber(Math.abs(turned), 0)}) + ' · ' +
                    label('angle.handle'),
                label('angle.' + style, {degrees : formatNumber(Math.abs(turned), 0)}));
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
  brow : {hinge : 30, tip : 34, throat : 40, rise : 6, lift : 30, tuck : 4}
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
         'Z"/>' + handle('trait:q2', tip, hy - wide, label('jaw.handle'), label('jaw.word')) +
         handle('trait:q1', T.x, top, label('teeth.' + style) + ' · ' + label('teeth.handle'),
                label('teeth.word', {form : label('teeth.' + style)}));
}
const chartShare = x => (x - USE_CHART.left) / (USE_CHART.right - USE_CHART.left);
const TRAIT_HANDLES = Object.freeze({
  [MOTOR_KIND.turn] : Object.fromEntries(
      Object.values(FIN_STROKE)
          .map(stroke => ['trait:q1:' + stroke, {key : FIN_ANGLE_TRAIT, at : angleAt(stroke)}])),
  [GUT_CODE] : {
    'trait:q1' : {key : GUT_TRAIT, at : x => (x - GUT.from - 110) / (GUT.to - GUT.from - 110)},
    'chart:gut' : {key : GUT_TRAIT, at : chartShare}
  },
  [GILL_CODE] : {
    'trait:q1' : {key : GILL_TRAIT, at : (x, y) => (GILL.bottom - y) / (GILL.bottom - GILL.top)}
  },
  [MOTOR_KIND.aggression] : {
    'chart:jaw' : {key : 'jaw_length', at : chartShare},
    'chart:teeth' : {key : 'blunt_teeth', at : chartShare},
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
  const S = SPINE, W = FRAME.width;
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
            const rest = S.least + (raised - S.least) * Math.max(0, organCommand(state, center));
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
// The key in the corner names the two outlines by their lines.
const SPINE_KEY = Object.freeze({x : 8, rows : [ 150, 162 ], sample : 14, gap : 4});
const spineKey = () => [[ 'rest', 'aid-spine-rest' ], [ 'raised', 'aid-spine-raised' ]]
                           .map(([ key, cls ], k) => {
                             const K = SPINE_KEY, y = K.rows[k];
                             return '<path class="' + cls + '" d="M' + K.x + ' ' + y + ' h' +
                                    K.sample + '"/><text class="aid-handle-word" x="' +
                                    (K.x + K.sample + K.gap) + '" y="' + y + '" dy=".35em">' +
                                    escapeText(label('spines.' + key)) + '</text>';
                           })
                           .join('');
// The spines: how far round the fish they guard at rest (solid) and raised (dashed), where its
// nodes sit and the spread handle; the muscle that raises them follows in its own picture.
// Without a design run's spines the side view of the skin stands in.
export function spineField(state, organ) {
  const {spinesRest : rest, spinesRaised : raised, spineAims : aims} = state.anatomy ?? {};
  const first = organ.centers[0];
  const aimOf = center => aims?.[centerIndex(state.document, center.id)];
  const aim = aimOf(first), block = '<div data-spine-block="' + escapeText(organ.id) + '">';
  if (!rest?.length || !raised?.length || !Number.isFinite(aim))
    return block + effectorGraphic(state, organ) + '</div>';
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
  const title = key => '<title>' + escapeText(label('spines.' + key)) + '</title>';
  return block + '<svg class="aid-spine-field" viewBox="0 0 ' + R.width + ' ' + R.height +
         '" data-spine-pad="' + escapeText(first.id) + '" data-spine-aim="' + aim +
         '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
         MOTOR_KIND.defense + '" data-effector-side="' + sideOf(organ) + '"' +
         ' role="img" aria-label="' + escapeText(label('spines.title')) + '">' +
         '<circle class="aid-spine-limit" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.outer +
         '"/><circle class="aid-spine-limit" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.inner +
         '"/>' + sector + '<path class="aid-spine-raised" d="' + around(raised) + '">' +
         title('raised') + '</path><path class="aid-spine-rest" d="' + around(rest) + '">' +
         title('rest') + '</path>' + fish + dots + spineKey() +
         '<circle class="aid-graphic-handle" data-graphic-handle="spread" cx="' + fixed(edge.x) +
         '" cy="' + fixed(edge.y) + '" r="' + HANDLE.radius + '"><title>' +
         escapeText(label('spines.spreadHandle')) + '</title></circle>' +
         '</svg>' + musclePicture(state, organ, MOTOR_KIND.defense, sideOf(organ)) + '</div>';
}
const GUT = Object.freeze(
    {from : 24, to : 276, middle : 85, amplitude : 30, tube : 14, steps : 96, cell : 3.2});
// What the gut gets out of plants and meat over all its lengths, as two curves: the axes span the
// plot (left, right, top, base), the scale words sit `tick` beside them, the curves end in their
// food's icon; the dots and their shares mark the gut's own length, which is dragged here as well.
const USE_CHART = Object.freeze({
  width : 300,
  height : 144,
  left : 44,
  title : 12,
  right : 252,
  top : 14,
  base : 100,
  tick : 6,
  axis : 16,
  icon : .7,
  gap : 16,
  dot : 3.5,
  share : 8,
  below : 9,
  legend : 134,
  sample : 14,
  // The second curve's name starts this far along the axis, clear of a long first name.
  second : .62,
  // A factor's plot reaches this much above its largest value.
  room : 1.15
});
// The gut: its length (handle at its end) and its sense cells, the food cells on the inner wall,
// the stretch cells on the outer wall. The chosen kind shows its feelers, as long as the cells are
// sensitive, and, where they get used to a lasting stimulus, the adaptation arc round its first
// cell. Below it, the use curve shows what plants and meat yield over all lengths. `held` is a
// dragged sensitivity.
export function gutGraphic(state, organ, selected, held = null) {
  const G = GUT, code = GUT_CODE;
  const length = gutLength(state.document);
  const turns = gutTurns(length ?? BODY_UNIT.trait_middle);
  const end = G.from + 110 + (G.to - G.from - 110) * (length ?? BODY_UNIT.trait_middle);
  const along = k => G.from + (end - G.from) * k / G.steps,
        across = k => G.middle + G.amplitude * Math.sin(2 * Math.PI * turns * k / G.steps);
  const points =
      Array.from({length : G.steps + 1}, (_, k) => fixed(along(k)) + ' ' + fixed(across(k)));
  const find = key => organ.centers.find(c => c.key === key);
  const part = (center, body) =>
      center ? '<g class="aid-sac-part' + (selected?.id === center.id ? ' selected' : '') +
                   '" data-select-center="' + escapeText(center.id) + '">' + body + '</g>'
             : '';
  const food = find('food'), fullness = find('fullness'), ache = find('ache');
  // Cell places along one wall: -1 inner (food, then pain), +1 outer (stretch).
  const wall = side => Array.from({length : ATELIER_LIMITS.max_copies}, (_, i) => {
    const k = Math.round((i + .5) / ATELIER_LIMITS.max_copies * G.steps);
    return {x : along(k), y : across(k) + side * (G.tube / 2 + G.cell)};
  });
  // The cells sit as dots along the wall; what they report shows in the pictures below.
  const plain = (center, side, skip = 0) =>
      center ? wall(side)
                   .slice(skip, skip + center.copies)
                   .map(p => '<circle class="aid-gut-cell" cx="' + fixed(p.x) + '" cy="' +
                             fixed(p.y) + '" r="' + G.cell + '"/>')
                   .join('')
             : '';
  return effectorBlock(
      organ, code, 1, label('gut.title'),
      '<path class="aid-gut-tube" d="M' + points.join(' L') + '" stroke-width="' + G.tube + '"/>' +
          part(fullness, '<path class="aid-gut-stretch" d="M' + points.join(' L') + '"><title>' +
                             escapeText(label('gut.stretch')) + '</title></path>' +
                             plain(fullness, 1)) +
          part(food, plain(food, -1)) + part(ache, plain(ache, -1, food?.copies ?? 0)) +
          handle('trait:q1', end, across(G.steps), label('gut.handle'), label('diet.gut.axis')),
      dietCurves(state, organ, 'gut') + gutSensePictures(state, organ, held));
}
// What a trait of the mouth or gut does over its whole range, as curves: the gut's length against
// how much of plants and meat it gets out, the teeth's form against what a bite cuts or grinds, the
// jaw's length against how wide it opens and how hard it bites. A share runs from 0 to 100 %, a
// factor from 0 to a little above its largest value with ×1 marked. The organ's own value is the
// line with a dot and its value on each curve; it is dragged there as well.
const DIET_CURVES = Object.freeze({
  gut : {
    code : GUT_CODE,
    curves : [ [ 'plant', FOOD_SLOT.plant ], [ 'meat', FOOD_SLOT.fish ] ],
    at : state => gutLength(state.document)
  },
  teeth : {
    code : MOTOR_KIND.aggression,
    curves : [ [ 'grind', FOOD_SLOT.plant ], [ 'cut', FOOD_SLOT.fish ] ],
    at : state => muscleTrait(state.document, MOTOR_KIND.aggression, 'blunt_teeth', state.sites)
  },
  jaw : {
    code : MOTOR_KIND.aggression,
    factor : true,
    curves : [ [ 'aperture', null ], [ 'lever', null ] ],
    at : state => muscleTrait(state.document, MOTOR_KIND.aggression, 'jaw_length', state.sites)
  }
});
// Colours of a factor's two curves, which have no food of their own.
const FACTOR_COLOURS = Object.freeze([ '#8fc7e8', '#e6a385' ]);
function dietCurves(state, organ, kind) {
  const spec = DIET_CURVES[kind], data = state.capabilities?.diet?.[kind], C = USE_CHART;
  const at = spec.at(state);
  if (!data)
    return '';
  const most = spec.factor ? C.room * Math.max(...spec.curves.flatMap(([ key ]) => data[key])) : 1;
  const x = share => C.left + (C.right - C.left) * share,
        y = value => C.base - (C.base - C.top) * clamp(value / most);
  const valueAt = values => {
    const pos = clamp(at) * (values.length - 1), k = Math.floor(pos);
    return values[k] + (values[Math.min(values.length - 1, k + 1)] - values[k]) * (pos - k);
  };
  const shown = v => spec.factor ? t('units.times', {n : formatNumber(v, 1)}) : percent(v);
  const words = key => label('diet.' + kind + '.' + key);
  const text = (cls, px, py, content, anchor = 'start', colour = '') =>
      '<text class="' + cls + '" x="' + fixed(px) + '" y="' + fixed(py) + '" text-anchor="' +
      anchor + '"' + (colour ? ' style="fill:' + colour + '"' : '') + '>' + escapeText(content) +
      '</text>';
  const colourOf = (slot, k) => slot === null ? FACTOR_COLOURS[k] : FOOD_COLORS[slot];
  const curves =
      spec.curves
          .map(([ key, slot ], k) => {
            const values = data[key], colour = colourOf(slot, k), end = values.at(-1);
            const d =
                'M' + values.map((v, i) => fixed(x(i / (values.length - 1))) + ' ' + fixed(y(v)))
                          .join(' L');
            return '<path class="aid-use-curve" d="' + d + '" stroke="' + colour + '"/>' +
                   (slot === null ? ''
                                  : '<g transform="translate(' + fixed(C.right + C.gap) + ' ' +
                                        fixed(y(end)) + ')">' +
                                        ecologyIconSvg(slot, colour, C.icon) + '</g>') +
                   '';
          })
          .join('');
  // The key below the axis names each curve by its line.
  const key = spec.curves
                  .map(([ name, slot ], k) => {
                    const from = C.left + k * C.second * (C.right - C.left);
                    return '<path class="aid-use-curve" d="M' + fixed(from) + ' ' + C.legend +
                           ' h' + C.sample + '" stroke="' + colourOf(slot, k) + '"/>' +
                           text('aid-use-food', from + C.sample + C.tick, C.legend + C.tick / 2,
                                words(name));
                  })
                  .join('');
  // The organ's own value: a line across the plot, a dot and the value on each curve; the higher
  // value is written above its dot, the lower one below, so the two never cover each other.
  const values = at === null ? []
                             : spec.curves
                                   .map(([ key, slot ], k) =>
                                            ({colour : colourOf(slot, k), v : valueAt(data[key])}))
                                   .sort((a, b) => b.v - a.v);
  const right = at < .5;
  const mark = at === null
                   ? ''
                   : '<line class="aid-use-marker" x1="' + fixed(x(at)) + '" y1="' + C.top +
                         '" x2="' + fixed(x(at)) + '" y2="' + C.base + '"/>' +
                         values
                             .map(({colour, v}, rank) =>
                                      '<circle class="aid-use-dot" cx="' + fixed(x(at)) + '" cy="' +
                                      fixed(y(v)) + '" r="' + C.dot + '" fill="' + colour + '"/>' +
                                      text('aid-use-share', x(at) + (right ? C.share : -C.share),
                                           rank ? y(v) + C.dot + C.below : y(v) - C.dot, shown(v),
                                           right ? 'start' : 'end', colour))
                             .join('') +
                         '<rect class="aid-diet-hit" data-effector-handle="chart:' + kind +
                         '" x="' + C.left + '" y="' + C.top + '" width="' + (C.right - C.left) +
                         '" height="' + (C.base - C.top) + '"/>' +
                         handle('chart:' + kind, x(at), C.base, words('handle'));
  const one = spec.factor
                  ? '<path class="aid-use-one" d="M' + C.left + ' ' + fixed(y(1)) + ' H' + C.right +
                        '"/>' + text('aid-use-scale', C.left - C.tick, y(1), shown(1), 'end')
                  : '';
  const axes =
      '<path class="aid-use-axis" d="M' + C.left + ' ' + C.top + ' V' + C.base + ' H' + C.right +
      '"/>' +
      (spec.factor ? one
                   : text('aid-use-scale', C.left - C.tick, C.top + C.tick / 2, percent(1), 'end') +
                         text('aid-use-scale', C.left - C.tick, C.base, percent(0), 'end')) +
      text('aid-use-scale', C.left, C.base + C.axis, words('low')) +
      text('aid-use-scale', C.right, C.base + C.axis, words('high'), 'end') +
      text('aid-use-title', (C.left + C.right) / 2, C.base + C.axis, words('axis'), 'middle') +
      '<text class="aid-use-title" transform="translate(' + C.title + ' ' +
      fixed((C.top + C.base) / 2) + ') rotate(-90)" text-anchor="middle">' +
      escapeText(words('title')) + '</text>';
  return '<svg class="aid-effector-graphic aid-use-chart" viewBox="0 0 ' + C.width + ' ' +
         C.height + '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
         spec.code + '" data-effector-side="' + sideOf(organ) + '" role="img" aria-label="' +
         escapeText(words('title')) + '">' + axes + curves + key + mark + '</svg>';
}

const effectorBlock = (organ, code, side, title, graphic, below, attributes = '') =>
    '<div class="aid-effector-block" data-effector-block="' + escapeText(organ.id) + '">' +
    '<svg class="aid-effector-graphic" viewBox="0 0 ' + FRAME.width + ' ' + FRAME.height +
    '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' + code +
    '" data-effector-side="' + side + '"' + attributes + ' role="img" aria-label="' +
    escapeText(title) + '">' + graphic + '</svg>' + below + '</div>';

const GILL = Object.freeze({
  x : 176,
  top : 18,
  bottom : 118,
  bow : 44,
  rakers : [ 4, 24 ],
  raker : 24,
  flows : [ 46, 68, 92 ],
  flow : [ 22, 270 ],
  water : 6,
  head : 6,
  specks : 9,
  speck : 2.2,
  steps : 24,
  rows : 3,
  caught : .4,
  // A mouthful of ground: its flocks come in low, those the rakers sift stay in front of the arch,
  // the rest falls out behind it.
  ground : {y : 110, grains : 6, grain : 2.6, gap : 7, past : [ 206, 121 ], fall : 3},
  // What the rakers hold, sift and let through, one line each.
  words : [ 138, 151, 164 ]
});
function gillArch(t) {
  const G = GILL, middle = (G.top + G.bottom) / 2, u = 1 - t;
  return {
    x : u * u * G.x + 2 * u * t * (G.x - G.bow) + t * t * G.x,
    y : u * u * G.top + 2 * u * t * middle + t * t * G.bottom
  };
}
export function gillGraphic(state, organ) {
  const G = GILL, density = gillRakers(organ) ?? BODY_UNIT.trait_middle;
  const passage = rakerPassage(density), kept = rakerRetention(density);
  const sifted = rakerSifting(density);
  const count = Math.round(G.rakers[0] + (G.rakers[1] - G.rakers[0]) * density);
  const arch = 'M' + Array
                         .from({length : G.steps + 1},
                               (_, k) => {
                                 const p = gillArch(k / G.steps);
                                 return fixed(p.x) + ' ' + fixed(p.y);
                               })
                         .join(' L');
  const rakers = Array
                     .from({length : count},
                           (_, i) => {
                             const p = gillArch((i + .5) / count);
                             return 'M' + fixed(p.x) + ' ' + fixed(p.y) + ' h' + -G.raker;
                           })
                     .join(' ');
  const water =
      G.flows
          .map(y => '<path class="aid-gill-water" d="M' + G.flow[0] + ' ' + y + ' H' + G.flow[1] +
                    ' m' + -G.head + ' ' + -G.head + ' l' + G.head + ' ' + G.head + ' l' + -G.head +
                    ' ' + G.head + '" stroke-width="' + fixed(G.water * passage) + '"/>')
          .join('');
  // Plankton: specks held on the rakers, the rest drifts on behind the arch.
  const held = Math.round(G.specks * kept);
  const specks = Array
                     .from({length : G.specks},
                           (_, i) => {
                             const y = G.flows[i % G.flows.length] + (i % 2 ? 1 : -1) * G.head;
                             const row = i % G.rows;
                             const x = i < held ? G.x - G.bow * G.caught - G.raker * row / G.rows
                                                : G.flow[1] - G.raker * row - G.head;
                             return '<circle class="aid-gill-speck' + (i < held ? ' held' : '') +
                                    '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' + G.speck +
                                    '"/>';
                           })
                     .join('');
  const D = G.ground, sits = Math.round(D.grains * sifted);
  const front = gillArch((D.y - G.top) / (G.bottom - G.top)).x - G.raker;
  const ground =
      Array
          .from({length : D.grains},
                (_, i) => {
                  const x = i < sits ? front - D.gap * i : D.past[0] + D.gap * (i - sits);
                  const y =
                      i < sits ? D.y + (i % 2 ? 1 : -1) * D.grain : D.past[1] + D.fall * (i - sits);
                  return '<circle class="aid-gill-grain' + (i < sits ? ' held' : '') + '" cx="' +
                         fixed(x) + '" cy="' + fixed(y) + '" r="' + D.grain + '"/>';
                })
          .join('');
  const graphic =
      '<title>' +
      escapeText(
          label('gills.hint',
                {water : percent(passage), kept : percent(kept), ground : percent(sifted)})) +
      '</title>' + water + '<path class="aid-gill-arch" d="' + arch +
      '"/><path class="aid-gill-rakers" d="' + rakers + '"/>' + specks + ground +
      // What the rakers do, where it shows: the water passing (the arrows' width), the plankton
      // held (the specks on the arch) and the ground sifted (the grains in front of it).
      '<text class="aid-handle-word" x="' + G.flow[0] + '" y="' + G.words[0] + '">' +
      escapeText(label('gills.kept', {share : percent(kept)})) + '</text>' +
      '<text class="aid-handle-word" x="' + G.flow[1] + '" y="' + G.words[1] +
      '" text-anchor="end">' + escapeText(label('gills.passage', {share : percent(passage)})) +
      '</text><text class="aid-handle-word" x="' + G.flow[0] + '" y="' + G.words[2] + '">' +
      escapeText(label('gills.ground', {share : percent(sifted)})) + '</text>' +
      handle('trait:q1', gillArch(1 - density).x - G.raker, gillArch(1 - density).y,
             label('gills.handle'), label('gills.word'));
  return effectorBlock(organ, GILL_CODE, 1, label('gills.title'), graphic,
                       musclePicture(state, organ, GILL_CODE, 1));
}
// The gut muscle: one meal through the gut at rest and driven (gut_meal.js), its muscle below.
export function gutMuscleGraphic(state, organ) {
  return effectorBlock(organ, GUT_MUSCLE_CODE, 1, label('gutmuscle.title'), gutMealRows(state),
                       musclePicture(state, organ, GUT_MUSCLE_CODE, 1));
}
export function effectorGraphic(state, organ) {
  const code = organFunction(organ, state.sites);
  const twinOrgan = findOrgan(state.document, organ.pair);
  const twin = twinOrgan?.type === 'muscle' ? twinOrgan.centers : [];
  const draw = {
    [MOTOR_KIND.turn] : sideGraphic,
    [MOTOR_KIND.suction] : suctionGraphic,
    [MOTOR_KIND.aggression] : jawGraphic,
    [MOTOR_KIND.defense] : defenseGraphic
  }[code];
  if (!draw)
    return '';
  const pelvic = isPelvicMuscle(organ),
        hint = textArea('studio').muscle?.hint?.[pelvic ? 'pelvic' : code];
  return effectorBlock(organ, code, sideOf(organ), label('title.' + (pelvic ? 'pelvic' : code)),
                       (hint ? '<title>' + escapeText(hint) + '</title>' : '') +
                           draw(state, organ, organ.centers, twin),
                       (code === MOTOR_KIND.turn ? strokeChooser(state, organ) : '') +
                           (code === MOTOR_KIND.aggression ? dietCurves(state, organ, 'jaw') +
                                                                 dietCurves(state, organ, 'teeth')
                                                           : '') +
                           musclePicture(state, organ, code, sideOf(organ)));
}
