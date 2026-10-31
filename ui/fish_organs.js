import {fishFinShapes, fishRearFinShape} from './fish_fins.js';
import {fishAlong, fishAnatomy, fishForm, fishOrganSpan} from './fish_forms.js';
import {
  fishBezier,
  fishBodyCurves,
  fishCurveReverse,
  fishFlank,
  fishHeadCurve,
  fishHeadCurves,
  fishPlan,
  fishPlanPhase,
  fishPlans,
  fishRegion
} from './fish_geometry.js';
export const fish_organsState = {};

function rawFishEye(a, side) {
  const f = fishForm(a, 's0', side);
  if (!f.weight)
    return {x : 0, y : 0, r : 0, rx : 0, ry : 0, pupil : 0};
  const location = a.forms[1 + side], rx = a.eyeScale * location[8], ry = a.eyeScale * location[9];
  return {
    x : (a.origin?.[0] || 0) + a.eyeScale * location[6],
    y : ((a.origin?.[1] || 0) + a.eyeScale * location[7]) *
            Math.max(0, Math.min(.88, a.eyeOffset * f.x / 2.4)),
    r : Math.max(rx, ry),
    rx,
    ry,
    pupil : location[10]
  };
}

export function fishEye(a, side) {
  const eye = rawFishEye(a, side), other = rawFishEye(a, 1 - side);
  if (!eye.r)
    return eye;
  const sign = side ? 1 : -1;
  // Include the outer socket; the free gap is half the larger eye diameter.
  const clearance = other.r ? 1.16 * (eye.ry + other.ry) + Math.max(eye.r, other.r) : 0;
  eye.y = sign * Math.max(Math.abs(eye.y), clearance / 2);
  const pull = a.eyePull?.[side] ?? 1;
  eye.x = (a.origin?.[0] || 0) + (eye.x - (a.origin?.[0] || 0)) * pull;
  eye.y = (a.origin?.[1] || 0) + (eye.y - (a.origin?.[1] || 0)) * pull;
  const head = fishBezier(fishHeadCurves(a, side)[0], .55);
  eye.baseX = head[0];
  eye.baseY = head[1] * .72;
  return eye;
}

export function fishBarbelCurve(a, side) {
  const sign = side ? 1 : -1, f = fishForm(a, 's1', side), plan = fishPlan(a, 'barbel', f),
        root = fishBezier(fishHeadCurves(a, side)[0], plan[3]),
        length = (.22 + .35 * a.barbelSides[side] + .20 * f.sy) * plan[0],
        tip = [ root[0] + length * plan[1], root[1] + sign * length * plan[2] ],
        control = [ root[0] + length * (.2 + .45 * plan[1]), root[1] + sign * length * plan[4] ];
  return [ root, control, tip ];
}

export function fishBarbel(a, side, t) {
  const [p, c, q] = fishBarbelCurve(a, side), u = 1 - t;
  return [
    u * u * p[0] + 2 * u * t * c[0] + t * t * q[0] - .04 * t * t * (a.waterMotion || 0),
    u * u * p[1] + 2 * u * t * c[1] + t * t * q[1] +
        (a.staticBarbel ? 0
                        : t * t * (.025 + .055 * (a.waterMotion || 0)) *
                              Math.sin((a.animationPhase || 0) * .73 - t * 2 + (side ? 1 : -1)))
  ];
}

export function fishNoseShape(a, side) {
  const amount = a.noseSides[side], f = fishForm(a, 's1', side), plan = fishPlan(a, 'nose', f),
        p = fishBezier(fishHeadCurves(a, side)[0],
                       Math.max(.12, Math.min(.88, plan[0] + .22 * (f.y - .5))));
  return {
    x : p[0],
    y : p[1] * plan[1],
    rx : Math.min(a.faceLength * .28, (.025 + .065 * amount) * (.7 + f.sy) * plan[2]),
    ry : Math.min(a.faceWidth * .30, (.025 + .04 * amount) * plan[3])
  };
}

export function fishNosePoint(a, side, direction, hue) {
  const q = fishNoseShape(a, side), angle = Math.PI + direction, band = .25 + .6 * hue / 360;
  return [ q.x + q.rx * band * Math.cos(angle), q.y + q.ry * band * Math.sin(angle) ];
}

export function fishNosePath(g, r, a, side) {
  const q = fishNoseShape(a, side);
  g.beginPath();
  g.ellipse(q.x * r, q.y * r, q.rx * r, q.ry * r, 0, 0, Math.PI * 2);
}

export function fishGameteShape(a, kind) {
  const fill = kind === 3 ? a.filled : a.spermFilled, f = fishForm(a, 'm' + kind),
        neural = Math.pow(1 + f.weight / 8, .26), elongation = .65 + .75 * f.z + .65 * f.sy;
  if (kind === 3)
    return {
      x : a.chestBack - a.hindLength * a.hindPeak,
      y : 0,
      rx : a.eggOrganRadius,
      ry : a.eggOrganRadius,
      yolkRadius : a.eggRadius,
      fill
    };
  const p = fishFlank(a, 0, .79);
  return {
    x : p[0],
    y : p[1] * .45,
    rx : Math.min(.16 * a.hindLength, (.06 * neural + .06 * fill) * elongation),
    ry : Math.min(Math.abs(p[1]) * .18, (.018 * neural + .03 * fill) / Math.sqrt(elongation)),
    fill
  };
}

export function fishReserveShape(a) {
  const f = fishForm(a, 's10'), x = a.chestBack - .04, neural = Math.pow(1 + f.weight / 8, .22);
  return {
    x,
    y : 0,
    rx : Math.max(.045, .72 * a.joinWidth) * (.9 + .1 * neural),
    ry : (.035 + .065 * Math.sqrt(a.reserve)) * (.8 + .2 * neural),
    bend : .035 + .08 * f.z + .06 * f.sy,
    fill : a.reserve
  };
}

export function fishReservePoint(a, t, across = 0) {
  const q = fishReserveShape(a), u = 2 * t - 1;
  return [
    q.x + q.bend * (1 - u * u) + q.ry * across * Math.sqrt(Math.max(0, 1 - u * u)), q.y + q.rx * u
  ];
}

export function fishSwimBladderShape(a) {
  const q = fishBladderShape(a), f = fishForm(a, 'm8');
  return {
    x : q.x + .08 * a.chestLength,
    y : -q.y,
    rx : q.rx * (1.25 + .20 * f.sy),
    ry : q.ry * 1.4
  };
}

export function fishSatietyShape(a) {
  const front = a.headBack - .025, back = a.chestBack + .07 * a.chestLength, x = (front + back) / 2,
        half = Math.max(.03, (front - back) / 2),
        breadth = Math.max(.035, Math.min(a.shoulder, a.joinWidth) * .72),
        turns = .5 + 2.5 * (a.gutLength || 0),
        tube = Math.min(.024 + .032 * Math.sqrt(a.gutFilling || 0), half / (turns * 5));
  return {x, y : breadth * .3, rx : half, ry : breadth * .48, turns, tube};
}

export function fishGutPoint(a, t, across = 0) {
  const q = fishSatietyShape(a), phase = 2 * Math.PI * q.turns * t, x = q.x + q.rx * (1 - 2 * t),
        y = q.y + q.ry * Math.sin(phase), dx = -2 * q.rx,
        dy = q.ry * 2 * Math.PI * q.turns * Math.cos(phase),
        length = Math.max(.001, Math.hypot(dx, dy));
  return [ x - dy / length * q.tube * across, y + dx / length * q.tube * across ];
}

export function fishGutPath(g, r, a) {
  g.beginPath();
  const steps = 24 + Math.ceil(48 * (a.gutLength || 0));
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

export function fishGlandShape(a) {
  const f = fishForm(a, 'm9'), size = .8 + .35 * Math.sqrt(f.weight / (4 + f.weight));
  return {
    x : a.headBack - .025,
    y : -.28 * a.shoulder,
    rx : .055 * size,
    ry : Math.min(.05 * size, .22 * a.shoulder)
  };
}

export function fishGlandPath(g, r, a, append = false) {
  const q = fishGlandShape(a);
  if (!append)
    g.beginPath();
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 32; ++i) {
      const t = i * Math.PI / 16, lobe = .88 + .12 * Math.cos(t * 5),
            x = q.x + q.rx * (side * .48 + .6 * lobe * Math.cos(t)),
            y = q.y + q.ry * lobe * Math.sin(t);
      if (i)
        g.lineTo(x * r, y * r);
      else
        g.moveTo(x * r, y * r);
    }
    g.closePath();
  }
}

export function fishPainShape(a, side) {
  const f = fishForm(a, 's9', side), p = fishFlank(a, side, .19 + .08 * f.y);
  return {
    x : p[0],
    y : 1.1 * p[1] + (side ? .02 : -.02),
    rx : .035 + .02 * f.sy,
    ry : .022 + .009 * f.x
  };
}

export function fishBladderShape(a) {
  const f = fishForm(a, 's7'), p = fishFlank(a, 1, .12 + .23 * f.y);
  return {
    x : p[0],
    y : .65 * p[1],
    rx : Math.min(a.chestLength * .18, .06 + .12 * f.sy + .04 * f.y),
    ry : Math.min(.035 + .055 * f.x, .13 * p[1])
  };
}

export function fishReservePath(g, r, a) {
  const q = fishReserveShape(a), x = q.x, y = q.y, w = q.ry, h = q.rx, b = -q.bend;
  g.beginPath();
  g.moveTo((x - w * .3) * r, (y - h) * r);
  g.bezierCurveTo((x - b - w) * r, (y - h * .55) * r, (x - b - w) * r, (y + h * .55) * r,
                  (x - w * .3) * r, (y + h) * r);
  g.quadraticCurveTo(x * r, (y + h + w * .3) * r, (x + w * .3) * r, (y + h) * r);
  g.bezierCurveTo((x - b + w) * r, (y + h * .55) * r, (x - b + w) * r, (y - h * .55) * r,
                  (x + w * .3) * r, (y - h) * r);
  g.quadraticCurveTo(x * r, (y - h - w * .3) * r, (x - w * .3) * r, (y - h) * r);
  g.closePath();
}

export function fishSurfacePoint(a, side, t, layer) {
  const p = fishFlank(a, side, t);
  return [ p[0], p[1] * layer ];
}

export function fishSkinPoint(a, side, t, z = 0, key = 's3') {
  const q = fishOrganSpan(a, key, side);
  return fishSurfacePoint(a, side, .02 + .45 * (q.start + q.span * t),
                          .96 + (.018 + .03 * q.f.sz) * z);
}

export function fishPigmentPoint(a, side, t, z = 0) {
  const q = fishOrganSpan(a, 'm7', side);
  return fishSurfacePoint(a, side, q.start + q.span * t,
                          .45 + .06 * q.f.x + (.06 + .16 * q.f.sz) * z);
}

export function fishLateralPoint(a, side, t) {
  const q = fishOrganSpan(a, 's2', side);
  return fishSurfacePoint(a, side, q.start + q.span * t,
                          .76 + .03 * q.f.x + .015 * Math.sin(t * Math.PI) * q.f.z);
}

function fishTongueShape(a) {
  const f = fishForm(a, 's5');
  return {
    back : fishSatietyShape(a).x + fishSatietyShape(a).rx,
    end : fishSatietyShape(a).y,
    front : fishMouthShape(a).back - .025,
    ry : .020 + .024 * f.sy,
    bow : a.shoulder * .96
  };
}

export function fishTonguePoint(a, t, across = 0) {
  const q = fishTongueShape(a), wave = (a.swallowPose || 0) * .010 * Math.sin(Math.PI * t),
        x = q.front + (q.back - q.front) * t, y = q.end * t + q.bow * .3 * Math.sin(Math.PI * t),
        dx = q.back - q.front, dy = q.end + q.bow * .3 * Math.PI * Math.cos(Math.PI * t),
        length = Math.max(.001, Math.hypot(dx, dy)), width = (q.ry + wave) * across;
  return [ x - dy / length * width, y + dx / length * width ];
}

export function fishTonguePath(g, r, a) {
  g.beginPath();
  for (const side of [-1, 1])
    for (let i = 0; i <= 24; i++) {
      const p = fishTonguePoint(a, side < 0 ? i / 24 : 1 - i / 24, side);
      if (side < 0 && i === 0)
        g.moveTo(p[0] * r, p[1] * r);
      else
        g.lineTo(p[0] * r, p[1] * r);
    }
  g.closePath();
}

export function fishEggDuctCurve(a) {
  if (a.birthDuct)
    return a.birthDuct;
  const q = fishGameteShape(a, 3), end = fishAlong(a, -.82);
  return [
    [ q.x, 0 ], [ q.x - .35 * q.rx, .08 + .55 * q.ry ],
    [ end + .14 * a.bodyStretch, .13 + .07 * q.fill ], [ end, .035 ]
  ];
}

function fishEggDuctWidth(a, t) {
  const phase = a.birthProgress / .55,
        passage = a.birthing && phase <= 1 ? Math.exp(-(((t - phase) / .20) ** 2)) : 0;
  return .024 + .012 * a.muscle(5) + .14 * passage;
}

export function fishEggDuctPoint(a, t, across = 0) {
  const q = fishEggDuctCurve(a), p = fishBezier(q, t), lo = fishBezier(q, Math.max(0, t - .002)),
        hi = fishBezier(q, Math.min(1, t + .002)), dx = hi[0] - lo[0], dy = hi[1] - lo[1],
        length = Math.max(.001, Math.hypot(dx, dy)), width = fishEggDuctWidth(a, t) * across;
  return [ p[0] - dy / length * width, p[1] + dx / length * width ];
}

export function fishEggDuctPath(g, r, a, append = false) {
  if (!append)
    g.beginPath();
  for (const side of [-1, 1])
    for (let i = 0; i <= 20; i++) {
      const p = fishEggDuctPoint(a, side < 0 ? i / 20 : 1 - i / 20, side);
      if (side === -1 && i === 0)
        g.moveTo(p[0] * r, p[1] * r);
      else
        g.lineTo(p[0] * r, p[1] * r);
    }
  const p = fishEggDuctPoint(a, 0, -1);
  g.lineTo(p[0] * r, p[1] * r);
  g.closePath();
}

export function fishEggMuscleFiber(a, t, side) {
  const sign = side ? 1 : -1;
  return [ fishEggDuctPoint(a, t, .22 * sign), fishEggDuctPoint(a, t, 1.15 * sign) ];
}

export function fishSkinPath(g, r, a, side) {
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const p = fishSkinPoint(a, side, i / 24, 1);
    if (i)
      g.lineTo(p[0] * r, p[1] * r);
    else
      g.moveTo(p[0] * r, p[1] * r);
  }
  for (let i = 24; i >= 0; i--) {
    const p = fishSkinPoint(a, side, i / 24, -1);
    g.lineTo(p[0] * r, p[1] * r);
  }
  g.closePath();
}

export function fishInjuryShape(a, side) {
  const f = fishForm(a, 's6', side), p = fishFlank(a, side, .06 + .30 * f.y);
  return {
    x : p[0],
    y : p[1] * .68,
    rx : .035 + .05 * f.sy + .025 * a.size(f.weight),
    ry : .025 + .025 * f.x
  };
}

export function fishInjuryPoint(a, side, t, z) {
  const q = fishInjuryShape(a, side), u = 2 * t - 1;
  return [ q.x + q.rx * .80 * u, q.y + q.ry * .66 * z * Math.sqrt(Math.max(0, 1 - u * u)) ];
}

export function fishInjuryPath(g, r, a, side) {
  const q = fishInjuryShape(a, side);
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const angle = i * Math.PI / 24, wave = .82 + .18 * Math.cos(6 * angle),
          x = q.x + q.rx * wave * Math.cos(angle), y = q.y + q.ry * wave * Math.sin(angle);
    if (i)
      g.lineTo(x * r, y * r);
    else
      g.moveTo(x * r, y * r);
  }
  g.closePath();
}

export function fishMouthShape(a) {
  const signature = [
    a.bitePose, a.swallowPose, a.mouthOpening, a.mouthOffset, a.snout, a.faceWidth, a.aperture,
    a.jaw, a.suction, a.teeth, a.shapePlans?.mouth
  ].join(':');
  if (a.mouthShapeCache?.signature === signature)
    return a.mouthShapeCache.shape;
  const f = fishForm(a, 'm2'), plan = fishPlan(a, 'mouth', f), bite = a.bitePose || 0,
        suction = a.swallowPose || 0, gape = Math.max(0, Math.min(1, a.mouthOpening || 0)),
        open = gape, biteOpen = bite, gap = .0015 + (a.aperture || a.faceWidth * .8) * gape;
  const shape = {
    front : Number.isFinite(a.mouthOffset) ? (a.origin?.[0] || 0) + a.mouthOffset : a.snout,
    back : Math.max(a.headBack + .35 * a.headLength,
                    a.snout - Math.min(a.faceLength * .92, .10 + .24 * a.jaw) -
                        gap * (.45 + .35 * biteOpen) * (1 - .10 * suction)),
    hinge : .0015 + .10 * gap,
    gap,
    lip : .020 + .024 * plan[3] + .035 * a.suction + .035 * suction,
    hook : plan[4] * biteOpen * (1 - .75 * a.teeth),
    gape,
    open,
    bite : biteOpen,
    suction
  };
  const eyeFront = Math.max(...[0, 1].map(side => {
    const eye = fishEye(a, side);
    return eye.rx > 0 ? eye.x + eye.rx * 1.2 : -Infinity;
  }));
  shape.back = Math.min(shape.front - .08, Math.max(shape.back, eyeFront + .035));
  a.mouthShapeCache = {signature, shape};
  return shape;
}

export function fishJawEdge(a, side, t) {
  const q = fishMouthShape(a), sign = side ? 1 : -1, span = q.front - q.back,
        round = Math.min(1, .7 * q.suction + .3 * a.teeth);
  return fishBezier(
      [
        [ q.back, sign * q.hinge ],
        [ q.back + (.35 - .20 * round) * span, sign * (q.hinge + (.50 + .55 * round) * q.gap) ],
        [ q.front - (.14 + .20 * round) * span, sign * q.gap * (1 + .22 * round) + q.hook ],
        [ q.front, sign * q.gap * .83 + q.hook ]
      ],
      t);
}

export function fishMouthContour(a, steps = 16) {
  const q = fishMouthShape(a), points = [];
  for (let side = 0; side < 2; side++) {
    if (side === 1) {
      const top = fishJawEdge(a, 0, 1), bottom = fishJawEdge(a, 1, 1);
      for (let k = 1; k < 5; k++) {
        const t = k / 5, u = 1 - t;
        points.push([
          u * u * top[0] + 2 * u * t * (q.front + q.gap * .48 * q.suction) + t * t * bottom[0],
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

export function fishMouthInterior(g, r, a) {
  const q = fishMouthShape(a);
  if (r < 22 || q.gape < .08)
    return;
  g.save();
  fishMouthPath(g, r, a);
  g.clip();
  g.fillStyle = '#633b49';
  g.globalAlpha = .75;
  g.beginPath();
  g.ellipse((q.back + .08 * (q.front - q.back)) * r, 0,
            Math.max(.008, (q.front - q.back) * .22) * r, q.gap * .65 * r, 0, 0, 2 * Math.PI);
  g.fill();
  g.strokeStyle = '#c09585';
  g.lineWidth = Math.max(.5, r * .003);
  g.globalAlpha = .5;
  for (const side of [0, 1])
    for (let i = 0; i < 5; ++i) {
      const t = .12 + i * .1, p = fishJawEdge(a, side, t), sign = side ? 1 : -1;
      g.beginPath();
      g.moveTo(p[0] * r, p[1] * .85 * r);
      g.quadraticCurveTo((p[0] - .02) * r, p[1] * .6 * r, (p[0] - .035) * r,
                         sign * q.gap * .18 * r);
      g.stroke();
    }
  g.fillStyle = '#eadbb5';
  g.strokeStyle = '#7d6958';
  g.globalAlpha = .95;
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

export function fishSuctionFlow(g, r, a) {
  const q = fishMouthShape(a);
  if (q.suction < .08 || r < 16)
    return;
  g.save();
  g.strokeStyle = '#b3dce3';
  g.globalAlpha = .42 * q.suction;
  g.lineWidth = Math.max(.6, r * .005);
  g.beginPath();
  for (const lane of [-1, 0, 1]) {
    const x = q.front + .08 + .18 * (1 - q.suction), y = lane * (q.gap + .10);
    g.moveTo((x + .14) * r, y * r);
    g.quadraticCurveTo((x + .04) * r, y * .65 * r, (q.front + .012) * r, lane * q.gap * .55 * r);
  }
  g.stroke();
  g.restore();
}

export function fishGametePath(g, r, a, kind) {
  const q = fishGameteShape(a, kind);
  g.beginPath();
  if (kind === 3)
    g.ellipse(q.x * r, q.y * r, q.rx * r, q.ry * r, 0, 0, 2 * Math.PI);
  else {
    g.moveTo((q.x + q.rx * .88) * r, (q.y - q.ry * .42) * r);
    g.bezierCurveTo((q.x + q.rx * 1.12) * r, (q.y - q.ry * .32) * r, (q.x + q.rx * 1.12) * r,
                    (q.y + q.ry * .32) * r, (q.x + q.rx * .88) * r, (q.y + q.ry * .42) * r);
    g.bezierCurveTo((q.x + q.rx * .30) * r, (q.y + q.ry) * r, (q.x - q.rx) * r, (q.y + q.ry) * r,
                    (q.x - q.rx) * r, q.y * r);
    g.bezierCurveTo((q.x - q.rx) * r, (q.y - q.ry) * r, (q.x + q.rx * .30) * r, (q.y - q.ry) * r,
                    (q.x + q.rx * .88) * r, (q.y - q.ry * .42) * r);
    g.closePath();
  }
}

function fishOutlinePoint(a, side, t) {
  if (t < .4)
    return fishBezier(fishHeadCurve(a, side), t / .4);
  return fishFlank(a, side, (t - .4) / .6);
}

export function fishDefenseSpines(a, side) {
  const capacity = a.organs[32 + side] || 0;
  if (capacity <= 0)
    return [];
  const f = fishForm(a, 'm6', side), p = fishPlan(a, 'spine', f),
        count = Math.min(10, Math.max(2, Math.round((2 + .85 * Math.sqrt(capacity)) * p[4]))),
        erect = Math.sqrt(a.defenseActivity),
        length = Math.min(2.1, (.10 + .14 * Math.sqrt(capacity)) * p[0]), result = [];
  for (let i = 0; i < count; i++) {
    const t = .405 + .04 * p[5] + (.40 + .13 * p[6]) * Math.pow((i + .5) / count, .5 + 1.5 * f.y),
          root = fishOutlinePoint(a, side, t), lo = fishOutlinePoint(a, side, t - .004),
          hi = fishOutlinePoint(a, side, t + .004),
          d = Math.max(.001, Math.hypot(hi[0] - lo[0], hi[1] - lo[1])), tx = (hi[0] - lo[0]) / d,
          ty = (hi[1] - lo[1]) / d, sign = side ? 1 : -1, nx = sign * ty, ny = -sign * tx,
          reach = length * (.7 + .3 * Math.sin((i + 1) * Math.PI / (count + 1))),
          base = (.012 + .018 * p[2]),
          tip =
              [
                root[0] + nx * reach * (.55 + .45 * erect) + tx * reach * p[1] * (1 - erect),
                root[1] + ny * reach * (.55 + .45 * erect) + ty * reach * p[1] * (1 - erect)
              ],
          eye = fishEye(a, side);
    if (eye.rx > 0 && root[0] > eye.x - eye.rx - .06)
      continue;
    result.push([
      [ root[0] - tx * base, root[1] - ty * base ],
      [
        root[0] + nx * reach * .45 - tx * base + tx * reach * p[3],
        root[1] + ny * reach * .45 - ty * base + ty * reach * p[3]
      ],
      tip, [ root[0] + nx * reach * .35 + tx * base, root[1] + ny * reach * .35 + ty * base ],
      [ root[0] + tx * base, root[1] + ty * base ]
    ]);
  }
  return result;
}

export function fishGillShape(a, side, pump = 0) {
  const sign = side ? 1 : -1, x = a.headBack + .12 * a.headLength,
        width = a.neckWidth * (.62 + .10 * pump), lift = .018 + .035 * pump;
  return [
    [ x + .11 * a.headLength, sign * width * .55 ],
    [ x - .12 * a.headLength - lift, sign * width * .70 ],
    [ x - .08 * a.headLength - lift, sign * width * 1.30 ],
    [ x + .13 * a.headLength, sign * width * 1.38 ]
  ];
}

export function fishSuctionShape(a) {
  const mouth = fishMouthShape(a), f = fishForm(a, 'm2'),
        front = Math.max(a.headFront + .015, mouth.back + .02);
  return {
    front,
    back : Math.max(a.headFront - .04, front - (.06 + .07 * a.jaw + .02 * f.sy)),
    ry : Math.min(a.faceWidth * .48, (.035 + .04 * a.jaw) * (1 + .5 * (a.swallowPose || 0)))
  };
}

export function fishSuctionPath(g, r, a, append = false) {
  const q = fishSuctionShape(a), mid = (q.front + q.back) / 2;
  if (!append)
    g.beginPath();
  g.moveTo(q.front * r, 0);
  g.bezierCurveTo(q.front * r, -q.ry * .85 * r, mid * r, -q.ry * r, q.back * r, -q.ry * .45 * r);
  g.quadraticCurveTo((q.back - .025) * r, 0, q.back * r, q.ry * .45 * r);
  g.bezierCurveTo(mid * r, q.ry * r, q.front * r, q.ry * .85 * r, q.front * r, 0);
  g.closePath();
}

export function fishJawFiber(a, side, t) {
  const sign = side ? 1 : -1, q = fishSuctionShape(a),
        x = q.back + (q.front - q.back) * (.16 + .68 * t),
        y = sign * q.ry * (.48 + .15 * Math.sin(Math.PI * t));
  return [ [ x - .035, y * .45 ], [ x + .035, y * 1.10 ] ];
}

export function fishJawMusclePath(g, r, a, side, append = false) {
  const sign = side ? 1 : -1, q = fishSuctionShape(a);
  if (!append)
    g.beginPath();
  g.moveTo(q.back * r, sign * q.ry * .45 * r);
  g.bezierCurveTo((q.back + .07) * r, sign * q.ry * r, (q.front - .07) * r, sign * q.ry * r,
                  q.front * r, 0);
  g.lineTo((q.front - .025) * r, 0);
  g.bezierCurveTo((q.front - .08) * r, sign * q.ry * .45 * r, (q.back + .07) * r,
                  sign * q.ry * .45 * r, q.back * r, sign * q.ry * .18 * r);
  g.closePath();
}

export function fishGlyphPoints(a) {
  const curves = [...fishBodyCurves(a) ];
  for (const side of [0, 1])
    curves.push(...fishRearFinShape(a, side));
  for (let i = 0; i < 3; i++)
    if (a.fin(i)[1] > 0)
      for (const f of fishFinShapes(a, i))
        curves.push(...f.curves);
  const points = curves.flatMap(q => Array.from({length : 5}, (_, k) => fishBezier(q, k / 4)));
  for (const side of [0, 1]) {
    const e = fishEye(a, side);
    points.push([ e.x - e.rx, e.y - e.ry ], [ e.x + e.rx, e.y + e.ry ]);
    if (a.barbelSides[side])
      for (let k = 0; k <= 4; k++)
        points.push(fishBarbel(a, side, k / 4));
    for (const spike of fishDefenseSpines(a, side))
      points.push(...spike);
  }
  const mouth = fishMouthShape(a);
  points.push([ mouth.front, mouth.gap + mouth.lip ], [ mouth.front, -mouth.gap - mouth.lip ]);
  return points;
}

export function fishGlyphBounds(a, angle = 0) { return fishPointBounds(fishGlyphPoints(a), angle); }

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
    width : Math.max(.1, right - left),
    height : Math.max(.1, bottom - top),
    cx : (left + right) / 2,
    cy : (top + bottom) / 2
  };
}

export function fishPreviewBounds(a, angle = 0) {
  // Fit the full motion envelope, independently of the current muscle pulses.
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
  for (const x of [a.snout + .01, mouth.front + .24 * mouth.gap])
    points.push([ x, -halfHeight ], [ x, halfHeight ]);
  // Fin control points vary linearly with activation. Their endpoint hulls also
  // enclose every intermediate pose, including both directions of the tail stroke.
  for (const active of [0, 1]) {
    pose.finPose = () => active;
    for (let i = 0; i < 3; i++)
      if (a.fin(i)[1] > 0)
        for (const fin of fishFinShapes(pose, i))
          points.push(...fin.curves.flat());
  }
  pose.tailDirection = -1;
  if (a.fin(0)[1] > 0)
    for (const fin of fishFinShapes(pose, 0))
      points.push(...fin.curves.flat());
  pose.defenseActivity = 1;
  for (const side of [0, 1])
    points.push(...fishDefenseSpines(pose, side).flat());
  return fishPointBounds(points, angle);
}

export function fishPreviewPose(p, width, height, desired, angle = 0) {
  const a = fishAnatomy(p), bounds = fishPreviewBounds(a, angle),
        r = Math.min(desired, (width - 12) / bounds.width, (height - 12) / bounds.height);
  return {a, r, x : width / 2 - bounds.cx * r, y : height / 2 - bounds.cy * r};
}

function fishDisplayLength(a) {
  if (a.displayLength !== undefined)
    return a.displayLength;
  const rear = a.fin(0)[1] > 0 ? Math.min(fishAlong(a, -.96),
                                          ...fishFinShape(a, 0).curves.flat().map(p => p[0]))
                               : fishAlong(a, -.96);
  return a.displayLength =
             Math.max(.1, (a.jaw || a.attack ? fishMouthShape(a).front : a.snout) - rear);
}

function fishCheekShape(a, side = -1) {
  const f = fishForm(a, 'm5'), power = side < 0 ? a.attack : a.attackSides[side],
        root = [ a.headFront + .08 * a.faceLength, a.faceWidth * .35 ],
        end = fishJawEdge(a, 1, .27);
  return {
    root,
    end,
    reach : Math.hypot(end[0] - root[0], end[1] - root[1]),
    base : .015 + .075 * power + .035 * f.sy,
    activation : a.bitePose || 0,
    hinges : 1,
    angles : [ 0 ],
    sweep : .15,
    bodyLength : fishDisplayLength(a),
    size : power
  };
}

export function fishCheekPoint(a, side, t, across = .5) {
  const jaw = fishJawEdge(a, side, t), skin = fishBezier(fishHeadCurves(a, side)[0], 1 - t),
        padding = (side ? 1 : -1) * (.025 + .04 * a.jaw) * Math.sin(Math.PI * t);
  return [
    skin[0] + (jaw[0] - skin[0]) * across,
    skin[1] + (jaw[1] - skin[1]) * across + padding * Math.sin(Math.PI * across)
  ];
}

export function fishGlyphExtent(a) {
  if (a.glyphExtent !== undefined)
    return a.glyphExtent;
  let extent = Math.max(a.snout + .8, Math.abs(fishAlong(a, -1.05)), 1.8 * a.shoulder,
                        1.8 * Math.max(...a.flank) + 2.5);
  for (const side of [0, 1]) {
    for (const p of fishRearFinShape(a, side).flat())
      extent = Math.max(extent, Math.abs(p[0]) + Math.abs(p[1]));
    if (a.barbelSides[side])
      for (const p of fishBarbelCurve(a, side))
        extent = Math.max(extent, Math.abs(p[0]) + Math.abs(p[1]));
  }
  const maximum = a.finMaximum ??= {...a, finShapeCache : null, finPose : () => 1};
  for (let index = 0; index < 3; index++)
    if (a.fin(index)[1] > 0)
      for (const f of fishFinShapes(maximum, index))
        for (const q of f.curves)
          for (const p of q)
            extent = Math.max(extent, Math.abs(p[0]) + Math.abs(p[1]));
  return a.glyphExtent = extent;
}

export function fishGillFolds(g, r, a, side) {
  const shape = fishCheekShape(a, side);
  g.beginPath();
  if (shape.reach * r < .05)
    return;
  for (let ray = 0; ray <= 6; ray++) {
    const across = ray / 6, p = fishCheekPoint(a, side, .10, across);
    g.moveTo(p[0] * r, p[1] * r);
    for (let i = 1; i <= 8; i++) {
      const q = fishCheekPoint(a, side, .10 + .87 * i / 8, across);
      g.lineTo(q[0] * r, q[1] * r);
    }
  }
  for (let joint = 1; joint <= shape.hinges; joint++) {
    const t = joint / (shape.hinges + 1);
    for (let i = 0; i <= 16; i++) {
      const p = fishCheekPoint(a, side, t, i / 16);
      if (i)
        g.lineTo(p[0] * r, p[1] * r);
      else
        g.moveTo(p[0] * r, p[1] * r);
    }
  }
}

export function fishTeeth(a, side) {
  const f = fishForm(a, 'm5'), power = a.attackSides[side], opening = fishMouthShape(a).gape;
  if (!power || opening < .08)
    return [];
  const q = fishMouthShape(a), count = 2 + Math.round(3 * power + 3 * f.sy + 2 * a.teeth),
        reach = .025 + .17 * power,
        broad = Math.min(.015 + .035 * f.sy, (q.front - q.back) * .32 / count), result = [];
  for (let i = 0; i < count; i++) {
    const t = .22 + .69 * (i + .30 + .4 * side) / count, p = fishJawEdge(a, side, t),
          sign = side ? 1 : -1, tip = reach * (.75 + .25 * Math.sin(Math.PI * t));
    const flat = broad * (.12 + .88 * (a.teeth || 0)),
          height = Math.min(tip * (1 - .42 * (a.teeth || 0)), Math.abs(p[1]) * .68);
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

export function fishCheekPath(g, r, a, side, append = false) {
  if (!append)
    g.beginPath();
  if (fishCheekShape(a, side).reach * r < .05)
    return;
  for (let i = 0; i <= 16; i++) {
    const p = fishCheekPoint(a, side, i / 16, 0);
    if (i)
      g.lineTo(p[0] * r, p[1] * r);
    else
      g.moveTo(p[0] * r, p[1] * r);
  }
  for (let i = 1; i <= 24; i++) {
    const p = fishCheekPoint(a, side, 1, i / 24);
    g.lineTo(p[0] * r, p[1] * r);
  }
  for (let i = 15; i >= 0; i--) {
    const p = fishCheekPoint(a, side, i / 16, 1);
    g.lineTo(p[0] * r, p[1] * r);
  }
  g.closePath();
}

export function fishFinDual(a, index) {
  if (index === 0)
    return 0;
  return fishPlan(a, 'side', fishForm(a, 'm1'))[5];
}

function fishFinPlan(a, index) {
  const name = index === 0 ? 'tail' : 'side', f = fishForm(a, index === 0 ? 'm0' : 'm1', -1),
        n = fishPlans[name].length;
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

function fishFinAttachment(a, index, lobe = 0) {
  const side = index - 1, f = fishRegion(a, 2 + 2 * side + lobe, 'm1', side),
        plan = fishPlan(a, 'side', fishForm(a, 'm1'));
  return lobe ? .505 + .08 * plan[6] + .035 * (1 - f.y)
              : Math.max(.025, Math.min(.44, .025 + .31 * plan[6] + .16 * (1 - f.y)));
}

export function fishFinShape(a, index, lobe = 0) {
  const signature = [
    a.bodyStretch, a.flex, a.shoulder, ...a.flank, a.finPose(0), a.finPose(1), a.finPose(2),
    a.tailDirection, a.deflection
  ].join(':');
  if (!(a.finShapeCache instanceof Map) || a.finShapeCache.forms !== a.forms ||
      a.finShapeCache.signature !== signature) {
    a.finShapeCache = new Map();
    a.finShapeCache.forms = a.forms;
    a.finShapeCache.signature = signature;
  }
  const cache = a.finShapeCache, key = index + ':' + lobe;
  if (cache.has(key))
    return cache.get(key);
  const side = index - 1, dual = fishFinDual(a, index),
        f = index === 0 ? fishForm(a, 'm0') : fishRegion(a, 2 + 2 * side + lobe, 'm1', side),
        plan = fishPlan(a, index === 0 ? 'tail' : 'side', index === 0 ? f : fishForm(a, 'm1')),
        pose = a.finPose(index), cells = a.fin(index)[0], strength = a.fin(index)[1],
        volume = Math.pow(Math.max(.01, .6 * cells + .4 * strength), .37),
        shape = {plan : fishFinPlan(a, index)};
  if (index === 0) {
    const root = [ a.tailRoot, 0 ], length = (.20 + .32 * volume) * plan[0] + .20 * pose,
          width = (.10 + .20 * volume) * plan[1] * (1 - .18 * pose), half = [
            [ 0, 0 ], [ plan[2], -plan[3] ], [ plan[4], -plan[5] ], [ plan[6], -plan[7] ],
            [ plan[8], 0 ]
          ];
    for (let k = 2; k < 4; k++)
      half[k][0] =
          Math.max(half[k][0],
                   Math.abs(half[k][1] * half[k - 1][0] / Math.min(-.001, half[k - 1][1])) * 1.08);
    const knots = [...half, ...half.slice(1, 4).reverse().map(([ u, v ]) => [u, -v]) ],
          points = knots.map(
              ([
                u, v
              ]) => [root[0] - length * u, width * v + .5 * pose * (a.tailDirection ?? 1) * u * u]),
          rounds = [ plan[13], plan[9], plan[10], plan[11], plan[12], plan[11], plan[10], plan[9] ];
    shape.curves = fishClosedCurves(points, rounds);
    shape.upper = shape.curves[0];
    shape.lower = fishCurveReverse(shape.curves[7]);
    shape.root = root;
    shape.width = width;
    shape.x = root[0] - length * Math.max(plan[2], plan[4], plan[6], plan[8]);
    shape.y = 0;
    shape.fork = (Math.max(plan[2], plan[6]) - plan[8]) * length;
    shape.rimRange = [ 1, 6 ];
  } else {
    const sign = side ? 1 : -1, t = fishFinAttachment(a, index, lobe),
          anchor = fishFlank(a, side, t),
          length = 1.3 *
                   Math.min((.16 + .30 * volume) * plan[0], .32 * (a.chestLength + a.hindLength)) *
                   (lobe ? .72 : 1),
          spread = 1.3 * Math.min((.08 + .15 * volume) * plan[1], .03 + .50 * Math.abs(anchor[1])) *
                   (.30 + .70 * pose) * (lobe ? dual : 1),
          root = [ anchor[0], anchor[1] * .98 ],
          at =
              (u,
               v) => [root[0] + length * (u - (.55 - .80 * pose) * v), root[1] + sign * spread * v],
          sweep = plan[3], lobed = fishPlan(a, 'side', fishForm(a, 'm1'))[4], knots = [
            [ 0, 0 ], [ .10, .28 * plan[2] ], [ .20 - .32 * sweep, .85 + .13 * plan[2] ],
            [ -sweep, 1 ], [ -sweep - .24, .48 + .25 * lobed ], [ -.52, .10 + .20 * lobed ],
            [ -plan[7], .025 ], [ -plan[7] * .60, 0 ]
          ];
    const fringe = plan[8],
          lobes = [ [ .12, 1.02 ], [ -.22, .80 ], [ -.53, 1.12 ], [ -.67, .64 ], [ -.87, .70 ] ];
    for (let k = 0; k < 5; k++)
      for (let d = 0; d < 2; d++)
        knots[k + 2][d] += (lobes[k][d] - knots[k + 2][d]) * fringe;
    const points = knots.map(q => at(...q)), rounds = [
      .1, .85 - .15 * fringe, .85 - .55 * fringe,
      (.15 + .60 * plan[2]) * (1 - fringe) + .42 * fringe, .85 - .55 * fringe, .8 - .38 * fringe,
      .4 - .10 * fringe, .2
    ];
    shape.curves = fishClosedCurves(points, rounds);
    shape.upper = shape.curves[0];
    shape.inner = [ points[6], points[5], points[4] ];
    shape.root = at(-plan[7] * .35, 0);
    shape.x = root[0];
    shape.y = root[1];
    shape.tx = points[3][0];
    shape.ty = points[3][1];
    shape.rimRange = [ 1, 6 ];
  }

  cache.set(key, shape);
  return shape;
}

const initializers = {

};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
