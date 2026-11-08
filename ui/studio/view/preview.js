import {HORMONE_EFFECT} from '../../schema.js';
import {receptorResponse} from '../model/document.js';
import {nerveClass} from '../model/organs.js';
import {neuralContextOf} from './development.js';
import {motorResponse} from './drive.js';

export const previewInputOf = state => state.previewInput ?? 1;
export function driveContext(state, center) {
  const context = neuralContextOf(state), wheel = state.capabilities;
  const response = (effect, baseline = 0) =>
      wheel ? receptorResponse(wheel, center.receptors[effect], context.hormones, context.maturity,
                               baseline)
            : baseline;
  return {
    scale : wheel?.biasScale ?? 0,
    excitation : response(HORMONE_EFFECT.excitation),
    output : (1 + response(HORMONE_EFFECT.output, 1)) / 2,
    pace : nerveClass(center).pace,
    rhythmEffect : response(HORMONE_EFFECT.rhythm),
    adaptationSpan : wheel?.neural?.adaptationSpan
  };
}
export const organCommand = (state, center) =>
    motorResponse(center, previewInputOf(state), driveContext(state, center));
