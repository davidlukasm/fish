import {FULL_TURN, hueRGB} from './units.js';
import {hormoneColors} from './hormones.js';
import {
  BARBEL,
  GUT_TISSUE,
  INTERNAL_TISSUE,
  isMotorTissue,
  isSenseTissue,
  MOTOR_TISSUE,
  RESERVE_TISSUE,
  SENSE_TISSUE,
  tissueKind
} from './tissue.js';
import {brainClamp} from './brain.js';
import {
  FEEDING_EFFECT,
  FEEDING_EFFECT_STEPS,
  FIN,
  FISH,
  HORMONES,
  MOTOR_KIND,
  NEURON,
  PRESSURE_SOURCE,
  RECEPTOR,
  SENSE_KIND,
  TOLERANCE,
  VISUAL_SAMPLE
} from './schema.js';
import {
  brainPartPosition,
  brainPigmentRadius,
  brainPigmentStar,
  brainPigmentState,
  fishCNSShape
} from './brain_geometry.js';
import {
  brainOrganRGB,
  brainScentRGB,
  brainScentWeights,
  CELL_AXES,
  lightCellHue,
  MIDLINE_MOTORS,
  tissueColor
} from './brain_model.js';
import {brainGeometry, brainReplayPath} from './brain_occlusion.js';
import {
  brainArrivalValue,
  brainCycleContraction,
  brainDisplayCharge,
  brainEase,
  brainMotorActivity,
  brainMotorColor,
  brainMuscleShape,
  brainMuscleState
} from './brain_signals.js';
import {rgb} from './dom.js';
import {displayStep} from './state.js';
import {fishFinPath} from './fish_fins.js';
import {
  fishBarbel,
  fishBladderShape,
  fishCheekPath,
  fishDefenseSpines,
  fishEggDuctPath,
  fishEye,
  fishGametePath,
  fishGameteShape,
  fishGillFolds,
  fishInjuryPath,
  fishInjuryShape,
  fishLateralPoint,
  fishMouthPath,
  fishNosePath,
  fishNoseShape,
  fishReservePath,
  fishReservePoint,
  fishReserveShape,
  fishSatietyShape,
  fishGutPath,
  fishGutPoint,
  fishGlandPath,
  fishGlandShape,
  fishMouthInterior,
  fishTonguePoint,
  fishSkinPath,
  fishSkinPoint,
  fishSuctionPath,
  fishSuctionShape,
  fishSwimBladderShape,
  fishTonguePath
} from './fish_organs.js';
export const brain_tissueState = {};

// The opened body: a dark interior with a rim in the fish's colour.
const INTERIOR = Object.freeze({
  alpha : .94,
  rim_alpha : .55,
  rim : .18,
  rim_per_color : .45,
  rim_width : .006,
  body : '#132c35'
});
export function brainDrawInterior(g, d) {
  g.save();
  g.translate(d.cx, d.cy);
  g.rotate(d.angle);
  brainReplayPath(g, brainGeometry(d).body);
  g.globalAlpha = INTERIOR.alpha;
  g.fillStyle = INTERIOR.body;
  g.fill();
  g.globalAlpha = INTERIOR.rim_alpha;
  g.strokeStyle =
      rgb(d.p.slice(FISH.red, FISH.blue + 1).map(v => INTERIOR.rim + INTERIOR.rim_per_color * v));
  g.lineWidth = Math.max(1, d.r * INTERIOR.rim_width);
  g.stroke();
  g.restore();
}

// Single cells fade in from FROM of the cell detail over SPAN.
export const CELL_DETAIL = Object.freeze({from : .45, span : .35});
export function brainCellOpacity(d) {
  return brainEase((d.cellDetail - CELL_DETAIL.from) / CELL_DETAIL.span);
}

// Muscle bundles: FINE_BANDS or COARSE_BANDS bands per side, shaded by contraction and signals,
// with three cross stripes.
const MUSCLE = Object.freeze({
  fine_bands : 3,
  coarse_bands : 2,
  negative_min : .03,
  alpha : .65,
  alpha_per_contraction : .12,
  alpha_per_positive : .20,
  alpha_per_negative : .12,
  alpha_min : .35,
  alpha_max : .98,
  min_width : .5,
  width : .003,
  stripe_alpha : .20,
  stripe_per_charge : .35,
  stripe_per_contraction : .30,
  stripe_per_signal : .35,
  stripe_min_width : .6,
  stripe_at : .45,
  stripe_width : .55,
  strained : '#eb8a88',
  calm : '#b9d5ce',
  inhibited : '#ef8a89',
  excited : '#d5eee0'
});
export function brainDrawMuscles(g, d, now, only = null) {
  const mix = brainCellOpacity(d);
  for (const pass of [{detail : false, alpha : 1 - mix}, {detail : true, alpha : mix}]) {
    if (pass.alpha <= 0)
      continue;
    for (const tissue of only ? [ only ] : d.tissues.values()) {
      if (!isMotorTissue(tissue.key) || tissueKind(tissue.key) >= MOTOR_KIND.pigment)
        continue;
      const k = tissueKind(tissue.key), bins = new Map(),
            bands = pass.detail ? MUSCLE.fine_bands : MUSCLE.coarse_bands;
      for (const {n, part} of tissue.members) {
        const depth = brainClamp((n[NEURON.y] + 1) / 2),
              across = MIDLINE_MOTORS.includes(k) ? n[NEURON.x] : n[NEURON.z],
              bin = pass.detail
                        ? n[NEURON.index]
                        : Math.min(bands - 1, Math.floor(depth * bands)) +
                              bands * Math.min(1, Math.floor(brainClamp((across + 1) / 2) * 2)),
              weight = part.share * n[NEURON.strength], s = brainMuscleState(n, k, d, now);
        let cell = bins.get(bin);
        if (!cell) {
          cell = {
            n,
            part,
            coordinates : CELL_AXES.map(() => 0),
            weight : 0,
            x : 0,
            y : 0,
            activation : 0,
            positive : 0,
            negative : 0,
            contraction : 0,
            charge : 0,
            flash : 0,
            elapsed : Infinity,
            arrivalAge : Infinity
          };
          bins.set(bin, cell);
        }
        if (s.flash > cell.flash) {
          cell.elapsed = s.elapsed;
          cell.n = n;
          cell.part = part;
        }
        cell.flash = Math.max(cell.flash, s.flash);
        cell.weight += weight;
        cell.x += part.p[0] * weight;
        cell.y += part.p[1] * weight;
        for (let axis = 0; axis < CELL_AXES.length; axis++)
          cell.coordinates[axis] += n[CELL_AXES[axis]] * weight;
        for (const key of ['activation', 'contraction', 'charge'])
          cell[key] += s[key] * weight;
        cell.arrivalAge = Math.min(cell.arrivalAge, s.arrivalAge);
        cell.positive = Math.max(cell.positive, s.positive);
        cell.negative = Math.max(cell.negative, s.negative);
      }
      g.save();
      brainTissuePath(g, d, tissue.key, tissue.side, tissue.variant);
      g.clip();

      for (const cell of bins.values()) {
        if (cell.weight <= 0)
          continue;
        const state = {};
        for (const key of ['activation', 'contraction', 'charge'])
          state[key] = cell[key] / cell.weight;
        state.flash = cell.flash;
        state.elapsed = cell.elapsed;
        state.arrivalAge = cell.arrivalAge;
        state.positive = cell.positive;
        state.negative = cell.negative;
        const representative = cell.n.slice();
        for (let axis = 0; axis < CELL_AXES.length; axis++)
          representative[CELL_AXES[axis]] = cell.coordinates[axis] / cell.weight;
        const center = brainPartPosition(representative, tissue.key, d),
              q = brainMuscleShape(representative, k, d, state, center), r = d.r,
              x0 = (q.x - q.dx * q.half) * r, y0 = (q.y - q.dy * q.half) * r,
              x1 = (q.x + q.dx * q.half) * r, y1 = (q.y + q.dy * q.half) * r,
              wx = q.nx * q.width * r, wy = q.ny * q.width * r;
        g.fillStyle = brainMotorColor(k, state);
        g.strokeStyle = state.negative > MUSCLE.negative_min ? MUSCLE.strained : MUSCLE.calm;
        g.globalAlpha = pass.alpha *
                        brainClamp(MUSCLE.alpha + MUSCLE.alpha_per_contraction * state.contraction +
                                       MUSCLE.alpha_per_positive * state.positive -
                                       MUSCLE.alpha_per_negative * state.negative,
                                   MUSCLE.alpha_min, MUSCLE.alpha_max);
        g.lineWidth = Math.max(MUSCLE.min_width, r * MUSCLE.width);
        g.beginPath();
        g.moveTo(x0, y0);
        g.bezierCurveTo(x0 + wx, y0 + wy, x1 + wx, y1 + wy, x1, y1);
        g.bezierCurveTo(x1 - wx, y1 - wy, x0 - wx, y0 - wy, x0, y0);
        g.fill();
        g.stroke();
        g.strokeStyle = state.negative > state.positive ? MUSCLE.inhibited : MUSCLE.excited;
        g.globalAlpha =
            pass.alpha * (MUSCLE.stripe_alpha + MUSCLE.stripe_per_charge * state.charge +
                          MUSCLE.stripe_per_contraction * state.contraction +
                          MUSCLE.stripe_per_signal * Math.max(state.positive, state.negative));
        g.lineWidth = Math.max(MUSCLE.stripe_min_width, r * MUSCLE.width);
        for (const t of [-MUSCLE.stripe_at, 0, MUSCLE.stripe_at]) {
          const x = (q.x + q.dx * q.half * t) * r, y = (q.y + q.dy * q.half * t) * r;
          g.beginPath();
          g.moveTo(x - wx * MUSCLE.stripe_width, y - wy * MUSCLE.stripe_width);
          g.lineTo(x + wx * MUSCLE.stripe_width, y + wy * MUSCLE.stripe_width);
          g.stroke();
        }
      }
      g.restore();
    }
  }
}

// Light cells take a hue over the full circle from their quality.
function brainTissueColor(key, n) {
  const k = tissueKind(key);
  return isSenseTissue(key)         ? (k === SENSE_KIND.odor    ? brainScentRGB(brainScentWeights(n))
                                       : k === SENSE_KIND.light ? hueRGB(lightCellHue(n))
                                                                : null)
         : k === MOTOR_KIND.pigment ? brainOrganRGB(n)
                                    : null;
}

// Tissue outlines: the brain and cord, barbels and lateral lines in STEPS points, the filled swim
// bladder, blood sensors beside the brain and inner pressure pores.
const TISSUE_PATH = Object.freeze({
  neck_reach : .01,
  handle : .55,
  crown : .65,
  tail_round : .04,
  barbel_steps : 24,
  lateral_steps : 20,
  swim_fill : .55,
  swim_fill_per_bladder : .45,
  bladder_tilt : .15,
  blood_offset : .35,
  blood_length : .6,
  blood_height : .3,
  pore : .014,
  pore_min : .8
});
export function brainTissuePath(g, d, key, side, variant = '') {
  const a = d.a, r = d.r;
  g.beginPath();
  if (key === INTERNAL_TISSUE) {
    const q = fishCNSShape(a);
    g.moveTo(q.tail * r, -q.cord * r);
    g.lineTo(q.neck * r, -q.cord * r);
    g.bezierCurveTo((q.neck + TISSUE_PATH.neck_reach) * r, -q.ry * TISSUE_PATH.handle * r,
                    (q.cx - q.rx) * r, -q.ry * r, q.cx * r, -q.ry * r);
    g.bezierCurveTo((q.cx + q.rx * TISSUE_PATH.crown) * r, -q.ry * r, (q.cx + q.rx) * r,
                    -q.ry * TISSUE_PATH.handle * r, (q.cx + q.rx) * r, 0);
    g.bezierCurveTo((q.cx + q.rx) * r, q.ry * TISSUE_PATH.handle * r,
                    (q.cx + q.rx * TISSUE_PATH.crown) * r, q.ry * r, q.cx * r, q.ry * r);
    g.bezierCurveTo((q.cx - q.rx) * r, q.ry * r, (q.neck + TISSUE_PATH.neck_reach) * r,
                    q.ry * TISSUE_PATH.handle * r, q.neck * r, q.cord * r);
    g.lineTo(q.tail * r, q.cord * r);
    g.quadraticCurveTo((q.tail - TISSUE_PATH.tail_round) * r, 0, q.tail * r, -q.cord * r);
    g.closePath();
  } else if ((key === SENSE_TISSUE.light || key === SENSE_TISSUE.proximity)) {
    const eye = fishEye(a, side);
    g.ellipse(eye.x * r, eye.y * r, eye.rx * r, eye.ry * r, 0, 0, Math.PI * 2);
  } else if (key === SENSE_TISSUE.odor && variant !== BARBEL)
    fishNosePath(g, r, a, side);
  else if (key === SENSE_TISSUE.odor) {
    for (let i = 0; i <= TISSUE_PATH.barbel_steps; i++) {
      const p = fishBarbel(a, side, i / TISSUE_PATH.barbel_steps);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
  } else if (key === SENSE_TISSUE.flow) {
    for (let i = 0; i <= TISSUE_PATH.lateral_steps; i++) {
      const p = fishLateralPoint(a, side, i / TISSUE_PATH.lateral_steps);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
  } else if (key === SENSE_TISSUE.touch)
    fishSkinPath(g, r, a, side);
  else if (key === MOTOR_TISSUE.pigment) {
    for (const group of d.pigments.groups)
      brainPigmentStar(
          g, group.p[0] * r, group.p[1] * r,
          brainPigmentRadius(r, brainPigmentState(group, d).value, d.pigments.groups.length));
  } else if (key === SENSE_TISSUE.damage)
    fishInjuryPath(g, r, a, side);
  else if (key === RESERVE_TISSUE)
    fishReservePath(g, r, a);
  else if (key === SENSE_TISSUE.intake)
    fishTonguePath(g, r, a);
  else if (key === SENSE_TISSUE.bladder_pressure || key === MOTOR_TISSUE.bladder) {
    const q = key === MOTOR_TISSUE.bladder ? fishSwimBladderShape(a) : fishBladderShape(a),
          fill = key === MOTOR_TISSUE.bladder
                     ? TISSUE_PATH.swim_fill +
                           TISSUE_PATH.swim_fill_per_bladder * (d.b.bladder_fill || 0)
                     : 1;
    g.ellipse(q.x * r, q.y * r, q.rx * r * fill, q.ry * r * fill, -TISSUE_PATH.bladder_tilt, 0,
              Math.PI * 2);
  } else if (key === SENSE_TISSUE.blood) {
    const q = fishCNSShape(a);
    g.ellipse(q.cx * r, (side ? 1 : -1) * TISSUE_PATH.blood_offset * q.ry * r,
              TISSUE_PATH.blood_length * q.rx * r, TISSUE_PATH.blood_height * q.ry * r, 0, 0,
              Math.PI * 2);
  } else if (key === MOTOR_TISSUE.gland) {
    fishGlandPath(g, r, a);
  } else if (key === SENSE_TISSUE.gonad_pressure) {
    fishGametePath(g, r, a, side === PRESSURE_SOURCE.sperm ? MOTOR_KIND.sperm : MOTOR_KIND.eggs);
  } else if (key === GUT_TISSUE) {
    fishGutPath(g, r, a);
  } else if (key === SENSE_TISSUE.inner_pressure) {
    for (const t of d.tissues.values())
      if (t.key === SENSE_TISSUE.inner_pressure)
        for (const {part} of t.members) {
          g.moveTo((part.p[0] + TISSUE_PATH.pore) * r, part.p[1] * r);
          g.arc(part.p[0] * r, part.p[1] * r, Math.max(TISSUE_PATH.pore_min, TISSUE_PATH.pore * r),
                0, 2 * Math.PI);
        }
  } else if (key === MOTOR_TISSUE.forward || key === MOTOR_TISSUE.turn)
    fishFinPath(g, r, a, key === MOTOR_TISSUE.forward ? FIN.tail : FIN.left + side);
  else if (key === MOTOR_TISSUE.suction) {
    fishSuctionPath(g, r, a, true);
    fishMouthPath(g, r, a, true);
  } else if (key === MOTOR_TISSUE.eggs) {
    if (!a.birthing)
      fishGametePath(g, r, a, MOTOR_KIND.eggs);
    fishEggDuctPath(g, r, a, !a.birthing);
  } else if (key === MOTOR_TISSUE.sperm)
    fishGametePath(g, r, a, MOTOR_KIND.sperm);
  else if (key === MOTOR_TISSUE.aggression) {
    fishCheekPath(g, r, a, 0, true);
    fishCheekPath(g, r, a, 1, true);
  } else if (key === MOTOR_TISSUE.defense) {
    for (const piece of fishDefenseSpines(a, side)) {
      piece.forEach((p, i) => i ? g.lineTo(p[0] * r, p[1] * r) : g.moveTo(p[0] * r, p[1] * r));
      g.closePath();
    }
  }
}

// Flow lines through the pump, brighter while it pumps.
const SUCTION_LINES = Object.freeze({
  alpha : .34,
  alpha_per_pump : .4,
  min_width : .6,
  width : .004,
  front_inset : .012,
  front_spread : .15,
  front_handle : .07,
  handle_spread : .25,
  back_handle : .09,
  lines : '#c4e9eb'
});
function brainSuctionLines(g, d) {
  const r = d.r, a = d.a;
  const q = fishSuctionShape(a);
  g.save();
  fishSuctionPath(g, r, a);
  g.clip();
  g.strokeStyle = SUCTION_LINES.lines;
  g.globalAlpha = SUCTION_LINES.alpha + SUCTION_LINES.alpha_per_pump * (a.swallowPose || 0);
  g.lineWidth = Math.max(SUCTION_LINES.min_width, r * SUCTION_LINES.width);
  for (const sign of [-1, 1]) {
    g.beginPath();
    g.moveTo((q.front - SUCTION_LINES.front_inset) * r,
             sign * q.ry * SUCTION_LINES.front_spread * r);
    g.bezierCurveTo((q.front - SUCTION_LINES.front_handle) * r,
                    sign * q.ry * SUCTION_LINES.handle_spread * r,
                    (q.back + SUCTION_LINES.back_handle) * r,
                    sign * q.ry * SUCTION_LINES.handle_spread * r, q.back * r, 0);
    g.stroke();
  }
  g.restore();
}

// The gut wall and its content: PELLETS pellets move through it once every CYCLE_STEPS steps
// while it digests.
const GUT_CONTENT = Object.freeze({
  alpha : .82,
  min_width : .6,
  width : .004,
  cycle_steps : 144,
  content_min_width : .5,
  content_width : 1.25,
  content_alpha : .25,
  content_alpha_per_fill : .7,
  min_fill : .01,
  pellets : 10,
  pellet_steps : 4,
  pellet_length : .014,
  wall : '#8f7358',
  rim : '#d8b78a',
  content : '#c8a061'
});
function brainGutContent(g, d) {
  const r = d.r, a = d.a;
  g.save();
  fishGutPath(g, r, a);
  g.fillStyle = GUT_CONTENT.wall;
  g.globalAlpha = GUT_CONTENT.alpha;
  g.fill();
  g.strokeStyle = GUT_CONTENT.rim;
  g.lineWidth = Math.max(GUT_CONTENT.min_width, r * GUT_CONTENT.width);
  g.stroke();
  g.clip();
  const moving = (d.b.digestion || 0) > 0,
        phase = moving ? (displayStep() / GUT_CONTENT.cycle_steps) % 1 : 0,
        fill = Math.min(1, a.gutFilling || 0), tube = fishSatietyShape(a).tube;
  g.strokeStyle = GUT_CONTENT.content;
  g.lineWidth = Math.max(GUT_CONTENT.content_min_width, r * tube * GUT_CONTENT.content_width);
  g.globalAlpha = GUT_CONTENT.content_alpha + GUT_CONTENT.content_alpha_per_fill * fill;
  if (fill > GUT_CONTENT.min_fill)
    for (let j = 0; j < GUT_CONTENT.pellets; ++j) {
      g.beginPath();
      for (let k = 0; k <= GUT_CONTENT.pellet_steps; ++k) {
        const t = ((j + phase) / GUT_CONTENT.pellets + k * GUT_CONTENT.pellet_length * fill) % 1,
              p = fishGutPoint(a, t);
        if (k)
          g.lineTo(p[0] * r, p[1] * r);
        else
          g.moveTo(p[0] * r, p[1] * r);
      }
      g.stroke();
    }
  g.restore();
}

// Each gland half shows two hormone lobes and DUCTS ducts.
const GLAND_HORMONES = Object.freeze({
  alpha : .3,
  alpha_per_level : .65,
  lobe_width : 1.2,
  min_width : .6,
  width : .003,
  ducts : 4,
  duct_start : .20,
  duct_step : .18,
  duct_reach : .65,
  duct : '#e3c7d1'
});
function brainGlandHormones(g, d) {
  const r = d.r, a = d.a;
  const q = fishGlandShape(a), levels = d.b.hormones?.levels || Array(HORMONES.levels).fill(0);
  g.save();
  fishGlandPath(g, r, a);
  g.clip();
  for (let side = 0; side < 2; ++side) {
    for (let row = 0; row < 2; ++row) {
      const k = side + 2 * row;
      g.fillStyle = hormoneColors[k];
      g.globalAlpha =
          GLAND_HORMONES.alpha + GLAND_HORMONES.alpha_per_level * Math.min(1, levels[k] || 0);
      g.fillRect((q.x + (side ? 0 : -GLAND_HORMONES.lobe_width) * q.rx) * r,
                 (q.y + (row ? 0 : -1) * q.ry) * r, q.rx * GLAND_HORMONES.lobe_width * r, q.ry * r);
    }
    g.strokeStyle = GLAND_HORMONES.duct;
    g.lineWidth = Math.max(GLAND_HORMONES.min_width, r * GLAND_HORMONES.width);
    for (let i = 0; i < GLAND_HORMONES.ducts; ++i) {
      const x =
          q.x + (side ? 1 : -1) * q.rx * (GLAND_HORMONES.duct_start + GLAND_HORMONES.duct_step * i);
      g.beginPath();
      g.moveTo(q.x * r, q.y * r);
      g.lineTo(x * r, (q.y + (i % 2 ? 1 : -1) * GLAND_HORMONES.duct_reach * q.ry) * r);
      g.stroke();
    }
  }
  g.restore();
}

// Cheek folds glow with aggression.
const CHEEK_FOLDS = Object.freeze(
    {alpha : .4, alpha_per_aggression : .45, min_width : .65, width : .006, folds : '#dca693'});
function brainCheekFolds(g, d, tissue) {
  const r = d.r, a = d.a;
  const {side} = tissue;
  g.save();
  fishGillFolds(g, r, a, side);
  g.strokeStyle = CHEEK_FOLDS.folds;
  g.globalAlpha = CHEEK_FOLDS.alpha + CHEEK_FOLDS.alpha_per_aggression * a.aggression;
  g.lineWidth = Math.max(CHEEK_FOLDS.min_width, r * CHEEK_FOLDS.width);
  g.stroke();
  g.restore();
}

// Pigment groups fill with their activation.
const PIGMENT_GROUPS = Object.freeze({alpha : .16, alpha_per_value : .48, width : .65});
function brainPigmentGroups(g, d, now) {
  const r = d.r;
  for (const group of d.pigments.groups) {
    const state = brainPigmentState(group, d, now);
    g.fillStyle = rgb(state.color);
    g.globalAlpha = PIGMENT_GROUPS.alpha + PIGMENT_GROUPS.alpha_per_value * state.value;
    g.beginPath();
    brainPigmentStar(g, group.p[0] * r, group.p[1] * r,
                     brainPigmentRadius(r, state.value, d.pigments.groups.length));
    g.fill();
    g.strokeStyle = rgb(state.color);
    g.lineWidth = PIGMENT_GROUPS.width;
    g.stroke();
  }
}

// The brain: shaded tissue with four folds across it.
const CNS_FOLDS = Object.freeze({
  shade_middle : .45,
  alpha : .72,
  min_width : .65,
  width : .004,
  alpha_lines : .32,
  fold_width : .78,
  fold_inset : .04,
  fold_bend : .06,
  fold_bow : .35,
  light : '#8a97b2',
  middle : '#62738f',
  dark : '#37465f',
  folds : '#c1c9db'
});
// Brain folds sit at these shares of its length from the centre.
const CNS_FOLD_PLACES = Object.freeze([ -.52, -.12, .28, .62 ]);
function brainCNSFolds(g, d, tissue) {
  const r = d.r, a = d.a;
  const {key, side} = tissue;
  const q = fishCNSShape(a);
  g.save();
  brainTissuePath(g, d, key, side, tissue.variant);
  g.clip();
  const shade = g.createLinearGradient?.(0, -q.ry * r, 0, q.ry * r);
  if (shade?.addColorStop) {
    shade.addColorStop(0, CNS_FOLDS.light);
    shade.addColorStop(CNS_FOLDS.shade_middle, CNS_FOLDS.middle);
    shade.addColorStop(1, CNS_FOLDS.dark);
    g.fillStyle = shade;
    g.globalAlpha = CNS_FOLDS.alpha;
    g.fill();
  }
  g.strokeStyle = CNS_FOLDS.folds;
  g.lineWidth = Math.max(CNS_FOLDS.min_width, r * CNS_FOLDS.width);
  g.globalAlpha = CNS_FOLDS.alpha_lines;
  g.beginPath();
  for (const t of CNS_FOLD_PLACES) {
    const x = q.cx + q.rx * t, w = q.ry * Math.sqrt(1 - t * t) * CNS_FOLDS.fold_width;
    g.moveTo((x - CNS_FOLDS.fold_inset) * r, -w * r);
    g.bezierCurveTo((x + CNS_FOLDS.fold_bend) * r, -w * CNS_FOLDS.fold_bow * r,
                    (x - CNS_FOLDS.fold_bend) * r, w * CNS_FOLDS.fold_bow * r,
                    (x + CNS_FOLDS.fold_inset) * r, w * r);
  }
  g.stroke();
  g.restore();
}

// The eye with its stalk, pupil and glint; each light cell draws its arc of view in the light it
// receives, on a ring set by its hue.
const RETINA = Object.freeze({
  alpha : .95,
  pupil_shift : .012,
  glint_offset : .23,
  glint_radius : .18,
  ring : .48,
  ring_per_hue : .42,
  min_width : .8,
  width : .10,
  cell_alpha : .15,
  cell_alpha_per_value : .65,
  eye : '#4e5b71',
  pupil : '#0a1a24',
  glint : '#e3ecdc'
});
function brainRetina(g, d, tissue) {
  const r = d.r, a = d.a;
  const {key, side, members} = tissue;
  const eye = fishEye(a, side);
  g.save();
  g.strokeStyle = RETINA.eye;
  g.lineWidth = eye.ry * r;
  g.beginPath();
  g.moveTo(eye.baseX * r, eye.baseY * r);
  g.lineTo(eye.x * r, eye.y * r);
  g.stroke();
  g.fillStyle = RETINA.eye;
  g.globalAlpha = RETINA.alpha;
  g.beginPath();
  g.ellipse(eye.x * r, eye.y * r, eye.rx * r, eye.ry * r, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = RETINA.pupil;
  g.beginPath();
  g.ellipse((eye.x + RETINA.pupil_shift) * r, eye.y * r, eye.rx * r * eye.pupil,
            eye.ry * r * eye.pupil, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = RETINA.glint;
  g.beginPath();
  g.arc((eye.x + eye.r * RETINA.glint_offset) * r, (eye.y - eye.r * RETINA.glint_offset) * r,
        eye.r * r * RETINA.glint_radius, 0, Math.PI * 2);
  g.fill();
  brainTissuePath(g, d, key, side, tissue.variant);
  g.clip();
  for (const {n} of members) {
    const rec = d.receptors.get(n[NEURON.index]);
    if (!rec)
      continue;
    const sample = d.visualSamples?.get(n[NEURON.index]),
          received = sample?.slice(VISUAL_SAMPLE.red, VISUAL_SAMPLE.blue + 1) || [ 0, 0, 0 ],
          peak = Math.max(TOLERANCE.rounding, ...received),
          rho = (RETINA.ring + RETINA.ring_per_hue * rec[RECEPTOR.hue] / FULL_TURN),
          value = sample?.[VISUAL_SAMPLE.response] || 0;
    g.strokeStyle = rgb(received.map(c => c / peak));
    g.lineWidth = Math.max(RETINA.min_width, eye.r * r * RETINA.width);
    g.globalAlpha = (RETINA.cell_alpha + RETINA.cell_alpha_per_value * value) *
                    Math.min(1, 2 / Math.sqrt(members.length));
    g.beginPath();
    g.ellipse(eye.x * r, eye.y * r, rho * eye.rx * r, rho * eye.ry * r, 0,
              Math.PI + rec[RECEPTOR.view_left], Math.PI + rec[RECEPTOR.view_right]);
    g.stroke();
  }
  g.restore();
}

// Fat drops in two rows of ROW, larger and denser as the reserve fills.
const RESERVE_FAT = Object.freeze({
  drops : 12,
  drop_start : .10,
  drop_span : .8,
  row : 6,
  lower_row : .32,
  upper_row : .4,
  drop_size : .01,
  drop_size_per_fill : .025,
  drop_base : .8,
  drop_variation : .2,
  drop_phase : 2.4,
  alpha : .10,
  alpha_per_fill : .6,
  drop_height : .7,
  fat : '#d8bf69'
});
function brainReserveFat(g, d) {
  const r = d.r, a = d.a;
  const q = fishReserveShape(a);
  g.save();
  fishReservePath(g, r, a);
  g.clip();
  for (let i = 0; i < RESERVE_FAT.drops; i++) {
    const [x, y] =
        fishReservePoint(a,
                         RESERVE_FAT.drop_start +
                             RESERVE_FAT.drop_span * (i % RESERVE_FAT.row) / (RESERVE_FAT.row - 1),
                         i < RESERVE_FAT.row ? -RESERVE_FAT.lower_row : RESERVE_FAT.upper_row),
              size = (RESERVE_FAT.drop_size + RESERVE_FAT.drop_size_per_fill * Math.sqrt(q.fill)) *
                     (RESERVE_FAT.drop_base +
                      RESERVE_FAT.drop_variation * Math.sin(i * RESERVE_FAT.drop_phase));
    g.globalAlpha = RESERVE_FAT.alpha + RESERVE_FAT.alpha_per_fill * q.fill;
    g.fillStyle = RESERVE_FAT.fat;
    g.beginPath();
    g.ellipse(x * r, y * r, size * r, size * r * RESERVE_FAT.drop_height, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// Filled gamete organs: yolk with a gloss, or CELLS sperm cells in COLUMNS columns.
const GAMETE_CONTENT = Object.freeze({
  alpha : .12,
  alpha_per_fill : .16,
  yolk_alpha : .55,
  yolk_min_width : .7,
  yolk_width : .005,
  gloss_shift : .08,
  gloss_lift : .18,
  gloss_length : .22,
  gloss_height : .25,
  cells : 12,
  cell_spread : .65,
  cell_span : 1.3,
  columns : 4,
  row_spread : .45,
  row_step : .45,
  cell_size : .006,
  cell_size_per_fill : .006,
  tail_bend : .02,
  tail_drop : .02,
  tail_length : .04,
  tail_end : .008,
  tail_min_width : .5,
  tail_width : .003,
  egg : '#e5bd71',
  sperm : '#a6b9e5',
  gloss : '#f5dd9f',
  tail : '#9eacd5'
});
function brainGameteContent(g, d, tissue) {
  const r = d.r, a = d.a;
  const {key} = tissue;
  const k = tissueKind(tissue.key);
  if (key === MOTOR_TISSUE.eggs && a.birthing)
    return;
  const q = fishGameteShape(a, k);
  if (q.fill > 0) {
    g.save();
    fishGametePath(g, r, a, k);
    g.clip();
    g.globalAlpha = GAMETE_CONTENT.alpha + GAMETE_CONTENT.alpha_per_fill * Math.min(1, q.fill);
    g.fillStyle = key === MOTOR_TISSUE.eggs ? GAMETE_CONTENT.egg : GAMETE_CONTENT.sperm;
    if (k === MOTOR_KIND.eggs) {
      g.beginPath();
      g.ellipse(q.x * r, q.y * r, q.yolk[0] * r, q.yolk[1] * r, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = GAMETE_CONTENT.yolk_alpha;
      g.strokeStyle = GAMETE_CONTENT.gloss;
      g.lineWidth = Math.max(GAMETE_CONTENT.yolk_min_width, r * GAMETE_CONTENT.yolk_width);
      g.beginPath();
      g.ellipse((q.x + GAMETE_CONTENT.gloss_shift * q.fill) * r,
                (q.y - GAMETE_CONTENT.gloss_lift * q.ry) * r,
                q.rx * GAMETE_CONTENT.gloss_length * r, q.ry * GAMETE_CONTENT.gloss_height * r, 0,
                0, Math.PI * 2);
      g.stroke();
    } else
      for (let i = 0; i < GAMETE_CONTENT.cells; i++) {
        const x = q.x + q.rx * (-GAMETE_CONTENT.cell_spread + GAMETE_CONTENT.cell_span *
                                                                  (i % GAMETE_CONTENT.columns) /
                                                                  (GAMETE_CONTENT.columns - 1)),
              y = q.y + q.ry * (-GAMETE_CONTENT.row_spread +
                                GAMETE_CONTENT.row_step * Math.floor(i / GAMETE_CONTENT.columns)),
              size = (GAMETE_CONTENT.cell_size +
                      GAMETE_CONTENT.cell_size_per_fill * Math.min(1, q.fill)) *
                     r;
        g.beginPath();
        g.arc(x * r, y * r, size, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x * r, y * r);
        g.quadraticCurveTo((x - GAMETE_CONTENT.tail_bend) * r, (y + GAMETE_CONTENT.tail_drop) * r,
                           (x - GAMETE_CONTENT.tail_length) * r, (y + GAMETE_CONTENT.tail_end) * r);
        g.strokeStyle = GAMETE_CONTENT.tail;
        g.lineWidth = Math.max(GAMETE_CONTENT.tail_min_width, r * GAMETE_CONTENT.tail_width);
        g.stroke();
      }
    g.restore();
  }
}

// The tongue reddens with nutrient flow; a bolus runs down it for SWALLOW_SHOWN steps after a
// swallow, filtered food loops every FILTER_STEPS steps.
const TONGUE_TISSUE = Object.freeze({
  flow_half : 4,
  red : .58,
  red_per_flow : .25,
  green : .31,
  green_per_flow : .20,
  blue : .38,
  blue_per_flow : .12,
  alpha : .55,
  alpha_per_flow : .20,
  min_width : .6,
  width : .005,
  swallow_steps : 48,
  swallow_shown : 12,
  filter_offset : .73,
  filter_steps : 8,
  max_bolus : .045,
  bolus : .010,
  bolus_per_amount : .025,
  bolus_alpha : .85,
  bolus_min_length : .8,
  filter_length : .65,
  swallow_length : 1.4,
  bolus_min_height : .6,
  bolus_height : .7,
  cell_alpha : .22,
  cell_alpha_per_activity : .65,
  cell_min_radius : .7,
  cell_radius : .004,
  rim : '#daa3ab',
  scrape : '#a69a72',
  filter : '#a6bd8e',
  meat : '#bd8870',
  food : '#d7b67a',
  cell : '#e4d4a0'
});
function brainTongue(g, d, tissue) {
  const r = d.r, a = d.a;
  const {members} = tissue;
  const flow = Math.max(0, d.b.nutrient_flow || 0), v = flow / (flow + TONGUE_TISSUE.flow_half);
  fishTonguePath(g, r, a);
  g.fillStyle = rgb([
    TONGUE_TISSUE.red + TONGUE_TISSUE.red_per_flow * v,
    TONGUE_TISSUE.green + TONGUE_TISSUE.green_per_flow * v,
    TONGUE_TISSUE.blue - TONGUE_TISSUE.blue_per_flow * v
  ]);
  g.globalAlpha = TONGUE_TISSUE.alpha + TONGUE_TISSUE.alpha_per_flow * v;
  g.fill();
  g.strokeStyle = TONGUE_TISSUE.rim;
  g.lineWidth = Math.max(TONGUE_TISSUE.min_width, r * TONGUE_TISSUE.width);
  g.stroke();
  const age = d.p[FISH.feeding_action_age] || 0,
        filtering = [ FEEDING_EFFECT.scrape, FEEDING_EFFECT.filter ].includes(a.feedingAction) &&
                    age > 0 && age <= FEEDING_EFFECT_STEPS.brief && (d.p[FISH.swallowed] || 0) > 0,
        swallowAge = Math.max(0, TONGUE_TISSUE.swallow_steps - age + (displayStep() - d.step));
  if (filtering ||
      [
        FEEDING_EFFECT.swallow, FEEDING_EFFECT.scrape, FEEDING_EFFECT.worm, FEEDING_EFFECT.gulp_fish
      ].includes(a.feedingAction) &&
          age > FEEDING_EFFECT_STEPS.brief && swallowAge < TONGUE_TISSUE.swallow_shown) {
    const progress = filtering
                         ? ((displayStep() + (d.p[FISH.id] || 0) * TONGUE_TISSUE.filter_offset) %
                            TONGUE_TISSUE.filter_steps) /
                               TONGUE_TISSUE.filter_steps
                         : Math.min(1, swallowAge / TONGUE_TISSUE.swallow_shown),
          p = fishTonguePoint(a, progress);
    const swallowed = Math.max(0, d.p[FISH.swallowed] || 0),
          size = r * Math.min(TONGUE_TISSUE.max_bolus,
                              TONGUE_TISSUE.bolus +
                                  TONGUE_TISSUE.bolus_per_amount * Math.sqrt(swallowed));
    g.fillStyle =
        a.feedingAction === FEEDING_EFFECT.scrape   ? TONGUE_TISSUE.scrape
        : a.feedingAction === FEEDING_EFFECT.filter ? TONGUE_TISSUE.filter
        : a.feedingAction === FEEDING_EFFECT.worm || a.feedingAction === FEEDING_EFFECT.gulp_fish
            ? TONGUE_TISSUE.meat
            : TONGUE_TISSUE.food;
    g.globalAlpha = TONGUE_TISSUE.bolus_alpha;
    g.beginPath();
    g.ellipse(
        p[0] * r, p[1] * r,
        Math.max(TONGUE_TISSUE.bolus_min_length,
                 size * (filtering ? TONGUE_TISSUE.filter_length : TONGUE_TISSUE.swallow_length)),
        Math.max(TONGUE_TISSUE.bolus_min_height, size * TONGUE_TISSUE.bolus_height), 0, 0,
        2 * Math.PI);
    g.fill();
  }
  for (const {n, part} of members) {
    const [x, y] = part.p;
    g.fillStyle = TONGUE_TISSUE.cell;
    g.globalAlpha = TONGUE_TISSUE.cell_alpha +
                    TONGUE_TISSUE.cell_alpha_per_activity * Math.abs(n[NEURON.activity]);
    g.beginPath();
    g.arc(x * r, y * r, Math.max(TONGUE_TISSUE.cell_min_radius, r * TONGUE_TISSUE.cell_radius), 0,
          2 * Math.PI);
    g.fill();
  }
}

// The mouth opening.
const MOUTH_TISSUE =
    Object.freeze({min_width : .6, width : .005, inside : '#081b25', rim : '#bd8798'});
function brainMouthTissue(g, d) {
  const r = d.r, a = d.a;
  fishMouthPath(g, r, a);
  g.fillStyle = MOUTH_TISSUE.inside;
  g.strokeStyle = MOUTH_TISSUE.rim;
  g.globalAlpha = 1;
  g.fill();
  g.lineWidth = Math.max(MOUTH_TISSUE.min_width, r * MOUTH_TISSUE.width);
  g.stroke();
  fishMouthInterior(g, r, a);
}

// Sense cells gather in ALONG bins along the organ and, for fins, pigment and touch, ACROSS bins
// across it.
const CELL_BINS = Object.freeze({along : 8, across : 4});
// Sense cells by organ: touch hooks, flow pores with a tail, pigment stars, damage sparks,
// bladder strokes, barbel segments and scent hooks, brighter with activity.
const SENSE_CELLS = Object.freeze({
  alpha : .24,
  alpha_per_value : .64,
  width : .009,
  touch_span : .02,
  touch_min_width : .7,
  touch_width : .004,
  touch_back : .025,
  touch_half : .022,
  touch_front : .034,
  flow_min_width : .8,
  flow_width : .005,
  flow_min_radius : 1.1,
  flow_radius : .012,
  flow_bend : .012,
  flow_bend_out : .02,
  flow_tip : .018,
  flow_tip_out : .025,
  flow_tip_per_value : .03,
  star_size : .013,
  star_size_per_value : .026,
  star_alpha : .30,
  star_alpha_per_value : .45,
  star_alpha_per_signal : .25,
  star_points : 12,
  star_inner : .48,
  star_min_width : .7,
  star_width : .004,
  damage_alpha : .25,
  damage_alpha_per_value : .65,
  damage_min_width : .8,
  damage_width : .004,
  spark_x : .014,
  spark_y : .012,
  spark_x2 : .012,
  damage_min_radius : .8,
  damage_radius : .006,
  damage_radius_per_value : .005,
  bladder_alpha : .18,
  bladder_alpha_per_value : .4,
  bladder_length : .026,
  bladder_height : .010,
  bladder_tilt : .2,
  barbel_first : .03,
  barbel_start : .12,
  barbel_span : .76,
  barbel_half : .035,
  barbel_last : .97,
  nose_bend : .025,
  nose_lift : .22,
  nose_length : .04
});
function brainSenseCells(g, d, tissue, now, color, closed) {
  const r = d.r, a = d.a;
  const {key, side, members} = tissue;
  const k = tissueKind(tissue.key);
  const bins = new Map();
  for (const {n, part} of members) {
    const depth = brainClamp((n[NEURON.y] + 1) / 2),
          across = key === MOTOR_TISSUE.forward ? n[NEURON.x] : n[NEURON.z],
          bin = Math.min(CELL_BINS.along - 1, Math.floor(depth * CELL_BINS.along)) +
                ([
                  MOTOR_TISSUE.forward, MOTOR_TISSUE.turn, MOTOR_TISSUE.pigment, SENSE_TISSUE.touch
                ].includes(key)
                     ? CELL_BINS.along *
                           Math.min(CELL_BINS.across - 1,
                                    Math.floor(brainClamp((across + 1) / 2) * CELL_BINS.across))
                     : 0),
          weight = part.share * (n[NEURON.strength] ?? 1),
          active = n[NEURON.ready] && !n[NEURON.muted]
                       ? (isMotorTissue(key) ? brainMotorActivity(n, k, d)
                                             : Math.abs(n[NEURON.activity]))
                       : 0;
    let cell = bins.get(bin);
    if (!cell) {
      cell = {
        n,
        weight : 0,
        value : 0,
        x : 0,
        y : 0,
        color : [ 0, 0, 0 ],
        colored : false,
        positive : 0,
        negative : 0
      };
      bins.set(bin, cell);
    }
    const incoming = brainArrivalValue(n[NEURON.index], now);
    cell.positive = Math.max(cell.positive, incoming.positive);
    cell.negative = Math.max(cell.negative, incoming.negative);
    cell.weight += weight;
    cell.value += active * weight;
    cell.x += part.p[0] * weight;
    cell.y += part.p[1] * weight;
    const hue = brainTissueColor(key, n);
    if (hue) {
      cell.colored = true;
      for (let c = 0; c < hue.length; c++)
        cell.color[c] += hue[c] * weight;
    }
  }
  g.save();
  if (closed) {
    brainTissuePath(g, d, key, side, tissue.variant);
    g.clip();
  }
  for (const cell of bins.values()) {
    if (cell.weight <= 0)
      continue;
    const value = cell.value / cell.weight, x = cell.x / cell.weight, y = cell.y / cell.weight;
    g.strokeStyle = g.fillStyle = cell.colored ? rgb(cell.color.map(c => c / cell.weight)) : color;
    g.globalAlpha = SENSE_CELLS.alpha + SENSE_CELLS.alpha_per_value * value;
    g.lineWidth = Math.max(1, r * SENSE_CELLS.width);
    if (key === SENSE_TISSUE.touch) {
      const t = brainClamp((cell.n[NEURON.y] + 1) / 2),
            lo = fishSkinPoint(a, side, Math.max(0, t - SENSE_CELLS.touch_span)),
            hi = fishSkinPoint(a, side, Math.min(1, t + SENSE_CELLS.touch_span));
      g.save();
      g.translate(x * r, y * r);
      g.rotate(Math.atan2(hi[1] - lo[1], hi[0] - lo[0]));
      g.lineWidth = Math.max(SENSE_CELLS.touch_min_width, r * SENSE_CELLS.touch_width);
      g.beginPath();
      g.moveTo(-SENSE_CELLS.touch_back * r, -SENSE_CELLS.touch_half * r);
      g.quadraticCurveTo(SENSE_CELLS.touch_front * r, 0, -SENSE_CELLS.touch_back * r,
                         SENSE_CELLS.touch_half * r);
      g.stroke();
      g.restore();
    } else if (key === SENSE_TISSUE.flow) {
      g.lineWidth = Math.max(SENSE_CELLS.flow_min_width, r * SENSE_CELLS.flow_width);
      g.beginPath();
      g.arc(x * r, y * r, Math.max(SENSE_CELLS.flow_min_radius, r * SENSE_CELLS.flow_radius), 0,
            Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x * r, y * r);
      g.quadraticCurveTo((x - SENSE_CELLS.flow_bend * value) * r,
                         (y + (side ? 1 : -1) * SENSE_CELLS.flow_bend_out) * r,
                         (x - SENSE_CELLS.flow_tip * value) * r,
                         (y + (side ? 1 : -1) * (SENSE_CELLS.flow_tip_out +
                                                 SENSE_CELLS.flow_tip_per_value * value)) *
                             r);
      g.stroke();
    } else if (key === MOTOR_TISSUE.pigment) {
      const size = (SENSE_CELLS.star_size + SENSE_CELLS.star_size_per_value * Math.sqrt(value)) * r;
      g.globalAlpha = SENSE_CELLS.star_alpha + SENSE_CELLS.star_alpha_per_value * value +
                      SENSE_CELLS.star_alpha_per_signal * cell.positive;
      g.beginPath();
      for (let i = 0; i < SENSE_CELLS.star_points; i++) {
        const t = i * 2 * Math.PI / SENSE_CELLS.star_points,
              len = size * (i % 2 ? SENSE_CELLS.star_inner : 1);
        if (i)
          g.lineTo(x * r + Math.cos(t) * len, y * r + Math.sin(t) * len);
        else
          g.moveTo(x * r + len, y * r);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = rgb(d.p.slice(FISH.red, FISH.blue + 1));
      g.lineWidth = Math.max(SENSE_CELLS.star_min_width, r * SENSE_CELLS.star_width);
      g.stroke();
    } else if (key === SENSE_TISSUE.damage) {
      const q = fishInjuryShape(a, side);
      g.globalAlpha = SENSE_CELLS.damage_alpha + SENSE_CELLS.damage_alpha_per_value * value;
      g.lineWidth = Math.max(SENSE_CELLS.damage_min_width, r * SENSE_CELLS.damage_width);
      g.beginPath();
      g.moveTo(q.x * r, q.y * r);
      g.quadraticCurveTo((q.x + x) * .5 * r, q.y * r, x * r, y * r);
      g.moveTo(x * r, y * r);
      g.lineTo((x + SENSE_CELLS.spark_x) * r, (y + SENSE_CELLS.spark_y) * r);
      g.moveTo(x * r, y * r);
      g.lineTo((x + SENSE_CELLS.spark_x2) * r, (y - SENSE_CELLS.spark_y) * r);
      g.stroke();
      g.beginPath();
      g.arc(x * r, y * r,
            Math.max(SENSE_CELLS.damage_min_radius,
                     r * (SENSE_CELLS.damage_radius + SENSE_CELLS.damage_radius_per_value * value)),
            0, Math.PI * 2);
      g.fill();
    } else if (key === SENSE_TISSUE.bladder_pressure) {
      g.globalAlpha = SENSE_CELLS.bladder_alpha + SENSE_CELLS.bladder_alpha_per_value * value;
      g.beginPath();
      g.ellipse(x * r, y * r, Math.max(1, r * SENSE_CELLS.bladder_length),
                Math.max(1, r * SENSE_CELLS.bladder_height), -SENSE_CELLS.bladder_tilt, 0,
                Math.PI * 2);
      g.stroke();
    } else if (key === SENSE_TISSUE.odor) {
      g.beginPath();
      if (tissue.variant === BARBEL) {
        const t = brainClamp((cell.n[NEURON.y] + 1) / 2),
              p = fishBarbel(a, side,
                             Math.max(SENSE_CELLS.barbel_first, SENSE_CELLS.barbel_start +
                                                                    SENSE_CELLS.barbel_span * t -
                                                                    SENSE_CELLS.barbel_half)),
              q = fishBarbel(a, side,
                             Math.min(SENSE_CELLS.barbel_last, SENSE_CELLS.barbel_start +
                                                                   SENSE_CELLS.barbel_span * t +
                                                                   SENSE_CELLS.barbel_half));
        g.moveTo(p[0] * r, p[1] * r);
        g.lineTo(q[0] * r, q[1] * r);
      } else {
        const q = fishNoseShape(a, side);
        g.moveTo(x * r, y * r);
        g.quadraticCurveTo((x - SENSE_CELLS.nose_bend) * r, (y + q.ry * SENSE_CELLS.nose_lift) * r,
                           (x - SENSE_CELLS.nose_length) * r, y * r);
      }
      g.stroke();
    }
  }
  g.restore();
}

// Tissue outlines and fills; damage sensors redden with injury.
const TISSUE = Object.freeze({
  damage_base : .55,
  damage_red : .35,
  damage_fade : .25,
  outline_alpha : .35,
  odor_width : .012,
  flow_width : .008,
  intake_width : .025,
  width : .006,
  egg_back_alpha : .15,
  egg_alpha : .16,
  motor_alpha : .22,
  defense_alpha : .20,
  defense_alpha_per_activity : .30,
  internal_alpha : .47,
  fill_alpha : .48,
  stroke_alpha : .78,
  back : '#162e38'
});
export function brainDrawTissue(g, d, tissue, now) {
  const r = d.r, a = d.a;
  const {key, side, members} = tissue, k = tissueKind(key),
                    motorTone = isMotorTissue(key) && k < MOTOR_KIND.eggs ? {
                      charge : brainDisplayCharge(k, side, now),
                      contraction : brainCycleContraction(k, side, now)
                    }
                                                                          : null,
                    color = key === SENSE_TISSUE.damage ? rgb([
                      TISSUE.damage_base + TISSUE.damage_red * (1 - d.p[FISH.health]),
                      TISSUE.damage_base - TISSUE.damage_fade * (1 - d.p[FISH.health]),
                      TISSUE.damage_base - TISSUE.damage_fade * (1 - d.p[FISH.health])
                    ])
                                                        : tissueColor(key),
                    closed = (key === SENSE_TISSUE.odor && tissue.variant !== BARBEL) || [
                      GUT_TISSUE,
                      RESERVE_TISSUE,
                      INTERNAL_TISSUE,
                      SENSE_TISSUE.light,
                      SENSE_TISSUE.touch,
                      SENSE_TISSUE.proximity,
                      SENSE_TISSUE.intake,
                      SENSE_TISSUE.damage,
                      SENSE_TISSUE.bladder_pressure,
                      MOTOR_TISSUE.forward,
                      MOTOR_TISSUE.turn,
                      MOTOR_TISSUE.suction,
                      MOTOR_TISSUE.eggs,
                      MOTOR_TISSUE.sperm,
                      MOTOR_TISSUE.aggression,
                      MOTOR_TISSUE.defense,
                      MOTOR_TISSUE.pigment,
                      MOTOR_TISSUE.bladder,
                      MOTOR_TISSUE.gland,
                      SENSE_TISSUE.gonad_pressure,
                      SENSE_TISSUE.inner_pressure,
                      SENSE_TISSUE.blood
                    ].includes(key);
  if (key === MOTOR_TISSUE.suction)
    fishSuctionPath(g, r, a);
  else
    brainTissuePath(g, d, key, side, tissue.variant);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.globalAlpha = TISSUE.outline_alpha;
  g.lineWidth = Math.max(1, r * (key === SENSE_TISSUE.odor     ? TISSUE.odor_width
                                 : key === SENSE_TISSUE.flow   ? TISSUE.flow_width
                                 : key === SENSE_TISSUE.intake ? TISSUE.intake_width
                                                               : TISSUE.width));
  if (closed &&
      ![SENSE_TISSUE.light, SENSE_TISSUE.touch, MOTOR_TISSUE.pigment, SENSE_TISSUE.damage].includes(
          key)) {
    g.globalAlpha = key === MOTOR_TISSUE.eggs ? TISSUE.egg_back_alpha : 1;
    g.fillStyle = TISSUE.back;
    g.fill();
    g.fillStyle = color;
    g.globalAlpha = key === MOTOR_TISSUE.eggs ? TISSUE.egg_alpha
                    : motorTone               ? TISSUE.motor_alpha
                    : key === MOTOR_TISSUE.defense
                        ? TISSUE.defense_alpha +
                              TISSUE.defense_alpha_per_activity * Math.sqrt(a.defenseActivity)
                    : key === INTERNAL_TISSUE ? TISSUE.internal_alpha
                                              : TISSUE.fill_alpha;
    g.fill();
    g.globalAlpha = TISSUE.stroke_alpha;
  }
  if (key !== SENSE_TISSUE.touch && key !== MOTOR_TISSUE.pigment)
    g.stroke();
  if (key === MOTOR_TISSUE.suction)
    brainSuctionLines(g, d);
  if (key === GUT_TISSUE)
    brainGutContent(g, d);
  if (key === MOTOR_TISSUE.gland)
    brainGlandHormones(g, d);
  if (key === MOTOR_TISSUE.aggression)
    return brainCheekFolds(g, d, tissue);
  if (key === MOTOR_TISSUE.pigment)
    return brainPigmentGroups(g, d, now);
  if (key === MOTOR_TISSUE.defense)
    return;
  if (key === INTERNAL_TISSUE)
    return brainCNSFolds(g, d, tissue);
  if ((key === SENSE_TISSUE.light || key === SENSE_TISSUE.proximity))
    return brainRetina(g, d, tissue);
  if (key === RESERVE_TISSUE)
    return brainReserveFat(g, d);
  if (key === MOTOR_TISSUE.eggs || key === MOTOR_TISSUE.sperm)
    return brainGameteContent(g, d, tissue);
  if (key === SENSE_TISSUE.intake)
    return brainTongue(g, d, tissue);
  if (key === MOTOR_TISSUE.suction)
    return brainMouthTissue(g, d);
  if (key === MOTOR_TISSUE.forward || key === MOTOR_TISSUE.turn)
    return;
  brainSenseCells(g, d, tissue, now, color, closed);
}
