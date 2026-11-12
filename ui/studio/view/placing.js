import {
  anatomicalPosition,
  placementArea,
  nerveHalfWidth,
  muscleAreas,
  musclePosition
} from '../model/anatomy.js';
import {halfWidth} from '../model/layout.js';
import {organLocation} from './places.js';
import {STUDIO_ICON} from '../../organ_icons.js';
import {escapeText, fixed, placedGlyph} from './markup.js';
import {ORGAN_BY_KEY} from '../model/organs.js';
import {BODY_FRAME} from '../model/layout.js';
import {steadyAt, zoomOf} from './frame.js';
import {tone} from './names.js';

export function placementHints(state, kind, value, moving = null) {
  if (!state.sites.length)
    return {svg : '', legend : []};
  const type = kind === 'organ' ? value : 'brain', M = BODY_FRAME.middle;
  const areas = type === 'muscle' ? muscleAreas(state.sites) : [ placementArea(type) ];
  const paths = areas.flatMap(
      area => (state.placementSide === 'middle' && area.neural ? [ 0 ] : [ -1, 1 ]).map(side => {
        const outer = [], inner = [];
        for (let k = 0; k <= 40; ++k) {
          const x = area.from + (area.to - area.from) * k / 40;
          const width = area.neural ? nerveHalfWidth(x) - 5 : halfWidth(x);
          outer.push({x, y : M + side * width * (area.neural ? 1 : area.outer)});
          inner.push({x, y : M + side * width * (area.neural ? 0 : area.inner)});
        }
        return '<path d="M' +
               [...outer, ...inner.reverse() ].map(p => fixed(p.x) + ' ' + fixed(p.y)).join(' L') +
               'Z"/>';
      }));
  return {svg : '<g class="aid-placement-area">' + paths.join('') + '</g>', legend : []};
}
export function hintLegend(legend) {
  return legend
      .map(({colour, name}) =>
               '<span><i style="border-color:' + colour + '"></i>' + escapeText(name) + '</span>')
      .join('');
}
export function organPreview(state, kind, key, position) {
  const type = kind === 'organ' ? key : 'brain';
  const p = (type === 'muscle' ? musclePosition(state.sites, position)?.position : null) ??
            anatomicalPosition(type, position, state.placementSide);
  const first = placementPreview(state, {type}, p);
  const paired = state.placementSide === 'both' && ORGAN_BY_KEY[type]?.scope !== 'single';
  return first + (paired
                      ? placementPreview(state, {type}, {x : p.x, y : 2 * BODY_FRAME.middle - p.y})
                      : '');
}
export function assemblyPreview(state, placed) {
  if (!placed?.document)
    return '';
  const added = placed.document.organs.filter(o => !state.document.organs.some(p => p.id === o.id));
  return added
      .map(o => placementPreview(state, {type : o.type},
                                 organLocation(o, state.sites, placed.document)))
      .join('');
}
const PREVIEW = Object.freeze({ring : 26, icon : 28, line : 2, ink : '#072e34'});
export function placementPreview(state, descriptor, position) {
  if (!position || !descriptor)
    return '';
  const P = PREVIEW;
  const zoom = zoomOf(state);
  const colour = tone(descriptor.type ?? 'brain');
  const icon = STUDIO_ICON[descriptor.type] ?? STUDIO_ICON.brain;
  return '<g' + steadyAt(position, zoom) + '>' +
         '<circle r="' + P.ring + '" class="aid-preview-ring" fill="' + colour + '"/>' +
         placedGlyph(
             icon, P.icon, {},
             {paint : ' fill="none" stroke="' + P.ink + '" stroke-width="' + P.line + '"'}) +
         '</g>';
}
