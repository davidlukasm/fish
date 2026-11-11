import {INVERTEBRATE_KIND, TRIAL_KIND, TRIAL_LAB} from '../schema.js';
import {formatNumber} from '../strings.js';
import {musselShellColor, smallAnimalColor} from '../fauna.js';
import {escapeText} from '../studio/view/markup.js';
import {
  OUTCOME,
  inspectedTrial,
  sampleStep,
  shownSessions,
  trialDistance,
  trialKey,
  successStep,
  trialOutcome,
  trialPath,
  trialSteps,
  trialTally
} from './trials.js';
import {choice, labShell, say, setupPanel} from './view.js';

const trials = (key, vars) => say('trials.' + key, vars);
const OUTCOME_KEY =
    Object.freeze(Object.fromEntries(Object.entries(OUTCOME).map(([ k, v ]) => [v, k])));
const COURSE = Object.freeze({
  size : 420,
  margin : 18,
  pad : 1.08,
  // The view spans at least the way to the target and at most this many times it, so one fish
  // swimming off does not shrink every other course.
  least : .75,
  most : 1.5,
  fish : 7,
  food : 3.5,
  shell : [ 6, 3.6 ],
  end : 2.6,
  digits : 1
});
const colour = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';
const fixed = v => v.toFixed(COURSE.digits);

// Success is eating for feed and cracking for a mussel or crab.
const outcomeName = (outcome, kind) =>
    trials('outcome.' +
           (outcome === OUTCOME.succeeded ? 'succeeded.' + trialKey(kind) : OUTCOME_KEY[outcome]));

function trialTitle(trial, kind, k) {
  const outcome = trialOutcome(trial, kind);
  return trials('trialTitle', {k : k + 1, outcome : outcomeName(outcome, kind)}) +
         (outcome === OUTCOME.succeeded
              ? ' · ' + trials('after', {steps : formatNumber(successStep(trial, kind) + 1)})
          : outcome === OUTCOME.vanished
              ? ' · ' + trials('after', {steps : formatNumber(trial.vanished + 1)})
              : '');
}

// Every trial's course from its start, the start heading pointing up and the target ahead.
function courseChart(sessions, kind, selected) {
  const C = COURSE, all = (selected ? [ selected.trial ] : sessions.flatMap(s => s.trials ?? []))
                              .filter(x => x.path?.length)
                              .map(x => ({...x, path : trialPath(x, kind)}));
  if (!all.length)
    return '';
  const points = [ [ 0, 0 ], ...all.flatMap(x => [x.target, ...x.path]) ],
        distance = trialDistance(kind);
  // Midway between the start and the targets' centre.
  const mid = [ 0, 1 ].map(i => all.reduce((sum, x) => sum + x.target[i], 0) / all.length / 2);
  const extent = Math.max(
            ...points.map(p => Math.max(Math.abs(p[0] - mid[0]), Math.abs(p[1] - mid[1])))),
        half = Math.min(selected ? Infinity : C.most * distance,
                        Math.max(C.least * distance, C.pad * extent)),
        scale = (C.size / 2 - C.margin) / half;
  const at =
      ([ forward,
         side ]) => [C.size / 2 + (side - mid[1]) * scale, C.size / 2 - (forward - mid[0]) * scale];
  const [ox, oy] = at([ 0, 0 ]);
  const ring = '<circle class="aid-trial-ring" cx="' + fixed(ox) + '" cy="' + fixed(oy) + '" r="' +
               fixed(distance * scale) + '"/>';
  const courses =
      all.map((x, k) => {
           const outcome = trialOutcome(x, kind),
                 line = (selected ? x.path.slice(0, selected.frame + 1) : x.path).map(at),
                 end = line.at(-1) ?? [ ox, oy ];
           return '<g class="aid-trial-course ' + OUTCOME_KEY[outcome] + '"><title>' +
                  escapeText(trialTitle(x, kind, selected?.index ?? k)) + '</title>' +
                  (selected
                       ? '<polyline class="aid-trial-future" points="' +
                             x.path.map(at).map(p => fixed(p[0]) + ',' + fixed(p[1])).join(' ') +
                             '"/>'
                       : '') +
                  '<polyline points="' + line.map(p => fixed(p[0]) + ',' + fixed(p[1])).join(' ') +
                  '"/><circle class="aid-trial-position" cx="' + fixed(end[0]) + '" cy="' +
                  fixed(end[1]) + '" r="' + (selected ? C.end * 2 : C.end) + '"/></g>';
         })
          .join('');
  const targets = all.map(x => {
                       const [tx, ty] = at(x.target);
                       return kind === TRIAL_KIND.mussel
                                  ? '<ellipse class="aid-trial-shell" cx="' + fixed(tx) + '" cy="' +
                                        fixed(ty) + '" rx="' + C.shell[0] + '" ry="' + C.shell[1] +
                                        '" fill="' + colour(musselShellColor(x.family)) + '"/>'
                              : kind === TRIAL_KIND.crab
                                  ? '<ellipse class="aid-trial-shell" cx="' + fixed(tx) + '" cy="' +
                                        fixed(ty) + '" rx="' + C.shell[0] + '" ry="' + C.shell[1] +
                                        '" fill="' +
                                        colour(smallAnimalColor(INVERTEBRATE_KIND.crab)) + '"/>'
                                  : '<circle class="aid-trial-food" cx="' + fixed(tx) + '" cy="' +
                                        fixed(ty) + '" r="' + C.food + '"/>';
                     })
                      .join('');
  const fish = '<path class="aid-trial-fish" d="M' + fixed(ox) + ' ' + fixed(oy - C.fish) + 'L' +
               fixed(ox + C.fish / 2) + ' ' + fixed(oy + C.fish / 2) + 'L' +
               fixed(ox - C.fish / 2) + ' ' + fixed(oy + C.fish / 2) + 'Z"/>';
  const hits = selected ? selected.path
                              .map((p, frame) => {
                                const [x, y] = at(p);
                                return '<circle class="aid-trial-waypoint" data-lab-frame="' +
                                       frame + '" cx="' + fixed(x) + '" cy="' + fixed(y) + '" r="' +
                                       C.fish + '"><title>' +
                                       trials('step', {step : formatNumber(sampleStep(frame))}) +
                                       '</title></circle>';
                              })
                              .join('')
                        : '';
  return '<svg class="aid-trial-chart" viewBox="0 0 ' + C.size + ' ' + C.size +
         '" role="img" aria-label="' + trials(selected ? 'detailChart' : 'chart') + '">' + ring +
         targets + courses + fish + hits + '</svg>';
}

const ending = s => s.died ? '<em class="died">' +
                                 trials(s.died.egg ? 'died.egg' : 'died.fish',
                                        {age : formatNumber(Math.round(s.died.age))}) +
                                 '</em>'
                    : s.done ? ''
                             : '<em>' + say('waiting') + '</em>';

// One row per world, one square per trial, coloured by its outcome.
function trialStrip(sessions, kind, selected) {
  return '<div class="aid-trial-strip">' +
         sessions
             .map(s =>
                      '<div><span>' + say('world', {seed : s.seed}) + '</span><div>' +
                      (s.trials ?? [])
                          .map((x, k) => '<button type="button" class="' +
                                         OUTCOME_KEY[trialOutcome(x, kind)] + '" data-lab-trial="' +
                                         k + '" data-lab-seed="' + s.seed + '" aria-pressed="' +
                                         (selected?.seed === s.seed && selected.index === k) +
                                         '" aria-label="' +
                                         escapeText(say('world', {seed : s.seed}) + ' · ' +
                                                    trialTitle(x, kind, k)) +
                                         '" title="' + escapeText(trialTitle(x, kind, k)) + '"' +
                                         (x.path?.length ? '' : ' disabled') + '>' + (k + 1) +
                                         '</button>')
                          .join('') +
                      ending(s) + '</div></div>')
             .join('') +
         '</div>';
}

function tallyCards(tally, kind) {
  return '<div class="aid-trial-tally">' +
         [ [ OUTCOME.reached, tally.reached ], [ OUTCOME.succeeded, tally.succeeded ] ]
             .map(([ outcome, n ]) =>
                      '<div><small>' + outcomeName(outcome, kind) + '</small><strong>' +
                      (tally.evaluated ? trials('share', {n, total : tally.evaluated}) : '—') +
                      '</strong></div>')
             .join('') +
         '</div>' +
         (tally.vanished
              ? '<p class="aid-trial-hint">' +
                    trials('omitted', {n : tally.vanished, total : tally.evaluated}) + '</p>'
              : '');
}

function legend(kind) {
  return '<div class="aid-lab-legend">' +
         [
           OUTCOME.succeeded, OUTCOME.reached, OUTCOME.missed,
           ...(kind === TRIAL_KIND.feed ? [] : [ OUTCOME.vanished ])
         ]
             .map(o => '<span><i class="aid-trial-key ' + OUTCOME_KEY[o] + '"></i>' +
                       outcomeName(o, kind) + '</span>')
             .join('') +
         '</div>';
}

function inspection(selected, kind) {
  if (!selected)
    return '<p class="aid-trial-hint">' + trials('inspect') + '</p>';
  const frame = selected.frame, last = selected.path.length - 1;
  const button = (key, target, glyph) =>
      '<button type="button" data-lab-frame="' + target + '" data-lab-step="' + key +
      '" aria-label="' + trials(key) + '" title="' + trials(key) + '"' +
      (frame === target ? ' disabled' : '') + '>' + glyph + '</button>';
  return '<div class="aid-trial-inspection"><div><strong>' + say('world', {seed : selected.seed}) +
         ' · ' + trialTitle(selected.trial, kind, selected.index) +
         '</strong><button type="button" data-lab-overview>' + trials('overview') +
         '</button></div>' +
         '<div class="aid-trial-time">' + button('first', 0, '↤') +
         button('previous', Math.max(0, frame - 1), '←') + '<output aria-live="polite">' +
         trials('step', {step : formatNumber(sampleStep(frame))}) + '</output>' +
         button('next', Math.min(last, frame + 1), '→') + button('last', last, '↦') + '</div>' +
         '<p class="aid-trial-hint">' + trials('sampling', {steps : TRIAL_LAB.path_every}) +
         '</p></div>';
}

function results(s) {
  const sessions = shownSessions(s.overview, s.fingerprint, s.trial, s.job);
  if (!sessions.some(x => x.trials?.length))
    return '<section class="aid-lab-results empty"><p>' + trials('nothingYet') + '</p></section>';
  const selected = inspectedTrial(sessions, s.inspection, s.fingerprint, s.trial);
  return '<section class="aid-lab-results aid-trial-results">' +
         tallyCards(trialTally(sessions, s.trial), s.trial) + '<div class="aid-trial-view">' +
         '<div>' + courseChart(sessions, s.trial, selected) + inspection(selected, s.trial) +
         '</div>' + trialStrip(sessions, s.trial, selected) + '</div>' + legend(s.trial) +
         '</section>';
}

function rule(kind) {
  return trials('rule.' + trialKey(kind), {
           distance : trialDistance(kind),
           steps : formatNumber(trialSteps(kind)),
           cluster : TRIAL_LAB.feed_cluster,
           near : TRIAL_LAB.feed_near
         }) +
         ' ' + trials('energyHelp');
}

const setup = s =>
    setupPanel(s,
               [
                 [
                   trials('choose.trial'),
                   Object.values(TRIAL_KIND)
                       .map(kind => choice('trial', kind, trials('kind.' + trialKey(kind)),
                                           s.trial === kind, s.running))
                       .join('')
                 ],
                 [
                   trials('choose.seeds'),
                   TRIAL_LAB.seeds.map(n => choice('seeds', n, n, s.seeds === n, s.running))
                       .join('')
                 ]
               ],
               rule(s.trial), trials('start'));

export function trialRunningLine(job) {
  const at = job.runs.findIndex(r => !r.done);
  return trials('running',
                {world : at + 1, worlds : job.count, n : job.runs[at]?.trials?.length ?? 0});
}
const status = s => s.error     ? escapeText(s.error)
                    : s.running ? trialRunningLine(s.job)
                                : say('ready');

export const trialShell = s =>
    labShell(s, trials('brand'), trials('title'), status(s), setup(s), results(s));
