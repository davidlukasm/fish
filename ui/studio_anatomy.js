// Render the developed body with the Aquarium's own anatomy geometry.
// A single morphology asset from observations.cc drives both views.
import {ANATOMY, BODY_UNIT, FIN, FIN_SHAPE, FISH, MOTOR_KIND} from './schema.js';
import {fishAnatomy} from './fish_forms.js';
import {BODY_FRAME} from './studio_geometry.js';
import {fishBodyPath, fishFinShapes, fishRearFinShape} from './fish_fins.js';
import {
  fishBarbelCurve,
  fishDefenseSpines,
  fishEggDuctPath,
  fishEye,
  fishGameteShape,
  fishGillShape,
  fishGlandPath,
  fishGutPath,
  fishLateralPoint,
  fishMouthPath,
  fishNoseShape,
  fishSwimBladderShape,
  fishSuctionPath,
  fishTeeth
} from './fish_organs.js';

const anatomyCache = new WeakMap();
const number = value => Number(value).toFixed(5);
const point = p => number(p[0]) + ' ' + number(p[1]);

// The path recorder delegates every anatomical curve to the Aquarium implementation.
function anatomyPath(draw) {
  const steps = [];
  const path = {
    beginPath() { steps.length = 0; },
    moveTo(x, y) { steps.push('M' + number(x) + ' ' + number(y)); },
    lineTo(x, y) { steps.push('L' + number(x) + ' ' + number(y)); },
    bezierCurveTo(x1, y1, x2, y2, x, y) {
      steps.push('C' + [x1, y1, x2, y2, x, y].map(number).join(' '));
    },
    quadraticCurveTo(x1, y1, x, y) {
      steps.push('Q' + [x1, y1, x, y].map(number).join(' '));
    },
    closePath() { steps.push('Z'); }
  };
  draw(path);
  return steps.join(' ');
}
const pathSvg = (kind, path) => '<path class="' + kind + '" d="' + path + '"/>';
const ellipseSvg = (kind, q) => '<ellipse class="' + kind + '" cx="' + number(q.x) +
    '" cy="' + number(q.y) + '" rx="' + number(q.rx) + '" ry="' + number(q.ry) + '"/>';
const polygon = points => 'M' + points.map(point).join(' L') + ' Z';
const trace = (kind, draw) => pathSvg(kind, anatomyPath(draw));

// The engine exports morphology in its fish-column order; all indices come from schema.js.
export function aquariumMorphologySvg(report, fill) {
  const m = report?.morphology;
  if (!Array.isArray(m) || m.length !== 6 || !m[5] || !Array.isArray(m[0]))
    return '';
  const cached = anatomyCache.get(report);
  if (cached?.fill === fill)
    return cached.markup;
  const p = [];
  [FISH.organs, FISH.fins, FISH.forms, FISH.contour, FISH.regions, FISH.body_geometry]
      .forEach((column, index) => { p[column] = m[index]; });
  p[FISH.radius] = 1;
  p[FISH.mass] = 1;
  p[FISH.energy] = BODY_UNIT.adult_reserve;
  p[FISH.reserve_capacity] = BODY_UNIT.adult_reserve;
  p[FISH.egg_capacity] = 1;
  p[FISH.sperm_capacity] = 1;
  p[FISH.neuron_budget] = report.neurons;
  const a = fishAnatomy(p, null, 1, 1, [0, 0]);
  const span = a.snout - a.tailRoot;
  if (!(span > 0) || !Number.isFinite(span))
    return '';
  const scale = (BODY_FRAME.tail - BODY_FRAME.snout) / span;
  const shift = BODY_FRAME.snout + scale * a.snout;
  const eyes = [fishEye(a, 0), fishEye(a, 1)];
  const eyeOrigins = eyes.map(eye => eye.rx > 0 && eye.ry > 0
      ? {x : shift - scale * eye.x, y : BODY_FRAME.middle + scale * eye.y} : null);
  let ink = '';
  for (const fin of [FIN.tail, FIN.left, FIN.right]) {
    if (!(a.fin(fin)[FIN_SHAPE.strength] > 0))
      continue;
    for (const shape of fishFinShapes(a, fin))
      ink += pathSvg('aid-fish-fin', anatomyPath(g => {
        g.beginPath();
        g.moveTo(...shape.curves[0][0]);
        for (const q of shape.curves)
          g.bezierCurveTo(...q[1], ...q[2], ...q[3]);
        g.closePath();
      }));
  }
  if (a.fin(FIN.tail)[FIN_SHAPE.strength] > 0)
    for (const side of [0, 1]) {
      const curves = fishRearFinShape(a, side);
      ink += pathSvg('aid-fish-fin', anatomyPath(g => {
        g.beginPath();
        g.moveTo(...curves[0][0]);
        for (const q of curves)
          g.bezierCurveTo(...q[1], ...q[2], ...q[3]);
        g.closePath();
      }));
    }
  ink += '<g style="fill:' + fill + '">' +
      trace('aid-fish-body', g => fishBodyPath(g, 1, a)) + '</g>';

  if (a.organs[ANATOMY.mouth] > 0) {
    ink += trace('aid-anatomical-mouth', g => fishMouthPath(g, 1, a));
    for (const side of [0, 1]) {
      const gill = fishGillShape(a, side);
      ink += pathSvg('aid-anatomical-lateral', 'M' + point(gill[0]) + ' C' +
          point(gill[1]) + ' ' + point(gill[2]) + ' ' + point(gill[3]));
      for (const tooth of fishTeeth(a, side))
        ink += pathSvg('aid-anatomical-tooth', polygon(tooth));
    }
  }
  if (a.organs[ANATOMY.suction_strength] > 0)
    ink += trace('aid-anatomical-muscle', g => fishSuctionPath(g, 1, a));
  if (a.organs[ANATOMY.satiety] > 0)
    ink += trace('aid-anatomical-gut', g => fishGutPath(g, 1, a));
  if (a.organs[ANATOMY.bladder] > 0)
    ink += ellipseSvg('aid-anatomical-bladder', fishSwimBladderShape(a));
  if (a.organs[ANATOMY.gland] > 0)
    ink += trace('aid-anatomical-gland', g => fishGlandPath(g, 1, a));
  if (a.organs[ANATOMY.eggs] > 0) {
    ink += ellipseSvg('aid-anatomical-gonad', fishGameteShape(a, MOTOR_KIND.eggs));
    ink += trace('aid-anatomical-gonad', g => fishEggDuctPath(g, 1, a));
  }
  if (a.organs[ANATOMY.sperm] > 0)
    ink += ellipseSvg('aid-anatomical-gonad', fishGameteShape(a, MOTOR_KIND.sperm));
  for (const side of [0, 1]) {
    const eye = eyes[side];
    if (eye.rx > 0 && eye.ry > 0) {
      ink += ellipseSvg('aid-anatomical-eye', eye);
      ink += ellipseSvg('aid-anatomical-pupil', {
        x: eye.x, y: eye.y, rx: eye.rx * eye.pupil, ry: eye.ry * eye.pupil
      });
    }
    if (a.noseSides[side] > 0)
      ink += ellipseSvg('aid-anatomical-contact', fishNoseShape(a, side));
    if (a.barbelSides[side] > 0) {
      const [from, control, tip] = fishBarbelCurve(a, side);
      ink += pathSvg('aid-anatomical-barbel', 'M' + point(from) + ' Q' + point(control) +
          ' ' + point(tip));
    }
    if (a.organs[ANATOMY.lateral_left + side] > 0) {
      const positions = Array.from({length: 17}, (_, i) => fishLateralPoint(a, side, i / 16));
      ink += pathSvg('aid-anatomical-lateral', 'M' + positions.map(point).join(' L'));
    }
    for (const spine of fishDefenseSpines(a, side))
      ink += pathSvg('aid-anatomical-spike', 'M' + point(spine[0]) + ' Q' +
          point(spine[1]) + ' ' + point(spine[2]) + ' Q' + point(spine[3]) + ' ' +
          point(spine[4]));
  }
  const markup = '<g class="aid-engine-anatomy" data-engine-morphology="true" transform="matrix(' +
      number(-scale) + ' 0 0 ' + number(scale) + ' ' + number(shift) + ' 365)">' +
      ink + '</g>';
  anatomyCache.set(report, {fill, markup, eyeOrigins});
  return markup;
}

export function aquariumEyePoint(report, side) {
  if (!report)
    return null;
  if (!anatomyCache.has(report))
    aquariumMorphologySvg(report, '#365b5b');
  return anatomyCache.get(report)?.eyeOrigins?.[side] ?? null;
}
