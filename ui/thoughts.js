import {evaluate, format} from './strings.js';
import {SECOND_MS} from './units.js';
export const thoughtsState = {};

const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = x => Math.max(0, Math.min(1, Number(x) || 0));

function words(node) {
  if (typeof node === 'string')
    return [ node ];
  return Array.isArray(node) && node.every(x => typeof x === 'string') ? node : [];
}

function lookup(T, path, vars) {
  let node = T.lexicon;
  for (const part of format(path, vars).split('.'))
    node = node?.[part];
  return words(node);
}

export function source(T, spec, vars) {
  if (spec === undefined)
    return [];
  if (typeof spec === 'string' || Array.isArray(spec))
    return words(spec);
  if (spec.cases) {
    const hit = spec.cases.find(c => c.when === undefined || evaluate(c.when, vars));
    return hit ? source(T, hit, vars) : [];
  }
  if (spec.texts)
    return words(spec.texts);
  const found = [].concat(spec.lex || []).flatMap(path => lookup(T, path, vars));
  return found.length || !spec.else ? found : lookup(T, spec.else, vars);
}

function fresh(T, mind, key, templates, vars, now, shared = []) {
  const wait = SECOND_MS * T.compose.repeatAfter,
        open = templates.map(template => [format(template, vars), key + ':' + template])
                   .filter(([ text, id ]) => text && now - (mind.used[id] ?? -Infinity) > wait &&
                                             !mind.recent.includes(id) && !shared.includes(text));
  return open.length ? pick(open) : null;
}

export function moodOf(T, facts) {
  return T.moods.find(m => m.when === undefined || evaluate(m.when, facts));
}

function candidate(T, rule, facts, mind, now, shared) {
  if (!evaluate(rule.when, facts))
    return null;
  const topic = format(rule.topic, facts),
        cool = clamp((now - (mind.last[topic] ?? -Infinity)) / (SECOND_MS * rule.cooldown)),
        salience = evaluate(rule.salience ?? 1, facts) * cool;
  if (!(salience > 0) || mind.topics.includes(topic) && salience < T.compose.urgent)
    return null;
  const vars = {...facts};
  for (const [name, spec] of Object.entries(rule.vars || {}))
    vars[name] = format(pick(source(T, spec, vars)) ?? '', vars);
  const chosen = fresh(T, mind, topic, source(T, rule.texts, vars), vars, now);
  if (!chosen)
    return null;
  const brief = fresh(T, mind, topic + ':brief', source(T, rule.brief, vars), vars, now, shared);
  return {
    topic,
    covers : (rule.covers || []).map(c => format(c, facts)),
    brief : brief?.[0] || '',
    briefKey : brief?.[1],
    s : salience,
    text : chosen[0],
    key : chosen[1],
    icon : pick(source(T, rule.icon, vars)) || '',
    stations : (rule.stations || []).map(s => format(s, vars)).filter(Boolean)
  };
}

export function think(T, facts, mind, now, shared = []) {
  const C = T.compose,
        found = T.rules.map(r => candidate(T, r, facts, mind, now, shared)).filter(Boolean);
  found.sort((p, q) => q.s - p.s);
  const best = found.find(c => c.s > C.threshold);
  if (!best || now - (mind.postedAt ?? -Infinity) < SECOND_MS * C.gap && best.s < C.urgent)
    return null;
  mind.postedAt = now;
  mind.used[best.key] = now;
  if (best.briefKey)
    mind.used[best.briefKey] = now;
  for (const topic of [best.topic, ...best.covers])
    mind.last[topic] = now;
  mind.recent = [ best.key, ...mind.recent ].slice(0, C.remember);
  mind.topics = [...new Set([ best.topic, ...best.covers, ...mind.topics ]) ].slice(0, C.topics);
  return {
    text : best.text,
    icon : best.icon,
    brief : best.brief,
    strength : best.s,
    stations : best.stations
  };
}
