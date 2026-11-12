import {muscleSpindle, muscleTissuePatch} from './muscle_tissue.js';
import {
  ANATOMY,
  ATELIER_LIMITS,
  BODY_UNIT,
  FIN,
  FIN_STROKE,
  GILL_FILTER,
  MOTOR_KIND,
  SIDE_FIN
} from '../../schema.js';
import {
  finVolumeOf,
  gutTurns,
  jawReach,
  lipWidth,
  tailFinSize,
  toothForm,
  gutPassage,
  gutUse,
} from '../../fish_organs.js';
import {mouthShare, organSize} from '../../fish_forms.js';
import {isPelvicMuscle, nodeLimit, organFunction} from '../model/organs.js';
import {
  antagonistOf,
  centerIndex,
  findOrgan,
  finAngle,
  finStroke,
  gillRakers,
  groupReport,
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
import {
  adaptationMarks,
  cellMarks,
  gateHandle,
  senseSensitivity,
  sensitivityHandle
} from './sense_marks.js';
import {ecologyIconSvg, FOOD_COLORS} from '../../feeding_view.js';
import {FOOD_SLOT} from '../../nutrition_model.js';

const label = (key, values) => t('studio.muscle.' + key, values);
// The gut, the gills and the gut muscle are no muscle organs; their handles carry their own codes.
export const GUT_TRAIT = 'gut_length', GUT_CODE = -1, GILL_TRAIT = 'gill_rakers', GILL_CODE = -2,
             GUT_MUSCLE_CODE = -3, FIN_ANGLE_TRAIT = 'fin_angle';
const FRAME = Object.freeze({width : 300, height : 170, middle : 85});
const HANDLE = Object.freeze({radius : 5.5});
const handle = (name, x, y, title) =>
    '<circle class="aid-graphic-handle aid-muscle-handle ' + name.replaceAll(':', '-') +
    '" data-effector-handle="' + name + '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
    HANDLE.radius + '"><title>' + escapeText(title) + '</title></circle>';
const RAY = Object.freeze({least : 1, span : 3});
const rayWidth = copies => RAY.least + RAY.span * copies / ATELIER_LIMITS.max_copies;
// Where each working organ's muscle lies in its picture (the axis from its anchor to where the
// longest muscle ends, as for the left side) and where its gate runs, from a strong command needed
// to a faint one.
const MUSCLE_PLACE = Object.freeze({
  [MOTOR_KIND.forward] :
      {spindle : {axis : [ 34, 50, 146, 70 ], thin : 5, thick : 13}, gate : [ 40, 163, 140, 163 ]},
  [MOTOR_KIND.turn] :
      {spindle : {axis : [ 38, 36, 116, 68 ], thin : 5, thick : 13}, gate : [ 290, 160, 290, 86 ]},
  [MOTOR_KIND.suction] : {
    spindle : {axis : [ 272, 126, 150, 108 ], thin : 5, thick : 12},
    gate : [ 14, 162, 14, 126 ]
  },
  [MOTOR_KIND.aggression] :
      {spindle : {axis : [ 272, 74, 214, 98 ], thin : 5, thick : 12}, gate : [ 14, 62, 14, 10 ]},
  [MOTOR_KIND.defense] :
      {spindle : {axis : [ 36, 28, 280, 28 ], thin : 5, thick : 11}, gate : [ 290, 164, 290, 98 ]},
  [GILL_CODE] : {
    spindle : {axis : [ 40, 142, 240, 142 ], thin : 5, thick : 11},
    gate : [ 290, 164, 290, 106 ]
  },
  [GUT_MUSCLE_CODE] : {
    spindle : {axis : [ 40, 40, 276, 40 ], thin : 13, thick : 20, rings : true},
    gate : [ 290, 160, 290, 100 ]
  }
});
// The tail's own flank is the upper one on the left, the lower one on the right.
const mirrored = ([ ax, ay, bx, by ], side, code) =>
    code === MOTOR_KIND.forward && side > 0
        ? [ ax, 2 * FRAME.middle - ay, bx, 2 * FRAME.middle - by ]
        : [ ax, ay, bx, by ];
const muscleMarks = (state, organ, code) =>
    MUSCLE_PLACE[code] ? placedMuscle(state, organ, MUSCLE_PLACE[code], code) : '';
function placedMuscle(state, organ, place, code) {
  const center = organ.centers[0];
  const [fx, fy, tx, ty] = place.gate;
  return muscleSpindle(organ, nodeLimit(organ, state.sites),
                       {...place.spindle, axis : mirrored(place.spindle.axis, organ.side, code)}) +
         (center?.role === 'motor'
              ? '<path class="aid-gate-track" d="M' + fx + ' ' + fy + ' L' + tx + ' ' + ty + '"/>' +
                    gateHandle({x : fx, y : fy}, {x : tx, y : ty}, state, center,
                               t('studio.inspector.motorGate'))
              : '');
}
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
  if ([ 'nodes', 'strength', 'sprint', 'fibre' ].includes(name))
    return muscleTissuePatch(name, {x : fx * FRAME.width, y : fy * FRAME.height}, marks, most,
                             organ);
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
  wave : {amplitude : 22, at : 22, stiff : 3, base : .35, steps : 48, length : 105}
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
         handle('trait:q1', at, handleY,
                label('undulation.' + style) + ' · ' + label('undulation.handle'));
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
                    label('angle.handle'));
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
         'Z"/>' + handle('trait:q2', tip, hy - wide, label('jaw.handle')) +
         handle('trait:q1', T.x, top, label('teeth.' + style) + ' · ' + label('teeth.handle'));
}
const TRAIT_HANDLES = Object.freeze({
  [MOTOR_KIND.forward] : {'trait:q1' : {key : 'undulation', at : undulationAt}},
  [MOTOR_KIND.turn] : Object.fromEntries(
      Object.values(FIN_STROKE)
          .map(stroke => ['trait:q1:' + stroke, {key : FIN_ANGLE_TRAIT, at : angleAt(stroke)}])),
  [GUT_CODE] : {
    'trait:q1' : {key : GUT_TRAIT, at : x => (x - GUT.from - 110) / (GUT.to - GUT.from - 110)},
    'trait:q2' :
        {key : GUT_TRAIT, at : x => (x - USE_CHART.left) / (USE_CHART.right - USE_CHART.left)}
  },
  [GILL_CODE] : {
    'trait:q1' : {key : GILL_TRAIT, at : (x, y) => (GILL.bottom - y) / (GILL.bottom - GILL.top)}
  },
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
// The erector muscle stands beside the ring, its gate at the other side.
const SPINE_MUSCLE = Object.freeze(
    {spindle : {axis : [ 26, 132, 26, 22 ], thin : 5, thick : 11}, gate : [ 286, 160, 286, 30 ]});
// The spines in one picture: how far round the fish they guard at rest (solid) and raised
// (dashed), where its nodes sit, the spread handle, the muscle that raises them and its gate.
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
         MOTOR_KIND.defense + '" data-effector-side="' + sideOf(organ) + '"' + gateField(organ) +
         ' role="img" aria-label="' + escapeText(label('spines.title')) + '">' +
         '<circle class="aid-spine-limit" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.outer +
         '"/><circle class="aid-spine-limit" cx="' + R.cx + '" cy="' + R.cy + '" r="' + R.inner +
         '"/>' + sector + '<path class="aid-spine-raised" d="' + around(raised) + '">' +
         title('raised') + '</path><path class="aid-spine-rest" d="' + around(rest) + '">' +
         title('rest') + '</path>' + fish + dots +
         '<circle class="aid-graphic-handle" data-graphic-handle="spread" cx="' + fixed(edge.x) +
         '" cy="' + fixed(edge.y) + '" r="' + HANDLE.radius + '"><title>' +
         escapeText(label('spines.spreadHandle')) + '</title></circle>' +
         placedMuscle(state, organ, SPINE_MUSCLE, MOTOR_KIND.defense) + '</svg></div>';
}
const GUT = Object.freeze({
  from : 24,
  to : 276,
  middle : 85,
  amplitude : 30,
  tube : 14,
  steps : 96,
  cell : 3.2,
  // The chosen sense cells' feelers grow to this length with their sensitivity; the adaptation
  // arc round the first cell.
  feeler : 16,
  clock : 18
});
// What the gut gets out of plants and meat over all its lengths, as two curves: the axes span the
// plot (left, right, top, base), the scale words sit `tick` beside them, the curves end in their
// food's icon; the dots and their shares mark the gut's own length, which is dragged here as well.
const USE_CHART = Object.freeze({
  width : 300,
  height : 132,
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
  below : 9
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
  const food = find('food'), fullness = find('fullness');
  // Cell places along one wall: -1 inner (food), +1 outer (stretch).
  const wall = side => Array.from({length : ATELIER_LIMITS.max_copies}, (_, i) => {
    const k = Math.round((i + .5) / ATELIER_LIMITS.max_copies * G.steps);
    return {x : along(k), y : across(k) + side * (G.tube / 2 + G.cell)};
  });
  const chosen = [ food, fullness ].find(c => c && c.id === selected?.id) ?? food ?? fullness;
  const plain = (center, side) =>
      center && center !== chosen ? wall(side)
                                        .slice(0, center.copies)
                                        .map(p => '<circle class="aid-gut-cell" cx="' + fixed(p.x) +
                                                  '" cy="' + fixed(p.y) + '" r="' + G.cell + '"/>')
                                        .join('')
                                  : '';
  return effectorBlock(
      organ, code, 1, label('gut.title'),
      '<path class="aid-gut-tube" d="M' + points.join(' L') + '" stroke-width="' + G.tube + '"/>' +
          part(fullness, '<path class="aid-gut-stretch" d="M' + points.join(' L') + '"><title>' +
                             escapeText(label('gut.stretch')) + '</title></path>' +
                             plain(fullness, 1)) +
          part(food, plain(food, -1)) +
          (chosen ? gutSenseMarks(state, chosen, wall(chosen === food ? -1 : 1),
                                  chosen === food ? -1 : 1, held)
                  : '') +
          handle('trait:q1', end, across(G.steps), label('gut.handle')),
      gutUseChart(state, organ),
      chosen
          ? ' data-sense-field="' + escapeText(chosen.id) + '" data-sense-redraw="refreshEffectors"'
          : '');
}
function gutSenseMarks(state, center, places, side, held) {
  const G = GUT, first = places[0];
  const sensitive = held ?? senseSensitivity(state, center) ?? 0;
  const feeler = r => ({x : first.x, y : first.y + side * r});
  const answer = groupReport(state.document, state.anatomy, 'senses', center.id);
  const feelers = places.slice(0, center.copies)
                      .map(p => '<path class="aid-gut-feeler" d="M' + fixed(p.x) + ' ' +
                                fixed(p.y) + ' v' + fixed(side * G.feeler * sensitive) + '"/>')
                      .join('');
  return feelers +
         (answer?.adapt?.steps > 0
              ? adaptationMarks(first, G.clock, side < 0 ? -Math.PI / 2 : Math.PI / 2, center)
              : '') +
         cellMarks(places, center) +
         sensitivityHandle(feeler(G.cell), feeler(G.cell + G.feeler), sensitive,
                           label('gut.sensitivityHandle'));
}
function gutUseChart(state, organ) {
  const data = state.capabilities?.diet?.gut, at = gutLength(state.document), C = USE_CHART;
  if (!data)
    return '';
  const x = share => C.left + (C.right - C.left) * share,
        y = value => C.base - (C.base - C.top) * value;
  const valueAt = values => {
    const pos = clamp(at) * (values.length - 1), k = Math.floor(pos);
    return values[k] + (values[Math.min(values.length - 1, k + 1)] - values[k]) * (pos - k);
  };
  const words = key => label('diet.gut.' + key);
  const text = (cls, px, py, content, anchor = 'start', colour = '') =>
      '<text class="' + cls + '" x="' + fixed(px) + '" y="' + fixed(py) + '" text-anchor="' +
      anchor + '"' + (colour ? ' style="fill:' + colour + '"' : '') + '>' + escapeText(content) +
      '</text>';
  const foods = [ [ 'plant', FOOD_SLOT.plant ], [ 'meat', FOOD_SLOT.fish ] ];
  const curves =
      foods
          .map(([ key, slot ]) => {
            const values = data[key], colour = FOOD_COLORS[slot], end = values.at(-1);
            const d =
                'M' +
                values.map((v, k) => fixed(x(k / (values.length - 1))) + ' ' + fixed(y(clamp(v))))
                    .join(' L');
            return '<path class="aid-use-curve" d="' + d + '" stroke="' + colour + '"/>' +
                   '<g transform="translate(' + fixed(C.right + C.gap) + ' ' +
                   fixed(y(clamp(end))) + ')">' + ecologyIconSvg(slot, colour, C.icon) + '</g>' +
                   text('aid-use-food', C.right + C.gap, y(clamp(end)) + C.axis, words(key),
                        'middle');
          })
          .join('');
  // The gut's own length: a line across the plot, a dot and the share on each curve.
  const shares = at === null ? []
                             : foods.map(([ key, slot ]) => ({slot, v : clamp(valueAt(data[key]))}))
                                   .sort((a, b) => b.v - a.v);
  const mark = at === null
                   ? ''
                   : '<line class="aid-use-marker" x1="' + fixed(x(at)) + '" y1="' + C.top +
                         '" x2="' + fixed(x(at)) + '" y2="' + C.base + '"/>' +
                         shares
                             .map(({slot, v}, rank) => {
                               const right = at < .5;
                               // The higher share is written above its dot, the lower one below,
                               // so the two never cover each other where the curves cross.
                               return '<circle class="aid-use-dot" cx="' + fixed(x(at)) + '" cy="' +
                                      fixed(y(v)) + '" r="' + C.dot + '" fill="' +
                                      FOOD_COLORS[slot] + '"/>' +
                                      text('aid-use-share', x(at) + (right ? C.share : -C.share),
                                           rank ? y(v) + C.dot + C.below : y(v) - C.dot, percent(v),
                                           right ? 'start' : 'end', FOOD_COLORS[slot]);
                             })
                             .join('') +
                         '<rect class="aid-diet-hit" data-effector-handle="trait:q2" x="' + C.left +
                         '" y="' + C.top + '" width="' + (C.right - C.left) + '" height="' +
                         (C.base - C.top) + '"/>' +
                         handle('trait:q2', x(at), C.base, words('handle'));
  const axes =
      '<path class="aid-use-axis" d="M' + C.left + ' ' + C.top + ' V' + C.base + ' H' + C.right +
      '"/>' + text('aid-use-scale', C.left - C.tick, C.top + C.tick / 2, percent(1), 'end') +
      text('aid-use-scale', C.left - C.tick, C.base, percent(0), 'end') +
      text('aid-use-scale', C.left, C.base + C.axis, words('low')) +
      text('aid-use-scale', C.right, C.base + C.axis, words('high'), 'end') +
      text('aid-use-title', (C.left + C.right) / 2, C.base + C.axis, words('length'), 'middle') +
      '<text class="aid-use-title" transform="translate(' + C.title + ' ' +
      fixed((C.top + C.base) / 2) + ') rotate(-90)" text-anchor="middle">' +
      escapeText(words('title')) + '</text>';
  return '<svg class="aid-effector-graphic aid-use-chart" viewBox="0 0 ' + C.width + ' ' +
         C.height + '" data-effector-graphic="' + escapeText(organ.id) + '" data-effector-code="' +
         GUT_CODE + '" data-effector-side="1" role="img" aria-label="' +
         escapeText(words('title')) + '">' + axes + curves + mark + '</svg>';
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
  track : [ 40, 260 ],
  track_y : 148
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
  const passage = 1 - GILL_FILTER.raker_drag * density,
        kept = GILL_FILTER.rakerless_retention + (1 - GILL_FILTER.rakerless_retention) * density;
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
  const graphic =
      '<title>' +
      escapeText(label('gills.hint', {water : percent(passage), kept : percent(kept)})) +
      '</title>' + water + '<path class="aid-gill-arch" d="' + arch +
      '"/><path class="aid-gill-rakers" d="' + rakers + '"/>' + specks +
      handle('trait:q1', gillArch(1 - density).x - G.raker, gillArch(1 - density).y,
             label('gills.handle')) +
      muscleMarks(state, organ, GILL_CODE);
  return effectorBlock(organ, GILL_CODE, 1, label('gills.title'), graphic, '', gateField(organ));
}
// The gut wall from the side with one ring of muscle per node, and the same meal twice: at rest
// it stays until it is used up, hurried along more of it passes and leaves half used.
const GUT_MUSCLE = Object.freeze({
  tube : [ 24, 276 ],
  y : 40,
  width : 22,
  lanes : [ 96, 136 ],
  lane : [ 112, 276 ],
  lift : 4,
  meal : 3,
  pellet : 6,
  least : 1.2
});
export function gutMuscleGraphic(state, organ) {
  const G = GUT_MUSCLE;
  const lane = (y, hurried, key) => {
    const used = gutUse(hurried), pellets = Math.round(G.meal * gutPassage(hurried));
    const food =
        Array
            .from({length : pellets},
                  (_, i) => {
                    const share = (i + .5) / pellets,
                          x = G.lane[0] + (G.lane[1] - G.lane[0]) * share;
                    return '<circle class="aid-gut-food" cx="' + fixed(x) + '" cy="' + y + '" r="' +
                           fixed(Math.max(G.least, G.pellet * Math.sqrt(1 - used * share))) + '"/>';
                  })
            .join('');
    return '<g><title>' + escapeText(label('gutmuscle.' + key)) + '</title><path ' +
           'class="aid-gut-lane" d="M' + G.lane[0] + ' ' + y + ' H' + G.lane[1] + '"/>' + food +
           '</g>';
  };
  const graphic =
      '<title>' +
      escapeText(label('gutmuscle.hint',
                       {speed : formatNumber(gutPassage(1)), used : percent(gutUse(1))})) +
      '</title><path class="aid-gut-tube" d="M' + G.tube[0] + ' ' + G.y + ' H' + G.tube[1] +
      '" stroke-width="' + G.width + '"/>' + lane(G.lanes[0], 0, 'rest') +
      lane(G.lanes[1], 1, 'hurried') + muscleMarks(state, organ, GUT_MUSCLE_CODE);
  return effectorBlock(organ, GUT_MUSCLE_CODE, 1, label('gutmuscle.title'), graphic, '',
                       gateField(organ));
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
  const pelvic = isPelvicMuscle(organ),
        hint = textArea('studio').muscle?.hint?.[pelvic ? 'pelvic' : code];
  return effectorBlock(
      organ, code, sideOf(organ), label('title.' + (pelvic ? 'pelvic' : code)),
      (hint ? '<title>' + escapeText(hint) + '</title>' : '') +
          draw(state, organ, organ.centers, twin) + muscleMarks(state, organ, code),
      code === MOTOR_KIND.turn ? strokeChooser(state, organ) : '', gateField(organ));
}
