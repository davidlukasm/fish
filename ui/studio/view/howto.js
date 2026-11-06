import {TOOL_ICON} from './icons.js';
import {fixed, placedGlyph} from './markup.js';
import {animate, travelling} from './episode.js';

const HOWTO = Object.freeze({
  width : 132,
  height : 40,
  middle : 20,
  play : 3.6,
  node : 5,
  pulse : 2.6,
  icon : 16,
  ring : 2.2,
  ringFor : .3,
  flashFor : .12,
  edge : .01,
  dim : .25,
  hold : .97,
  thin : 1.5,
  thick : 5,
  start : 16,
  near : 22,
  far : 110,
  spread : 12,
  tile : {x : 6, y : 10, size : 20, round : 5},
  fish : {x : 64, landing : 92, scale : 1, small : .9, out : 72},
  hormone : {from : 28, gap : 2, fan : 7, stagger : .08},
  learn : {x : 96, y : 26, gland : 7, stem : 14, left : 10},
  stimulate : {x : 46},
  egg : {x : 22, rx : 9, ry : 11, squeeze : 10},
  arrow : {from : 38, to : 60, head : 5}
});
const H = HOWTO;
const TIMES = Object.freeze({
  pick : .1,
  land : .5,
  draw : [ .2, .6 ],
  release : [ .15, .55 ],
  bind : .7,
  input : [ .1, .3 ],
  teach : [ .4, .52 ],
  grow : [ .55, .7 ],
  spark : .15,
  travel : [ .2, .5 ],
  wobble : [ .2, .3, .4 ],
  hatch : [ .4, .55 ]
});
const T = TIMES;
const way = (x1, y1, x2, y2) =>
    'M' + fixed(x1) + ' ' + fixed(y1) + ' L' + fixed(x2) + ' ' + fixed(y2);
const line = (x1, y1, x2, y2, cls = '', inner = '') =>
    '<path class="aid-howto-line ' + cls + '" d="' + way(x1, y1, x2, y2) + '">' + inner + '</path>';
const pulse = (path, from, to, colour = '') => travelling(path, from, to, H.pulse, H.play, colour);
const flash = at => animate(
    'fill-opacity', [ [ 0, H.dim ], [ at, H.dim ], [ at + H.edge, 1 ], [ at + H.flashFor, H.dim ] ],
    H.play);
const node = (x, y, at = []) => '<circle class="aid-howto-node" cx="' + fixed(x) + '" cy="' +
                                fixed(y) + '" r="' + H.node + '" fill-opacity="' + H.dim + '">' +
                                at.map(flash).join('') + '</circle>';
const ring = (x, y, at) =>
    '<circle class="aid-howto-ring" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' + H.node +
    '" stroke-opacity="0">' +
    animate('stroke-opacity', [ [ 0, 0 ], [ at, 0 ], [ at + H.edge, 1 ], [ at + H.ringFor, 0 ] ],
            H.play) +
    animate('r', [ [ 0, H.node ], [ at, H.node ], [ at + H.ringFor, H.node * H.ring ] ], H.play) +
    '</circle>';
const icon = (path, x, y, cls) =>
    '<g class="aid-howto-icon ' + cls + '">' + placedGlyph(path, H.icon, {x, y}) + '</g>';
const fish = (x, scale) => '<path class="aid-howto-fish" transform="translate(' + fixed(x) + ' ' +
                           H.middle + ') scale(' + fixed(scale) +
                           ')" d="M0 0C9-12 33-12 44 0C33 12 9 12 0 0ZM44 0L54-8V8Z"/>';
const SCENES = Object.freeze({
  select : () => {
    const {x, y, size, round} = H.tile;
    return '<rect class="aid-howto-tile" x="' + x + '" y="' + y + '" width="' + size +
           '" height="' + size + '" rx="' + round + '"/>' + fish(H.fish.x, H.fish.scale) +
           pulse(way(H.start, H.middle, H.fish.landing, H.middle), T.pick, T.land) +
           ring(H.fish.landing, H.middle, T.land);
  },
  wire : () => {
    const length = H.far - H.near;
    return '<path class="aid-howto-line" d="' + way(H.near, H.middle, H.far, H.middle) +
           '" stroke-dasharray="' + length + '" stroke-dashoffset="' + length + '">' +
           animate('stroke-dashoffset',
                   [ [ 0, length ], [ T.draw[0], length ], [ T.draw[1], 0 ], [ H.hold, 0 ] ],
                   H.play) +
           '</path>' + node(H.near, H.middle, [ T.pick ]) + ring(H.near, H.middle, T.pick) +
           node(H.far, H.middle, [ T.draw[1] ]) + ring(H.far, H.middle, T.draw[1]);
  },
  hormone : () => {
    const {from, gap, fan, stagger} = H.hormone;
    return icon(TOOL_ICON.hormone, H.start, H.middle, 'gland') +
           [ -fan, 0, fan ]
               .map((dy, k) => pulse(way(from, H.middle, H.far - H.node - gap, H.middle + dy),
                                     T.release[0] + k * stagger, T.release[1] + k * stagger,
                                     'var(--aid-substance)'))
               .join('') +
           node(H.far, H.middle, [ T.bind ]) + ring(H.far, H.middle, T.bind);
  },
  learn : () => {
    const {x, y, gland, stem, left} = H.learn, end = x - H.node;
    return line(left, y, end, y, '',
                animate('stroke-width',
                        [
                          [ 0, H.thin ], [ T.grow[0], H.thin ], [ T.grow[1], H.thick ],
                          [ H.hold, H.thick ]
                        ],
                        H.play)) +
           icon(TOOL_ICON.hormone, x, gland, 'gland') + line(x, stem, x, y - H.node, 'teach') +
           pulse(way(left, y, end, y), T.input[0], T.input[1]) +
           pulse(way(x, stem, x, y - H.node), T.teach[0], T.teach[1], 'var(--aid-teach)') +
           node(x, y, [ T.input[1] ]);
  },
  stimulate : () => {
    const a = {x : H.stimulate.x, y : H.middle};
    const ends = [ -1, 1 ].map(side => ({x : H.far, y : H.middle + side * H.spread}));
    return ends.map(b => line(a.x, a.y, b.x, b.y)).join('') +
           icon(TOOL_ICON.stimulate, H.start, H.middle, 'spark') + node(a.x, a.y, [ T.spark ]) +
           ring(a.x, a.y, T.spark) +
           ends.map(b => pulse(way(a.x, a.y, b.x, b.y), T.travel[0], T.travel[1]) +
                         node(b.x, b.y, [ T.travel[1] ]))
               .join('');
  },
  develop : () => {
    const {x, rx, ry, squeeze} = H.egg, {from, to, head} = H.arrow;
    return '<ellipse class="aid-howto-egg" cx="' + x + '" cy="' + H.middle + '" rx="' + rx +
           '" ry="' + ry + '">' +
           animate(
               'ry',
               [ [ 0, ry ], [ T.wobble[0], ry ], [ T.wobble[1], squeeze ], [ T.wobble[2], ry ] ],
               H.play) +
           '</ellipse><path class="aid-howto-line" d="M' + from + ' ' + H.middle + 'H' + to + 'M' +
           (to - head) + ' ' + (H.middle - head) + 'l' + head + ' ' + head + '-' + head + ' ' +
           head + '"/><g opacity="' + H.dim + '">' +
           animate('opacity',
                   [ [ 0, H.dim ], [ T.hatch[0], H.dim ], [ T.hatch[1], 1 ], [ H.hold, 1 ] ],
                   H.play) +
           fish(H.fish.out, H.fish.small) + '</g>';
  }
});
export const howtoScene = key => SCENES[key] ? '<svg class="aid-howto" viewBox="0 0 ' + H.width +
                                                   ' ' + H.height + '" aria-hidden="true">' +
                                                   SCENES[key]() + '</svg>'
                                             : '';
