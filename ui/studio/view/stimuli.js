import {SENSE_KIND} from '../../schema.js';
import {escapeText, fixed} from './markup.js';

// What each sense feels, drawn at a strength from 0 to 1 as a small picture around its middle,
// PICTURE.size wide: the charts of a sense show their stimulus in these pictures rather than in
// numbers. Each picture paints in the text colour, which the sense's own colour sets (a scent's,
// a colour type's) or else its kind's style.
export const PICTURE = Object.freeze({size : 18});
const HALF = PICTURE.size / 2;
const share = (least, most, s) => least + (most - least) * s;
const circle = (x, y, r, more = '') =>
    '<circle cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' + fixed(r) + '"' + more + '/>';

// A scent: a cloud of droplets, the denser the stronger, on a sunflower spiral (TURN apart).
const CLOUD = Object.freeze({least : 3, most : 14, radius : 7.6, dot : 1.6, turn : 2.4});
function scentCloud(s) {
  const C = CLOUD, count = Math.round(share(C.least, C.most, s));
  let html = '';
  for (let i = 0; i < count; ++i) {
    const r = C.radius * Math.sqrt((i + .5) / count), a = i * C.turn;
    html += circle(Math.cos(a) * r, Math.sin(a) * r, C.dot, ' fill="currentColor"');
  }
  return html;
}
// Flow: LINES streamlines GAP apart, the longer, bolder and brighter the stronger, each with an
// arrowhead HEAD long.
const FLOW = Object.freeze({
  lines : 3,
  gap : 5,
  length : [ 7, 16 ],
  wave : 1.4,
  width : [ .9, 2.2 ],
  opacity : [ .45, 1 ],
  head : 2.6
});
function streamlines(s) {
  const F = FLOW, length = share(...F.length, s), from = -length / 2, to = length / 2;
  let d = '';
  for (let k = 0; k < F.lines; ++k) {
    const y = (k - (F.lines - 1) / 2) * F.gap;
    d += 'M' + fixed(from) + ' ' + fixed(y) + ' q' + fixed(length / 4) + ' ' + -F.wave + ' ' +
         fixed(length / 2) + ' 0 t' + fixed(length / 2) + ' 0 M' + fixed(to - F.head) + ' ' +
         fixed(y - F.head) + ' L' + fixed(to) + ' ' + fixed(y) + ' L' + fixed(to - F.head) + ' ' +
         fixed(y + F.head);
  }
  return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-linecap="round" ' +
         'stroke-width="' + fixed(share(...F.width, s)) + '" opacity="' +
         fixed(share(...F.opacity, s)) + '"/>';
}
// Touch: a ball on the skin (SKIN below the middle), hovering LIFT above it untouched and pressing
// up to PRESS into it, the skin giving way under it over SPREAD of its radius either side.
const TOUCH = Object.freeze({skin : 5, ball : 3.6, lift : 2.5, press : 4.5, spread : 1.8});
function pressingBall(s) {
  const T = TOUCH, depth = T.press * s, edge = T.ball * T.spread;
  return '<path class="skin" d="M' + -HALF + ' ' + T.skin + ' H' + fixed(-edge) + ' Q0 ' +
         fixed(T.skin + 2 * depth) + ' ' + fixed(edge) + ' ' + T.skin + ' H' + HALF +
         '" fill="none" stroke-linecap="round"/>' +
         circle(0, T.skin + depth - T.ball - T.lift * (1 - s), T.ball, ' fill="currentColor"');
}
// Food: pellets PELLET wide, piling up from the bottom, as many as the strength asks.
const FOOD = Object.freeze({
  pellet : 2.1,
  pile : [ [ 0, 5 ], [ -4.6, 5 ], [ 4.6, 5 ], [ -2.3, 1 ], [ 2.3, 1 ], [ 0, -3 ], [ -4.6, -3 ] ]
});
const foodPile = s => FOOD.pile.slice(0, Math.max(1, Math.round(s * FOOD.pile.length)))
                          .map(([ x, y ]) => circle(x, y, FOOD.pellet, ' fill="currentColor"'))
                          .join('');
// An injury: parallel scratches, more and longer the worse, slanting by SLANT.
const WOUND =
    Object.freeze({least : 1, most : 4, length : [ 6, 15 ], gap : 3.4, slant : .55, stroke : 1.6});
function scratches(s) {
  const W = WOUND, count = Math.round(share(W.least, W.most, s)), length = share(...W.length, s);
  const dx = length / 2 * Math.cos(W.slant), dy = length / 2 * Math.sin(W.slant);
  let d = '';
  for (let k = 0; k < count; ++k) {
    const x = (k - (count - 1) / 2) * W.gap;
    d += 'M' + fixed(x - dx) + ' ' + fixed(dy) + ' L' + fixed(x + dx) + ' ' + fixed(-dy);
  }
  return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-linecap="round" ' +
         'stroke-width="' + W.stroke + '"/>';
}
// Depth: a column of water, darker deeper, with the fish (FISH long) sunk the further the deeper
// below its surface.
const DEPTH = Object.freeze({width : 13, opacity : [ .12, .75 ], fish : [ 3.4, 1.8 ], room : 3});
function waterDepth(s) {
  const D = DEPTH, y = -HALF + D.room + (PICTURE.size - 2 * D.room) * s;
  return '<rect x="' + -D.width / 2 + '" y="' + -HALF + '" width="' + D.width + '" height="' +
         PICTURE.size + '" fill="currentColor" opacity="' + fixed(share(...D.opacity, s)) +
         '"/><path class="surface" d="M' + -D.width / 2 + ' ' + -HALF + ' H' + D.width / 2 +
         '"/><ellipse class="fish" cx="0" cy="' + fixed(y) + '" rx="' + D.fish[0] + '" ry="' +
         D.fish[1] + '"/>';
}
// A gonad's filling: a sac (RX by RY) filled with eggs EGG wide up to the strength.
const SAC = Object.freeze({rx : 7.5, ry : 8.5, egg : 1.5, step : 3.4, stroke : 1.1});
function fillingSac(s) {
  const S = SAC, level = S.ry - 2 * S.ry * s;
  let eggs = '';
  for (let y = S.ry - S.step / 2; y > level && y > -S.ry; y -= S.step) {
    const reach = S.rx * Math.sqrt(Math.max(0, 1 - (y / S.ry) ** 2)) - S.egg;
    for (let x = -reach; x <= reach; x += S.step)
      eggs += circle(x, y, S.egg, ' fill="currentColor"');
  }
  return '<ellipse cx="0" cy="0" rx="' + S.rx + '" ry="' + S.ry +
         '" fill="none" stroke="currentColor" stroke-width="' + S.stroke + '"/>' + eggs;
}
// Stretch: the gut as a tube WIDTH wide, wider the more it is stretched, its wall drawn over a
// FILL of its colour.
const TUBE = Object.freeze({length : 16, width : [ 2.5, 10 ], fill : .35, stroke : 1.1});
function stretchedTube(s) {
  const T = TUBE, w = share(...T.width, s);
  return '<rect x="' + -T.length / 2 + '" y="' + fixed(-w / 2) + '" width="' + T.length +
         '" height="' + fixed(w) + '" rx="' + fixed(w / 2) +
         '" fill="currentColor" fill-opacity="' + T.fill +
         '" stroke="currentColor" stroke-width="' + T.stroke + '"/>';
}
// A substance in the blood: a drop from the top to BOTTOM, WIDTH wide at its shoulders (SHOULDER
// above the middle), the more saturated the more there is.
const DROP = Object.freeze({width : 5.5, shoulder : 2, bottom : HALF - 1, opacity : [ .1, 1 ]});
const bloodDrop = s => {
  const D = DROP;
  return '<path d="M0 ' + -HALF + ' C' + D.width + ' ' + -D.shoulder + ' ' + D.width + ' ' +
         D.bottom + ' 0 ' + D.bottom + ' C' + -D.width + ' ' + D.bottom + ' ' + -D.width + ' ' +
         -D.shoulder + ' 0 ' + -HALF + 'Z" fill="currentColor" fill-opacity="' +
         fixed(share(...D.opacity, s)) + '" stroke="currentColor"/>';
};
// Light: a source with RAYS rays, longer and with a wider glow the brighter, the glow up to GLOW_AT
// opaque.
const LIGHT = Object.freeze({
  core : 2.6,
  rays : 8,
  ray : [ .8, 5.4 ],
  glow : [ 3, 8.5 ],
  glow_at : 1 / 3,
  gap : 1,
  stroke : 1.3
});
function lightSource(s) {
  const L = LIGHT, reach = share(...L.ray, s);
  let d = '';
  for (let k = 0; k < L.rays; ++k) {
    const a = 2 * Math.PI * k / L.rays, c = Math.cos(a), n = Math.sin(a);
    d += 'M' + fixed(c * (L.core + L.gap)) + ' ' + fixed(n * (L.core + L.gap)) + ' L' +
         fixed(c * (L.core + L.gap + reach)) + ' ' + fixed(n * (L.core + L.gap + reach));
  }
  return circle(0, 0, share(...L.glow, s),
                ' fill="currentColor" opacity="' + fixed(s * L.glow_at) + '"') +
         '<path d="' + d + '" stroke="currentColor" stroke-linecap="round" stroke-width="' +
         L.stroke + '"/>' + circle(0, 0, L.core, ' fill="currentColor"');
}
// Nearness: an object, the larger the nearer, before an eye's arc.
const NEAR = Object.freeze({object : [ 1.5, 6 ], at : 3, arc : 8, stroke : 1.2});
const nearObject = s => '<path d="M' + -HALF + ' ' + -NEAR.arc + ' Q' + (NEAR.at - HALF) + ' 0 ' +
                        -HALF + ' ' + NEAR.arc + '" fill="none" stroke="currentColor" ' +
                        'stroke-width="' + NEAR.stroke + '"/>' +
                        circle(NEAR.at, 0, share(...NEAR.object, s), ' fill="currentColor"');

const PICTURES = Object.freeze({
  [SENSE_KIND.light] : lightSource,
  [SENSE_KIND.odor] : scentCloud,
  [SENSE_KIND.flow] : streamlines,
  [SENSE_KIND.touch] : pressingBall,
  [SENSE_KIND.proximity] : nearObject,
  [SENSE_KIND.intake] : foodPile,
  [SENSE_KIND.damage] : scratches,
  [SENSE_KIND.bladder_pressure] : waterDepth,
  [SENSE_KIND.gonad_pressure] : fillingSac,
  [SENSE_KIND.inner_pressure] : stretchedTube,
  [SENSE_KIND.blood] : bloodDrop
});
const KIND_NAME =
    Object.freeze(Object.fromEntries(Object.entries(SENSE_KIND).map(([ k, v ]) => [v, k])));
// A sense's stimulus at strength s around a point, named by `title`, `size` times PICTURE.size
// wide; nothing for a sense without a picture.
export function stimulusPicture(kind, s, {x, y}, title, colour = null, size = 1) {
  const draw = PICTURES[kind];
  if (!draw)
    return '';
  return '<g class="aid-stimulus k-' + KIND_NAME[kind] + '" transform="translate(' + fixed(x) +
         ' ' + fixed(y) + ')' + (size === 1 ? '' : ' scale(' + fixed(size) + ')') + '"' +
         (colour ? ' style="color:' + colour + '"' : '') + '><title>' + escapeText(title) +
         '</title>' + draw(s) + '</g>';
}
