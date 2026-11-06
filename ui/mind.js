import {displayFaults} from './diagnostics.js';
import {STATION, hormoneEffects, planFor, updatePlanLive} from './brain_plan.js';
import {ANATOMY, FISH, HORMONE_EFFECT, HORMONES, NEURON, SENSE_KIND, TOLERANCE} from './schema.js';
import {t, voiceArea} from './strings.js';
import {FULL_TURN, SECOND_MS, hueOf} from './units.js';
import {moodOf, think} from './thoughts.js';
export const mindState = {
  minds : new Map(),
  bubbles : new Map(),
  said : [],
  version : 0,
  othersAt : 0
};

const clamp = (x, a = 0, b = 1) => {
  x = Number(x);
  return x !== x ? a : Math.max(a, Math.min(b, x));
};

// A fish's log is replaced, never changed, when it thinks: the same array means no new thought.
const NO_THOUGHTS = Object.freeze([]);
export function thoughtLog(id) { return mindState.minds.get(id)?.log || NO_THOUGHTS; }
export function moodFor(id) { return mindState.minds.get(id)?.mood || null; }
export function thoughtBubbles() { return mindState.bubbles; }

export function notePoke(station) { mindState.poked = {id : station, at : performance.now()}; }

function mindOf(id, now) {
  let mind = mindState.minds.get(id);
  if (!mind)
    mindState.minds.set(id, mind = {
      id,
      slow : {},
      peak : {},
      last : {},
      used : {},
      recent : [],
      topics : [],
      prev : {},
      log : [],
      postedAt : now,
      changed : null
    });
  return mind;
}

const MIND = Object.freeze({
  side : .2,
  peak_decay : .997,
  news_gain : 4,
  news_rise : .8,
  news_level : .15,
  hunger_gut : .6,
  hunger_reserve : .4
});
const OBSERVE = Object.freeze({
  eye_gain : 6,
  near_gain : 6,
  lateral_gain : 7,
  scent_rate : .05,
  scent_bands : 3,
  intent_rate : .06,
  surprise_rate : .05,
  surprise_share : .8,
  surprise_gain : 3,
  effect_keep : .9,
  hormone_rate : .05,
  mood_settle : 5
});
function sideKey(l, r) {
  const d = (r - l) / (Math.abs(l) + Math.abs(r) + TOLERANCE.precision);
  return d > MIND.side ? 'right' : d < -MIND.side ? 'left' : 'front';
}

function senseFamily(meta) {
  return meta.kind === STATION.sense ? meta.family : meta.inFamily || '';
}

function trackAll(m, raw, rates) {
  const facts = {...raw};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'number')
      continue;
    const old = m.slow[name] ?? value, rate = rates[name] ?? rates.default;
    m.slow[name] = old + (value - old) * rate;
    m.peak[name] =
        Math.max(Math.abs(value), (m.peak[name] || TOLERANCE.precision) * MIND.peak_decay);
    const norm = Math.abs(value) / (m.peak[name] || 1);
    facts[name + '_rise'] = value - old;
    facts[name + '_norm'] = norm;
    facts[name + '_prev'] = m.prev[name] ?? value;
    facts[name + '_prevNorm'] = m.prev[name + '_norm'] ?? norm;
    m.prev[name] = value;
    m.prev[name + '_norm'] = norm;
  }
  return facts;
}

function strongest(m, prefix, values, rate) {
  let best = {index : -1, news : 0, level : 0, value : 0};
  values.forEach((v, k) => {
    const key = prefix + k, size = Math.abs(v), old = m.slow[key] ?? size;
    m.slow[key] = old + (size - old) * rate;
    m.peak[key] = Math.max(size, (m.peak[key] || TOLERANCE.precision) * MIND.peak_decay);
    const news = clamp((size - old) / m.peak[key] * MIND.news_gain) * MIND.news_rise +
                 size / m.peak[key] * MIND.news_level;
    if (news > best.news)
      best = {index : k, news, level : size / m.peak[key], value : v};
  });
  return best;
}

const BODY_SENSES = Object.freeze({
  light : [ ANATOMY.eye_left, ANATOMY.eye_right ],
  odor : [ ANATOMY.smell_left, ANATOMY.smell_right ],
  flow : [ ANATOMY.lateral_left, ANATOMY.lateral_right ],
  touch : [ ANATOMY.touch_left, ANATOMY.touch_right ],
  damage : [ ANATOMY.damage ],
  inner_pressure : [ ANATOMY.satiety ],
  gonad_pressure : [ ANATOMY.gonad ]
});
function senseReport(row, b) {
  const r = b?.sense_report, organs = row[FISH.organs] || [], report = {};
  Object.keys(SENSE_KIND).forEach((name, k) => {
    const has = r ? r.cells[k] > 0 : (BODY_SENSES[name] || []).some(column => organs[column] > 0);
    report['has_' + name] = has ? 1 : 0;
    report['sense_' + name] = r ? Math.max(r.left[k], r.right[k]) : 0;
  });
  const side = (k, s) => r?.[s]?.[k] || 0;
  return {
    report,
    scents : r?.scents || [],
    sides : {
      eyeL : side(SENSE_KIND.light, 'left'),
      eyeR : side(SENSE_KIND.light, 'right'),
      nearL : side(SENSE_KIND.proximity, 'left'),
      nearR : side(SENSE_KIND.proximity, 'right'),
      latL : side(SENSE_KIND.flow, 'left'),
      latR : side(SENSE_KIND.flow, 'right'),
      noseL : side(SENSE_KIND.odor, 'left'),
      noseR : side(SENSE_KIND.odor, 'right'),
      touch : report.sense_touch,
      pigment : r?.pigment || 0,
      mindBusy : r?.hubs || 0,
      hasPigment : r?.pigment_cells > 0 ? 1 : 0
    },
    shown : !!r
  };
}

function feltReadings(body, r) {
  const felt = (sense, value, none = 0) => sense ? value : none;
  return {
    hungerFelt : felt(r.has_inner_pressure || r.has_blood, body.hunger),
    fullFelt : felt(r.has_inner_pressure, body.fullness),
    painFelt : felt(r.has_damage, body.pain),
    healthFelt : felt(r.has_damage || r.has_blood, body.health, 1),
    readyFelt : felt(r.has_gonad_pressure, body.ready)
  };
}

function bodyReadings(row, b, cover) {
  const share = (v, of) => of > 0 ? clamp(v / of) : 0;
  if (b) {
    const condition = b.peak_tissue > b.tissue_floor
                          ? clamp((b.tissue - b.tissue_floor) / (b.peak_tissue - b.tissue_floor))
                          : 1;
    return {
      hunger :
          clamp(MIND.hunger_gut * (1 - clamp(b.satiety)) + MIND.hunger_reserve * (1 - condition)),
      fullness : clamp(b.satiety),
      pain : clamp(b.damage),
      health : b.health ?? 1,
      aggression : clamp(b.aggression),
      defense : clamp(Math.max(b.defense || 0, b.active_defense || 0)),
      ready : Math.max(b.egg_readiness || 0, b.sperm_readiness || 0) * clamp(b.gonad_filling),
      eggReady : b.egg_readiness || 0,
      spermReady : b.sperm_readiness || 0,
      thrust : Math.abs(b.thrust || 0),
      turn : Math.abs(b.turn || 0),
      eating : Math.max(b.eat_signal || 0, b.bite_signal || 0, b.mouth_opening || 0),
      pumping : b.pump_flow > 0 ? 1 : 0,
      bladder : b.bladder_capacity > 0 ? clamp(b.bladder_fill / b.bladder_capacity) : 0,
      hasBladder : b.bladder_capacity > 0 ? 1 : 0,
      eggLaying : b.egg_laying ? 1 : 0,
      spermLaying : b.sperm_laying ? 1 : 0,
      buried : cover
    };
  }
  const egg = share(row[FISH.egg_yolk], row[FISH.egg_capacity]),
        sperm = share(row[FISH.sperm_store], row[FISH.sperm_capacity]);
  return {
    hunger : clamp(MIND.hunger_gut * (1 - clamp(row[FISH.satiety])) +
                   MIND.hunger_reserve * (1 - share(row[FISH.energy], row[FISH.reserve_capacity]))),
    fullness : clamp(row[FISH.satiety]),
    pain : clamp(row[FISH.damage]),
    health : row[FISH.health] ?? 1,
    aggression : clamp(row[FISH.aggression]),
    defense : clamp(row[FISH.defense]),
    ready : Math.max(egg, sperm),
    eggReady : egg,
    spermReady : sperm,
    thrust : Math.abs(row[FISH.thrust] || 0),
    turn : Math.abs(row[FISH.torque] || 0),
    eating : clamp(row[FISH.eat_signal]),
    pumping : 0,
    bladder : clamp(row[FISH.bladder_fill]),
    hasBladder : 0,
    eggLaying : row[FISH.egg_laying] ? 1 : 0,
    spermLaying : 0,
    buried : cover
  };
}

function observe(T, m, now, row, b, plan, cover) {
  const st = id => plan?.activity.get(id) || 0, effects = hormoneEffects(b),
        levels = b?.hormones?.levels || [],
        poked = mindState.poked && mindState.poked.at > (m.pokedAt || 0) ? mindState.poked : null,
        senses = senseReport(row, b), body = bodyReadings(row, b, cover);
  if (poked)
    m.pokedAt = poked.at;
  m.changed ??= b?.learning?.changed || 0;
  const facts = trackAll(m, {
    ...body,
    ...senses.report,
    ...feltReadings(body, senses.report),
    ...senses.sides,
    excite : effects[HORMONE_EFFECT.excitation],
    probe : b?.probe?.remaining > 0 ? 1 : 0,
    probeKind : b?.probe?.kind ?? -1,
    poked : poked ? 1 : 0,
    pokedOrgan : poked && plan?.meta.get(poked.id)?.kind !== STATION.hub ? 1 : 0,
    pokeStation : poked?.id || '',
    learned : Math.max(0, (b?.learning?.changed || 0) - m.changed),
    quiet : (now - m.postedAt) / SECOND_MS,
    dice : Math.random()
  },
                         T.tracking);
  m.changed = b?.learning?.changed || m.changed;
  const eyeL = facts.eyeL_rise, eyeR = facts.eyeR_rise, nearL = facts.nearL_rise,
        nearR = facts.nearR_rise, latL = facts.latL_rise, latR = facts.latR_rise;
  Object.assign(facts, {
    eyeNews : Math.max(Math.abs(eyeL), Math.abs(eyeR)) * OBSERVE.eye_gain,
    eyeSide : sideKey(Math.abs(eyeL), Math.abs(eyeR)),
    eyeTone : eyeL + eyeR > 0 ? 'bright' : 'dark',
    eyeDark : eyeL + eyeR > 0 ? 0 : 1,
    eyeStation : Math.abs(eyeL) > Math.abs(eyeR) ? 'eyeL' : 'eyeR',
    nearNews : Math.max(nearL, nearR) * OBSERVE.near_gain,
    nearSide : sideKey(Math.max(0, nearL), Math.max(0, nearR)),
    nearStation : nearL > nearR ? 'nearL' : 'nearR',
    latNews : Math.max(latL, latR) * OBSERVE.lateral_gain,
    latSide : sideKey(facts.latL, facts.latR),
    latStation : facts.latL > facts.latR ? 'latL' : 'latR',
    turnStation : st('turnL') > st('turnR') ? 'turnL' : 'turnR',
    mouthStation : (b?.bite_signal || 0) > (b?.eat_signal || 0) ? 'bite' : 'suck',
    gonadStation : facts.eggReady >= facts.spermReady ? 'egg' : 'sperm'
  });
  const scent = strongest(m, 'scent', senses.scents, OBSERVE.scent_rate);
  Object.assign(facts, {
    scentIndex : senses.shown && facts.has_odor ? scent.index : -1,
    scentNews : scent.news,
    scentBand : Math.min(OBSERVE.scent_bands - 1, Math.floor(scent.level * OBSERVE.scent_bands)),
    scentSide : sideKey(facts.noseL, facts.noseR),
    noseStation : facts.noseL > facts.noseR ? 'noseL' : 'noseR'
  });
  if (plan) {
    const drive = new Map();
    for (const p of plan.pairs.values()) {
      const to = plan.meta.get(p.to), sense = senseFamily(plan.meta.get(p.from));
      if (to.kind === STATION.motor && sense)
        drive.set(sense + '>' + to.family,
                  (drive.get(sense + '>' + to.family) || 0) + p.flow * p.sum);
    }
    const keys = [...drive.keys() ],
          urge = strongest(m, 'intent:', keys.map(k => drive.get(k)), OBSERVE.intent_rate);
    if (urge.index >= 0) {
      const key = keys[urge.index], organ = key.split('>')[1];
      Object.assign(facts, {
        intentKey : key,
        intentOrgan : organ,
        intentSign : urge.value >= 0 ? 'drive' : 'hold',
        intentNews : urge.news,
        intentStation : [...plan.meta.values() ]
                                .find(x => x.kind === STATION.motor && x.family === organ)
                                ?.id ||
                            ''
      });
    }
    let most = 0;
    facts.lessonKey = '';
    for (const p of plan.pairs.values()) {
      const to = plan.meta.get(p.to), sense = senseFamily(plan.meta.get(p.from));
      if (to.kind === STATION.motor && sense && p.learned > most)
        [most, facts.lessonKey] = [ p.learned, sense + '>' + to.family ];
    }
    let top = 0, where = '';
    for (const n of b.neurons) {
      const v = Math.abs(b.learning?.surprise?.[n[NEURON.index]]?.[0] || 0);
      if (v > top)
        [top, where] = [ v, plan.station.get(n[NEURON.index]) || '' ];
    }
    const old = m.slow.surprise ?? top;
    m.slow.surprise = old + (top - old) * OBSERVE.surprise_rate;
    m.peak.surprise = Math.max(top, (m.peak.surprise || TOLERANCE.precision) * MIND.peak_decay);
    Object.assign(facts, {
      surpriseNews : where && top > old && top / m.peak.surprise > OBSERVE.surprise_share
                         ? (top - old) / m.peak.surprise * OBSERVE.surprise_gain
                         : 0,
      surpriseStation : where,
      surpriseSense : where ? senseFamily(plan.meta.get(where)) : ''
    });
  }
  const shift = effects.map((v, k) => [k, v - (m.effectSlow?.[k] ?? v)])
                    .sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0];
  m.effectSlow = effects.map((v, k) => (m.effectSlow?.[k] ?? v) * OBSERVE.effect_keep +
                                       v * (1 - OBSERVE.effect_keep));
  let stir = 0;
  m.hormoneSlow ??= [];
  levels.slice(0, HORMONES.levels).forEach((value, k) => {
    const v = clamp(value), old = m.hormoneSlow[k] ?? v;
    m.hormoneSlow[k] = old + (v - old) * OBSERVE.hormone_rate;
    stir = Math.max(stir, Math.abs(v - old));
  });
  Object.assign(facts, {
    stir,
    feelIndex : shift?.[0] ?? 0,
    feelShift : shift?.[1] ?? 0,
    feelSign : (shift?.[1] ?? 0) > 0 ? 'up' : 'down'
  });
  const c = b?.probe?.color;
  facts.probeColour = Math.floor((c ? hueOf(c) : 0) / FULL_TURN * T.lexicon.colour.length) %
                      T.lexicon.colour.length;
  facts.probeScent = b?.probe?.scents ? b.probe.scents.indexOf(Math.max(...b.probe.scents)) : 0;
  facts.mood = moodOf(T, facts).name;
  if (facts.mood === m.moodSeen)
    m.moodRun++;
  else
    [m.moodSeen, m.moodRun] = [ facts.mood, 1 ];
  const settled = m.moodRun === OBSERVE.mood_settle;
  facts.moodChanged = settled && m.moodSettled && m.moodSettled !== facts.mood ? 1 : 0;
  if (settled)
    m.moodSettled = facts.mood;
  return facts;
}

function post(T, mind, thought, now, shown) {
  if (!thought)
    return;
  mind.log = [ {...thought, at : now, time : Date.now()}, ...mind.log ].slice(0, T.compose.log);
  if (shown && thought.brief) {
    mindState.bubbles.set(mind.id, {text : thought.brief, at : now});
    mindState.said = [ thought.brief, ...mindState.said ].slice(0, T.compose.remember);
  }
  mindState.version++;
}

// Once per new frame: the selected fish thinks in detail, a few others now and then.
// Thoughts are an extra: a failure here is reported and never stops the aquarium.
export function updateMinds(f, now = performance.now()) {
  displayFaults.run(t('mind.fault'), () => thinkAll(f, now));
}

function thinkAll(f, now) {
  const T = voiceArea('thoughts');
  if (!T.rules || !f?.fish || f.historical)
    return;
  const cover = new Map(f.buried || []), rows = new Map(f.fish.map(p => [p[FISH.id], p])),
        C = T.compose;
  const consider = (id, detailed) => {
    const row = rows.get(id);
    if (!row?.[FISH.hatched])
      return;
    const mind = mindOf(id, now), b = detailed && f.brain?.id === id ? f.brain : null,
          plan = b ? planFor(b) : null;
    if (plan)
      updatePlanLive(plan, b);
    const facts = observe(T, mind, now, row, b, plan, cover.get(id) || 0),
          thought = think(T, facts, mind, now, mindState.said);
    mind.mood = moodOf(T, facts);
    mind.observedAt = now;
    mind.step = f.step;
    post(T, mind, thought, now, detailed || thought?.strength >= C.tank);
  };
  const selected = f.selected, mind = mindState.minds.get(selected);
  if (selected && now - (mind?.observedAt ?? -Infinity) > SECOND_MS * C.every &&
      f.step !== mind?.step)
    consider(selected, true);
  if (now - mindState.othersAt > SECOND_MS * C.othersEvery) {
    mindState.othersAt = now;
    const others = f.fish.filter(p => p[FISH.hatched] && p[FISH.id] !== selected);
    for (let k = 0; k < Math.min(C.othersAtOnce, others.length); k++)
      consider(others[Math.floor(Math.random() * others.length)][FISH.id], false);
    for (const id of mindState.minds.keys())
      if (!rows.has(id))
        mindState.minds.delete(id);
  }
  for (const [id, bubble] of mindState.bubbles)
    if (now - bubble.at > SECOND_MS * C.bubble || !rows.has(id))
      mindState.bubbles.delete(id);
}
