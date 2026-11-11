// The balance organ's hairs: their direction is a gene, from the head over the flank to the tail,
// mirrored on the other side. A hair is weighed down as far as it points to the bottom, so beside
// the fish each side shows the posture in which its hair hangs straight down.
import {bodyDirection, fieldFish} from './frame.js';
import {escapeText, fixed} from './markup.js';
import {t} from '../../strings.js';

const HAIR_FIELD = Object.freeze({
  width : 300,
  height : 200,
  cx : 104,
  cy : 100,
  scale : .15,
  reach : 64,
  sac : 14,
  stone : 6,
  handle : 10,
  guide : 72,
  pose : {x : 246, y : [ 48, 140 ], scale : .06, drop : 34, stone : 4, word : 40}
});
export const hairAngle = q1 => Math.PI / 2 * (1 + q1);
// Direction of a hair in the picture, head to the left and side +1 at the bottom.
export const hairVector = (q1, side) => bodyDirection(side * hairAngle(q1));
export function hairPatch(fx, fy) {
  const H = HAIR_FIELD, dx = fx * H.width - H.cx, dy = fy * H.height - H.cy;
  return {q1 : 2 * Math.atan2(Math.abs(dy), -dx) / Math.PI - 1};
}
// The pitch, positive with the head down, at which a hair on this side points straight down.
const weighedPitch = (q1, side) => Math.PI / 2 - side * hairAngle(q1);
const POSTURES = Object.freeze([ 'head', 'flank', 'tail' ]);
const posture = q1 =>
    POSTURES[Math.min(POSTURES.length - 1, Math.floor(hairAngle(q1) / Math.PI * POSTURES.length))];

export function hairField(state, organ, center) {
  const H = HAIR_FIELD, q1 = center.q1 ?? 0, label = key => t('studio.balance.' + key);
  const at = (side, r) => {
    const v = hairVector(q1, side);
    return {x : H.cx + v.x * r, y : H.cy + v.y * r};
  };
  const guide = 'M' + fixed(H.cx - H.guide) + ' ' + fixed(H.cy) + ' A' + H.guide + ' ' + H.guide +
                ' 0 0 0 ' + fixed(H.cx + H.guide) + ' ' + fixed(H.cy) + ' A' + H.guide + ' ' +
                H.guide + ' 0 0 0 ' + fixed(H.cx - H.guide) + ' ' + fixed(H.cy);
  let hairs = '', poses = '';
  for (const [k, side] of [-1, 1].entries()) {
    const tip = at(side, H.reach), handle = at(side, H.guide);
    hairs +=
        '<path class="aid-hair" d="M' + fixed(H.cx) + ' ' + fixed(H.cy) + ' L' + fixed(tip.x) +
        ' ' + fixed(tip.y) + '"/><circle class="aid-anatomical-statolith" cx="' + fixed(tip.x) +
        '" cy="' + fixed(tip.y) + '" r="' + H.stone +
        '"/><circle class="aid-graphic-handle aid-hair-handle" data-graphic-handle="hair" cx="' +
        fixed(handle.x) + '" cy="' + fixed(handle.y) + '" r="' + H.handle + '"><title>' +
        escapeText(label('handle')) + '</title></circle>';
    const y = H.pose.y[k], pitch = weighedPitch(q1, side) * 180 / Math.PI;
    const pose = {cx : H.pose.x, cy : y};
    poses += '<g class="aid-hair-pose ' + (side < 0 ? 'upper' : 'lower') +
             '"><g transform="rotate(' + fixed(-pitch) + ' ' + H.pose.x + ' ' + y + ')">' +
             fieldFish(pose, H.pose.scale, 'aid-hair-pose-fish') +
             '</g><path class="aid-hair" d="M' + H.pose.x + ' ' + y + ' v' + H.pose.drop / 2 +
             '"/><circle class="aid-anatomical-statolith" cx="' + H.pose.x + '" cy="' +
             (y + H.pose.drop / 2) + '" r="' + H.pose.stone + '"/><text x="' + H.pose.x + '" y="' +
             (y + H.pose.word) + '" text-anchor="middle">' +
             escapeText(t('studio.balance.reports.' + posture(q1) + (side < 0 ? 'Other' : ''))) +
             '</text></g>';
  }
  return '<section class="aid-eye-section"><h4>' + escapeText(label('title')) + '</h4>' +
         '<svg class="aid-hair-field" viewBox="0 0 ' + H.width + ' ' + H.height +
         '" data-hair-pad="' + escapeText(center.id) + '" role="img" aria-label="' +
         escapeText(label('title')) + '"><path class="aid-hair-guide" d="' + guide + '"/>' +
         fieldFish({cx : H.cx, cy : H.cy}, H.scale, 'aid-lateral-fish') +
         '<ellipse class="aid-anatomical-balance" cx="' + H.cx + '" cy="' + H.cy + '" rx="' +
         H.sac + '" ry="' + H.sac + '"/>' + hairs + poses + '</svg></section>';
}
