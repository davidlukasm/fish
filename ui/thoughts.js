// Generic thought engine. Facts come from the observers; everything the fish can think, when,
// how urgently and in which words is declared in the thought resource (rules, lexicon, moods,
// composition). Nothing here knows about any particular topic.
import {evaluate, format} from './strings.js';
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

// A text source is a list, a lexicon path (or several, joined), or the first matching case.
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

// A wording returns only after a while, so nothing turns into a refrain.
function fresh(T, mind, key, variants, now) {
  const wait = 1000 * T.compose.repeatAfter,
        open = variants.map((text, i) => [text, key + ':' + i])
                   .filter(([ text, id ]) => text && now - (mind.used[id] ?? -1e9) > wait &&
                                             !mind.recent.includes(text));
  return open.length ? pick(open) : null;
}

export function moodOf(T, facts) {
  return T.moods.find(m => m.when === undefined || evaluate(m.when, facts));
}

function candidate(T, rule, facts, mind, now) {
  if (!evaluate(rule.when, facts))
    return null;
  const topic = format(rule.topic, facts),
        cool = clamp((now - (mind.last[topic] ?? -1e9)) / (1000 * (rule.cooldown ?? 8))),
        salience = evaluate(rule.salience ?? 1, facts) * cool *
                   (mind.topics.includes(topic) ? T.compose.repeatTopic : 1);
  if (!(salience > 0))
    return null;
  const vars = {...facts};
  for (const [name, spec] of Object.entries(rule.vars || {}))
    vars[name] = format(pick(source(T, spec, vars)) ?? '', vars);
  const chosen = fresh(T, mind, topic, source(T, rule.texts, vars).map(t => format(t, vars)), now);
  if (!chosen)
    return null;
  return {
    topic,
    s : salience,
    text : chosen[0],
    key : chosen[1],
    icon : pick(source(T, rule.icon, vars)) || '',
    stations : (rule.stations || []).map(s => format(s, vars)).filter(Boolean)
  };
}

// One thought per call at most: the most salient fresh candidate, sometimes with a mood opener,
// a second thought or a closing remark, as the composition settings say.
export function think(T, facts, mind, now) {
  const C = T.compose, found = T.rules.map(r => candidate(T, r, facts, mind, now)).filter(Boolean);
  found.sort((p, q) => q.s - p.s);
  const best = found.find(c => c.s > C.threshold);
  if (!best || now - (mind.postedAt ?? -1e9) < 1000 * C.gap && best.s < C.urgent)
    return null;
  const mood = moodOf(T, facts);
  let text = best.text;
  const opener = Math.random() < C.opener && fresh(T, mind, 'open:' + mood.name, mood.openers, now);
  if (opener) {
    text = opener[0] + ' ' + text;
    mind.used[opener[1]] = now;
  }
  const second =
      found.find(c => c !== best && c.topic !== best.topic && c.s > C.secondShare * best.s);
  if (second && Math.random() < C.second) {
    text += ' ' + pick(C.connectors) + ' ' + second.text;
    mind.last[second.topic] = now;
    mind.used[second.key] = now;
  } else if (Math.random() < C.tail) {
    const tail = fresh(T, mind, 'tail', [...T.tails.any, ...(T.tails[mood.name] || []) ], now);
    if (tail) {
      text += ' ' + tail[0];
      mind.used[tail[1]] = now;
    }
  }
  mind.postedAt = now;
  mind.used[best.key] = now;
  mind.last[best.topic] = now;
  mind.recent = [ best.text, ...mind.recent ].slice(0, C.remember);
  mind.topics = [ best.topic, ...mind.topics ].slice(0, 3);
  return {
    text,
    icon : best.icon,
    stations : [...new Set([...best.stations, ...(second?.stations || []) ]) ]
  };
}
