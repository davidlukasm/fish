import {FISH} from './schema.js';
import {updateBrainState} from './brain.js';
import {brainClamp, brainState} from './brain.js';
import {brainFiber} from './brain_geometry.js';
import {brainMotorColors} from './brain_model.js';
import {brainConnection} from './brain_paths.js';
import {el, rgb, text} from './dom.js';
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
export let brainPacketLimit;

export function brainTrace(d) {
  const now = displayNow();
  brainCollectArrivals(d, now);
  const selection = el('brain-flow').value === 'selection',
        limit = selection ? 24 : brainPacketLimit, groups = new Map(),
        bin = Math.max(16, d.r * .11);
  for (const {e, curve} of d.edges) {
    const source = d.nodes.get(e[0]), parts = d.parts.get(e[1]),
          main = parts?.reduce((a, b) => a.share >= b.share ? a : b);
    if (!source)
      continue;
    const signal = source[19] ?? source[3],
          value = d.b.learning ? (d.b.learning.signals?.[e[3]] ?? 0) : signal * e[2],
          strength = Math.abs(value);
    if (strength < (source[5] === sessionState.neuronFocus ? .002 : .015) || !source[7] ||
        source[10])
      continue;
    const sign = value >= 0 ? 1 : -1,
          key =
              [
                Math.round(curve[0] / bin), Math.round(curve[1] / bin),
                Math.round(curve[curve.length - 2] / bin),
                Math.round(curve[curve.length - 1] / bin), sign
              ].join(':'),
          old = groups.get(key),
          focus = e[0] === sessionState.neuronFocus || e[1] === sessionState.neuronFocus;
    if (!old || strength > old.strength)
      groups.set(key, {
        key,
        edge : e[3],
        source : e[0],
        target : e[1],
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
  for (let k = 0; k < 7; k++)
    for (const side of ([ 1, 6 ].includes(k) ? [ 0, 1 ] : [ 0 ])) {
      const key = brainCycleKey(k, side), cycle = brain_signalsState.brainMotorCycles.get(key),
            cue = 'm' + k + ':' + side, track = brainTensionTrack(k, side),
            pulse = cycle?.step === d.step && !cycle.issued.has(cue),
            phase = k <= 5 ? brainMotorReadiness(k, d, side) : 0;
      if (phase < track.sentPhase)
        track.sentPhase = 0;
      if (pulse)
        commands.set(cue, {cycle, cue, release : k <= 5, gain : .3, phase});
      else if (k <= 5 && phase - track.sentPhase >= .08)
        commands.set(cue, {cue, charge : true, gain : phase - track.sentPhase, phase});
    }
  if (commands.size)
    for (const e of d.b.edges) {
      const target = d.nodes.get(e[1]), source = d.nodes.get(e[0]);
      if (!target?.[4] || !source?.[7] || source[10] ||
          selection && sessionState.neuronFocus >= 0 && e[0] !== sessionState.neuronFocus &&
              e[1] !== sessionState.neuronFocus)
        continue;
      const signal = source[19] ?? source[3],
            strength = d.b.learning ? (d.b.learning.signals?.[e[3]] ?? 0) : signal * e[2];
      if (strength <= 0)
        continue;
      for (let k = 0; k < 7; k++)
        if (target[14]?.[k] > 0 && brainMotorActivity(target, k, d) > 0) {
          const side = [ 1, 6 ].includes(k) ? (target[0] < 0 ? 0 : 1) : 0,
                cue = 'm' + k + ':' + side, command = commands.get(cue);
          if (!command)
            continue;
          const quality = strength * brainMotorEffort(target, k, d) * target[14][k],
                old = work.get(cue);
          if (old && old.quality >= quality)
            continue;
          work.set(cue, {
            key : (command.charge ? 'charge:' : 'work:') + d.step + ':' + cue,
            edge : e[3],
            source : e[0],
            target : e[1],
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
            factor : d.raw?.[56] ?? d.p[56] ?? 1,
            delay : 0,
            focus : e[0] === sessionState.neuronFocus || e[1] === sessionState.neuronFocus
          });
        }
    }
  const working = [...work.values() ].sort((a, b) => b.quality - a.quality),
        ordinary = [...groups.values() ];
  for (const q of ordinary) {
    const cycle = ((Math.imul(q.edge + 1, 2654435761) ^
                    Math.imul(brainState.brainTraceStep + 1, 2246822519)) >>>
                   0) /
                  4294967296;
    q.priority = (q.focus ? 3 : 0) + Math.sqrt(Math.min(1, q.strength)) * .65 + cycle * .35;
  }
  ordinary.sort((a, b) => b.priority - a.priority || a.edge - b.edge);
  const live = brainState.brainPackets.filter(
            q => now < q.start + q.duration &&
                 (q.work ? d.nodes.has(q.target) : d.curves.has(q.edge))),
        active = live.filter(q => q.work).slice(0, limit),
        reserve =
            Math.min(limit - active.length,
                     working.reduce((sum, q) => sum + (q.motor <= 5 && !q.charge ? 2 : 1), 0));
  active.push(...live.filter(q => !q.work)
                  .sort((a, b) => Number(b.focus) - Number(a.focus))
                  .slice(0, Math.max(0, limit - active.length - reserve)));
  for (const q of working) {
    if (active.length >= limit)
      break;
    const count = Math.min(limit - active.length, q.motor <= 5 && !q.charge ? 2 : 1), spacing = 80,
          arrival =
              q.cycle?.at ?? now + Math.max(240, Math.min(500, sceneState.frameInterval * .6));
    for (let i = 0; i < count; i++) {
      const at = arrival - (count - 1 - i) * spacing, duration = Math.max(120, at - now);
      active.push({
        ...q,
        cycle : undefined,
        key : q.key + ':' + i,
        start : at - duration,
        duration,
        last : i === count - 1,
        radius : q.charge ? .95 : 1.25,
        alpha : q.charge ? .75 : .95
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
    if (used.has(q.key) || !q.focus && (sources.get(q.source) || 0) >= 2)
      continue;
    active.push({
      ...q,
      start : now,
      duration : Math.max(140, Math.min(1100, sceneState.frameInterval * (.55 + .20 * q.delay))),
      radius : .85 + .55 * brainClamp(q.strength),
      alpha : .30 + .55 * brainClamp(q.strength)
    });
    used.add(q.key);
    sources.set(q.source, (sources.get(q.source) || 0) + 1);
  }
  updateBrainState({brainPackets : active});
  text('brain-flow-note', d.edges.length.toLocaleString('de') + ' Verbindungen');
  el('brain-flow-note').title = 'Signale laden die Muskelspannung; beim Schlag wird sie entladen.';
}

export function brainSignalCurve(packet, d) {
  if (!(packet.motor >= 0))
    return d.curves.get(packet.edge);
  const key = 'motor:' + packet.edge + ':' + packet.motor + ':' + (packet.motorSide || 0);
  if (d.curves.has(key))
    return d.curves.get(key);
  const source = d.parts.get(packet.source), targets = d.parts.get(packet.target),
        to = targets?.find(p => p.key === 'm' + packet.motor &&
                                (p.side === undefined || p.side === (packet.motorSide || 0)));
  if (!source?.length || !to)
    return d.curves.get(packet.edge);
  const from = source.reduce((a, b) => a.share >= b.share ? a : b),
        curve = brainConnection(d, from, to, packet.source === packet.target);
  d.curves.set(key, curve);
  return curve;
}

export function brainCycleKey(k, side = 0) { return k + ':' + ([ 1, 6 ].includes(k) ? side : 0); }

export function brainEase(value) {
  const t = brainClamp(value);
  return t * t * (3 - 2 * t);
}

export function brainTensionTrack(k, side = 0) {
  const key = brainCycleKey(k, side);
  if (!brain_signalsState.brainMotorTensions.has(key))
    brain_signalsState.brainMotorTensions.set(key, {value : 0, at : 0, sentPhase : 0});
  return brain_signalsState.brainMotorTensions.get(key);
}

export function brainDisplayCharge(k, side = 0, now = displayNow()) {
  if (k === 2 || k === 5) {
    const p = frameFish(sceneState.frame);
    return brainClamp(p?.[k === 2 ? FISH.eat_signal : FISH.aggression] || 0);
  }
  if (k > 5)
    return 0;
  const track = brainTensionTrack(k, side),
        cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(k, side));
  if (cycle?.workAt !== undefined && now >= cycle.workAt && track.at <= cycle.workAt)
    return 0;
  const lifetime = Math.max(600, sceneState.frameInterval * organMotorInterval(k) * .85),
        age = Math.max(0, now - track.at);
  // A received signal adds tension; during silence it leaks away. No clock fills the muscle.
  const mix = brainEase(age / (track.rise || 150));
  return ((track.from ?? track.value) + (track.value - (track.from ?? track.value)) * mix) *
         Math.exp(-age / lifetime);
}

export function brainCycleContraction(k, side, now) {
  if (k === 2 || k === 5) {
    const p = frameFish(sceneState.frame);
    if (!p)
      return 0;
    if (k === 2)
      return p[FISH.suction_pose] || 0;
    const phase = p[FISH.mouth_phase] ?? -1;
    return phase >= 4 && phase <= 6 ? (1 - (p[FISH.mouth_pose] || 0)) * (p[FISH.aggression] || 0)
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

export function brainFinRelease(k, side, now) {
  const cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(k, side));
  if (!cycle || cycle.workAt === undefined)
    return 0;
  const elapsed = now - cycle.workAt;
  if (elapsed < 0)
    return .08 * cycle.pose * brainEase((elapsed + 45) / 45);
  const stroke = brainCycleContraction(k, side, now);
  return stroke + .08 * cycle.pose * (1 - brainEase(elapsed / cycle.attack));
}

export function brainDisplayMotorValue(p, k, value, side = 0) {
  if (k === 2 || k === 5)
    return value;
  if (!brainState.brainOpen || brainState.brainOpacity < .5 || p[4] !== sceneState.frame?.selected)
    return value;
  const now = displayNow(), cycle = brain_signalsState.brainMotorCycles.get(brainCycleKey(k, side));
  if (!cycle)
    return value;
  if (k < 2)
    return brainFinRelease(k, side, now);
  if ((k === 3 || k === 4) && cycle) {
    const from = cycle.from ?? value, to = cycle.to ?? value,
          mix = cycle.workAt === undefined ? 0 : brainEase((now - cycle.workAt) / cycle.duration);
    return from + (to - from) * mix;
  }
  return value;
}

export function brainDisplayTail(p, value) {
  if (!brainState.brainOpen || brainState.brainOpacity < .5 || p[4] !== sceneState.frame?.selected)
    return value;
  const cycle = brain_signalsState.brainMotorCycles.get('0:0');
  return cycle ? cycle.tail * brainFinRelease(0, 0, displayNow()) / Math.max(.001, cycle.pose)
               : value;
}

export function brainPresentationFish(p) {
  if (!brainState.brainOpen || brainState.brainOpacity < .5 ||
      p[4] !== sceneState.frame?.selected || !p[8])
    return p;
  const out = p.slice();
  if (p.birthing)
    Object.assign(out, {birthing : true, birthProgress : p.birthProgress, birthDuct : p.birthDuct});
  out[57] = [ 0, 1, 2 ].map(
      i => brainDisplayMotorValue(p, i === 0 ? 0 : 1, p[57]?.[i] || 0, i === 0 ? 0 : i - 1));
  out[57][3] = p[57]?.[3];
  // Mouth geometry and pump flow are the simulation's values, including in inspection.
  out[44] = brainDisplayTail(p, p[44] || 0);
  out[46] = p.birthing ? p[46] : brainDisplayMotorValue(p, 3, p[46] || 0);
  out[48] = brainDisplayMotorValue(p, 4, p[48] || 0);
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
  const port = [ 1, 2, 6, 4, 5, 10, 11, 7, 12, 13 ][k],
        e = (d.effectors.get(n[5]) || []).find(e => e[1] === port);
  return e && n[4] && n[7] && !n[10] ? brainClamp(k === 1 ? Math.abs(n[18] ?? n[3]) : n[18] ?? n[3])
                                     : 0;
}

export function brainMotorEffort(n, k, d) {
  if (!d.motorPeaks) {
    d.motorPeaks = new Map();
    for (const [id, effectors] of d.effectors) {
      const cell = d.nodes.get(id);
      if (!cell)
        continue;
      for (const e of effectors) {
        const j = [ 1, 2, 6, 4, 5, 10, 11, 7, 12, 13 ].indexOf(e[1]),
              key = j + ':' + (j === 1 ? (cell[0] < 0 ? 0 : 1) : 0),
              activation = brainMotorActivity(cell, j, d);
        d.motorPeaks.set(key, Math.max(d.motorPeaks.get(key) || 0, activation));
      }
    }
  }
  const peak = d.motorPeaks.get(k + ':' + (k === 1 ? (n[0] < 0 ? 0 : 1) : 0)) || 0;
  return peak > 0 ? brainMotorActivity(n, k, d) / peak : 0;
}

export function brainRememberMotors(d, now) {
  if (brain_signalsState.brainMotorLast?.layout !== d.b.layout_id ||
      brain_signalsState.brainMotorLast.fish !== (d.raw || d.p)[4]) {
    brainResetSignals();
    brain_signalsState
        .brainMotorLast = {layout : d.b.layout_id, fish : (d.raw || d.p)[4], step : -1};
  }
  if (brain_signalsState.brainMotorLast.step === d.step)
    return;
  brain_signalsState.brainMotorLast.step = d.step;
  const p = d.raw || d.p;
  for (let k = 0; k < 8; k++)
    if (k !== 2 && k !== 5 && d.b.motor_pulses?.[k] && (p[56] ?? 1) > 0)
      for (const side of ([ 1, 6 ].includes(k) ? [ 0, 1 ] : [ 0 ])) {
        if (k === 1 && !(p[42 + side] > 0))
          continue;
        if (k === 6 && !(p[32]?.[32 + side] > 0))
          continue;
        const duration = Math.max(460, Math.min(760, sceneState.frameInterval * 1.2)),
              lead = Math.max(280, Math.min(550, sceneState.frameInterval * .65)),
              slot = k === 3   ? 46
                     : k === 4 ? 48
                               : null;
        brain_signalsState.brainMotorCycles.set(brainCycleKey(k, side), {
          step : d.step,
          started : now,
          at : now + lead,
          duration,
          attack : Math.min(100, duration * .16),
          hold : 50,
          from : slot === null ? 0 : sceneState.previousFish.get(p[4])?.[slot] ?? p[slot],
          to : slot === null ? 0 : p[slot],
          pose : k === 0   ? (p[57]?.[0] ?? 1)
                 : k === 1 ? (p[57]?.[side + 1] ?? 1)
                           : 1,
          tail : p[44] || 0,
          issued : new Set()
        });
      }
}

export function brainPreDraw(f, now = displayNow()) {
  const b = f.brain, raw = frameFish(f);
  if (!brainState.brainOpen || brainState.brainOpacity < .5 || !raw?.[8] || !b?.neurons?.length ||
      brain_signalsState.brainMotorLast?.layout === b.layout_id &&
          brain_signalsState.brainMotorLast.step === f.step)
    return;
  brainRememberMotors({b, raw, p : raw, step : f.step}, now);
}

export function brainArrivalValue(id, now) {
  const q = brain_signalsState.brainArrivals.get(id);
  if (!q || now < q.at)
    return {positive : 0, negative : 0, age : Infinity};
  const age = now - q.at, decay = Math.exp(-age / 260);
  return {positive : q.positive * decay, negative : q.negative * decay, age};
}

export function brainCollectArrivals(d, now) {
  brainRememberMotors(d, now);
  const due = brainState.brainPackets
                  .filter(p => !p.arrived && now >= p.start + p.duration && d.nodes.has(p.target))
                  .sort((a, b) => a.start + a.duration - b.start - b.duration);
  for (const packet of due) {
    packet.arrived = true;
    const at = packet.start + packet.duration, old = brainArrivalValue(packet.target, at),
          gain = .22 + .65 * Math.sqrt(brainClamp(packet.strength));
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
      const n = d.nodes.get(packet.target), factor = packet.factor ?? d.raw?.[56] ?? d.p[56] ?? 1,
            key = packet.target + ':' + packet.motor,
            cycle = brain_signalsState.brainMotorCycles.get(
                brainCycleKey(packet.motor, packet.motorSide || 0));
      brain_signalsState.brainMotorInputs.set(key, {at, gain});
      if (factor > 0 && packet.work && packet.motor <= 5) {
        const track = brainTensionTrack(packet.motor, packet.motorSide || 0),
              value = brainDisplayCharge(packet.motor, packet.motorSide || 0, at);
        track.from = value;
        track.rise = packet.charge ? 150 : 30;
        track.value = packet.charge           ? brainClamp(value + (packet.chargeGain ?? .15))
                      : packet.last === false ? brainClamp(value + .3)
                                              : 1;
        track.at = at;
      }
      if (factor > 0 && packet.work && !packet.charge && cycle &&
          (packet.cycleStep === undefined || packet.cycleStep === cycle.step)) {
        cycle.firstAt ??= at;
        if (packet.last !== false)
          cycle.workAt ??= at + 45;
      }
      if (factor > 0 && !packet.charge && packet.last !== false)
        brain_signalsState.brainMotorEvents.set(
            key,
            {at : at + 45, effort : packet.effort ?? brainMotorEffort(n, packet.motor, d), factor});
    }
  }
  for (const [id, q] of brain_signalsState.brainArrivals)
    if (now - q.at > 1400)
      brain_signalsState.brainArrivals.delete(id);
}

export function brainMotorReadiness(k, d, side = 0) {
  const index = organStrokeIndex(k, side), threshold = d.b.stroke_threshold;
  if (!(threshold > 0))
    return 0;
  let mean = d.b.strokes?.[index]?.[0] || 0;
  const before = sceneState.previous?.selected === d.p[4] &&
                         sceneState.previous.brain?.layout_id === d.b.layout_id
                     ? sceneState.previous.brain.strokes?.[index]?.[0]
                     : null;
  if (!sceneState.frame?.paused && before !== null && before !== undefined && mean >= before)
    mean = before + (mean - before) * frameBlend();
  return brainClamp(mean / threshold);
}

export function brainMuscleState(n, k, d, now) {
  const activation = brainMotorActivity(n, k, d),
        input = brain_signalsState.brainMotorInputs.get(n[5] + ':' + k),
        age = input ? now - input.at : Infinity,
        positive = input && age >= 0 ? input.gain * Math.exp(-age / 180) : 0,
        arrival = {positive, negative : 0, age},
        event = brain_signalsState.brainMotorEvents.get(n[5] + ':' + k),
        elapsed = event ? now - event.at : Infinity, effort = 1, flash = 0, side = n[0] < 0 ? 0 : 1;
  let pose = k < 2    ? brainFinRelease(k, side, now)
             : k <= 5 ? brainCycleContraction(k, side, now)
                      : 0;
  if (k === 3 && d.a.birthing) {
    const t = .32 + .60 * brainClamp((n[1] + 1) / 2), behind = d.a.birthProgress / .55 - .14;
    pose = Math.max(pose, Math.exp(-(((t - behind) / .16) ** 2)));
  }
  if (k === 5) {
    pose = brainCycleContraction(5, 0, now);
  } else if (k === 6) {
    const capacity = (d.a.organs[32] || 0) + (d.a.organs[33] || 0);
    pose = capacity > 0 ? brainClamp(d.a.defenseActivity * (1 + capacity) / (.85 * capacity)) : 0;
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

export function brainMotorColor(k, state) {
  const hex = brainMotorColors[k].slice(1),
        original = [ 0, 2, 4 ].map(i => parseInt(hex.slice(i, i + 2), 16) / 255),
        lo = Math.min(...original), span = Math.max(.01, Math.max(...original) - lo),
        base = k <= 5 ? original.map(c => .15 + .85 * (c - lo) / span) : original,
        charge = brainClamp(state.charge || 0),
        tone = k <= 5 ? .18 + .82 * charge : .25 + .65 * (state.contraction || 0),
        gray = .33 + .07 * (state.contraction || 0);
  return rgb(base.map(c => gray + (c - gray) * tone));
}

export function brainEffectorFiber(n, k, d, center) {
  if (k < 3)
    return brainFiber(n, k, d);
  const side = k === 5 ? (center[1] < 0 ? 0 : 1) : (n[0] < 0 ? 0 : 1),
        depth = brainClamp((n[1] + 1) / 2);
  if (k === 3)
    return fishEggMuscleFiber(d.a, .32 + .60 * depth, side);
  if (k === 4) {
    const q = fishGameteShape(d.a, k), span = q.rx * (.14 + .10 * depth);
    return [ [ center[0] - span, center[1] - .008 ], [ center[0] + span, center[1] + .008 ] ];
  }
  if (k === 5) {
    const t = .10 + .8 * depth, across = .2 + .6 * brainClamp((n[8] + 1) / 2);
    return [
      fishCheekPoint(d.a, side, Math.max(.02, t - .16), across),
      fishCheekPoint(d.a, side, Math.min(.98, t + .16), across)
    ];
  }
  const pieces = fishDefenseSpines(d.a, side),
        q = pieces[Math.min(pieces.length - 1, Math.floor((1 - depth) * pieces.length))];
  if (!q)
    return [ [ center[0] - .03, center[1] ], [ center[0] + .03, center[1] ] ];
  const root = [ (q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2 ],
        delta = [ q[1][0] - root[0], q[1][1] - root[1] ];
  return [
    [ root[0] + delta[0] * .08, root[1] + delta[1] * .08 ],
    [ root[0] + delta[0] * .60, root[1] + delta[1] * .60 ]
  ];
}

export function brainMuscleShape(n, k, d, state, center) {
  const f = brainEffectorFiber(n, k, d, center), dx = f[1][0] - f[0][0], dy = f[1][1] - f[0][1],
        length = Math.max(.001, Math.hypot(dx, dy)),
        shorten = 1 - .52 * state.contraction - (k < 2 ? 0 : .16 * (state.charge || 0)),
        half = length * shorten * .5,
        width = Math.max(1.5 / d.r, k === 2 ? .024 : .026) *
                (1 + (k < 2 ? 0
                            : .20 * (state.charge || 0) +
                                  .30 * Math.max(state.positive || 0, state.negative || 0))) /
                Math.sqrt(shorten),
        nx = -dy / length, ny = dx / length;
  return {x : center[0], y : center[1], dx : dx / length, dy : dy / length, nx, ny, half, width};
}

const initializers = {
  "brainPacketLimit" : () => { brainPacketLimit = 56; },
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
