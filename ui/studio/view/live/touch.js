// The sense of touch's live inspector: the skin pressed in, and how deep it must be pressed at
// each place for the cells to report it.
// Read in the engine (body_plan.cc, the skin cells' wedge of weights, record_touch and the touch
// stimulus; physiology_parameters.hh, touch_rest and touch_impact; embryo.cc): the body's rim
// has 16 sectors; the cells weigh them by a wedge round their own place, 22.5 to 180 degrees wide,
// the weights summing to one. A touch presses its sector: 0.1 for a mere leaning up to 1 for the
// hardest blow. The cells' stimulus is the touched sector's weight x that pressure; it is bounded
// and they do not get used to it, so there is no course over time to show. In the egg they feel
// the shell's pressure.
// The thing is the fish panel's probe (probes.js). The cells' place is the plan's report
// (anatomy.felt), what they report of the probe the engine's (anatomy.senseProbe).
// Not in the picture: sediment; several touches at once.
import {SKIN_RESPONSE} from '../../../schema.js';
import {t} from '../../../strings.js';
import {findOrgan, groupReport, updateCenter} from '../../model/document.js';
import {
  addPicture,
  clamp,
  drag,
  el,
  liveKind,
  path,
  picture,
  reportBubble,
  squareGrip,
  txt
} from './kit.js';
import {BOUNDED} from './sense.js';
import {sectorAngle, sectorOf, skinSectors, turnTo} from './skin.js';

const word = (key, values) => t('studio.live.touch.' + key, values);
const pressureOf = impact => SKIN_RESPONSE.touch_rest + (1 - SKIN_RESPONSE.touch_rest) * impact /
                                                            (impact + SKIN_RESPONSE.touch_impact);
const CUT = Object.freeze({
  height : 236,
  L : 14,
  R : 286,
  skin : 52,
  deep : 110,
  cells : 180,
  bubble : 11,
  below : 30,
  thing : 11,
  dent : 20,
  least : .06
});

liveKind('touch', (studio, organId) => {
  const root = document.createElement('div');
  root.className = 'aid-live-touch aid-live-sense-touch';
  const cut = addPicture(root);
  const organ = () => findOrgan(studio.state.document, organId);
  const draft = doc => doc && studio.draftDesign(doc, 'live:' + organId, 'refreshLive');
  const settle = () => studio.drafted && studio.settleGraphic();
  // The skin round the body laid out flat, the cells' own place in the middle; under it the
  // touch cells, each as big as the group weighs its place (the field's width is set at the
  // fish, anatomy_handles.js). The fish panel's thing presses the skin in as deep as its
  // pressure. The steps under the skin are how deep a place must be pressed before the cells
  // report it (threshold / the place's weight; where the hardest blow is not enough, no step);
  // their grip sets the threshold. Under the cell the thing presses, what the engine reports of
  // the probe, in the fish panel's bubble.
  function drawCut(cell) {
    const {svg, under, live} = picture(cut, CUT.height),
                       {L, R, skin, deep, cells, thing, dent} = CUT,
                       {place, weights} = skinSectors(studio.state, cell.id),
                       most = Math.max(0, ...weights), count = weights.length;
    const active = studio.state.senseProbe,
          probe = active?.kind === 'touch' && active.organ === organId ? active : null,
          X = a => L + (R - L) * (a + 180) / 360, tx = probe ? X(turnTo(probe.bearing - place)) : 0;
    const pressure = probe ? pressureOf(probe.strength) : 0;
    const dip = x => probe ? pressure * deep * Math.exp(-(((x - tx) / dent) ** 2)) : 0,
          line = Array.from({length : 69}, (_, n) => {
            const x = L + (R - L) * n / 68;
            return [ x, skin + dip(x) ];
          });
    el('path', {
      d : path(line) + ` L${R} ${CUT.height - 14} L${L} ${CUT.height - 14} Z`,
      class : 'aid-live-flesh'
    },
       under);
    el('path', {d : path(line), class : 'aid-live-skinline'}, live);
    const hit = probe && count ? sectorOf(probe.bearing, count) : -1, gate = BOUNDED.gate(cell),
          heard = probe ? groupReport(studio.state.document, studio.state.anatomy, 'senseProbe',
                                      cell.id)
                        : 0;
    // One step per sector of the rim: the cells weigh whole sectors.
    const half = count ? (R - L) / count / 2 : 0;
    const sectorX = k => X(turnTo(sectorAngle(k, count) - place));
    weights.forEach((v, k) => {
      if (v > 0 && gate <= v) {
        const x = sectorX(k), d = gate / v;
        el('path',
           {d : `M${x - half + 1} ${skin + d * deep} h${2 * half - 2}`, class : 'aid-live-hair k0'},
           live);
      }
    });
    weights.forEach((v, k) => {
      const x = sectorX(k), y = cells;
      if (v <= 0) {
        el('circle', {cx : x, cy : y, r : 1.2, class : 'aid-live-rimdot'}, live);
        return;
      }
      el('path', {d : `M${x} ${y - 4} V${skin + dip(x) + 3}`, class : 'aid-live-keyline k0'}, live);
      el('circle', {
        cx : x,
        cy : y,
        r : 3 + 6 * v / most,
        class : 'aid-live-petal k0',
        opacity : .45 + .55 * v / most
      },
         live);
      if (k === hit && Number.isFinite(heard)) {
        // Clear of the cell it belongs to, joined to it by a short line.
        el('path',
           {d : `M${x} ${y + 11} V${y + CUT.below - CUT.bubble}`, class : 'aid-live-keyline k0'},
           live);
        reportBubble(live, CUT.bubble)(x, y + CUT.below, heard);
      }
    });
    if (probe) {
      const top = skin + pressure * deep - thing + 1;
      el('circle', {cx : tx, cy : top, r : thing, class : 'aid-live-thing'}, live);
      txt(live, tx, skin - 8, word('pressure'),
          {'text-anchor' : 'middle', class : 'aid-live-small'});
    }
    if (!most)
      return;
    // The threshold's grip at an end of the middle step, on the side away from the thing.
    const away = probe && tx < X(0) ? 1 : -1, gx = X(0) + away * (2 * half + 6),
          gy = skin + clamp(gate / most, CUT.least, 1) * deep;
    txt(live, gx + away * 10, gy - 7, word('reports'),
        {'text-anchor' : away > 0 ? 'start' : 'end', class : 'aid-live-small aid-live-inflesh'});
    drag(svg,
         squareGrip(live, gx, gy, {class : 'aid-live-keygrip k0 on'}),
         p => draft(updateCenter(
             studio.state.document, cell.id,
             {threshold : BOUNDED.threshold(most * clamp((p.y - skin) / deep, CUT.least, 1))})),
         'touchgate', 'grip', settle);
  }
  function show() {
    const cell = organ()?.centers[0];
    if (cell)
      drawCut(cell);
  }
  return {root, show};
});
