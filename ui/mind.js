// Every fish may think. Observers turn what is known about a fish into neutral facts; the rules
// in the thought resource turn facts into thoughts. The selected fish is observed in detail (its
// body readings and, while its brain is inspected, the brain plan); the others only through what
// the tank shows of them, and only their strongest thoughts surface. Pure model: views read the
// logs and bubbles from here.
import {hormoneEffects, planFor, updatePlanLive} from './brain_plan.js';
import {FISH} from './schema.js';
import {textArea} from './strings.js';
import {moodOf, think} from './thoughts.js';
export const mindState = {
  minds : new Map(),
  bubbles : new Map(),
  version : 0,
  othersAt : 0
};

const clamp = (x, a = 0, b = 1) => {
  x = Number(x);
  return x !== x ? a : Math.max(a, Math.min(b, x));
};

export function thoughtLog(id) { return mindState.minds.get(id)?.log || []; }
export function moodFor(id) { return mindState.minds.get(id)?.mood || null; }
export function thoughtBubbles() { return mindState.bubbles; }

// A visitor stimulated one station of the inspected brain.
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

function sideKey(l, r) {
  const d = (r - l) / (Math.abs(l) + Math.abs(r) + 1e-6);
  return d > .2 ? 'right' : d < -.2 ? 'left' : 'front';
}

function senseFamily(meta) { return meta.kind === 's' ? meta.family : meta.inFamily || ''; }

// Every numeric fact also gets <name>_rise (above its slow baseline), <name>_norm (relative to its
// recent peak), <name>_prev and <name>_prevNorm (the previous observation).
function trackAll(m, raw, rates) {
  const facts = {...raw};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'number')
      continue;
    const old = m.slow[name] ?? value, rate = rates[name] ?? rates.default;
    m.slow[name] = old + (value - old) * rate;
    m.peak[name] = Math.max(Math.abs(value), (m.peak[name] || 1e-6) * .997);
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

// The strongest of several tracked channels relative to its own recent peak.
function strongest(m, prefix, values, rate) {
  let best = {index : -1, news : 0, level : 0};
  values.forEach((v, k) => {
    const key = prefix + k, old = m.slow[key] ?? v;
    m.slow[key] = old + (v - old) * rate;
    m.peak[key] = Math.max(Math.abs(v), (m.peak[key] || 1e-6) * .997);
    const news = clamp((v - old) / m.peak[key] * 4) * .8 + Math.abs(v) / m.peak[key] * .15;
    if (news > best.news)
      best = {index : k, news, level : Math.abs(v) / m.peak[key], value : v - old};
  });
  return best;
}

// Body readings: from the brain readout of the selected fish, otherwise from its tank record.
function bodyReadings(row, b, cover) {
  const share = (v, of) => of > 0 ? clamp(v / of) : 0;
  if (b) {
    const condition = b.peak_tissue > b.tissue_floor
                          ? clamp((b.tissue - b.tissue_floor) / (b.peak_tissue - b.tissue_floor))
                          : 1;
    return {
      hunger : clamp(.6 * (1 - clamp(b.satiety)) + .4 * (1 - condition)),
      fullness : clamp(b.satiety),
      pain : clamp(b.pain),
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
      contact : Math.abs(b.contact || 0),
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
    hunger : clamp(.6 * (1 - clamp(row[FISH.satiety])) +
                   .4 * (1 - share(row[FISH.energy], row[FISH.reserve_capacity]))),
    fullness : clamp(row[FISH.satiety]),
    pain : clamp(row[FISH.pain]),
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
    contact : Math.abs(row[FISH.impact] || 0),
    bladder : clamp(row[FISH.bladder_fill]),
    hasBladder : 0,
    eggLaying : row[FISH.egg_laying] ? 1 : 0,
    spermLaying : 0,
    buried : cover
  };
}

function observe(T, m, now, row, b, plan, cover) {
  const st = id => plan?.activity.get(id) || 0, has = id => plan?.members.has(id) ? 1 : 0,
        effects = b ? hormoneEffects(b) : [ 0, 0, 0, 0, 0, 0 ], levels = b?.hormones?.levels || [],
        poked = mindState.poked && mindState.poked.at > (m.pokedAt || 0) ? mindState.poked : null;
  if (poked)
    m.pokedAt = poked.at;
  m.changed ??= b?.learning?.changed || 0;
  const facts = trackAll(m, {
    ...bodyReadings(row, b, cover),
    excite : effects[0],
    eyeL : st('eyeL'),
    eyeR : st('eyeR'),
    latL : st('latL'),
    latR : st('latR'),
    touch : st('touch'),
    pigment : st('pigment'),
    hasEyes : has('eyeL') || has('eyeR'),
    hasNose : plan              ? has('noseL') || has('noseR')
              : b?.nose_samples ? 1
                                : 0,
    hasLateral : has('latL') || has('latR'),
    hasPigment : has('pigment'),
    probe : b?.probe?.remaining > 0 ? 1 : 0,
    probeKind : b?.probe?.kind ?? -1,
    poked : poked ? 1 : 0,
    pokedOrgan : poked && !poked.id.startsWith('h') ? 1 : 0,
    pokeStation : poked?.id || '',
    learned : Math.max(0, (b?.learning?.changed || 0) - m.changed),
    quiet : (now - m.postedAt) / 1000,
    dice : Math.random()
  },
                         T.tracking);
  m.changed = b?.learning?.changed || m.changed;
  const eyeL = facts.eyeL_rise, eyeR = facts.eyeR_rise, latL = facts.latL_rise,
        latR = facts.latR_rise;
  Object.assign(facts, {
    eyeNews : Math.max(Math.abs(eyeL), Math.abs(eyeR)) * 6,
    eyeSide : sideKey(Math.abs(eyeL), Math.abs(eyeR)),
    eyeTone : eyeL + eyeR > 0 ? 'bright' : 'dark',
    eyeStation : eyeL > eyeR ? 'eyeL' : 'eyeR',
    latNews : Math.max(latL, latR) * 7,
    latSide : sideKey(facts.latL, facts.latR),
    latStation : facts.latL > facts.latR ? 'latL' : 'latR',
    turnStation : st('turnL') > st('turnR') ? 'turnL' : 'turnR',
    mouthStation : (b?.bite_signal || 0) > (b?.eat_signal || 0) ? 'bite' : 'suck',
    gonadStation : facts.eggReady >= facts.spermReady ? 'egg' : 'sperm'
  });
  // The scent that stands out most, from both nostrils.
  const nose = b?.nose_samples || [],
        scent = strongest(
            m, 'scent',
            [...Array(8).keys() ].map(k => Math.max(nose[0]?.[3 + k] || 0, nose[1]?.[3 + k] || 0)),
            .05),
        left = nose[0]?.[3 + scent.index] || 0, right = nose[1]?.[3 + scent.index] || 0;
  Object.assign(facts, {
    scentIndex : nose.length ? scent.index : -1,
    scentNews : scent.news,
    scentBand : scent.level < .33   ? 0
                : scent.level < .66 ? 1
                                    : 2,
    scentSide : sideKey(left, right),
    noseStation : left > right ? 'noseL' : 'noseR'
  });
  if (plan) {
    // Intentions: how strongly each sense, directly or through its hubs, drives each organ family.
    const drive = new Map();
    for (const p of plan.pairs.values()) {
      const to = plan.meta.get(p.to), sense = senseFamily(plan.meta.get(p.from));
      if (to.kind === 'm' && sense)
        drive.set(sense + '>' + to.family,
                  (drive.get(sense + '>' + to.family) || 0) + p.flow * p.sum);
    }
    const keys = [...drive.keys() ],
          urge = strongest(m, 'intent:', keys.map(k => drive.get(k)), .06);
    if (urge.index >= 0) {
      const key = keys[urge.index], organ = key.split('>')[1];
      Object.assign(facts, {
        intentKey : key,
        intentOrgan : organ,
        intentSign : urge.value >= 0 ? 'drive' : 'hold',
        intentNews : urge.news,
        intentStation :
            [...plan.meta.values() ].find(x => x.kind === 'm' && x.family === organ)?.id || ''
      });
    }
    // Learning: which sense has come to mean most for which organ.
    let most = 0;
    facts.lessonKey = '';
    for (const p of plan.pairs.values()) {
      const to = plan.meta.get(p.to), sense = senseFamily(plan.meta.get(p.from));
      if (to.kind === 'm' && sense && p.learned > most)
        [most, facts.lessonKey] = [ p.learned, sense + '>' + to.family ];
    }
    // Surprise: the cell most surprised by its last learning step, and where it sits.
    let top = 0, where = '';
    for (const n of b.neurons) {
      const v = Math.abs(b.learning?.surprise?.[n[5]]?.[0] || 0);
      if (v > top)
        [top, where] = [ v, plan.station.get(n[5]) || '' ];
    }
    const old = m.slow.surprise ?? top;
    m.slow.surprise = old + (top - old) * .05;
    m.peak.surprise = Math.max(top, (m.peak.surprise || 1e-6) * .997);
    Object.assign(facts, {
      surpriseNews :
          where && top > old && top / m.peak.surprise > .8 ? (top - old) / m.peak.surprise * 3 : 0,
      surpriseStation : where,
      surpriseSense : where ? senseFamily(plan.meta.get(where)) : ''
    });
  }
  // Feelings: the hormone effect that shifts most while the hormone levels stir.
  const shift = effects.map((v, k) => [k, v - (m.effectSlow?.[k] ?? v)])
                    .sort((p, q) => Math.abs(q[1]) - Math.abs(p[1]))[0];
  m.effectSlow = effects.map((v, k) => (m.effectSlow?.[k] ?? v) * .9 + v * .1);
  let stir = 0;
  m.hormoneSlow ??= [];
  levels.slice(0, 4).forEach((value, k) => {
    const v = clamp(value), old = m.hormoneSlow[k] ?? v;
    m.hormoneSlow[k] = old + (v - old) * .05;
    stir = Math.max(stir, Math.abs(v - old));
  });
  Object.assign(facts, {
    stir,
    feelIndex : shift?.[0] ?? 0,
    feelShift : shift?.[1] ?? 0,
    feelSign : (shift?.[1] ?? 0) > 0 ? 'up' : 'down'
  });
  // A probe the visitor placed: its colour and scent.
  const c = b?.probe?.color,
        hue = c ? Math.atan2(Math.sqrt(3) * (c[1] - c[2]), 2 * c[0] - c[1] - c[2]) * 180 / Math.PI
                : 0;
  facts.probeColour = Math.floor(((hue + 360) % 360) / 30);
  facts.probeScent = b?.probe?.scents ? b.probe.scents.indexOf(Math.max(...b.probe.scents)) : 0;
  facts.mood = moodOf(T, facts).name;
  return facts;
}

function post(T, mind, thought, now, shown) {
  if (!thought)
    return;
  mind.log = [ {...thought, at : now, time : Date.now()}, ...mind.log ].slice(0, T.compose.log);
  if (shown)
    mindState.bubbles.set(mind.id, {...thought, at : now});
  mindState.version++;
}

// Once per new frame: the selected fish thinks in detail, a few others now and then.
export function updateMinds(f, now = performance.now()) {
  const T = textArea('thoughts', 'de-AT');
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
          thought = think(T, facts, mind, now);
    mind.mood = moodOf(T, facts);
    mind.observedAt = now;
    mind.step = f.step;
    post(T, mind, thought, now, detailed || thought?.strength >= C.tank);
  };
  const selected = f.selected, mind = mindState.minds.get(selected);
  if (selected && now - (mind?.observedAt ?? -1e9) > 1000 * C.every && f.step !== mind?.step)
    consider(selected, true);
  if (now - mindState.othersAt > 1000 * C.othersEvery) {
    mindState.othersAt = now;
    const others = f.fish.filter(p => p[FISH.hatched] && p[FISH.id] !== selected);
    for (let k = 0; k < Math.min(C.othersAtOnce, others.length); k++)
      consider(others[Math.floor(Math.random() * others.length)][FISH.id], false);
    for (const id of mindState.minds.keys())
      if (!rows.has(id))
        mindState.minds.delete(id);
  }
  for (const [id, bubble] of mindState.bubbles)
    if (now - bubble.at > 1000 * C.bubble || !rows.has(id))
      mindState.bubbles.delete(id);
}
