import {ATELIER_LIMITS, FIN_STROKE, MOTOR_KIND} from '../../schema.js';
import {isPelvicMuscle, musclePlaces, organFunction} from '../model/organs.js';
import {
  BODY_FRAME,
  halfWidth,
  sideOf,
  sideSign,
  findSite,
  sitePoint,
  centroid
} from '../model/layout.js';
import {finStroke, sprintNodes, usedSites} from '../model/document.js';
import {FIN_BASE, HEAD, PELVIC_BASE, skinAt, SNOUT_TIP} from './frame.js';
import {fixed} from './markup.js';

const MUSCLE_TONE = Object.freeze({
  [MOTOR_KIND.forward] : '#7eabe4',
  [MOTOR_KIND.turn] : '#b99ddf',
  [MOTOR_KIND.suction] : '#ebbd7a',
  [MOTOR_KIND.aggression] : '#82d5cb'
});
const PELVIC_TONE = '#df9dc4';
export const workTone = ({code, pelvic}) => pelvic ? PELVIC_TONE : MUSCLE_TONE[code];
// The works a muscle can do, each with its own place on each side: the pelvic fins behind the
// pectoral fins are fins of their own.
export const WORKS = Object.freeze([
  {code : MOTOR_KIND.aggression, pelvic : false}, {code : MOTOR_KIND.suction, pelvic : false},
  {code : MOTOR_KIND.turn, pelvic : false}, {code : MOTOR_KIND.turn, pelvic : true},
  {code : MOTOR_KIND.forward, pelvic : false}
].map(Object.freeze));
// A muscle is drawn as one band, not cell by cell: its length grows with the number of nodes and
// saturates, and a few schematic segments stand for all of them.
const BAND = Object.freeze({half_fill : 8, segments : 24});
export const muscleSegments = count => Math.max(1, Math.min(count, BAND.segments));
function muscleBuild(organ) {
  const count = organ.centers.length;
  const copies = organ.centers.reduce((sum, c) => sum + c.copies, 0) / Math.max(1, count);
  return {fill : count / (count + BAND.half_fill), strength : copies / ATELIER_LIMITS.max_copies};
}
const SHAPE = Object.freeze({
  tail : {
    stalk : [ 470, 897 ],
    depth : .84,
    length : [ 120, 410 ],
    thick : [ .18, .2 ],
    steps : 32,
    mark : .92,
    lean : .5
  },
  fin : {inset : 6, reach : [ 22, 10 ], width : [ 3.5, 3 ]},
  pelvic : {inset : 4, reach : [ 17, 8 ], width : [ 3, 2.5 ]},
  jaw : {at : .9, length : [ 44, 26 ], width : [ 5, 4 ]},
  throat : {after : 12, length : [ 45, 35 ], off : 11, width : [ 3, 3 ]}
});
const grow = ([ least, span ], share) => least + span * share;
const point = (x, y) => fixed(x) + ' ' + fixed(y);
const mouthAt = () => ({x : SNOUT_TIP.x + HEAD.mouth_in, y : SNOUT_TIP.y});
function spindle(from, to, width, cells) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const at = (t, across) =>
      ({x : from.x + dx * t - dy / length * across, y : from.y + dy * t + dx / length * across});
  const p = (t, across = 0) => {
    const q = at(t, across);
    return point(q.x, q.y);
  };
  const count = Math.max(4, muscleSegments(cells));
  return {
    from,
    to,
    path : 'M' + p(0) + ' C' + p(.2, width) + ' ' + p(.8, width) + ' ' + p(1) + ' C' +
               p(.8, -width) + ' ' + p(.2, -width) + ' ' + p(0) + 'Z',
    marks : Array.from({length : count},
                       (_, k) => {
                         const across = (2 * (k + .5) / count - 1) * width * .8;
                         return 'M' + p(.07, across * .25) + ' C' + p(.3, across) + ' ' +
                                p(.7, across) + ' ' + p(.93, across * .25);
                       }),
    nodeAt : t => at(.5 + .18 * Math.sin(t * 2 * Math.PI), (2 * t - 1) * width * .6)
  };
}
function workShape(code, side, {fill, strength}, nodes, stroke = FIN_STROKE.back, pelvic = false,
                   position = null) {
  const s = sideSign(side), count = muscleSegments(nodes), along = k => (k + .5) / count;
  if (code === MOTOR_KIND.forward) {
    const T = SHAPE.tail, end = position ? position.x + grow(T.length, fill) / 2 : T.stalk[1],
          start = Math.max(T.stalk[0], end - grow(T.length, fill));
    const dy = position
                   ? position.y - (BODY_FRAME.middle + s * halfWidth((start + end) / 2) * T.depth)
                   : 0;
    const at = x => BODY_FRAME.middle + s * halfWidth(x) * T.depth + dy,
          half = x => halfWidth(x) * grow(T.thick, strength) / 2 *
                      Math.max(0, Math.sin(Math.PI * (x - start) / (end - start))) ** .25;
    const top = [], bottom = [];
    for (let k = 0; k <= T.steps; ++k) {
      const x = start + (end - start) * k / T.steps;
      top.push(point(x, at(x) - half(x)));
      bottom.unshift(point(x, at(x) + half(x)));
    }
    const marks = Array.from({length : count}, (_, k) => {
      const x = start + (end - start) * along(k), y = at(x), w = half(x) * T.mark,
            back = w * T.lean;
      return 'M' + point(x + back, y - w) + ' L' + point(x - back, y - w * .5) + ' L' +
             point(x, y) + ' L' + point(x - back, y + w * .5) + ' L' + point(x + back, y + w);
    });
    return {
      path : 'M' + top.join(' L') + ' L' + bottom.join(' L') + 'Z',
      from : {x : start, y : at(start)},
      to : {x : end, y : at(end)},
      marks,
      fibres : [ -.45, .45 ].map(
          across => 'M' + Array
                              .from({length : T.steps + 1},
                                    (_, k) => {
                                      const x = start + (end - start) * k / T.steps;
                                      return point(x, at(x) + across * half(x));
                                    })
                              .join(' L')),
      nodeAt : t => {
        const x = start + (end - start) * t;
        return {x, y : at(x)};
      }
    };
  }
  if (code === MOTOR_KIND.turn) {
    const F = pelvic ? SHAPE.pelvic : SHAPE.fin, B = pelvic ? PELVIC_BASE : FIN_BASE,
          x = position?.x ?? B.at + B.length / 2, y = position?.y ?? skinAt(x, s) - s * F.inset;
    const direction = stroke === FIN_STROKE.front ? -1 : 1,
          reach = grow(F.reach, (fill + strength) / 2);
    return spindle({x : x + direction * reach, y : y - s * (reach * .65 + 4)},
                   {x : x + direction * 3, y : y - s * 2}, grow(F.width, strength), nodes);
  }
  const mouth = mouthAt();
  if (code === MOTOR_KIND.aggression) {
    const J = SHAPE.jaw, x = position?.x ?? mouth.x + HEAD.jaw_back * J.at,
          y = position?.y ?? mouth.y + s * (HEAD.mouth[1] + HEAD.jaw_spread * J.at),
          half = grow(J.length, fill) / 2;
    return spindle({x : x - half, y : y - s * half * .32}, {x : x + half, y : y + s * half * .32},
                   grow(J.width, strength), nodes);
  }
  if (code === MOTOR_KIND.suction) {
    const P = SHAPE.throat,
          a = position ? position.x - grow(P.length, fill) / 2 : mouth.x + HEAD.mouth[0] + P.after,
          end = a + grow(P.length, fill);
    const y = position?.y ?? BODY_FRAME.middle + s * P.off;
    return spindle({x : a, y}, {x : end, y : y + s * 5}, grow(P.width, strength), nodes);
  }
  return null;
}
// The segments at the end of the band stand for the sprint nodes.
export function muscleAttachment(organ, sites) {
  if (organ.position)
    return organ.position;
  if (organFunction(organ, sites) !== MOTOR_KIND.turn)
    return null;
  const places = organ.centers.map(c => findSite(sites, c.site)).filter(Boolean);
  const u = places.reduce((sum, s) => sum + 1 - s.u, 0) / Math.max(1, places.length);
  const x = isPelvicMuscle(organ) ? 665 + u * 85 : 435 + u * 65;
  return {x, y : skinAt(x, sideOf(organ)) - sideOf(organ) * 8};
}
export function finAttachments(state) {
  const result = {};
  for (const organ of state.document.organs.filter(
           o => o.type === 'muscle' && organFunction(o, state.sites) === MOTOR_KIND.turn)) {
    const index = 1 + (sideOf(organ) > 0 ? 1 : 0) + (isPelvicMuscle(organ) ? 2 : 0);
    if (!result[index] || finStroke(organ) === FIN_STROKE.back)
      result[index] = muscleAttachment(organ, state.sites);
  }
  return result;
}
export function muscleShape(organ, sites) {
  const code = organFunction(organ, sites);
  const shape = workShape(code, sideOf(organ), muscleBuild(organ), organ.centers.length,
                          code === MOTOR_KIND.turn ? finStroke(organ) : FIN_STROKE.back,
                          isPelvicMuscle(organ), muscleAttachment(organ, sites));
  if (!shape)
    return null;
  const sprint = sprintNodes(organ), count = shape.marks.length,
        reserved = sprint ? Math.max(1, Math.round(count * sprint / organ.centers.length)) : 0;
  return {
    ...shape,
    marks : shape.marks.slice(0, count - reserved),
    sprint : shape.marks.slice(count - reserved)
  };
}
// Every node sits on the segment that stands for it, so wires split into the segments only.
export function muscleNode(organ, index, sites) {
  const shape = muscleShape(organ, sites);
  if (!shape)
    return null;
  const count = organ.centers.length, segments = muscleSegments(count),
        share = (Math.floor(index * segments / Math.max(1, count)) + .5) / segments;
  return shape.nodeAt ? shape.nodeAt(share) : {
    x : shape.from.x + (shape.to.x - shape.from.x) * share,
    y : shape.from.y + (shape.to.y - shape.from.y) * share
  };
}

const HOME = Object.freeze({fill : .5, strength : .5});
export function muscleHomes(doc, sites) {
  const used = usedSites(doc);
  return [ -1, 1 ].flatMap(side => WORKS.map(({code, pelvic}) => {
    const organ =
        doc.organs.find(o => o.type === 'muscle' && sideSign(o.side) === side &&
                             organFunction(o, sites) === code && isPelvicMuscle(o) === pelvic) ??
        null;
    const shape =
        organ ? muscleShape(organ, sites) : workShape(code, side, HOME, 1, FIN_STROKE.back, pelvic);
    const free = musclePlaces(sites, code, side, pelvic).filter(s => !used.has(s.id));
    const middle = {x : (shape.from.x + shape.to.x) / 2, y : (shape.from.y + shape.to.y) / 2};
    return {code, pelvic, side, organ, shape, free, middle};
  }));
}
export function muscleTarget(doc, sites, position) {
  const homes = muscleHomes(doc, sites).filter(h => h.organ || h.free.length);
  if (!homes.length)
    return null;
  const distance = p => Math.hypot(p.x - position.x, p.y - position.y);
  return homes.reduce((best, h) => distance(h.middle) < distance(best.middle) ? h : best);
}
