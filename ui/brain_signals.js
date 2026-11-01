import {FINS} from './fin_stroke.js';
import {motorTissue, sidedTissue} from './tissue.js';

import {
  ANATOMY,
  EFFECTOR,
  FIN,
  FISH,
  MOTOR_KIND,
  MOTOR_PORTS,
  MOUTH_CYCLE,
  NEURON,
  STROKE,
  SYNAPSE
} from './schema.js';
import {updateBrainState} from './brain.js';
import {brainClamp, brainState} from './brain.js';
import {brainFiber} from './brain_geometry.js';
import {brainMotorColors, PAIRED_MOTORS} from './brain_model.js';
import {brainConnection} from './brain_paths.js';
import {rgb} from './dom.js';
import {hexColor} from './units.js';
import {
  fishCheekPoint,
  fishDefenseSpines,
  fishEggMuscleFiber,
  fishGameteShape
} from './fish_organs.js';
import {organMotorInterval, organStrokeIndex} from './organ_readout.js';
import {sessionState} from './session.js';
import {displayNow, frameBlend, frameFish, sceneState} from './state.js';
export const brain_signalsState = {};

// A bite shows its closing for BITE_SHOWN steps of the mouth cycle. Motors animate the inspected
// fish once the brain view is SHOWN_OPACITY opaque.
const BITE_SHOWN = 2, SHOWN_OPACITY = .5;
// Signal packets: at most PACKETS at once, grouped in BIN pixel cells; strokes send STROKE_PACKETS
// packets SPACING ms apart that arrive with the stroke; ordinary packets fly with the frame
// interval and are ranked by focus, strength and a hashed turn.
const TRACE = Object.freeze({
  packets : 56,
  bin : 16,
  bin_per_radius : .11,
  focus_min : .002,
  min_strength : .015,
  pulse_gain : .3,
  charge_step : .08,
  hash_a : 2654435761,
  hash_b : 2246822519,
  hash_range : 4294967296,
  focus_priority : 3,
  strength_priority : .65,
  random_priority : .35,
  stroke_packets : 2,
  spacing : 80,
  min_arrival : 240,
  max_arrival : 500,
  arrival_share : .6,
  min_duration : 120,
  charge_radius : .95,
  work_radius : 1.25,
  charge_alpha : .75,
  work_alpha : .95,
  per_source : 2,
  min_flight : 140,
  max_flight : 1100,
  flight_share : .55,
  flight_per_delay : .20,
  radius : .85,
  radius_per_strength : .55,
  alpha : .30,
  alpha_per_strength : .55
});
export function brainTrace(d) {
  const now = displayNow();
  brainCollectArrivals(d, now);
  const limit = TRACE.packets, groups = new Map(),
        bin = Math.max(TRACE.bin, d.r * TRACE.bin_per_radius);
  for (const {e, curve} of d.edges) {
    const source = d.nodes.get(e[SYNAPSE.source]);
    if (!source)
      continue;
    const signal = source[NEURON.signal] ?? source[NEURON.activity],
          value = d.b.learning ? (d.b.learning.signals?.[e[SYNAPSE.id]] ?? 0)
                               : signal * e[SYNAPSE.strength],
          strength = Math.abs(value);
    if (strength < (source[NEURON.index] === sessionState.neuronFocus ? TRACE.focus_min
                                                                      : TRACE.min_strength) ||
        !source[NEURON.ready] || source[NEURON.muted])
      continue;
    const sign = value >= 0 ? 1 : -1,
          key =
              [
                Math.round(curve[0] / bin), Math.round(curve[1] / bin),
                Math.round(curve[curve.length - 2] / bin),
                Math.round(curve[curve.length - 1] / bin), sign
              ].join(':'),
          old = groups.get(key),
          focus = e[SYNAPSE.source] === sessionState.neuronFocus ||
                  e[SYNAPSE.target] === sessionState.neuronFocus;
    if (!old || strength > old.strength)
      groups.set(key, {
        key,
        edge : e[SYNAPSE.id],
        source : e[SYNAPSE.source],
        target : e[SYNAPSE.target],
        strength,
        sign,
        motor : -1,
        delay : 0,
        focus : focus || old?.focus
      });
    else
      old.focus ||= focus;
  }
  const work = new Map(), commands = new Map();
  for (let k = 0; k < MOTOR_KIND.pigment; k++)
    for (const side of (PAIRED_MOTORS.includes(k) ? [ 0, 1 ] : [ 0 ])) {
      const key = brainCycleKey(k, side), cycle = brain_signalsState.brainMotorCycles.get(key),
            cue = sidedTissue(motorTissue(k), side), track = brainTensionTrack(k, side),
            pulse = cycle?.step === d.step && !cycle.issued.has(cue),
            phase = k <= MOTOR_KIND.aggression ? brainMotorReadiness(k, d, side) : 0;
      if (phase < track.sentPhase)
        track.sentPhase = 0;
      if (pulse)
        commands.set(
            cue,
            {cycle, cue, release : k <= MOTOR_KIND.aggression, gain : TRACE.pulse_gain, phase});
      else if (k <= MOTOR_KIND.aggression && phase - track.sentPhase >= TRACE.charge_step)
        commands.set(cue, {cue, charge : true, gain : phase - track.sentPhase, phase});
    }
  if (commands.size)
    for (const e of d.b.edges) {
      const target = d.nodes.get(e[SYNAPSE.target]), source = d.nodes.get(e[SYNAPSE.source]);
      if (!target?.[NEURON.functional] || !source?.[NEURON.ready] || source[NEURON.muted])
        continue;
      const signal = source[NEURON.signal] ?? source[NEURON.activity],
            strength = d.b.learning ? (d.b.learning.signals?.[e[SYNAPSE.id]] ?? 0)
                                    : signal * e[SYNAPSE.strength];
      if (strength <= 0)
        continue;
      for (let k = 0; k < MOTOR_KIND.pigment; k++)
        if (target[NEURON.motors]?.[k] > 0 && brainMotorActivity(target, k, d) > 0) {
          const side = PAIRED_MOTORS.includes(k) ? (target[NEURON.x] < 0 ? 0 : 1) : 0,
                cue = sidedTissue(motorTissue(k), side), command = commands.get(cue);
          if (!command)
            continue;
          const quality = strength * brainMotorEffort(target, k, d) * target[NEURON.motors][k],
                old = work.get(cue);
          if (old && old.quality >= quality)
            continue;
          work.set(cue, {
            key : (command.charge ? 'charge:' : 'work:') + d.step + ':' + cue,
            edge : e[SYNAPSE.id],
            source : e[SYNAPSE.source],
            target : e[SYNAPSE.target],
            strength,
            quality,
            sign : 1,
            motor : k,
            motorSide : side,
            motorCue : cue,
            work : true,
            charge : !!command.charge,
            chargeGain : command.gain,
            phase : command.phase,
            cycle : command.cycle,
            cycleStep : command.cycle?.step,
            effort : brainMotorEffort(target, k, d),
            factor : d.raw?.[FISH.motor_factor] ?? d.p[FISH.motor_factor] ?? 1,
            delay : 0,
            focus : e[SYNAPSE.source] === sessionState.neuronFocus ||
                        e[SYNAPSE.target] === sessionState.neuronFocus
          });
        }
    }
  const working = [...work.values() ].sort((a, b) => b.quality - a.quality),
        ordinary = [...groups.values() ];
  for (const q of ordinary) {
    const cycle = ((Math.imul(q.edge + 1, TRACE.hash_a) ^
                    Math.imul(brainState.brainTraceStep + 1, TRACE.hash_b)) >>>
                   0) /
                  TRACE.hash_range;
    q.priority = (q.focus ? TRACE.focus_priority : 0) +
                 Math.sqrt(Math.min(1, q.strength)) * TRACE.strength_priority +
                 cycle * TRACE.random_priority;
  }
  ordinary.sort((a, b) => b.priority - a.priority || a.edge - b.edge);
  const live = brainState.brainPackets.filter(
            q => now < q.start + q.duration &&
                 (q.work ? d.nodes.has(q.target) : d.curves.has(q.edge))),
        active = live.filter(q => q.work).slice(0, limit),
        reserve =
            Math.min(limit - active.length,
                     working.reduce((sum, q) => sum + (q.motor <= MOTOR_KIND.aggression && !q.charge
                                                           ? TRACE.stroke_packets
                                                           : 1),
                                    0));
  active.push(...live.filter(q => !q.work)
                  .sort((a, b) => Number(b.focus) - Number(a.focus))
                  .slice(0, Math.max(0, limit - active.length - reserve)));
  for (const q of working) {
    if (active.length >= limit)
      break;
    const count =
              Math.min(limit - active.length,
                       q.motor <= MOTOR_KIND.aggression && !q.charge ? TRACE.stroke_packets : 1),
          spacing = TRACE.spacing,
          arrival = q.cycle?.at ??
                    now + Math.max(TRACE.min_arrival,
                                   Math.min(TRACE.max_arrival,
                                            sceneState.frameInterval * TRACE.arrival_share));
    for (let i = 0; i < count; i++) {
      const at = arrival - (count - 1 - i) * spacing,
            duration = Math.max(TRACE.min_duration, at - now);
      active.push({
        ...q,
        cycle : undefined,
        key : q.key + ':' + i,
        start : at - duration,
        duration,
        last : i === count - 1,
        radius : q.charge ? TRACE.charge_radius : TRACE.work_radius,
        alpha : q.charge ? TRACE.charge_alpha : TRACE.work_alpha
      });
    }
    brainTensionTrack(q.motor, q.motorSide).sentPhase = q.phase;
    if (q.cycle)
      q.cycle.issued.add(q.motorCue);
  }

  const used = new Set(active.map(q => q.key)), sources = new Map();
  for (const q of active)
    sources.set(q.source, (sources.get(q.source) || 0) + 1);
  for (const q of ordinary) {
    if (active.length >= limit)
      break;
    if (used.has(q.key) || !q.focus && (sources.get(q.source) || 0) >= TRACE.per_source)
      continue;
    active.push({
      ...q,
      start : now,
      duration : Math.max(
          TRACE.min_flight,
          Math.min(TRACE.max_flight, sceneState.frameInterval *
                                         (TRACE.flight_share + TRACE.flight_per_delay * q.delay))),
      radius : TRACE.radius + TRACE.radius_per_strength * brainClamp(q.strength),
      alpha : TRACE.alpha + TRACE.alpha_per_strength * brainClamp(q.strength)
    });
    used.add(q.key);
    sources.set(q.source, (sources.get(q.source) || 0) + 1);
  }
  updateBrainState({brainPackets : active});
}

export function brainSignalCurve(packet, d) {
  if (!(packet.motor >= 0))
    return d.curves.get(packet.edge);
  const key = 'motor:' + packet.edge + ':' + packet.motor + ':' + (packet.motorSide || 0);
  if (d.curves.has(key))
    return d.curves.get(key);
  const source = d.parts.get(packet.source), targets = d.parts.get(packet.target),
        to = targets?.find(p => p.key === motorTissue(packet.motor) &&
                                (p.side === undefined || p.side === (packet.motorSide || 0)));
  if (!source?.length || !to)
    return d.curves.get(packet.edge);
  const from = source.reduce((a, b) => a.share >= b.share ? a : b),
        curve = brainConnection(d, from, to, packet.source === packet.target);
  d.curves.set(key, curve);
  return curve;
}

function brainCycleKey(k, side = 0) { return k + ':' + (PAIRED_MOTORS.includes(k) ? side : 0); }

export function brainEase(value) {
  const t = brainClamp(value);
  return t * t * (3 - 2 * t);
}

function brainTensionTrack(k, side = 0) {
  const key = brainCycleKey(k, side);
  if (!brain_signalsState.brainMotorTensions.has(key))
    brain_signalsState.brainMotorTensions.set(key, {value : 0, at : 0, sentPhase : 0});
  return brain_signalsState.brainMotorTensions.get(key);
}

// Shown tension leaks over at least MIN_LIFETIME ms or LIFETIME_SHARE of the motor interval; it
// rises over RISE ms.
const CHARGE = Object.freeze({min_lifetime : 600, lifetime_share : .85, rise : 150});
export function brainDisplayCharge(k, side = 0, now = displayNow()) {
  if (k === MOTOR_KIND.suction || k === MOTOR_KIND.aggression) {
    const p = frameFish(sceneState.frame);
    return brainClamp(p?.[k === MOTOR_KIND.suction ? FISH.eat_signal : FISH.aggression] || 0);
  }
  if (k > MOTOR_KIND.aggression)
    return 0;
  const track = brainTensionTrack(k, side),
        cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(k, side));
  if (cycle?.workAt !== undefined && now >= cycle.workAt && track.at <= cycle.workAt)
    return 0;
  const lifetime = Math.max(CHARGE.min_lifetime, sceneState.frameInterval * organMotorInterval(k) *
                                                     CHARGE.lifetime_share),
        age = Math.max(0, now - track.at);
  // A received signal adds tension; during silence it leaks away. No clock fills the muscle.
  const mix = brainEase(age / (track.rise || CHARGE.rise));
  return ((track.from ?? track.value) + (track.value - (track.from ?? track.value)) * mix) *
         Math.exp(-age / lifetime);
}

export function brainCycleContraction(k, side, now) {
  if (k === MOTOR_KIND.suction || k === MOTOR_KIND.aggression) {
    const p = frameFish(sceneState.frame);
    if (!p)
      return 0;
    if (k === MOTOR_KIND.suction)
      return p[FISH.suction_pose] || 0;
    // The bite closes in the mouth cycle's second half, for BITE_SHOWN steps.
    const phase = p[FISH.mouth_phase] ?? -1, closing = MOUTH_CYCLE.steps / 2;
    return phase >= closing && phase <= closing + BITE_SHOWN
               ? (1 - (p[FISH.mouth_pose] || 0)) * (p[FISH.aggression] || 0)
               : 0;
  }
  const cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(k, side));
  if (!cycle || cycle.workAt === undefined)
    return 0;
  const elapsed = now - cycle.workAt;
  if (elapsed < 0 || elapsed >= cycle.duration)
    return 0;
  const rise = brainEase(elapsed / cycle.attack),
        release = 1 - brainEase((elapsed - cycle.attack - cycle.hold) /
                                (cycle.duration - cycle.attack - cycle.hold));
  return cycle.pose * rise * release;
}

// Fins pre-tense by LEAD of their pose over LEAD_TIME ms before a stroke.
const FIN_RELEASE = Object.freeze({lead : .08, lead_time : 45});
function brainFinRelease(k, side, now) {
  const cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(k, side));
  if (!cycle || cycle.workAt === undefined)
    return 0;
  const elapsed = now - cycle.workAt;
  if (elapsed < 0)
    return FIN_RELEASE.lead * cycle.pose *
           brainEase((elapsed + FIN_RELEASE.lead_time) / FIN_RELEASE.lead_time);
  const stroke = brainCycleContraction(k, side, now);
  return stroke + FIN_RELEASE.lead * cycle.pose * (1 - brainEase(elapsed / cycle.attack));
}

function brainDisplayMotorValue(p, k, value, side = 0) {
  if (k === MOTOR_KIND.suction || k === MOTOR_KIND.aggression)
    return value;
  if (!brainState.brainOpen || brainState.brainOpacity < SHOWN_OPACITY ||
      p[FISH.id] !== sceneState.frame?.selected)
    return value;
  const now = displayNow(), cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(k, side));
  if (!cycle)
    return value;
  if (k <= MOTOR_KIND.turn)
    return brainFinRelease(k, side, now);
  if ((k === MOTOR_KIND.eggs || k === MOTOR_KIND.sperm) && cycle) {
    const from = cycle.from ?? value, to = cycle.to ?? value,
          mix = cycle.workAt === undefined ? 0 : brainEase((now - cycle.workAt) / cycle.duration);
    return from + (to - from) * mix;
  }
  return value;
}

// Tail poses scale against at least MIN_POSE.
const DISPLAY_TAIL = Object.freeze({min_pose : .001});
function brainDisplayTail(p, value) {
  if (!brainState.brainOpen || brainState.brainOpacity < SHOWN_OPACITY ||
      p[FISH.id] !== sceneState.frame?.selected)
    return value;
  const cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(MOTOR_KIND.forward));
  return cycle ? cycle.tail * brainFinRelease(MOTOR_KIND.forward, 0, displayNow()) /
                     Math.max(DISPLAY_TAIL.min_pose, cycle.pose)
               : value;
}

export function brainPresentationFish(p) {
  if (!brainState.brainOpen || brainState.brainOpacity < SHOWN_OPACITY ||
      p[FISH.id] !== sceneState.frame?.selected || !p[FISH.hatched])
    return p;
  const out = p.slice();
  if (p.birthing)
    Object.assign(out, {birthing : true, birthProgress : p.birthProgress, birthDuct : p.birthDuct});
  // The tail fin follows the forward motor, the side fins the turn motor of their side.
  out[FISH.fin_pose] = Object.values(FIN).map(
      fin => brainDisplayMotorValue(p, fin === FIN.tail ? MOTOR_KIND.forward : MOTOR_KIND.turn,
                                    p[FISH.fin_pose]?.[fin] || 0,
                                    fin === FIN.tail ? 0 : fin - FIN.left));
  out[FISH.fin_pose][FINS] = p[FISH.fin_pose]?.[FINS];
  // Mouth geometry and pump flow are the simulation's values, including in inspection.
  out[FISH.tail] = brainDisplayTail(p, p[FISH.tail] || 0);
  out[FISH.egg_yolk] = p.birthing
                           ? p[FISH.egg_yolk]
                           : brainDisplayMotorValue(p, MOTOR_KIND.eggs, p[FISH.egg_yolk] || 0);
  out[FISH.sperm_store] = brainDisplayMotorValue(p, MOTOR_KIND.sperm, p[FISH.sperm_store] || 0);
  return out;
}

export function brainResetSignals() {
  brain_signalsState.brainArrivals.clear();
  brain_signalsState.brainMotorEvents.clear();
  brain_signalsState.brainMotorInputs.clear();
  brain_signalsState.brainMotorCycles.clear();
  brain_signalsState.brainMotorTensions.clear();
  brain_signalsState.brainMotorLast = null;
}

export function brainMotorActivity(n, k, d) {
  const port = MOTOR_PORTS[k],
        e = (d.effectors.get(n[NEURON.index]) || []).find(e => e[EFFECTOR.port] === port),
        state = n[NEURON.state] ?? n[NEURON.activity];
  // Bladder and gland work in both directions.
  return e && n[NEURON.functional] && n[NEURON.ready] && !n[NEURON.muted]
             ? brainClamp(k === MOTOR_KIND.bladder || k === MOTOR_KIND.gland ? Math.abs(state)
                                                                             : state)
             : 0;
}

function brainMotorEffort(n, k, d) {
  if (!d.motorPeaks) {
    d.motorPeaks = new Map();
    for (const [id, effectors] of d.effectors) {
      const cell = d.nodes.get(id);
      if (!cell)
        continue;
      for (const e of effectors) {
        const j = MOTOR_PORTS.indexOf(e[EFFECTOR.port]),
              key = j + ':' + (j === MOTOR_KIND.turn ? (cell[NEURON.x] < 0 ? 0 : 1) : 0),
              activation = brainMotorActivity(cell, j, d);
        d.motorPeaks.set(key, Math.max(d.motorPeaks.get(key) || 0, activation));
      }
    }
  }
  const peak =
      d.motorPeaks.get(k + ':' + (k === MOTOR_KIND.turn ? (n[NEURON.x] < 0 ? 0 : 1) : 0)) || 0;
  return peak > 0 ? brainMotorActivity(n, k, d) / peak : 0;
}

// A motor pulse plays as a cycle of the frame interval's length within bounds, starting after a
// lead; it rises over ATTACK_SHARE (at most MAX_ATTACK ms) and holds HOLD ms.
const MOTOR_CYCLE = Object.freeze({
  min_duration : 460,
  max_duration : 760,
  duration_share : 1.2,
  min_lead : 280,
  max_lead : 550,
  lead_share : .65,
  max_attack : 100,
  attack_share : .16,
  hold : 50
});
function brainRememberMotors(d, now) {
  if (brain_signalsState.brainMotorLast?.layout !== d.b.layout_id ||
      brain_signalsState.brainMotorLast.fish !== (d.raw || d.p)[FISH.id]) {
    brainResetSignals();
    brain_signalsState
        .brainMotorLast = {layout : d.b.layout_id, fish : (d.raw || d.p)[FISH.id], step : -1};
  }
  if (brain_signalsState.brainMotorLast.step === d.step)
    return;
  brain_signalsState.brainMotorLast.step = d.step;
  const p = d.raw || d.p;
  for (let k = 0; k <= MOTOR_KIND.pigment; k++)
    if (k !== MOTOR_KIND.suction && k !== MOTOR_KIND.aggression && d.b.motor_pulses?.[k] &&
        (p[FISH.motor_factor] ?? 1) > 0)
      for (const side of (PAIRED_MOTORS.includes(k) ? [ 0, 1 ] : [ 0 ])) {
        if (k === MOTOR_KIND.turn && !(p[FISH.impulse_left + side] > 0))
          continue;
        if (k === MOTOR_KIND.defense && !(p[FISH.organs]?.[ANATOMY.armor_left + side] > 0))
          continue;
        const duration = Math.max(MOTOR_CYCLE.min_duration,
                                  Math.min(MOTOR_CYCLE.max_duration,
                                           sceneState.frameInterval * MOTOR_CYCLE.duration_share)),
              lead = Math.max(MOTOR_CYCLE.min_lead,
                              Math.min(MOTOR_CYCLE.max_lead,
                                       sceneState.frameInterval * MOTOR_CYCLE.lead_share)),
              slot = k === MOTOR_KIND.eggs    ? FISH.egg_yolk
                     : k === MOTOR_KIND.sperm ? FISH.sperm_store
                                              : null;
        brain_signalsState.brainMotorCycles.set(brainCycleKey(k, side), {
          step : d.step,
          started : now,
          at : now + lead,
          duration,
          attack : Math.min(MOTOR_CYCLE.max_attack, duration * MOTOR_CYCLE.attack_share),
          hold : MOTOR_CYCLE.hold,
          from : slot === null ? 0 : sceneState.previousFish.get(p[FISH.id])?.[slot] ?? p[slot],
          to : slot === null ? 0 : p[slot],
          pose : k === MOTOR_KIND.forward ? (p[FISH.fin_pose]?.[FIN.tail] ?? 1)
                 : k === MOTOR_KIND.turn  ? (p[FISH.fin_pose]?.[FIN.left + side] ?? 1)
                                          : 1,
          tail : p[FISH.tail] || 0,
          issued : new Set()
        });
      }
}

export function brainPreDraw(f, now = displayNow()) {
  const b = f.brain, raw = frameFish(f);
  if (!brainState.brainOpen || brainState.brainOpacity < SHOWN_OPACITY || !raw?.[FISH.hatched] ||
      !b?.neurons?.length ||
      brain_signalsState.brainMotorLast?.layout === b.layout_id &&
          brain_signalsState.brainMotorLast.step === f.step)
    return;
  brainRememberMotors({b, raw, p : raw, step : f.step}, now);
}

// Arrived signals fade over DECAY ms.
const ARRIVAL = Object.freeze({decay : 260});
export function brainArrivalValue(id, now) {
  const q = brain_signalsState.brainArrivals.get(id);
  if (!q || now < q.at)
    return {positive : 0, negative : 0, age : Infinity};
  const age = now - q.at, decay = Math.exp(-age / ARRIVAL.decay);
  return {positive : q.positive * decay, negative : q.negative * decay, age};
}

// Arrivals add GAIN plus GAIN_PER_STRENGTH; work starts WORK_DELAY ms after arrival; old
// arrivals are forgotten after FORGET ms.
const ARRIVALS = Object.freeze({
  gain : .22,
  gain_per_strength : .65,
  charge_rise : 150,
  work_rise : 30,
  charge_gain : .15,
  pulse_gain : .3,
  work_delay : 45,
  forget : 1400
});
export function brainCollectArrivals(d, now) {
  brainRememberMotors(d, now);
  const due = brainState.brainPackets
                  .filter(p => !p.arrived && now >= p.start + p.duration && d.nodes.has(p.target))
                  .sort((a, b) => a.start + a.duration - b.start - b.duration);
  for (const packet of due) {
    packet.arrived = true;
    const at = packet.start + packet.duration, old = brainArrivalValue(packet.target, at),
          gain =
              ARRIVALS.gain + ARRIVALS.gain_per_strength * Math.sqrt(brainClamp(packet.strength));
    brain_signalsState.brainArrivals.set(packet.target, {
      at,
      edge : packet.edge,
      source : packet.source,
      target : packet.target,
      motor : packet.motor,
      motorSide : packet.motorSide,
      positive : brainClamp(old.positive + (packet.sign > 0 ? gain : 0)),
      negative : brainClamp(old.negative + (packet.sign < 0 ? gain : 0))
    });
    if (packet.sign > 0 && packet.motor >= 0 && (packet.work || d.b.motor_pulses?.[packet.motor])) {
      const n = d.nodes.get(packet.target),
            factor = packet.factor ?? d.raw?.[FISH.motor_factor] ?? d.p[FISH.motor_factor] ?? 1,
            key = packet.target + ':' + packet.motor,
            cycle = brain_signalsState.brainMotorCycles.get(
                brainCycleKey(packet.motor, packet.motorSide || 0));
      brain_signalsState.brainMotorInputs.set(key, {at, gain});
      if (factor > 0 && packet.work && packet.motor <= MOTOR_KIND.aggression) {
        const track = brainTensionTrack(packet.motor, packet.motorSide || 0),
              value = brainDisplayCharge(packet.motor, packet.motorSide || 0, at);
        track.from = value;
        track.rise = packet.charge ? ARRIVALS.charge_rise : ARRIVALS.work_rise;
        track.value = packet.charge
                          ? brainClamp(value + (packet.chargeGain ?? ARRIVALS.charge_gain))
                      : packet.last === false ? brainClamp(value + ARRIVALS.pulse_gain)
                                              : 1;
        track.at = at;
      }
      if (factor > 0 && packet.work && !packet.charge && cycle &&
          (packet.cycleStep === undefined || packet.cycleStep === cycle.step)) {
        cycle.firstAt ??= at;
        if (packet.last !== false)
          cycle.workAt ??= at + ARRIVALS.work_delay;
      }
      if (factor > 0 && !packet.charge && packet.last !== false)
        brain_signalsState.brainMotorEvents.set(key, {
          at : at + ARRIVALS.work_delay,
          effort : packet.effort ?? brainMotorEffort(n, packet.motor, d),
          factor
        });
    }
  }
  for (const [id, q] of brain_signalsState.brainArrivals)
    if (now - q.at > ARRIVALS.forget)
      brain_signalsState.brainArrivals.delete(id);
}

function brainMotorReadiness(k, d, side = 0) {
  const index = organStrokeIndex(k, side), threshold = d.b.stroke_threshold;
  if (!(threshold > 0))
    return 0;
  let mean = d.b.strokes?.[index]?.[STROKE.mean] || 0;
  const before = sceneState.previous?.selected === d.p[FISH.id] &&
                         sceneState.previous.brain?.layout_id === d.b.layout_id
                     ? sceneState.previous.brain.strokes?.[index]?.[STROKE.mean]
                     : null;
  if (!sceneState.frame?.paused && before !== null && before !== undefined && mean >= before)
    mean = before + (mean - before) * frameBlend();
  return brainClamp(mean / threshold);
}

// Muscle input fades over INPUT_DECAY ms; a laid egg passes the duct muscles; spines erect with
// the defence activity.
const MUSCLE_STATE = Object.freeze({
  input_decay : 180,
  duct_start : .32,
  duct_span : .60,
  passage_travel : .55,
  passage_behind : .14,
  passage_length : .16,
  spine_share : .85
});
export function brainMuscleState(n, k, d, now) {
  const activation = brainMotorActivity(n, k, d),
        input = brain_signalsState.brainMotorInputs.get(n[NEURON.index] + ':' + k),
        age = input ? now - input.at : Infinity,
        positive = input && age >= 0 ? input.gain * Math.exp(-age / MUSCLE_STATE.input_decay) : 0,
        arrival = {positive, negative : 0, age},
        event = brain_signalsState.brainMotorEvents.get(n[NEURON.index] + ':' + k),
        elapsed = event ? now - event.at : Infinity, effort = 1, flash = 0,
        side = n[NEURON.x] < 0 ? 0 : 1;
  let pose = k <= MOTOR_KIND.turn         ? brainFinRelease(k, side, now)
             : k <= MOTOR_KIND.aggression ? brainCycleContraction(k, side, now)
                                          : 0;
  if (k === MOTOR_KIND.eggs && d.a.birthing) {
    const t = MUSCLE_STATE.duct_start + MUSCLE_STATE.duct_span * brainClamp((n[NEURON.y] + 1) / 2),
          behind = d.a.birthProgress / MUSCLE_STATE.passage_travel - MUSCLE_STATE.passage_behind;
    pose = Math.max(pose, Math.exp(-(((t - behind) / MUSCLE_STATE.passage_length) ** 2)));
  }
  if (k === MOTOR_KIND.aggression) {
    pose = brainCycleContraction(MOTOR_KIND.aggression, 0, now);
  } else if (k === MOTOR_KIND.defense) {
    const capacity = (d.a.organs[ANATOMY.armor_left] || 0) + (d.a.organs[ANATOMY.armor_right] || 0);
    pose = capacity > 0 ? brainClamp(d.a.defenseActivity * (1 + capacity) /
                                     (MUSCLE_STATE.spine_share * capacity))
                        : 0;
  }
  return {
    activation,
    ...arrival,
    arrivalAge : arrival.age,
    charge : brainDisplayCharge(k, side, now) * effort,
    flash,
    elapsed,
    contraction : brainClamp(pose * effort)
  };
}

// Motor colours brighten with charge or contraction around a gray of GRAY.
const MOTOR_TONE = Object.freeze({
  min_span : .01,
  base : .15,
  base_span : .85,
  tone : .18,
  tone_per_charge : .82,
  pulse_tone : .25,
  pulse_tone_per_contraction : .65,
  gray : .33,
  gray_per_contraction : .07
});
export function brainMotorColor(k, state) {
  const original = hexColor(brainMotorColors[k]), lo = Math.min(...original),
        span = Math.max(MOTOR_TONE.min_span, Math.max(...original) - lo),
        base = k <= MOTOR_KIND.aggression
                   ? original.map(c => MOTOR_TONE.base + MOTOR_TONE.base_span * (c - lo) / span)
                   : original,
        charge = brainClamp(state.charge || 0),
        tone = k <= MOTOR_KIND.aggression
                   ? MOTOR_TONE.tone + MOTOR_TONE.tone_per_charge * charge
                   : MOTOR_TONE.pulse_tone +
                         MOTOR_TONE.pulse_tone_per_contraction * (state.contraction || 0),
        gray = MOTOR_TONE.gray + MOTOR_TONE.gray_per_contraction * (state.contraction || 0);
  return rgb(base.map(c => gray + (c - gray) * tone));
}

// Effector fibres per organ: along the egg duct, across the sperm organ, along the cheek, up the
// spines.
const EFFECTOR_FIBER = Object.freeze({
  duct_start : .32,
  duct_span : .60,
  sperm_span : .14,
  sperm_span_per_depth : .10,
  sperm_slant : .008,
  cheek_start : .10,
  cheek_span : .8,
  cheek_across : .2,
  cheek_across_span : .6,
  cheek_first : .02,
  cheek_reach : .16,
  cheek_last : .98,
  spine_half : .03,
  spine_root : .08,
  spine_tip : .60
});
function brainEffectorFiber(n, k, d, center) {
  if (k < MOTOR_KIND.eggs)
    return brainFiber(n, k, d);
  const side = k === MOTOR_KIND.aggression ? (center[1] < 0 ? 0 : 1) : (n[NEURON.x] < 0 ? 0 : 1),
        depth = brainClamp((n[NEURON.y] + 1) / 2);
  if (k === MOTOR_KIND.eggs)
    return fishEggMuscleFiber(d.a, EFFECTOR_FIBER.duct_start + EFFECTOR_FIBER.duct_span * depth,
                              side);
  if (k === MOTOR_KIND.sperm) {
    const q = fishGameteShape(d.a, k),
          span = q.rx * (EFFECTOR_FIBER.sperm_span + EFFECTOR_FIBER.sperm_span_per_depth * depth);
    return [
      [ center[0] - span, center[1] - EFFECTOR_FIBER.sperm_slant ],
      [ center[0] + span, center[1] + EFFECTOR_FIBER.sperm_slant ]
    ];
  }
  if (k === MOTOR_KIND.aggression) {
    const t = EFFECTOR_FIBER.cheek_start + EFFECTOR_FIBER.cheek_span * depth,
          across = EFFECTOR_FIBER.cheek_across +
                   EFFECTOR_FIBER.cheek_across_span * brainClamp((n[NEURON.z] + 1) / 2);
    return [
      fishCheekPoint(d.a, side,
                     Math.max(EFFECTOR_FIBER.cheek_first, t - EFFECTOR_FIBER.cheek_reach), across),
      fishCheekPoint(d.a, side, Math.min(EFFECTOR_FIBER.cheek_last, t + EFFECTOR_FIBER.cheek_reach),
                     across)
    ];
  }
  const pieces = fishDefenseSpines(d.a, side),
        q = pieces[Math.min(pieces.length - 1, Math.floor((1 - depth) * pieces.length))];
  if (!q)
    return [
      [ center[0] - EFFECTOR_FIBER.spine_half, center[1] ],
      [ center[0] + EFFECTOR_FIBER.spine_half, center[1] ]
    ];
  const root = [ (q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2 ],
        delta = [ q[1][0] - root[0], q[1][1] - root[1] ];
  return [
    [
      root[0] + delta[0] * EFFECTOR_FIBER.spine_root, root[1] + delta[1] * EFFECTOR_FIBER.spine_root
    ],
    [ root[0] + delta[0] * EFFECTOR_FIBER.spine_tip, root[1] + delta[1] * EFFECTOR_FIBER.spine_tip ]
  ];
}

// Muscles shorten and thicken as they contract or charge, at least MIN_PIXELS wide.
const MUSCLE_SHAPE = Object.freeze({
  min_length : .001,
  shortening : .52,
  charge_shortening : .16,
  min_pixels : 1.5,
  suction_width : .024,
  width : .026,
  charge_width : .20,
  signal_width : .30
});
export function brainMuscleShape(n, k, d, state, center) {
  const f = brainEffectorFiber(n, k, d, center), dx = f[1][0] - f[0][0], dy = f[1][1] - f[0][1],
        length = Math.max(MUSCLE_SHAPE.min_length, Math.hypot(dx, dy)),
        shorten = 1 - MUSCLE_SHAPE.shortening * state.contraction -
                  (k <= MOTOR_KIND.turn ? 0 : MUSCLE_SHAPE.charge_shortening * (state.charge || 0)),
        half = length * shorten * .5,
        width =
            Math.max(MUSCLE_SHAPE.min_pixels / d.r,
                     k === MOTOR_KIND.suction ? MUSCLE_SHAPE.suction_width : MUSCLE_SHAPE.width) *
            (1 + (k <= MOTOR_KIND.turn
                      ? 0
                      : MUSCLE_SHAPE.charge_width * (state.charge || 0) +
                            MUSCLE_SHAPE.signal_width *
                                Math.max(state.positive || 0, state.negative || 0))) /
            Math.sqrt(shorten),
        nx = -dy / length, ny = dx / length;
  return {x : center[0], y : center[1], dx : dx / length, dy : dy / length, nx, ny, half, width};
}

const initializers = {
  "brainArrivals" : () => { brain_signalsState.brainArrivals = new Map(); },
  "brainMotorEvents" : () => { brain_signalsState.brainMotorEvents = new Map(); },
  "brainMotorInputs" : () => { brain_signalsState.brainMotorInputs = new Map(); },
  "brainMotorCycles" : () => { brain_signalsState.brainMotorCycles = new Map(); },
  "brainMotorTensions" : () => { brain_signalsState.brainMotorTensions = new Map(); },
  "brainMotorLast" : () => { brain_signalsState.brainMotorLast = null; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
