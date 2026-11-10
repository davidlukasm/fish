import {BREEDING} from '../schema.js';
import {formatNumber, t} from '../strings.js';
import {DEATH_COLORS, deathNames} from '../feeding_view.js';
import {escapeText} from '../studio/view/markup.js';
import {
  breedingVerdict,
  deathTotals,
  DRAFT,
  SAMPLE,
  shownWorlds,
  START_FISH,
  worldVerdict
} from './model.js';

export const say = (key, vars) => t('labor.' + key, vars);
const CHART = Object.freeze({width : 320, height : 112, top : 14, bottom : 18, side : 6, tick : 4});

export const choice = (setting, value, text, chosen, disabled = false) =>
    '<button type="button" data-lab-setting="' + setting + '" data-lab-value="' + value +
    '" aria-pressed="' + chosen + '"' + (chosen ? ' class="active"' : '') +
    (disabled ? ' disabled' : '') + '>' + text + '</button>';

export const fishName = (key, draft) =>
    key === DRAFT ? escapeText(draft?.name || say('fish.draft')) : say('fish.' + key);

export function fishChoices(s) {
  const fish = START_FISH.map(key => ({key, offered : true}));
  fish.push({key : DRAFT, offered : !!s.draft});
  return fish
      .map(({key, offered}) => '<button type="button" class="aid-lab-fish' +
                               (s.fish === key ? ' active' : '') + '" data-lab-fish="' + key + '"' +
                               (offered && !s.running ? '' : ' disabled') + '><strong>' +
                               fishName(key, s.draft) + '</strong><span>' + say('role.' + key) +
                               '</span></button>')
      .join('');
}

// The fish, the station's own settings, its rule and the start or cancel button.
export function setupPanel(s, settings, rule, start) {
  return '<div class="aid-lab-setup"><h3>' + say('choose.fish') + '</h3>' +
         '<div class="aid-lab-fishes">' + fishChoices(s) + '</div>' +
         settings
             .map(([ title, buttons ]) =>
                      '<h3>' + title + '</h3><div class="aid-button-group">' + buttons + '</div>')
             .join('') +
         '<p class="aid-lab-rule">' + rule + '</p><button type="button" ' +
         'class="primary aid-lab-go" data-lab="' + (s.running ? 'cancel' : 'start') + '"' +
         (s.fingerprint ? '' : ' disabled') + '>' + (s.running ? say('cancel') : start) +
         '</button></div>';
}
const setup = s =>
    setupPanel(s,
               [
                 [
                   say('choose.worlds'),
                   BREEDING.worlds.map(n => choice('worlds', n, n, s.worlds === n, s.running))
                       .join('')
                 ],
                 [
                   say('choose.steps'),
                   BREEDING.steps
                       .map(n => choice('steps', n, formatNumber(n), s.steps === n, s.running))
                       .join('')
                 ]
               ],
               say('rule', {founders : BREEDING.founders}), say('start'));

function generationMarks(samples, x) {
  const marks = [];
  let reached = -1;
  for (const sample of samples)
    if (sample[SAMPLE.parents] > reached && sample[SAMPLE.parents] > 0) {
      reached = sample[SAMPLE.parents];
      marks.push({x : x(sample[SAMPLE.step]), g : reached});
    }
  return marks;
}

function worldChart(world, top) {
  const C = CHART, samples = world.samples ?? [], floor = C.height - C.bottom;
  const x = step => C.side + (C.width - 2 * C.side) * step / world.steps,
        y = n => floor - (floor - C.top) * n / Math.max(1, top);
  const line = samples.map(s => x(s[SAMPLE.step]).toFixed(1) + ',' + y(s[SAMPLE.fish]).toFixed(1));
  const area = line.length ? 'M' + x(samples[0][SAMPLE.step]).toFixed(1) + ',' + floor + 'L' +
                                 line.join('L') + 'L' + x(samples.at(-1)[SAMPLE.step]).toFixed(1) +
                                 ',' + floor + 'Z'
                           : '';
  const marks =
      generationMarks(samples, x)
          .map(m => '<g class="aid-lab-generation"><title>' + say('parentsTitle', {g : m.g}) +
                    '</title><line x1="' + m.x.toFixed(1) + '" x2="' + m.x.toFixed(1) + '" y1="' +
                    C.top + '" y2="' + floor + '"/><text x="' + (m.x + C.tick).toFixed(1) +
                    '" y="' + (C.top - C.tick) + '">' + say('parents', {g : m.g}) + '</text></g>')
          .join('');
  return '<svg class="aid-lab-chart" viewBox="0 0 ' + C.width + ' ' + C.height +
         '" role="img" aria-label="' + say('chart') + '"><line class="aid-lab-axis" x1="' + C.side +
         '" x2="' + (C.width - C.side) + '" y1="' + floor + '" y2="' + floor + '"/>' +
         (area ? '<path class="aid-lab-area" d="' + area + '"/><polyline class="aid-lab-line" ' +
                     'points="' + line.join(' ') + '"/>'
               : '') +
         marks + '<text class="aid-lab-scale" x="' + C.side + '" y="' + (C.height - C.tick) +
         '">0</text><text class="aid-lab-scale" text-anchor="end" x="' + (C.width - C.side) +
         '" y="' + (C.height - C.tick) + '">' + formatNumber(world.steps) + '</text></svg>';
}

function deathBar(deaths) {
  const entries = Object.entries(deaths).filter(([, n ]) => n > 0),
        total = entries.reduce((sum, [, n ]) => sum + n, 0);
  if (!total)
    return '';
  return '<div class="aid-lab-deaths">' +
         entries
             .map(([ cause, n ]) => '<span style="flex:' + n +
                                    ';background:' + DEATH_COLORS[cause] + '" title="' +
                                    escapeText(deathNames[cause] + ': ' + n) + '"></span>')
             .join('') +
         '</div>';
}

function deathLegend(deaths) {
  return '<div class="aid-lab-legend">' +
         Object.entries(deaths)
             .filter(([, n ]) => n > 0)
             .map(([ cause, n ]) => '<span><i style="background:' + DEATH_COLORS[cause] + '"></i>' +
                                    escapeText(deathNames[cause]) + ' ' + n + '</span>')
             .join('') +
         '</div>';
}

function worldState(v, running) {
  if (!v.done && !running)
    return say('waiting');
  if (!v.done)
    return say('runningWorld', {step : formatNumber(v.reached)});
  return v.alive ? say('alive', {n : formatNumber(v.peak)})
                 : say('extinct', {step : formatNumber(v.reached)});
}

function worldCard(world, top, runningSeed) {
  const v = worldVerdict(world);
  return '<article class="aid-lab-world' + (v.proven ? ' proven' : '') +
         '"><div class="aid-lab-world-head"><strong>' + say('world', {seed : world.seed}) +
         '</strong><span>' + worldState(v, runningSeed === world.seed) + '</span></div>' +
         worldChart(world, top) + deathBar(world.deaths ?? {}) + '</article>';
}

export function verdictStamp(verdict, cls = '') {
  if (!verdict || !verdict.done)
    return '<span class="aid-lab-stamp open ' + cls + '">' + say('verdict.none') + '</span>';
  return '<span class="aid-lab-stamp ' + (verdict.passed ? 'passed ' : 'open ') + cls + '">' +
         say(verdict.passed ? 'verdict.passed' : 'verdict.open') + '</span>';
}

export const verdictLine = verdict =>
    verdict?.done
        ? say('verdictLine',
              {proven : verdict.proven, done : verdict.done, g : Math.max(0, verdict.parents)})
        : '';

function results(s) {
  const worlds = shownWorlds(s.overview, s.fingerprint, s.steps, s.job);
  if (!worlds.length)
    return '<section class="aid-lab-results empty"><p>' + say('nothingYet') + '</p></section>';
  const verdict = breedingVerdict(worlds),
        top = Math.max(1, ...worlds.flatMap(w => (w.samples ?? []).map(x => x[SAMPLE.fish])));
  const runningSeed = s.running ? s.job?.runs.find(w => !w.done)?.seed : null;
  return '<section class="aid-lab-results"><div class="aid-lab-verdict">' + verdictStamp(verdict) +
         '<span>' + verdictLine(verdict) + '</span></div>' +
         '<div class="aid-lab-worlds">' + worlds.map(w => worldCard(w, top, runningSeed)).join('') +
         '</div>' + deathLegend(deathTotals(worlds)) + '</section>';
}

export const runningLine = job => {
  const at = job.runs.findIndex(w => !w.done), world = job.runs[at];
  return say('running', {
    world : at + 1,
    worlds : job.count,
    step : formatNumber(world?.samples?.at(-1)?.[SAMPLE.step] ?? 0)
  });
};
const status = s => s.error ? escapeText(s.error) : s.running ? runningLine(s.job) : say('ready');

// A station page: header with the way home, the setup beside the results.
export function labShell(s, brand, title, line, setupHtml, resultsHtml) {
  return '<div class="aid-station aid-lab"><header class="aid-header"><div class="aid-header-brand">' +
         '<button type="button" data-action="home"><span aria-hidden="true">' +
         t('studio.app.backMark') + '</span>' + t('studio.app.home') + '</button><div><small>' +
         brand + '</small><h1>' + title + '</h1></div></div>' +
         '<div class="aid-status" role="status">' + line + '</div></header>' +
         '<div class="aid-lab-body">' + setupHtml + resultsHtml + '</div>' +
         '<footer class="aid-station-footer"><span class="aid-message"></span><span>' +
         t('studio.app.stationFooter') + '</span></footer></div>';
}
export const breedingShell = s =>
    labShell(s, say('brand'), say('title'), status(s), setup(s), results(s));
