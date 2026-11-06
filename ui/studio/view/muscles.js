import {ATELIER_LIMITS, MOTOR_KIND} from '../../schema.js';
import {musclePlaces, nodeLimit, organFunction} from '../model/organs.js';
import {BODY_FRAME, halfWidth, sideOf, sideSign} from '../model/layout.js';
import {usedSites} from '../model/document.js';
import {FIN_BASE, HEAD, skinAt, SNOUT_TIP} from './frame.js';
import {fixed} from './markup.js';

export const MUSCLE_TONE = Object.freeze({
  [MOTOR_KIND.forward] : '#7eabe4',
  [MOTOR_KIND.turn] : '#b99ddf',
  [MOTOR_KIND.suction] : '#ebbd7a',
  [MOTOR_KIND.aggression] : '#82d5cb'
});
export const WORKS = Object.freeze(
    [ MOTOR_KIND.aggression, MOTOR_KIND.suction, MOTOR_KIND.turn, MOTOR_KIND.forward ]);
export function muscleBuild(organ, sites) {
  const most = nodeLimit(organ, sites), count = organ.centers.length;
  const copies = organ.centers.reduce((sum, c) => sum + c.copies, 0) / Math.max(1, count);
  return {fill : most ? count / most : 0, strength : copies / ATELIER_LIMITS.max_copies};
}
const SHAPE = Object.freeze({
  tail : {
    stalk : [ 690, 880 ],
    depth : .5,
    length : [ 70, 120 ],
    thick : [ .28, .3 ],
    steps : 16,
    mark : .8,
    lean : .5
  },
  fin : {inset : 6, reach : [ 22, 18 ]},
  jaw : {at : .82, size : [ [ 16, 10 ], [ 8, 5 ] ], spread : .8, tilt : .6, fibre : .7},
  throat :
      {after : 4, length : [ 40, 50 ], off : 20, width : [ 12, 10 ], out : 2.2, in : .4, ring : 1.2}
});
const grow = ([ least, span ], share) => least + span * share;
const point = (x, y) => fixed(x) + ' ' + fixed(y);
const mouthAt = () => ({x : SNOUT_TIP.x + HEAD.mouth_in, y : SNOUT_TIP.y});
export function workShape(code, side, {fill, strength}, count) {
  const s = sideSign(side), along = k => (k + .5) / Math.max(1, count);
  if (code === MOTOR_KIND.forward) {
    const T = SHAPE.tail, end = T.stalk[1],
          start = Math.max(T.stalk[0], end - grow(T.length, fill));
    const at = x => BODY_FRAME.middle + s * halfWidth(x) * T.depth,
          half = x => halfWidth(x) * grow(T.thick, strength) / 2;
    const top = [], bottom = [];
    for (let k = 0; k <= T.steps; ++k) {
      const x = start + (end - start) * k / T.steps, swell = Math.sin(Math.PI * k / T.steps);
      top.push(point(x, at(x) - half(x) * swell));
      bottom.unshift(point(x, at(x) + half(x) * swell));
    }
    const marks = Array.from({length : count}, (_, k) => {
      const x = start + (end - start) * along(k), y = at(x), w = half(x) * T.mark,
            back = w * T.lean;
      return 'M' + point(x + back, y - w) + ' L' + point(x - back, y) + ' L' +
             point(x + back, y + w);
    });
    return {
      path : 'M' + top.join(' L') + ' L' + bottom.join(' L') + 'Z',
      from : {x : start, y : at(start)},
      to : {x : end, y : at(end)},
      marks
    };
  }
  if (code === MOTOR_KIND.turn) {
    const F = SHAPE.fin, a = FIN_BASE.at, b = FIN_BASE.at + FIN_BASE.length, middle = (a + b) / 2;
    const base = x => skinAt(x, s) - s * F.inset, reach = grow(F.reach, (fill + strength) / 2);
    const root = {x : middle, y : base(middle) - s * reach};
    const marks = Array.from({length : count}, (_, k) => {
      const x = a + (b - a) * along(k);
      return 'M' + point(root.x, root.y) + ' L' + point(x, base(x));
    });
    return {
      path : 'M' + point(a, base(a)) + ' Q' + point(middle, base(middle) - 2 * s * reach) + ' ' +
                 point(b, base(b)) + 'Z',
      from : {x : a, y : base(a)},
      to : {x : b, y : base(b)},
      marks
    };
  }
  const mouth = mouthAt();
  if (code === MOTOR_KIND.aggression) {
    const J = SHAPE.jaw, x = mouth.x + HEAD.jaw_back * J.at,
          y = mouth.y + s * (HEAD.mouth[1] + HEAD.jaw_spread * J.at);
    const share = (fill + strength) / 2, rx = grow([ J.size[0][0], J.size[1][0] ], share),
          ry = grow([ J.size[0][1], J.size[1][1] ], share);
    const arc = 'A' + fixed(rx) + ' ' + fixed(ry) + ' 0 1 0 ';
    const marks = Array.from({length : count}, (_, k) => {
      const dx = rx * (along(k) * 2 - 1) * J.spread;
      return 'M' + point(x + dx, y - ry * J.fibre) + ' L' +
             point(x + dx * J.tilt, y + ry * J.fibre);
    });
    return {
      path : 'M' + point(x - rx, y) + ' ' + arc + point(x + rx, y) + ' ' + arc + point(x - rx, y) +
                 'Z',
      from : {x : x - rx, y},
      to : {x : x + rx, y},
      marks
    };
  }
  if (code === MOTOR_KIND.suction) {
    const P = SHAPE.throat, a = mouth.x + HEAD.mouth[0] + P.after, end = a + grow(P.length, fill);
    const y = BODY_FRAME.middle + s * P.off, half = grow(P.width, strength) / 2;
    const marks = Array.from({length : count}, (_, k) => {
      const x = a + (end - a) * along(k);
      return 'M' + point(x, y - s * half * P.in) + ' L' + point(x, y + s * half * P.ring);
    });
    return {
      path : 'M' + point(a, y) + ' C' + point(a, y + s * half * P.out) + ' ' +
                 point(end, y + s * half) + ' ' + point(end, y) + ' C' +
                 point(end, y - s * half * P.in) + ' ' + point(a, y - s * half * P.in) + ' ' +
                 point(a, y) + 'Z',
      from : {x : a, y},
      to : {x : end, y},
      marks
    };
  }
  return null;
}
export const muscleShape = (organ, sites) => workShape(
    organFunction(organ, sites), sideOf(organ), muscleBuild(organ, sites), organ.centers.length);
export function muscleNode(organ, index, sites) {
  const shape = muscleShape(organ, sites);
  if (!shape)
    return null;
  const share = (index + .5) / Math.max(1, organ.centers.length);
  return {
    x : shape.from.x + (shape.to.x - shape.from.x) * share,
    y : shape.from.y + (shape.to.y - shape.from.y) * share
  };
}

const HOME = Object.freeze({fill : .5, strength : .5});
export function muscleHomes(doc, sites) {
  const used = usedSites(doc);
  return [ -1, 1 ].flatMap(side => WORKS.map(code => {
    const organ = doc.organs.find(o => o.type === 'muscle' && sideSign(o.side) === side &&
                                       organFunction(o, sites) === code) ??
                  null;
    const shape = organ ? muscleShape(organ, sites) : workShape(code, side, HOME, 1);
    const free = musclePlaces(sites, code, side).filter(s => !used.has(s.id));
    const middle = {x : (shape.from.x + shape.to.x) / 2, y : (shape.from.y + shape.to.y) / 2};
    return {code, side, organ, shape, free, middle};
  }));
}
export function muscleTarget(doc, sites, position) {
  const homes = muscleHomes(doc, sites).filter(h => h.organ || h.free.length);
  if (!homes.length)
    return null;
  const distance = p => Math.hypot(p.x - position.x, p.y - position.y);
  return homes.reduce((best, h) => distance(h.middle) < distance(best.middle) ? h : best);
}
