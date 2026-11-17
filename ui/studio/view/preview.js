import {HORMONE_EFFECT} from '../../schema.js';
import {groupReport} from '../model/document.js';
import {nerveClass} from '../model/organs.js';

// What drives a cell's activity in the preview's blood. Its receptors' answers are the engine's
// (anatomy.groups, effects: at the life band's blood); for an effect the cell does not have, and
// before the engine's first answer, a receptor's resting answer.
export function driveContext(state, center) {
  const wheel = state.capabilities,
        effects =
            groupReport(state.document, state.outlinePreview ?? state.anatomy, 'groups', center.id)
                ?.effects;
  const response = (effect, baseline = 0) => effects?.[effect] ?? baseline;
  return {
    scale : wheel?.biasScale ?? 0,
    excitation : response(HORMONE_EFFECT.excitation),
    output : (1 + response(HORMONE_EFFECT.output, 1)) / 2,
    pace : nerveClass(center).pace,
    rhythmEffect : response(HORMONE_EFFECT.rhythm),
    adaptationSpan : wheel?.neural?.adaptationSpan
  };
}
