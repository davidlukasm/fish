import {BEHAVIOR_SCALE, FIN, FIN_EVENT as E, STROKE_GRIP as G} from './schema.js';

export const FIN_STROKE = Object.freeze({tail_swing : .8, body_bend : .22});
export const FINS = Object.keys(FIN).length;
// The side fins: the pectoral pair, then the pelvic pair behind it.
export const SIDE_FIN_INDICES =
    Object.freeze([ FIN.left, FIN.right, FIN.pelvic_left, FIN.pelvic_right ]);
export const finSide = index => (index - FIN.left) % 2;
export const isPelvic = index => index >= FIN.pelvic_left;
// Share of a stroke that the tail and the fins turn into push at a speed through the water, as
// the engine has it (movement.cc).
export function swimmingGrip(speed) {
  const s = Math.max(0, speed || 0) / BEHAVIOR_SCALE.cruising_speed, fast = s / (1 + s);
  return {
    tail : G.tail_at_rest + (1 - G.tail_at_rest) * fast,
    fins : 1 - (1 - G.fin_at_speed) * fast
  };
}

export function finStrokePose(events, age, fin) {
  const tick = events?.[E.age_tail + fin], steps = events?.[E.steps_tail + fin],
        peak = events?.[E.peak_tail + fin] || 0;
  if (!(tick >= 0) || !(steps > 0))
    return 0;
  const s = (age - tick) / steps;
  return s < 0 || s > 1 ? 0 : Math.sqrt(Math.min(1, Math.abs(peak))) * Math.sin(Math.PI * s);
}

export function tailDirection(events) { return Math.sign(events?.[E.peak_tail] || 1); }

export function blendedFinPose(newer, older, age) {
  const events = Array(E.count).fill(0), pose = [];
  for (let fin = 0; fin < FINS; fin++) {
    const tick = newer?.[E.age_tail + fin],
          source = tick >= 0 && tick <= age ? newer : older ?? newer;
    for (const start of [E.age_tail, E.peak_tail, E.steps_tail])
      events[start + fin] = source?.[start + fin] ?? (start === E.age_tail ? -1 : 0);
    pose[fin] = finStrokePose(events, age, fin);
  }
  pose[FINS] = events;
  return pose;
}
