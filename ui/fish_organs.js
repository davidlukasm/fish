import {FULL_TURN} from './units.js';
import {MOTOR_TISSUE, SENSE_TISSUE, motorTissue} from './tissue.js';
import {
  ANATOMY,
  BARBEL,
  BODY_SHAPE,
  EYE_PLACE,
  FIN,
  FIN_SHAPE,
  DIGESTION,
  MOTOR_KIND,
  ORGAN_FORM,
  REGION_LAYOUT,
  TOLERANCE
} from './schema.js';
import {FIN_STROKE, FINS, finSide, isPelvic} from './fin_stroke.js';
import {fishRearFinShape} from './fish_fins.js';
import {
  fishAlong,
  fishAnatomy,
  fishForm,
  fishOrganSpan,
  formIndex,
  GAMETE_GROWTH,
  organGrowth
} from './fish_forms.js';
import {
  FISH_PLANS,
  fishBezier,
  fishBodyCurves,
  fishCurveReverse,
  fishFlank,
  fishHeadCurve,
  fishHeadCurves,
  fishPlan,
  fishPlanPhase,
  fishRegion,
  TAIL_END
} from './fish_geometry.js';
export const fish_organsState = {};

const TANGENT_MIN = .001;
function rawHeadSense(a, key, side) {
  const f = fishForm(a, key, side);
  if (!f.weight)
    return {x : 0, y : 0, r : 0, rx : 0, ry : 0, pupil : 0};
  const location = a.forms[formIndex(key) + side], rx = a.eyeScale * location[ORGAN_FORM.eye_rx],
        ry = a.eyeScale * location[ORGAN_FORM.eye_ry],
        halfWidth = Math.abs(location[ORGAN_FORM.eye_across]),
        share = halfWidth > TOLERANCE.negligible ? f.x / halfWidth : 0;
  return {
    x : (a.origin?.[0] || 0) + a.eyeScale * location[ORGAN_FORM.eye_along],
    y : ((a.origin?.[1] || 0) + a.eyeScale * location[ORGAN_FORM.eye_across]) *
            Math.max(0, Math.min(EYE_PLACE.outset, a.eyeOffset * share / EYE_PLACE.default_offset)),
    r : Math.max(rx, ry),
    rx,
    ry,
    pupil : location[ORGAN_FORM.pupil]
  };
}
const rawFishEye = (a, side) => rawHeadSense(a, SENSE_TISSUE.light, side);
const PROXIMITY_PITS = Object.freeze({count : 5, span : Math.PI, gap : .4});
export function fishProximityShape(a, side) {
  return rawHeadSense(a, SENSE_TISSUE.proximity, side);
}
export function fishProximityPits(a, side) {
  const organ = fishProximityShape(a, side);
  if (!organ.r)
    return [];
  const eye = fishEye(a, side), P = PROXIMITY_PITS, r = organ.r / Math.sqrt(P.count),
        x = eye.r ? eye.x : organ.x, y = eye.r ? eye.y : organ.y;
  return Array.from({length : P.count}, (_, k) => {
    const angle = Math.PI + P.span * ((k + .5) / P.count - .5);
    return {
      x : x + (eye.rx + r * (1 + P.gap)) * Math.cos(angle),
      y : y + (eye.ry + r * (1 + P.gap)) * Math.sin(angle),
      r
    };
  });
}

const EYE_SOCKET = Object.freeze({along : .55, width : .72});
export function fishEye(a, side) {
  const eye = rawFishEye(a, side), other = rawFishEye(a, 1 - side);
  if (!eye.r)
    return eye;
  const sign = side ? 1 : -1;
  const clearance =
      other.r ? BODY_SHAPE.eye_clearance * (eye.ry + other.ry) + Math.max(eye.r, other.r) : 0;
  eye.y = sign * Math.max(Math.abs(eye.y), clearance / 2);
  const pull = a.eyePull?.[side] ?? 1;
  eye.x = (a.origin?.[0] || 0) + (eye.x - (a.origin?.[0] || 0)) * pull;
  eye.y = (a.origin?.[1] || 0) + (eye.y - (a.origin?.[1] || 0)) * pull;
  const head = fishBezier(fishHeadCurves(a, side)[0], EYE_SOCKET.along);
  eye.baseX = head[0];
  eye.baseY = head[1] * EYE_SOCKET.width;
  return eye;
}

const BARBEL_BEND = Object.freeze({at : .2, per_reach : .45});
// Length and direction are the engine's: the drawn tip is where the barbel tastes.
export function fishBarbelCurve(a, side) {
  const sign = side ? 1 : -1, f = fishForm(a, SENSE_TISSUE.odor, side),
        plan = fishPlan(a, 'barbel', f), root = fishBezier(fishHeadCurves(a, side)[0], plan.root),
        length = BARBEL.length + BARBEL.length_per_size * a.barbelSides[side],
        along = Math.cos(BARBEL.spread), across = Math.sin(BARBEL.spread),
        tip = [ root[0] + length * along, root[1] + sign * length * across ], control = [
          root[0] + length * (BARBEL_BEND.at + BARBEL_BEND.per_reach * along),
          root[1] + sign * length * plan.bend
        ];
  return [ root, control, tip ];
}

const BARBEL_SWAY =
    Object.freeze({drag : .04, sway : .025, sway_per_motion : .055, rate : .73, wave : 2});
export function fishBarbel(a, side, t) {
  const [p, c, q] = fishBarbelCurve(a, side), u = 1 - t;
  return [
    u * u * p[0] + 2 * u * t * c[0] + t * t * q[0] -
        BARBEL_SWAY.drag * t * t * (a.waterMotion || 0),
    u * u * p[1] + 2 * u * t * c[1] + t * t * q[1] +
        (a.staticBarbel
             ? 0
             : t * t * (BARBEL_SWAY.sway + BARBEL_SWAY.sway_per_motion * (a.waterMotion || 0)) *
                   Math.sin((a.animationPhase || 0) * BARBEL_SWAY.rate - t * BARBEL_SWAY.wave +
                            (side ? 1 : -1)))
  ];
}

const NOSE = Object.freeze({
  first : .12,
  last : .88,
  shift : .22,
  center : .5,
  max_length : .28,
  length : .025,
  length_per_size : .065,
  length_base : .7,
  max_height : .30,
  height : .025,
  height_per_size : .04
});
export function fishNoseShape(a, side) {
  const amount = a.noseSides[side], f = fishForm(a, SENSE_TISSUE.odor, side),
        plan = fishPlan(a, 'nose', f),
        p = fishBezier(
            fishHeadCurves(a, side)[0],
            Math.max(NOSE.first,
                     Math.min(NOSE.last, plan.place + NOSE.shift * (f.y - NOSE.center))));
  return {
    x : p[0],
    y : p[1] * plan.across,
    rx : Math.min(a.faceLength * NOSE.max_length, (NOSE.length + NOSE.length_per_size * amount) *
                                                      (NOSE.length_base + f.sy) * plan.length),
    ry : Math.min(a.faceWidth * NOSE.max_height,
                  (NOSE.height + NOSE.height_per_size * amount) * plan.height)
  };
}

const NOSE_POINT = Object.freeze({inner : .25, span : .6});
export function fishNosePoint(a, side, direction, hue) {
  const q = fishNoseShape(a, side), angle = Math.PI + direction,
        band = NOSE_POINT.inner + NOSE_POINT.span * hue / FULL_TURN;
  return [ q.x + q.rx * band * Math.cos(angle), q.y + q.ry * band * Math.sin(angle) ];
}

export function fishNosePath(g, r, a, side) {
  const q = fishNoseShape(a, side);
  g.beginPath();
  g.ellipse(q.x * r, q.y * r, q.rx * r, q.ry * r, 0, 0, Math.PI * 2);
}

const SPERM_ORGAN = Object.freeze({
  elongation : .65,
  elongation_per_depth : .75,
  elongation_per_spread : .65,
  along : .79,
  across : .45,
  max_length : .16,
  length : .06,
  length_per_fill : .06,
  max_height : .18,
  height : .018,
  height_per_fill : .03
});
export function fishGameteShape(a, kind) {
  const fill = kind === MOTOR_KIND.eggs ? a.filled : a.spermFilled,
        f = fishForm(a, motorTissue(kind)), neural = organGrowth(f, GAMETE_GROWTH),
        elongation = SPERM_ORGAN.elongation + SPERM_ORGAN.elongation_per_depth * f.z +
                     SPERM_ORGAN.elongation_per_spread * f.sy;
  if (kind === MOTOR_KIND.eggs)
    return {
      x : a.chestBack - a.hindLength * a.hindPeak,
      y : 0,
      rx : Math.max(a.eggLength, a.eggOrganRadius),
      ry : Math.max(a.eggWidth, a.eggOrganRadius),
      yolk : [ a.eggLength, a.eggWidth ],
      fill
    };
  const p = fishFlank(a, 0, SPERM_ORGAN.along);
  return {
    x : p[0],
    y : p[1] * SPERM_ORGAN.across,
    rx : Math.min(SPERM_ORGAN.max_length * a.hindLength,
                  (SPERM_ORGAN.length * neural + SPERM_ORGAN.length_per_fill * fill) * elongation),
    ry : Math.min(Math.abs(p[1]) * SPERM_ORGAN.max_height,
                  (SPERM_ORGAN.height * neural + SPERM_ORGAN.height_per_fill * fill) /
                      Math.sqrt(elongation)),
    fill
  };
}

const RESERVE = Object.freeze({
  back : .04,
  growth : .22,
  min_length : .045,
  length_per_width : .72,
  length_base : .9,
  length_per_growth : .1,
  width : .035,
  width_per_fill : .065,
  width_base : .8,
  width_per_growth : .2,
  bend : .035,
  bend_per_depth : .08,
  bend_per_spread : .06
});
export function fishReserveShape(a) {
  const f = fishForm(a, SENSE_TISSUE.blood), x = a.chestBack - RESERVE.back,
        neural = organGrowth(f, RESERVE.growth);
  return {
    x,
    y : 0,
    rx : Math.max(RESERVE.min_length, RESERVE.length_per_width * a.joinWidth) *
             (RESERVE.length_base + RESERVE.length_per_growth * neural),
    ry : (RESERVE.width + RESERVE.width_per_fill * Math.sqrt(a.reserve)) *
             (RESERVE.width_base + RESERVE.width_per_growth * neural),
    bend : RESERVE.bend + RESERVE.bend_per_depth * f.z + RESERVE.bend_per_spread * f.sy,
    fill : a.reserve
  };
}

export function fishReservePoint(a, t, across = 0) {
  const q = fishReserveShape(a), u = 2 * t - 1;
  return [
    q.x + q.bend * (1 - u * u) + q.ry * across * Math.sqrt(Math.max(0, 1 - u * u)), q.y + q.rx * u
  ];
}

const SWIM_BLADDER =
    Object.freeze({shift : .08, length : 1.25, length_per_spread : .20, height : 1.4});
export function fishSwimBladderShape(a) {
  const q = fishBladderShape(a), f = fishForm(a, MOTOR_TISSUE.bladder);
  return {
    x : q.x + SWIM_BLADDER.shift * a.chestLength,
    y : -q.y,
    rx : q.rx * (SWIM_BLADDER.length + SWIM_BLADDER.length_per_spread * f.sy),
    ry : q.ry * SWIM_BLADDER.height
  };
}

const GUT = Object.freeze({
  front : .025,
  back : .07,
  min_half : .03,
  min_breadth : .035,
  breadth : .72,
  turns : .5,
  turns_per_length : 2.5,
  tube : .024,
  tube_per_fill : .032,
  loop_tubes : 5,
  lift : .3,
  height : .48
});
// The gut as the engine has it (digest_nutrition). Its muscle, at a steady drive share `driven`,
// moves the content on this many times as fast as at rest; `speed` is what the muscle reaches at
// full drive, from its size.
export const gutPassage = (driven, speed) => 1 + (speed - 1) * driven;
// Two rates closer than this count as one, where the general solution would divide by nothing.
const GUT_RATES_APART = 1e-9;
// A meal of which the share `flesh` is flesh and the rest plant matter, followed for `steps`
// through a gut that holds its content `stay` steps: the shares still usable in the gut and taken
// up so far (physiology.hh, gut_yield). The meal's closed part is broken open the sooner the more
// flesh it is, its open part is taken up or spoils, the sooner the more flesh it is, and the gut
// moves both on; a full fish takes up nothing.
export function gutMeal(flesh, stay, steps, full = false) {
  const D = DIGESTION, passage = 1 / stay,
        progress = (span, needed) => (span / needed) ** D.sharpness;
  const opening = flesh < 1 ? Math.min(1, progress(stay, D.open_steps * (1 - flesh)) / stay) : 1,
        spoiling =
            flesh > 0 ? Math.min(1, progress(stay * flesh, D.spoil_steps) / D.uptake_steps) : 0,
        uptake = full ? 0 : 1 / D.uptake_steps;
  // Closed matter leaves at `a`, open matter at `b`; the open share rises from the closed one.
  const a = opening + passage, b = uptake + spoiling + passage;
  const closed = Math.exp(-a * steps), gone = Math.exp(-b * steps);
  const apart = Math.abs(b - a) > GUT_RATES_APART;
  const open = apart ? opening * (closed - gone) / (b - a) : closed && opening * steps * closed;
  const through = apart ? opening * ((1 - closed) / a - (1 - gone) / b) / (b - a)
                        : opening * (1 - (closed && closed * (1 + a * steps))) / (a * a);
  return {held : closed + open, taken : uptake * through};
}
// The share of such a meal the fish takes up before it has passed.
export const gutUse = (flesh, stay) => gutMeal(flesh, stay, Infinity).taken;
export const gutTurns = gutLength => GUT.turns + GUT.turns_per_length * (gutLength || 0);
export function fishSatietyShape(a) {
  const front = a.headBack - GUT.front, back = a.chestBack + GUT.back * a.chestLength,
        x = (front + back) / 2, half = Math.max(GUT.min_half, (front - back) / 2),
        breadth = Math.max(GUT.min_breadth, Math.min(a.shoulder, a.joinWidth) * GUT.breadth),
        turns = gutTurns(a.gutLength),
        tube = Math.min(GUT.tube + GUT.tube_per_fill * Math.sqrt(a.gutFilling || 0),
                        half / (turns * GUT.loop_tubes));
  return {x, y : breadth * GUT.lift, rx : half, ry : breadth * GUT.height, turns, tube};
}

export function fishGutPoint(a, t, across = 0) {
  const q = fishSatietyShape(a), phase = 2 * Math.PI * q.turns * t, x = q.x + q.rx * (1 - 2 * t),
        y = q.y + q.ry * Math.sin(phase), dx = -2 * q.rx,
        dy = q.ry * 2 * Math.PI * q.turns * Math.cos(phase),
        length = Math.max(TANGENT_MIN, Math.hypot(dx, dy));
  return [ x - dy / length * q.tube * across, y + dx / length * q.tube * across ];
}

const GUT_PATH = Object.freeze({steps : 24, steps_per_length : 48});
export function fishGutPath(g, r, a) {
  g.beginPath();
  const steps = GUT_PATH.steps + Math.ceil(GUT_PATH.steps_per_length * (a.gutLength || 0));
  for (const side of [-1, 1])
    for (let i = 0; i <= steps; ++i) {
      const p = fishGutPoint(a, side < 0 ? i / steps : 1 - i / steps, side);
      if (side < 0 && !i)
        g.moveTo(p[0] * r, p[1] * r);
      else
        g.lineTo(p[0] * r, p[1] * r);
    }
  g.closePath();
}

const GLAND = Object.freeze({
  size : .8,
  size_per_cells : .35,
  half_cells : 4,
  back : .025,
  lift : .28,
  length : .055,
  height : .05,
  max_height : .22
});
export function fishGlandShape(a) {
  const f = fishForm(a, MOTOR_TISSUE.gland),
        size =
            GLAND.size + GLAND.size_per_cells * Math.sqrt(f.weight / (GLAND.half_cells + f.weight));
  return {
    x : a.headBack - GLAND.back,
    y : -GLAND.lift * a.shoulder,
    rx : GLAND.length * size,
    ry : Math.min(GLAND.height * size, GLAND.max_height * a.shoulder)
  };
}

const GLAND_PATH =
    Object.freeze({steps : 32, lobe : .88, lobe_depth : .12, lobes : 5, offset : .48, width : .6});
export function fishGlandPath(g, r, a, append = false) {
  const q = fishGlandShape(a);
  if (!append)
    g.beginPath();
  for (const side of [-1, 1]) {
    for (let i = 0; i <= GLAND_PATH.steps; ++i) {
      const t = i * 2 * Math.PI / GLAND_PATH.steps,
            lobe = GLAND_PATH.lobe + GLAND_PATH.lobe_depth * Math.cos(t * GLAND_PATH.lobes),
            x = q.x + q.rx * (side * GLAND_PATH.offset + GLAND_PATH.width * lobe * Math.cos(t)),
            y = q.y + q.ry * lobe * Math.sin(t);
      if (i)
        g.lineTo(x * r, y * r);
      else
        g.moveTo(x * r, y * r);
    }
    g.closePath();
  }
}

const PAIN = Object.freeze({
  along : .19,
  along_per_place : .08,
  out : 1.1,
  shift : .02,
  length : .035,
  length_per_spread : .02,
  height : .022,
  height_per_out : .009
});
export function fishPainShape(a, side) {
  const f = fishForm(a, SENSE_TISSUE.inner_pressure, side),
        p = fishFlank(a, side, PAIN.along + PAIN.along_per_place * f.y);
  return {
    x : p[0],
    y : PAIN.out * p[1] + (side ? PAIN.shift : -PAIN.shift),
    rx : PAIN.length + PAIN.length_per_spread * f.sy,
    ry : PAIN.height + PAIN.height_per_out * f.x
  };
}

const BLADDER = Object.freeze({
  along : .12,
  along_per_place : .23,
  across : .65,
  max_length : .18,
  length : .06,
  length_per_spread : .12,
  length_per_place : .04,
  height : .035,
  height_per_out : .055,
  max_height : .13
});
export function fishBladderShape(a) {
  const f = fishForm(a, SENSE_TISSUE.bladder_pressure),
        p = fishFlank(a, 1, BLADDER.along + BLADDER.along_per_place * f.y);
  return {
    x : p[0],
    y : BLADDER.across * p[1],
    rx : Math.min(a.chestLength * BLADDER.max_length, BLADDER.length +
                                                          BLADDER.length_per_spread * f.sy +
                                                          BLADDER.length_per_place * f.y),
    ry : Math.min(BLADDER.height + BLADDER.height_per_out * f.x, BLADDER.max_height * p[1])
  };
}

const RESERVE_PATH = Object.freeze({cap : .3, handle : .55});
export function fishReservePath(g, r, a) {
  const q = fishReserveShape(a), x = q.x, y = q.y, w = q.ry, h = q.rx, b = -q.bend;
  g.beginPath();
  g.moveTo((x - w * RESERVE_PATH.cap) * r, (y - h) * r);
  g.bezierCurveTo((x - b - w) * r, (y - h * RESERVE_PATH.handle) * r, (x - b - w) * r,
                  (y + h * RESERVE_PATH.handle) * r, (x - w * RESERVE_PATH.cap) * r, (y + h) * r);
  g.quadraticCurveTo(x * r, (y + h + w * RESERVE_PATH.cap) * r, (x + w * RESERVE_PATH.cap) * r,
                     (y + h) * r);
  g.bezierCurveTo((x - b + w) * r, (y + h * RESERVE_PATH.handle) * r, (x - b + w) * r,
                  (y - h * RESERVE_PATH.handle) * r, (x + w * RESERVE_PATH.cap) * r, (y - h) * r);
  g.quadraticCurveTo(x * r, (y - h - w * RESERVE_PATH.cap) * r, (x - w * RESERVE_PATH.cap) * r,
                     (y - h) * r);
  g.closePath();
}

export function fishSurfacePoint(a, side, t, layer) {
  const p = fishFlank(a, side, t);
  return [ p[0], p[1] * layer ];
}

const SKIN =
    Object.freeze({start : .02, span : .45, layer : .96, depth : .018, depth_per_spread : .03});
export function fishSkinPoint(a, side, t, z = 0, key = SENSE_TISSUE.touch) {
  const q = fishOrganSpan(a, key, side);
  return fishSurfacePoint(a, side, SKIN.start + SKIN.span * (q.start + q.span * t),
                          SKIN.layer + (SKIN.depth + SKIN.depth_per_spread * q.f.sz) * z);
}

const PIGMENT =
    Object.freeze({layer : .45, layer_per_out : .06, depth : .06, depth_per_spread : .16});
export function fishPigmentPoint(a, side, t, z = 0) {
  const q = fishOrganSpan(a, MOTOR_TISSUE.pigment, side);
  return fishSurfacePoint(a, side, q.start + q.span * t,
                          PIGMENT.layer + PIGMENT.layer_per_out * q.f.x +
                              (PIGMENT.depth + PIGMENT.depth_per_spread * q.f.sz) * z);
}

const LATERAL = Object.freeze({layer : .76, layer_per_out : .03, wave : .015});
export function fishLateralPoint(a, side, t) {
  const q = fishOrganSpan(a, SENSE_TISSUE.flow, side);
  return fishSurfacePoint(a, side, q.start + q.span * t,
                          LATERAL.layer + LATERAL.layer_per_out * q.f.x +
                              LATERAL.wave * Math.sin(t * Math.PI) * q.f.z);
}

const TONGUE = Object.freeze({mouth_gap : .025, width : .020, width_per_spread : .024, bow : .96});
function fishTongueShape(a) {
  const f = fishForm(a, SENSE_TISSUE.intake);
  return {
    back : fishSatietyShape(a).x + fishSatietyShape(a).rx,
    end : fishSatietyShape(a).y,
    front : fishMouthShape(a).back - TONGUE.mouth_gap,
    ry : TONGUE.width + TONGUE.width_per_spread * f.sy,
    bow : a.shoulder * TONGUE.bow
  };
}

const TONGUE_WAVE = Object.freeze({swallow : .010, bow : .3});
export function fishTonguePoint(a, t, across = 0) {
  const q = fishTongueShape(a),
        wave = (a.swallowPose || 0) * TONGUE_WAVE.swallow * Math.sin(Math.PI * t),
        x = q.front + (q.back - q.front) * t,
        y = q.end * t + q.bow * TONGUE_WAVE.bow * Math.sin(Math.PI * t), dx = q.back - q.front,
        dy = q.end + q.bow * TONGUE_WAVE.bow * Math.PI * Math.cos(Math.PI * t),
        length = Math.max(TANGENT_MIN, Math.hypot(dx, dy)), width = (q.ry + wave) * across;
  return [ x - dy / length * width, y + dx / length * width ];
}

const TONGUE_PATH = Object.freeze({steps : 24});
export function fishTonguePath(g, r, a) {
  g.beginPath();
  for (const side of [-1, 1])
    for (let i = 0; i <= TONGUE_PATH.steps; i++) {
      const p =
          fishTonguePoint(a, side < 0 ? i / TONGUE_PATH.steps : 1 - i / TONGUE_PATH.steps, side);
      if (side < 0 && i === 0)
        g.moveTo(p[0] * r, p[1] * r);
      else
        g.lineTo(p[0] * r, p[1] * r);
    }
  g.closePath();
}

const EGG_DUCT = Object.freeze({
  vent : .82,
  bend_back : .35,
  bend_out : .08,
  bend_per_height : .55,
  reach : .14,
  rise : .13,
  rise_per_fill : .07,
  vent_out : .035
});
export function fishEggDuctCurve(a) {
  if (a.birthDuct)
    return a.birthDuct;
  const q = fishGameteShape(a, MOTOR_KIND.eggs), end = fishAlong(a, -EGG_DUCT.vent);
  return [
    [ q.x, 0 ],
    [ q.x - EGG_DUCT.bend_back * q.rx, EGG_DUCT.bend_out + EGG_DUCT.bend_per_height * q.ry ],
    [ end + EGG_DUCT.reach * a.bodyStretch, EGG_DUCT.rise + EGG_DUCT.rise_per_fill * q.fill ],
    [ end, EGG_DUCT.vent_out ]
  ];
}

const EGG_PASSAGE = Object.freeze(
    {travel : .55, length : .20, width : .024, width_per_muscle : .012, width_per_egg : .14});
function fishEggDuctWidth(a, t) {
  const phase = a.birthProgress / EGG_PASSAGE.travel,
        passage =
            a.birthing && phase <= 1 ? Math.exp(-(((t - phase) / EGG_PASSAGE.length) ** 2)) : 0;
  return EGG_PASSAGE.width + EGG_PASSAGE.width_per_muscle * a.muscle(ANATOMY.egg_strength) +
         EGG_PASSAGE.width_per_egg * passage;
}

const EGG_DUCT_TANGENT = Object.freeze({step : .002});
export function fishEggDuctPoint(a, t, across = 0) {
  const q = fishEggDuctCurve(a), p = fishBezier(q, t),
        lo = fishBezier(q, Math.max(0, t - EGG_DUCT_TANGENT.step)),
        hi = fishBezier(q, Math.min(1, t + EGG_DUCT_TANGENT.step)), dx = hi[0] - lo[0],
        dy = hi[1] - lo[1], length = Math.max(TANGENT_MIN, Math.hypot(dx, dy)),
        width = fishEggDuctWidth(a, t) * across;
  return [ p[0] - dy / length * width, p[1] + dx / length * width ];
}

const EGG_DUCT_PATH = Object.freeze({steps : 20});
export function fishEggDuctPath(g, r, a, append = false) {
  if (!append)
    g.beginPath();
  for (const side of [-1, 1])
    for (let i = 0; i <= EGG_DUCT_PATH.steps; i++) {
      const p = fishEggDuctPoint(
          a, side < 0 ? i / EGG_DUCT_PATH.steps : 1 - i / EGG_DUCT_PATH.steps, side);
      if (side === -1 && i === 0)
        g.moveTo(p[0] * r, p[1] * r);
      else
        g.lineTo(p[0] * r, p[1] * r);
    }
  const p = fishEggDuctPoint(a, 0, -1);
  g.lineTo(p[0] * r, p[1] * r);
  g.closePath();
}

const EGG_MUSCLE = Object.freeze({inner : .22, outer : 1.15});
export function fishEggMuscleFiber(a, t, side) {
  const sign = side ? 1 : -1;
  return [
    fishEggDuctPoint(a, t, EGG_MUSCLE.inner * sign), fishEggDuctPoint(a, t, EGG_MUSCLE.outer * sign)
  ];
}

const SKIN_PATH = Object.freeze({steps : 24});
export function fishSkinPath(g, r, a, side) {
  g.beginPath();
  for (let i = 0; i <= SKIN_PATH.steps; i++) {
    const p = fishSkinPoint(a, side, i / SKIN_PATH.steps, 1);
    if (i)
      g.lineTo(p[0] * r, p[1] * r);
    else
      g.moveTo(p[0] * r, p[1] * r);
  }
  for (let i = SKIN_PATH.steps; i >= 0; i--) {
    const p = fishSkinPoint(a, side, i / SKIN_PATH.steps, -1);
    g.lineTo(p[0] * r, p[1] * r);
  }
  g.closePath();
}

const INJURY = Object.freeze({
  along : .06,
  along_per_place : .30,
  across : .68,
  length : .035,
  length_per_spread : .05,
  length_per_size : .025,
  height : .025,
  height_per_out : .025
});
export function fishInjuryShape(a, side) {
  const f = fishForm(a, SENSE_TISSUE.damage, side),
        p = fishFlank(a, side, INJURY.along + INJURY.along_per_place * f.y);
  return {
    x : p[0],
    y : p[1] * INJURY.across,
    rx :
        INJURY.length + INJURY.length_per_spread * f.sy + INJURY.length_per_size * a.size(f.weight),
    ry : INJURY.height + INJURY.height_per_out * f.x
  };
}

const INJURY_SPAN = Object.freeze({length : .80, height : .66});
export function fishInjuryPoint(a, side, t, z) {
  const q = fishInjuryShape(a, side), u = 2 * t - 1;
  return [
    q.x + q.rx * INJURY_SPAN.length * u,
    q.y + q.ry * INJURY_SPAN.height * z * Math.sqrt(Math.max(0, 1 - u * u))
  ];
}

const INJURY_PATH = Object.freeze({steps : 48, wave : .82, wave_depth : .18, waves : 6});
export function fishInjuryPath(g, r, a, side) {
  const q = fishInjuryShape(a, side);
  g.beginPath();
  for (let i = 0; i <= INJURY_PATH.steps; i++) {
    const angle = i * 2 * Math.PI / INJURY_PATH.steps,
          wave = INJURY_PATH.wave + INJURY_PATH.wave_depth * Math.cos(INJURY_PATH.waves * angle),
          x = q.x + q.rx * wave * Math.cos(angle), y = q.y + q.ry * wave * Math.sin(angle);
    if (i)
      g.lineTo(x * r, y * r);
    else
      g.moveTo(x * r, y * r);
  }
  g.closePath();
}

const MOUTH = Object.freeze({
  closed_gap : .0015,
  aperture : .8,
  min_back : .35,
  max_jaw : .92,
  jaw : .10,
  jaw_per_length : .24,
  gap_back : .45,
  gap_back_per_bite : .35,
  suction_shorten : .10,
  hinge_per_gap : .10,
  lip : .020,
  lip_per_plan : .024,
  lip_per_suction : .035,
  lip_per_pump : .035,
  hook_blunting : .75,
  eye_clearance : 1.2,
  min_length : .08,
  eye_gap : .035
});
export const lipWidth = suction => MOUTH.lip + MOUTH.lip_per_suction * suction;
export const jawReach = jaw => MOUTH.jaw + MOUTH.jaw_per_length * jaw;
export function fishMouthShape(a) {
  const signature = [
    a.bitePose, a.swallowPose, a.mouthOpening, a.mouthOffset, a.snout, a.faceWidth, a.aperture,
    a.jaw, a.suction, a.teeth, a.shapePlans?.mouth
  ].join(':');
  if (a.mouthShapeCache?.signature === signature)
    return a.mouthShapeCache.shape;
  const f = fishForm(a, MOTOR_TISSUE.suction), plan = fishPlan(a, 'mouth', f),
        bite = a.bitePose || 0, suction = a.swallowPose || 0,
        gape = Math.max(0, Math.min(1, a.mouthOpening || 0)), open = gape, biteOpen = bite,
        gap = MOUTH.closed_gap + (a.aperture || a.faceWidth * MOUTH.aperture) * gape;
  const shape = {
    front : Number.isFinite(a.mouthOffset) ? (a.origin?.[0] || 0) + a.mouthOffset : a.snout,
    back : Math.max(a.headBack + MOUTH.min_back * a.headLength,
                    a.snout - Math.min(a.faceLength * MOUTH.max_jaw, jawReach(a.jaw)) -
                        gap * (MOUTH.gap_back + MOUTH.gap_back_per_bite * biteOpen) *
                            (1 - MOUTH.suction_shorten * suction)),
    hinge : MOUTH.closed_gap + MOUTH.hinge_per_gap * gap,
    gap,
    lip : lipWidth(a.suction) + MOUTH.lip_per_plan * plan.lip + MOUTH.lip_per_pump * suction,
    hook : plan.hook * biteOpen * (1 - MOUTH.hook_blunting * a.teeth),
    gape,
    open,
    bite : biteOpen,
    suction
  };
  const eyeFront = Math.max(...[0, 1].map(side => {
    const eye = fishEye(a, side);
    return eye.rx > 0 ? eye.x + eye.rx * MOUTH.eye_clearance : -Infinity;
  }));
  shape.back =
      Math.min(shape.front - MOUTH.min_length, Math.max(shape.back, eyeFront + MOUTH.eye_gap));
  a.mouthShapeCache = {signature, shape};
  return shape;
}

const JAW_EDGE = Object.freeze({
  round_per_suction : .7,
  round_per_teeth : .3,
  rise_at : .35,
  rise_at_round : .20,
  rise : .50,
  rise_round : .55,
  crest_at : .14,
  crest_at_round : .20,
  crest_round : .22,
  lip : .83
});
export function fishJawEdge(a, side, t) {
  const q = fishMouthShape(a), sign = side ? 1 : -1, span = q.front - q.back,
        round = Math.min(1, JAW_EDGE.round_per_suction * q.suction +
                                JAW_EDGE.round_per_teeth * a.teeth);
  return fishBezier(
      [
        [ q.back, sign * q.hinge ],
        [
          q.back + (JAW_EDGE.rise_at - JAW_EDGE.rise_at_round * round) * span,
          sign * (q.hinge + (JAW_EDGE.rise + JAW_EDGE.rise_round * round) * q.gap)
        ],
        [
          q.front - (JAW_EDGE.crest_at + JAW_EDGE.crest_at_round * round) * span,
          sign * q.gap * (1 + JAW_EDGE.crest_round * round) + q.hook
        ],
        [ q.front, sign * q.gap * JAW_EDGE.lip + q.hook ]
      ],
      t);
}

const MOUTH_CONTOUR = Object.freeze({steps : 16, corners : 5, bulge : .48});
export function fishMouthContour(a, steps = MOUTH_CONTOUR.steps) {
  const q = fishMouthShape(a), points = [];
  for (let side = 0; side < 2; side++) {
    if (side === 1) {
      const top = fishJawEdge(a, 0, 1), bottom = fishJawEdge(a, 1, 1);
      for (let k = 1; k < MOUTH_CONTOUR.corners; k++) {
        const t = k / MOUTH_CONTOUR.corners, u = 1 - t;
        points.push([
          u * u * top[0] + 2 * u * t * (q.front + q.gap * MOUTH_CONTOUR.bulge * q.suction) +
              t * t * bottom[0],
          u * u * top[1] + 2 * u * t * q.hook + t * t * bottom[1]
        ]);
      }
    }
    for (let k = 0; k <= steps; k++)
      points.push(fishJawEdge(a, side, side ? 1 - k / steps : k / steps));
  }
  return points;
}
export function fishMouthPath(g, r, a, append = false) {
  if (!append)
    g.beginPath();
  const points = fishMouthContour(a);
  points.forEach((p, k) => k ? g.lineTo(p[0] * r, p[1] * r) : g.moveTo(p[0] * r, p[1] * r));
  g.closePath();
}

const MOUTH_INTERIOR = Object.freeze({
  min_radius : 22,
  min_gape : .08,
  throat_alpha : .75,
  throat_at : .08,
  throat_min : .008,
  throat_length : .22,
  throat_height : .65,
  ridge_min_width : .5,
  ridge_width : .003,
  ridge_alpha : .5,
  ridges : 5,
  ridge_start : .12,
  ridge_step : .1,
  ridge_lip : .85,
  ridge_bend_back : .02,
  ridge_bend : .6,
  ridge_back : .035,
  ridge_end : .18,
  teeth_alpha : .95,
  throat : '#633b49',
  ridge : '#c09585',
  tooth : '#eadbb5',
  tooth_edge : '#7d6958'
});
export function fishMouthInterior(g, r, a) {
  const q = fishMouthShape(a);
  if (r < MOUTH_INTERIOR.min_radius || q.gape < MOUTH_INTERIOR.min_gape)
    return;
  g.save();
  fishMouthPath(g, r, a);
  g.clip();
  g.fillStyle = MOUTH_INTERIOR.throat;
  g.globalAlpha = MOUTH_INTERIOR.throat_alpha;
  g.beginPath();
  g.ellipse((q.back + MOUTH_INTERIOR.throat_at * (q.front - q.back)) * r, 0,
            Math.max(MOUTH_INTERIOR.throat_min, (q.front - q.back) * MOUTH_INTERIOR.throat_length) *
                r,
            q.gap * MOUTH_INTERIOR.throat_height * r, 0, 0, 2 * Math.PI);
  g.fill();
  g.strokeStyle = MOUTH_INTERIOR.ridge;
  g.lineWidth = Math.max(MOUTH_INTERIOR.ridge_min_width, r * MOUTH_INTERIOR.ridge_width);
  g.globalAlpha = MOUTH_INTERIOR.ridge_alpha;
  for (const side of [0, 1])
    for (let i = 0; i < MOUTH_INTERIOR.ridges; ++i) {
      const t = MOUTH_INTERIOR.ridge_start + i * MOUTH_INTERIOR.ridge_step,
            p = fishJawEdge(a, side, t), sign = side ? 1 : -1;
      g.beginPath();
      g.moveTo(p[0] * r, p[1] * MOUTH_INTERIOR.ridge_lip * r);
      g.quadraticCurveTo(
          (p[0] - MOUTH_INTERIOR.ridge_bend_back) * r, p[1] * MOUTH_INTERIOR.ridge_bend * r,
          (p[0] - MOUTH_INTERIOR.ridge_back) * r, sign * q.gap * MOUTH_INTERIOR.ridge_end * r);
      g.stroke();
    }
  g.fillStyle = MOUTH_INTERIOR.tooth;
  g.strokeStyle = MOUTH_INTERIOR.tooth_edge;
  g.globalAlpha = MOUTH_INTERIOR.teeth_alpha;
  for (const side of [0, 1])
    for (const tooth of fishTeeth(a, side)) {
      g.beginPath();
      tooth.forEach((p, i) => i ? g.lineTo(p[0] * r, p[1] * r) : g.moveTo(p[0] * r, p[1] * r));
      g.closePath();
      g.fill();
      g.stroke();
    }
  g.restore();
}

const SUCTION_FLOW = Object.freeze({
  min_suction : .08,
  min_radius : 16,
  alpha : .42,
  min_width : .6,
  width : .005,
  reach : .08,
  reach_idle : .18,
  lane : .10,
  start : .14,
  bend : .04,
  bend_lane : .65,
  inlet : .012,
  inlet_lane : .55,
  water : '#b3dce3'
});
export function fishSuctionFlow(g, r, a) {
  const q = fishMouthShape(a);
  if (q.suction < SUCTION_FLOW.min_suction || r < SUCTION_FLOW.min_radius)
    return;
  g.save();
  g.strokeStyle = SUCTION_FLOW.water;
  g.globalAlpha = SUCTION_FLOW.alpha * q.suction;
  g.lineWidth = Math.max(SUCTION_FLOW.min_width, r * SUCTION_FLOW.width);
  g.beginPath();
  for (const lane of [-1, 0, 1]) {
    const x = q.front + SUCTION_FLOW.reach + SUCTION_FLOW.reach_idle * (1 - q.suction),
          y = lane * (q.gap + SUCTION_FLOW.lane);
    g.moveTo((x + SUCTION_FLOW.start) * r, y * r);
    g.quadraticCurveTo((x + SUCTION_FLOW.bend) * r, y * SUCTION_FLOW.bend_lane * r,
                       (q.front + SUCTION_FLOW.inlet) * r,
                       lane * q.gap * SUCTION_FLOW.inlet_lane * r);
  }
  g.stroke();
  g.restore();
}

const SPERM_PATH =
    Object.freeze({tip_x : .88, tip_y : .42, nose_x : 1.12, nose_y : .32, shoulder : .30});
export function fishGametePath(g, r, a, kind) {
  const q = fishGameteShape(a, kind);
  g.beginPath();
  if (kind === MOTOR_KIND.eggs)
    g.ellipse(q.x * r, q.y * r, q.rx * r, q.ry * r, 0, 0, 2 * Math.PI);
  else {
    g.moveTo((q.x + q.rx * SPERM_PATH.tip_x) * r, (q.y - q.ry * SPERM_PATH.tip_y) * r);
    g.bezierCurveTo((q.x + q.rx * SPERM_PATH.nose_x) * r, (q.y - q.ry * SPERM_PATH.nose_y) * r,
                    (q.x + q.rx * SPERM_PATH.nose_x) * r, (q.y + q.ry * SPERM_PATH.nose_y) * r,
                    (q.x + q.rx * SPERM_PATH.tip_x) * r, (q.y + q.ry * SPERM_PATH.tip_y) * r);
    g.bezierCurveTo((q.x + q.rx * SPERM_PATH.shoulder) * r, (q.y + q.ry) * r, (q.x - q.rx) * r,
                    (q.y + q.ry) * r, (q.x - q.rx) * r, q.y * r);
    g.bezierCurveTo((q.x - q.rx) * r, (q.y - q.ry) * r, (q.x + q.rx * SPERM_PATH.shoulder) * r,
                    (q.y - q.ry) * r, (q.x + q.rx * SPERM_PATH.tip_x) * r,
                    (q.y - q.ry * SPERM_PATH.tip_y) * r);
    g.closePath();
  }
}

const OUTLINE = Object.freeze({head : .4});
function fishOutlinePoint(a, side, t) {
  if (t < OUTLINE.head)
    return fishBezier(fishHeadCurve(a, side), t / OUTLINE.head);
  return fishFlank(a, side, (t - OUTLINE.head) / (1 - OUTLINE.head));
}

const SPINES = Object.freeze({
  max_count : 10,
  min_count : 2,
  count : 2,
  count_per_capacity : .85,
  max_length : 2.1,
  length : .10,
  length_per_capacity : .14,
  start : .405,
  start_per_plan : .04,
  span : .40,
  span_per_plan : .13,
  crowding : .5,
  crowding_per_place : 1.5,
  tangent : .004,
  reach : .7,
  reach_wave : .3,
  base : .012,
  base_per_plan : .018,
  folded : .55,
  erect : .45,
  eye_gap : .06,
  control : .45,
  back_control : .35
});
export function fishDefenseSpines(a, side) {
  const capacity = a.organs[ANATOMY.armor_left + side] || 0;
  if (capacity <= 0)
    return [];
  const f = fishForm(a, MOTOR_TISSUE.defense, side), p = fishPlan(a, 'spine', f),
        count = Math.min(
            SPINES.max_count,
            Math.max(SPINES.min_count,
                     Math.round((SPINES.count + SPINES.count_per_capacity * Math.sqrt(capacity)) *
                                p.count))),
        erect = Math.sqrt(a.defenseActivity),
        length =
            Math.min(SPINES.max_length,
                     (SPINES.length + SPINES.length_per_capacity * Math.sqrt(capacity)) * p.length),
        result = [];
  for (let i = 0; i < count; i++) {
    const t = SPINES.start + SPINES.start_per_plan * p.start +
              (SPINES.span + SPINES.span_per_plan * p.spread) *
                  Math.pow((i + .5) / count, SPINES.crowding + SPINES.crowding_per_place * f.y),
          root = fishOutlinePoint(a, side, t), lo = fishOutlinePoint(a, side, t - SPINES.tangent),
          hi = fishOutlinePoint(a, side, t + SPINES.tangent),
          d = Math.max(TANGENT_MIN, Math.hypot(hi[0] - lo[0], hi[1] - lo[1])),
          tx = (hi[0] - lo[0]) / d, ty = (hi[1] - lo[1]) / d, sign = side ? 1 : -1, nx = sign * ty,
          ny = -sign * tx,
          reach = length *
                  (SPINES.reach + SPINES.reach_wave * Math.sin((i + 1) * Math.PI / (count + 1))),
          base = (SPINES.base + SPINES.base_per_plan * p.base),
          tip =
              [
                root[0] + nx * reach * (SPINES.folded + SPINES.erect * erect) +
                    tx * reach * p.lean * (1 - erect),
                root[1] + ny * reach * (SPINES.folded + SPINES.erect * erect) +
                    ty * reach * p.lean * (1 - erect)
              ],
          eye = fishEye(a, side);
    if (eye.rx > 0 && root[0] > eye.x - eye.rx - SPINES.eye_gap)
      continue;
    result.push([
      [ root[0] - tx * base, root[1] - ty * base ],
      [
        root[0] + nx * reach * SPINES.control - tx * base + tx * reach * p.curve,
        root[1] + ny * reach * SPINES.control - ty * base + ty * reach * p.curve
      ],
      tip,
      [
        root[0] + nx * reach * SPINES.back_control + tx * base,
        root[1] + ny * reach * SPINES.back_control + ty * base
      ],
      [ root[0] + tx * base, root[1] + ty * base ]
    ]);
  }
  return result;
}

const GILL = Object.freeze({
  at : .12,
  width : .62,
  width_per_pump : .10,
  lift : .018,
  lift_per_pump : .035,
  start_along : .11,
  start_out : .55,
  bulge_along : .12,
  bulge_out : .70,
  bend_along : .08,
  bend_out : 1.30,
  end_along : .13,
  end_out : 1.38,
  flare_per_gills : 1.5
});
// Gill covers flare with the water through the mouth, the wider the stronger their pump muscle.
export function fishGillShape(a, side, pump = 0) {
  pump *= 1 + GILL.flare_per_gills * (a.gills || 0);
  const sign = side ? 1 : -1, x = a.headBack + GILL.at * a.headLength,
        width = a.neckWidth * (GILL.width + GILL.width_per_pump * pump),
        lift = GILL.lift + GILL.lift_per_pump * pump;
  return [
    [ x + GILL.start_along * a.headLength, sign * width * GILL.start_out ],
    [ x - GILL.bulge_along * a.headLength - lift, sign * width * GILL.bulge_out ],
    [ x - GILL.bend_along * a.headLength - lift, sign * width * GILL.bend_out ],
    [ x + GILL.end_along * a.headLength, sign * width * GILL.end_out ]
  ];
}

// A gill cover's muscle runs along its rim.
const GILL_FIBRE = Object.freeze({half : .12});
export function fishGillFiber(a, side, t) {
  const rim = fishGillShape(a, side, 0);
  return [
    fishBezier(rim, Math.max(0, t - GILL_FIBRE.half)),
    fishBezier(rim, Math.min(1, t + GILL_FIBRE.half))
  ];
}
// The gut's ring muscle at a share along the gut, one half ring for each side of its wall.
const GUT_RING = Object.freeze({reach : 1.6});
export function fishGutRing(a, t, side) {
  return [ fishGutPoint(a, t, 0), fishGutPoint(a, t, (side ? 1 : -1) * GUT_RING.reach) ];
}

const SUCTION = Object.freeze({
  front : .015,
  mouth_gap : .02,
  max_back : .04,
  length : .06,
  length_per_jaw : .07,
  length_per_spread : .02,
  max_height : .48,
  height : .035,
  height_per_jaw : .04,
  height_per_pump : .5
});
export function fishSuctionShape(a) {
  const mouth = fishMouthShape(a), f = fishForm(a, MOTOR_TISSUE.suction),
        front = Math.max(a.headFront + SUCTION.front, mouth.back + SUCTION.mouth_gap);
  return {
    front,
    back : Math.max(a.headFront - SUCTION.max_back,
                    front - (SUCTION.length + SUCTION.length_per_jaw * a.jaw +
                             SUCTION.length_per_spread * f.sy)),
    ry : Math.min(a.faceWidth * SUCTION.max_height,
                  (SUCTION.height + SUCTION.height_per_jaw * a.jaw) *
                      (1 + SUCTION.height_per_pump * (a.swallowPose || 0)))
  };
}

const SUCTION_PATH = Object.freeze({front : .85, back : .45, inset : .025});
export function fishSuctionPath(g, r, a, append = false) {
  const q = fishSuctionShape(a), mid = (q.front + q.back) / 2;
  if (!append)
    g.beginPath();
  g.moveTo(q.front * r, 0);
  g.bezierCurveTo(q.front * r, -q.ry * SUCTION_PATH.front * r, mid * r, -q.ry * r, q.back * r,
                  -q.ry * SUCTION_PATH.back * r);
  g.quadraticCurveTo((q.back - SUCTION_PATH.inset) * r, 0, q.back * r,
                     q.ry * SUCTION_PATH.back * r);
  g.bezierCurveTo(mid * r, q.ry * r, q.front * r, q.ry * SUCTION_PATH.front * r, q.front * r, 0);
  g.closePath();
}

const JAW_FIBER = Object.freeze(
    {start : .16, span : .68, across : .48, bulge : .15, slant : .035, inner : .45, outer : 1.10});
export function fishJawFiber(a, side, t) {
  const sign = side ? 1 : -1, q = fishSuctionShape(a),
        x = q.back + (q.front - q.back) * (JAW_FIBER.start + JAW_FIBER.span * t),
        y = sign * q.ry * (JAW_FIBER.across + JAW_FIBER.bulge * Math.sin(Math.PI * t));
  return [
    [ x - JAW_FIBER.slant, y * JAW_FIBER.inner ], [ x + JAW_FIBER.slant, y * JAW_FIBER.outer ]
  ];
}

const JAW_MUSCLE =
    Object.freeze({root : .45, handle : .07, tip : .025, inner_handle : .08, inner_root : .18});
export function fishJawMusclePath(g, r, a, side, append = false) {
  const sign = side ? 1 : -1, q = fishSuctionShape(a);
  if (!append)
    g.beginPath();
  g.moveTo(q.back * r, sign * q.ry * JAW_MUSCLE.root * r);
  g.bezierCurveTo((q.back + JAW_MUSCLE.handle) * r, sign * q.ry * r,
                  (q.front - JAW_MUSCLE.handle) * r, sign * q.ry * r, q.front * r, 0);
  g.lineTo((q.front - JAW_MUSCLE.tip) * r, 0);
  g.bezierCurveTo((q.front - JAW_MUSCLE.inner_handle) * r, sign * q.ry * JAW_MUSCLE.root * r,
                  (q.back + JAW_MUSCLE.handle) * r, sign * q.ry * JAW_MUSCLE.root * r, q.back * r,
                  sign * q.ry * JAW_MUSCLE.inner_root * r);
  g.closePath();
}

const GLYPH_POINTS = Object.freeze({curve_steps : 4, barbel_steps : 4});
export function fishGlyphPoints(a) {
  const curves = [...fishBodyCurves(a) ];
  for (const side of [0, 1])
    curves.push(...fishRearFinShape(a, side));
  for (let i = 0; i < FINS; i++)
    if (a.fin(i)[FIN_SHAPE.strength] > 0)
      curves.push(...fishFinShape(a, i).curves);
  const points =
      curves.flatMap(q => Array.from({length : GLYPH_POINTS.curve_steps + 1},
                                     (_, k) => fishBezier(q, k / GLYPH_POINTS.curve_steps)));
  for (const side of [0, 1]) {
    const e = fishEye(a, side);
    points.push([ e.x - e.rx, e.y - e.ry ], [ e.x + e.rx, e.y + e.ry ]);
    for (const pit of fishProximityPits(a, side))
      points.push([ pit.x - pit.r, pit.y - pit.r ], [ pit.x + pit.r, pit.y + pit.r ]);
    if (a.barbelSides[side])
      for (let k = 0; k <= GLYPH_POINTS.barbel_steps; k++)
        points.push(fishBarbel(a, side, k / GLYPH_POINTS.barbel_steps));
    for (const spike of fishDefenseSpines(a, side))
      points.push(...spike);
  }
  const mouth = fishMouthShape(a);
  points.push([ mouth.front, mouth.gap + mouth.lip ], [ mouth.front, -mouth.gap - mouth.lip ]);
  return points;
}

export function fishGlyphBounds(a, angle = 0) { return fishPointBounds(fishGlyphPoints(a), angle); }

const POINT_BOUNDS = Object.freeze({min_size : .1});
function fishPointBounds(points, angle) {
  const co = Math.cos(angle), si = Math.sin(angle),
        q = points.map(([ x, y ]) => [x * co - y * si, x * si + y * co]),
        left = Math.min(...q.map(p => p[0])), right = Math.max(...q.map(p => p[0])),
        top = Math.min(...q.map(p => p[1])), bottom = Math.max(...q.map(p => p[1]));
  return {
    left,
    right,
    top,
    bottom,
    width : Math.max(POINT_BOUNDS.min_size, right - left),
    height : Math.max(POINT_BOUNDS.min_size, bottom - top),
    cx : (left + right) / 2,
    cy : (top + bottom) / 2
  };
}

const PREVIEW_BOUNDS = Object.freeze({snout_margin : .01, lip_reach : .24});
export function fishPreviewBounds(a, angle = 0) {
  const pose = {
    ...a,
    mouthOpening : 1,
    bitePose : 1,
    swallowPose : 1,
    finShapeCache : null,
    finPose : () => 0,
    tailDirection : 1,
    defenseActivity : 0
  },
        points = fishGlyphPoints(pose), mouth = fishMouthShape(pose),
        halfHeight = mouth.gap + mouth.lip + Math.abs(mouth.hook);
  for (const x of [a.snout + PREVIEW_BOUNDS.snout_margin,
                   mouth.front + PREVIEW_BOUNDS.lip_reach * mouth.gap])
    points.push([ x, -halfHeight ], [ x, halfHeight ]);
  for (const active of [0, 1]) {
    pose.finPose = () => active;
    for (let i = 0; i < FINS; i++)
      if (a.fin(i)[FIN_SHAPE.strength] > 0)
        points.push(...fishFinShape(pose, i).curves.flat());
  }
  pose.tailDirection = -1;
  if (a.fin(FIN.tail)[FIN_SHAPE.strength] > 0)
    points.push(...fishFinShape(pose, FIN.tail).curves.flat());
  pose.defenseActivity = 1;
  for (const side of [0, 1])
    points.push(...fishDefenseSpines(pose, side).flat());
  return fishPointBounds(points, angle);
}

const PREVIEW = Object.freeze({margin : 12});
export function fishPreviewPose(p, width, height, desired, angle = 0) {
  const a = fishAnatomy(p), bounds = fishPreviewBounds(a, angle),
        r = Math.min(desired, (width - PREVIEW.margin) / bounds.width,
                     (height - PREVIEW.margin) / bounds.height);
  return {a, r, x : width / 2 - bounds.cx * r, y : height / 2 - bounds.cy * r};
}

const DISPLAY_LENGTH = Object.freeze({min : .1});
function fishDisplayLength(a) {
  if (a.displayLength !== undefined)
    return a.displayLength;
  const rear = a.fin(FIN.tail)[FIN_SHAPE.strength] > 0
                   ? Math.min(fishAlong(a, -TAIL_END),
                              ...fishFinShape(a, FIN.tail).curves.flat().map(p => p[0]))
                   : fishAlong(a, -TAIL_END);
  return a.displayLength = Math.max(DISPLAY_LENGTH.min,
                                    (a.jaw || a.attack ? fishMouthShape(a).front : a.snout) - rear);
}

const CHEEK = Object.freeze({
  root_along : .08,
  root_out : .35,
  end : .27,
  base : .015,
  base_per_power : .075,
  base_per_spread : .035,
  sweep : .15
});
function fishCheekShape(a, side = -1) {
  const f = fishForm(a, MOTOR_TISSUE.aggression), power = side < 0 ? a.attack : a.attackSides[side],
        root = [ a.headFront + CHEEK.root_along * a.faceLength, a.faceWidth * CHEEK.root_out ],
        end = fishJawEdge(a, 1, CHEEK.end);
  return {
    root,
    end,
    reach : Math.hypot(end[0] - root[0], end[1] - root[1]),
    base : CHEEK.base + CHEEK.base_per_power * power + CHEEK.base_per_spread * f.sy,
    activation : a.bitePose || 0,
    hinges : 1,
    angles : [ 0 ],
    sweep : CHEEK.sweep,
    bodyLength : fishDisplayLength(a),
    size : power
  };
}

const CHEEK_PAD = Object.freeze({pad : .025, pad_per_jaw : .04});
export function fishCheekPoint(a, side, t, across = .5) {
  const jaw = fishJawEdge(a, side, t), skin = fishBezier(fishHeadCurves(a, side)[0], 1 - t),
        padding = (side ? 1 : -1) * (CHEEK_PAD.pad + CHEEK_PAD.pad_per_jaw * a.jaw) *
                  Math.sin(Math.PI * t);
  return [
    skin[0] + (jaw[0] - skin[0]) * across,
    skin[1] + (jaw[1] - skin[1]) * across + padding * Math.sin(Math.PI * across)
  ];
}

const GLYPH_EXTENT = Object.freeze({snout : .8, tail : 1.05, width : 1.8, flank_margin : 2.5});
export function fishGlyphExtent(a) {
  if (a.glyphExtent !== undefined)
    return a.glyphExtent;
  let extent = Math.max(a.snout + GLYPH_EXTENT.snout, Math.abs(fishAlong(a, -GLYPH_EXTENT.tail)),
                        GLYPH_EXTENT.width * a.shoulder,
                        GLYPH_EXTENT.width * Math.max(...a.flank) + GLYPH_EXTENT.flank_margin);
  for (const side of [0, 1]) {
    for (const p of fishRearFinShape(a, side).flat())
      extent = Math.max(extent, Math.abs(p[0]) + Math.abs(p[1]));
    if (a.barbelSides[side])
      for (const p of fishBarbelCurve(a, side))
        extent = Math.max(extent, Math.abs(p[0]) + Math.abs(p[1]));
  }
  const maximum = a.finMaximum ??= {...a, finShapeCache : null, finPose : () => 1};
  for (let index = 0; index < FINS; index++)
    if (a.fin(index)[FIN_SHAPE.strength] > 0)
      for (const q of fishFinShape(maximum, index).curves)
        for (const p of q)
          extent = Math.max(extent, Math.abs(p[0]) + Math.abs(p[1]));
  return a.glyphExtent = extent;
}

const GILL_FOLDS = Object.freeze(
    {min_pixels : .05, rays : 6, start : .10, steps : 8, span : .87, hinge_steps : 16});
export function fishGillFolds(g, r, a, side) {
  const shape = fishCheekShape(a, side);
  g.beginPath();
  if (shape.reach * r < GILL_FOLDS.min_pixels)
    return;
  for (let ray = 0; ray <= GILL_FOLDS.rays; ray++) {
    const across = ray / GILL_FOLDS.rays, p = fishCheekPoint(a, side, GILL_FOLDS.start, across);
    g.moveTo(p[0] * r, p[1] * r);
    for (let i = 1; i <= GILL_FOLDS.steps; i++) {
      const q = fishCheekPoint(a, side, GILL_FOLDS.start + GILL_FOLDS.span * i / GILL_FOLDS.steps,
                               across);
      g.lineTo(q[0] * r, q[1] * r);
    }
  }
  for (let joint = 1; joint <= shape.hinges; joint++) {
    const t = joint / (shape.hinges + 1);
    for (let i = 0; i <= GILL_FOLDS.hinge_steps; i++) {
      const p = fishCheekPoint(a, side, t, i / GILL_FOLDS.hinge_steps);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
  }
}

const TEETH = Object.freeze({
  min_gape : .08,
  count : 2,
  count_per_power : 3,
  count_per_spread : 3,
  count_per_bluntness : 2,
  reach : .025,
  reach_per_power : .17,
  width : .015,
  width_per_spread : .035,
  max_width : .32,
  start : .22,
  span : .69,
  offset : .30,
  side_offset : .4,
  tip : .75,
  tip_wave : .25,
  flat : .12,
  flat_per_bluntness : .88,
  blunting : .42,
  max_height : .68
});
export function toothForm(power, bluntness = 0, spread = 0) {
  return {
    count :
        TEETH.count + Math.round(TEETH.count_per_power * power + TEETH.count_per_spread * spread +
                                 TEETH.count_per_bluntness * bluntness),
    reach : TEETH.reach + TEETH.reach_per_power * power,
    flat : TEETH.flat + TEETH.flat_per_bluntness * bluntness,
    height : 1 - TEETH.blunting * bluntness
  };
}
export function fishTeeth(a, side) {
  const f = fishForm(a, MOTOR_TISSUE.aggression), power = a.attackSides[side],
        opening = fishMouthShape(a).gape;
  if (!power || opening < TEETH.min_gape)
    return [];
  const q = fishMouthShape(a), form = toothForm(power, a.teeth || 0, f.sy), count = form.count,
        reach = form.reach,
        broad = Math.min(TEETH.width + TEETH.width_per_spread * f.sy,
                         (q.front - q.back) * TEETH.max_width / count),
        result = [];
  for (let i = 0; i < count; i++) {
    const t = TEETH.start + TEETH.span * (i + TEETH.offset + TEETH.side_offset * side) / count,
          p = fishJawEdge(a, side, t), sign = side ? 1 : -1,
          tip = reach * (TEETH.tip + TEETH.tip_wave * Math.sin(Math.PI * t));
    const flat = broad * form.flat,
          height = Math.min(tip * form.height, Math.abs(p[1]) * TEETH.max_height);
    const tooth = [
      [ p[0] - broad, p[1] ], [ p[0] - flat, p[1] - sign * height ],
      [ p[0] + flat, p[1] - sign * height ], [ p[0] + broad, p[1] ]
    ];
    tooth.along = t;
    tooth.base = p;
    result.push(tooth);
  }
  return result;
}

const CHEEK_PATH = Object.freeze({min_pixels : .05, edge_steps : 16, rim_steps : 24});
export function fishCheekPath(g, r, a, side, append = false) {
  if (!append)
    g.beginPath();
  if (fishCheekShape(a, side).reach * r < CHEEK_PATH.min_pixels)
    return;
  for (let i = 0; i <= CHEEK_PATH.edge_steps; i++) {
    const p = fishCheekPoint(a, side, i / CHEEK_PATH.edge_steps, 0);
    if (i)
      g.lineTo(p[0] * r, p[1] * r);
    else
      g.moveTo(p[0] * r, p[1] * r);
  }
  for (let i = 1; i <= CHEEK_PATH.rim_steps; i++) {
    const p = fishCheekPoint(a, side, 1, i / CHEEK_PATH.rim_steps);
    g.lineTo(p[0] * r, p[1] * r);
  }
  for (let i = CHEEK_PATH.edge_steps - 1; i >= 0; i--) {
    const p = fishCheekPoint(a, side, i / CHEEK_PATH.edge_steps, 1);
    g.lineTo(p[0] * r, p[1] * r);
  }
  g.closePath();
}

function fishFinPlan(a, index) {
  const name = index === FIN.tail ? 'tail' : 'side',
        f = fishForm(a, index === FIN.tail ? MOTOR_TISSUE.forward : MOTOR_TISSUE.turn, -1),
        n = FISH_PLANS[name].length;
  return Math.floor(((fishPlanPhase(a, name, f) % n) + n) % n);
}

function fishClosedCurves(points, roundness) {
  return points.map((p, i) => {
    const n = points.length, prev = points[(i + n - 1) % n], q = points[(i + 1) % n],
          after = points[(i + 2) % n], r = roundness[i] / 6, t = roundness[(i + 1) % n] / 6;
    return [
      p, [ p[0] + r * (q[0] - prev[0]), p[1] + r * (q[1] - prev[1]) ],
      [ q[0] - t * (after[0] - p[0]), q[1] - t * (after[1] - p[1]) ], q
    ];
  });
}

const FIN_ATTACHMENT = Object.freeze({
  rear : .505,
  rear_per_plan : .08,
  rear_per_place : .035,
  first : .025,
  last : .44,
  front : .025,
  front_per_plan : .31,
  front_per_place : .16
});
// A side fin's region: the pectoral fin's or, behind it, the pelvic fin's.
const sideFinRegion = (a, index) => fishRegion(
    a, REGION_LAYOUT.turn_fin + REGION_LAYOUT.lobes * finSide(index) + (isPelvic(index) ? 1 : 0),
    MOTOR_TISSUE.turn, finSide(index));
function fishFinAttachment(a, index) {
  const f = sideFinRegion(a, index), plan = fishPlan(a, 'side', fishForm(a, MOTOR_TISSUE.turn));
  return isPelvic(index) ? FIN_ATTACHMENT.rear + FIN_ATTACHMENT.rear_per_plan * plan.attachment +
                               FIN_ATTACHMENT.rear_per_place * (1 - f.y)
                         : Math.max(FIN_ATTACHMENT.first,
                                    Math.min(FIN_ATTACHMENT.last,
                                             FIN_ATTACHMENT.front +
                                                 FIN_ATTACHMENT.front_per_plan * plan.attachment +
                                                 FIN_ATTACHMENT.front_per_place * (1 - f.y)));
}

const FIN_SIZE = Object.freeze({min : .01, cells : .6, strength : .4, power : .37});
export const finVolumeOf = (cells, strength) => Math.pow(
    Math.max(FIN_SIZE.min, FIN_SIZE.cells * cells + FIN_SIZE.strength * strength), FIN_SIZE.power);
export const finVolume = (a, index) =>
    finVolumeOf(a.fin(index)[FIN_SHAPE.cells], a.fin(index)[FIN_SHAPE.strength]);
const FIN_RIM = Object.freeze([ 1, 6 ]);
const TAIL_FIN = Object.freeze({
  length : .20,
  length_per_size : .32,
  length_per_pose : .20,
  width : .10,
  width_per_size : .20,
  narrowing : .18,
  min_slope : .001,
  push_out : 1.08
});
export const tailFinSize = volume => ({
  length : TAIL_FIN.length + TAIL_FIN.length_per_size * volume,
  width : TAIL_FIN.width + TAIL_FIN.width_per_size * volume
});
const TAIL_KNOT = Object.freeze({lead : 1, lobe : 2, tip : 3, fork : 4});
export const FIN_TIP = TAIL_KNOT.tip;
// A side fin stands out from the flank like a hand: at rest it reaches out and back, a stroke
// swings it out across the body. Its outward reach is a share of its length (span), always clear
// of the flank behind its root.
const SIDE_FIN = Object.freeze({
  scale : 1.3,
  length : .16,
  length_per_size : .30,
  max_length : .32,
  flank_samples : 16,
  clearance : .02,
  spread : .06,
  spread_per_size : .04,
  span : .45,
  span_per_pose : .45,
  root_inset : 1,
  rake : .45,
  rake_per_pose : .45,
  root_at : .35
});
export const sideFinSize = volume => ({
  length : SIDE_FIN.length + SIDE_FIN.length_per_size * volume,
  spread : SIDE_FIN.spread + SIDE_FIN.spread_per_size * volume
});
const SIDE_KNOT =
    Object.freeze({root : 0, lead : 1, shoulder : 2, tip : 3, trail : 4, notch : 5, base : 6});
const SIDE_KNOTS = Object.freeze({
  lead_along : .10,
  lead_out : .28,
  shoulder_along : .20,
  shoulder_sweep : .32,
  shoulder_out : .85,
  shoulder_per_leading : .13,
  trail_back : .24,
  trail_out : .48,
  trail_per_lobed : .25,
  notch_along : .52,
  notch_out : .10,
  notch_per_lobed : .20,
  base_out : .025,
  base_end : .60
});
const FRINGE_KNOTS =
    Object.freeze([ [ .12, 1.02 ], [ -.22, .80 ], [ -.53, 1.12 ], [ -.67, .64 ], [ -.87, .70 ] ]);
const SIDE_ROUND = Object.freeze({
  plain : [ .1, .85, .85, 0, .85, .8, .4, .2 ],
  fringed : [ .1, .70, .30, .42, .30, .42, .30, .2 ],
  tip : .15,
  tip_per_leading : .60
});
export function tailFinCurves(plan, {root = [ 0, 0 ], length, width, flex = 0, swing = 0}) {
  const half = [
    [ 0, 0 ], [ plan.lead_along, -plan.lead_out ], [ plan.lobe_along, -plan.lobe_out ],
    [ plan.tip_along, -plan.tip_out ], [ plan.fork, 0 ]
  ];
  for (const k of [TAIL_KNOT.lobe, TAIL_KNOT.tip])
    half[k][0] = Math.max(half[k][0], Math.abs(half[k][1] * half[k - 1][0] /
                                               Math.min(-TAIL_FIN.min_slope, half[k - 1][1])) *
                                          TAIL_FIN.push_out);
  const knots = [
    ...half, ...half.slice(TAIL_KNOT.lead, TAIL_KNOT.fork).reverse().map(([ u, v ]) => [u, -v])
  ];
  const points =
      knots.map(([ u, v ]) => [root[0] - length * u, root[1] + flex + width * v + swing * u * u]);
  return fishClosedCurves(points, [
    plan.root_round, plan.lead_round, plan.lobe_round, plan.tip_round, plan.fork_round,
    plan.tip_round, plan.lobe_round, plan.lead_round
  ]);
}
export function fishFinShape(a, index) {
  const signature = [
    a.bodyStretch, a.flex, a.shoulder, ...a.flank,
    ...Array.from({length : FINS}, (_, k) => a.finPose(k)), a.tailDirection
  ].join(':');
  if (!(a.finShapeCache instanceof Map) || a.finShapeCache.forms !== a.forms ||
      a.finShapeCache.signature !== signature) {
    a.finShapeCache = new Map();
    a.finShapeCache.forms = a.forms;
    a.finShapeCache.signature = signature;
  }
  const cache = a.finShapeCache, key = index;
  if (cache.has(key))
    return cache.get(key);
  const side = finSide(index),
        f = index === FIN.tail ? fishForm(a, MOTOR_TISSUE.forward) : sideFinRegion(a, index),
        plan = fishPlan(a, index === FIN.tail ? 'tail' : 'side',
                        index === FIN.tail ? f : fishForm(a, MOTOR_TISSUE.turn)),
        pose = a.finPose(index), volume = finVolume(a, index),
        shape = {plan : fishFinPlan(a, index), rimRange : FIN_RIM};
  if (index === FIN.tail) {
    const root = [ a.tailRoot, 0 ], size = tailFinSize(volume),
          length = size.length * plan.length + TAIL_FIN.length_per_pose * pose,
          width = size.width * plan.width * (1 - TAIL_FIN.narrowing * pose);
    shape.curves = tailFinCurves(plan, {
      root,
      length,
      width,
      flex : a.flex || 0,
      swing : FIN_STROKE.tail_swing * pose * (a.tailDirection ?? 1)
    });
    shape.upper = shape.curves[0];
    shape.lower = fishCurveReverse(shape.curves[shape.curves.length - 1]);
    shape.root = root;
    shape.width = width;
    shape.x =
        root[0] - length * Math.max(plan.lead_along, plan.lobe_along, plan.tip_along, plan.fork);
    shape.y = 0;
    shape.fork = (Math.max(plan.lead_along, plan.tip_along) - plan.fork) * length;
  } else {
    const sign = side ? 1 : -1, t = fishFinAttachment(a, index), anchor = fishFlank(a, side, t),
          length = SIDE_FIN.scale * Math.min(sideFinSize(volume).length * plan.length,
                                             SIDE_FIN.max_length * (a.chestLength + a.hindLength)),
          widest = Array
                       .from({length : SIDE_FIN.flank_samples},
                             (_, k) => fishFlank(a, side, t + (1 - t) * k / SIDE_FIN.flank_samples))
                       .filter(q => q[0] >= anchor[0] - length && q[0] <= anchor[0])
                       .reduce((m, q) => Math.max(m, Math.abs(q[1])), Math.abs(anchor[1])),
          spread =
              Math.max(Math.max(0, widest - Math.abs(anchor[1])) + SIDE_FIN.clearance,
                       sideFinSize(volume).spread +
                           length * plan.swing * (SIDE_FIN.span + SIDE_FIN.span_per_pose * pose)),
          root = [ anchor[0], anchor[1] * SIDE_FIN.root_inset ],
          at = (u,
                v) => [root[0] + length * (u - (SIDE_FIN.rake - SIDE_FIN.rake_per_pose * pose) * v),
                       root[1] + sign * spread * v],
          sweep = plan.sweep, lobed = fishPlan(a, 'side', fishForm(a, MOTOR_TISSUE.turn)).lobed,
          K = SIDE_KNOTS, knots = [
            [ 0, 0 ], [ K.lead_along, K.lead_out * plan.leading ],
            [
              K.shoulder_along - K.shoulder_sweep * sweep,
              K.shoulder_out + K.shoulder_per_leading * plan.leading
            ],
            [ -sweep, 1 ], [ -sweep - K.trail_back, K.trail_out + K.trail_per_lobed * lobed ],
            [ -K.notch_along, K.notch_out + K.notch_per_lobed * lobed ], [ -plan.base, K.base_out ],
            [ -plan.base * K.base_end, 0 ]
          ];
    const fringe = plan.fringe;
    FRINGE_KNOTS.forEach((knot, k) => knot.forEach((v, d) => {
      knots[SIDE_KNOT.shoulder + k][d] += (v - knots[SIDE_KNOT.shoulder + k][d]) * fringe;
    }));
    const points = knots.map(q => at(...q)),
          rounds = SIDE_ROUND.plain.map(
              (v, k) =>
                  (k === SIDE_KNOT.tip ? SIDE_ROUND.tip + SIDE_ROUND.tip_per_leading * plan.leading
                                       : v) *
                      (1 - fringe) +
                  SIDE_ROUND.fringed[k] * fringe);
    shape.curves = fishClosedCurves(points, rounds);
    shape.upper = shape.curves[0];
    shape.inner = [ points[SIDE_KNOT.base], points[SIDE_KNOT.notch], points[SIDE_KNOT.trail] ];
    shape.root = at(-plan.base * SIDE_FIN.root_at, 0);
    shape.x = root[0];
    shape.y = root[1];
    shape.tx = points[SIDE_KNOT.tip][0];
    shape.ty = points[SIDE_KNOT.tip][1];
  }

  cache.set(key, shape);
  return shape;
}
