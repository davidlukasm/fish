import {BREEDING} from '../schema.js';
import {formatNumber, t, tList} from '../strings.js';
import {DEATH_COLORS, deathNames, FOOD_COLORS} from '../feeding_view.js';
import {foodDisplayIndex} from '../nutrition_model.js';
import {escapeText} from '../studio/view/markup.js';
import {lifeView} from './life_view.js';
import {
  breedingVerdict,
  BREEDING_METRICS,
  deathTotals,
  DRAFT,
  inspectedWorld,
  sampleSeries,
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
    if (sample.parents > reached && sample.parents > 0) {
      reached = sample.parents;
      marks.push({x : x(sample.step), g : reached});
    }
  return marks;
}

function worldChart(world, top, metric, selected) {
  const C = CHART, samples = world.samples ?? [], floor = C.height - C.bottom;
  const x = step => C.side + (C.width - 2 * C.side) * step / world.steps,
        y = n => floor - (floor - C.top) * n / top;
  const series = sampleSeries(world, metric);
  const lines = series
                    .map(({key, values}) => {
                      let open = false;
                      const path = values
                                       .map((value, i) => {
                                         if (value === null) {
                                           open = false;
                                           return '';
                                         }
                                         const point = (open ? 'L' : 'M') +
                                                       x(samples[i].step).toFixed(1) + ',' +
                                                       y(value).toFixed(1);
                                         open = true;
                                         return point;
                                       })
                                       .join('');
                      return '<path class="aid-lab-line ' + key + '" d="' + path + '"/>';
                    })
                    .join('');
  const selection = selected?.world.seed === world.seed ? selected : null;
  const marker = selection
                     ? '<line class="aid-lab-cursor" x1="' + x(selection.sample.step) + '" x2="' +
                           x(selection.sample.step) + '" y1="' + C.top + '" y2="' + floor + '"/>' +
                           series.filter(s => s.values[selection.frame] !== null)
                               .map(s => '<circle class="aid-lab-point ' + s.key + '" cx="' +
                                         x(selection.sample.step) + '" cy="' +
                                         y(s.values[selection.frame]) + '" r="3"/>')
                               .join('')
                     : '';
  const marks =
      generationMarks(samples, x)
          .map(m => '<g class="aid-lab-generation"><title>' + say('parentsTitle', {g : m.g}) +
                    '</title><line x1="' + m.x.toFixed(1) + '" x2="' + m.x.toFixed(1) + '" y1="' +
                    C.top + '" y2="' + floor + '"/><text x="' + (m.x + C.tick).toFixed(1) +
                    '" y="' + (C.top - C.tick) + '">' + say('parents', {g : m.g}) + '</text></g>')
          .join('');
  const hits =
      samples
          .map((sample, i) => {
            const left = i ? (x(samples[i - 1].step) + x(sample.step)) / 2 : 0;
            const right =
                i + 1 < samples.length ? (x(sample.step) + x(samples[i + 1].step)) / 2 : C.width;
            return '<rect class="aid-lab-hit" data-lab-world="' + world.seed +
                   '" data-lab-sample="' + i + '" x="' + left + '" y="0" width="' + (right - left) +
                   '" height="' + C.height + '"><title>' +
                   say('analysis.step', {step : formatNumber(sample.step)}) + '</title></rect>';
          })
          .join('');
  return '<button type="button" class="aid-lab-plot" data-lab-world="' + world.seed +
         '" data-lab-sample="' + (samples.length - 1) + '" aria-pressed="' + !!selection +
         '" aria-label="' + say('analysis.inspect', {seed : world.seed}) + '"' +
         (samples.length ? '' : ' disabled') + '><svg class="aid-lab-chart" viewBox="0 0 ' +
         C.width + ' ' + C.height + '" role="img" aria-label="' + say('analysis.metric.' + metric) +
         '"><line class="aid-lab-axis" x1="' + C.side + '" x2="' + (C.width - C.side) + '" y1="' +
         floor + '" y2="' + floor + '"/>' + lines + marks + marker +
         '<text class="aid-lab-scale" text-anchor="end" x="' + (C.width - C.side) + '" y="10">' +
         formatNumber(top, metric === 'population' ? 0
                           : metric === 'intake'   ? 2
                                                   : 1) +
         '</text>' +
         '<text class="aid-lab-scale" x="' + C.side + '" y="' + (C.height - C.tick) +
         '">0</text><text class="aid-lab-scale" text-anchor="end" x="' + (C.width - C.side) +
         '" y="' + (C.height - C.tick) + '">' + formatNumber(world.steps) + '</text>' + hits +
         '</svg></button>';
}

function deathBar(deaths) {
  const entries = Object.entries(deaths).filter(([, n ]) => n > 0),
        total = entries.reduce((sum, [, n ]) => sum + n, 0);
  if (!total)
    return '';
  return '<div class="aid-lab-deaths" title="' + say('analysis.deaths') + '">' +
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
  return v.alive ? say('alive') : say('extinct', {step : formatNumber(v.reached)});
}

function worldCard(world, top, runningSeed, metric, selected) {
  const v = worldVerdict(world);
  return '<article class="aid-lab-world' + (v.proven ? ' proven' : '') +
         (selected?.world.seed === world.seed ? ' selected' : '') +
         '"><div class="aid-lab-world-head"><strong>' + say('world', {seed : world.seed}) +
         '</strong><span>' + worldState(v, runningSeed === world.seed) + '</span></div>' +
         worldChart(world, top, metric, selected) + deathBar(world.deaths ?? {}) + '</article>';
}

function sampleInspection(selected) {
  if (!selected)
    return '';
  const {world, frame, following, sample, intake} = selected, last = world.samples.length - 1;
  const button = (key, target, glyph, disabled = false) =>
      '<button type="button" data-lab-sample-step="' + key + '" data-lab-sample="' + target +
      '" data-lab-world="' + world.seed + '" title="' + say('analysis.' + key) + '" aria-label="' +
      say('analysis.' + key) + '"' + (disabled ? ' disabled' : '') + '>' + glyph + '</button>';
  const stat = (key, value) =>
      '<div><dt>' + say('analysis.' + key) + '</dt><dd>' + value + '</dd></div>';
  const names = tList('feeding_view.foodShortNames');
  const food = (intake?.diet ?? [])
                   .flatMap((amount, kind) => amount > 0 ? [ {
                              amount,
                              name : names[foodDisplayIndex(kind)],
                              color : FOOD_COLORS[foodDisplayIndex(kind)]
                            } ]
                                                         : []);
  const meal =
      !intake ? '<p>' + say('analysis.noInterval') + '</p>'
              : '<h4>' + say('analysis.interval', {
                  from : formatNumber(intake.from),
                  to : formatNumber(intake.to),
                  amount : formatNumber(intake.total, 1)
                }) + '</h4>' +
                    (food.length
                         ? '<div class="aid-lab-food-bar">' +
                               food.map(f => '<span style="flex:' + f.amount +
                                             ';background:' + f.color + '" title="' +
                                             escapeText(f.name + ': ' + formatNumber(f.amount, 1)) +
                                             '"></span>')
                                   .join('') +
                               '</div>' +
                               '<div class="aid-lab-food-key">' +
                               food.map(f => '<span><i style="background:' + f.color + '"></i>' +
                                             escapeText(f.name) + ' <b>' +
                                             formatNumber(f.amount, 1) + '</b></span>')
                                   .join('') +
                               '</div>'
                         : '<p>' + say('analysis.noIntake') + '</p>');
  return '<section class="aid-lab-inspection"><div class="aid-lab-inspection-head"><h3>' +
         say('world', {seed : world.seed}) + '</h3><span>' +
         say(following ? 'analysis.following' : 'analysis.fixed') +
         '</span></div><div class="aid-lab-time">' + button('first', 0, '↤', frame === 0) +
         button('previous', frame - 1, '←', frame === 0) + '<output aria-live="polite">' +
         say('analysis.step', {step : formatNumber(sample.step)}) + '</output>' +
         button('next', frame + 1, '→', frame === last) +
         button('latest', 'latest', '↦', following) + '</div>' +
         '<dl class="aid-lab-values">' + stat('fish', formatNumber(sample.fish)) +
         stat('eggs', formatNumber(sample.eggs)) +
         stat('reserve', formatNumber(sample.reserve[2], 1)) +
         stat('feed', formatNumber(sample.availableFeed, 1)) + '</dl><p class="aid-lab-detail">' +
         say('analysis.reserveRange', {
           low : formatNumber(sample.reserve[1], 1),
           high : formatNumber(sample.reserve[3], 1)
         }) +
         ' · ' + say('analysis.leaves', {n : formatNumber(sample.leaves, 1)}) + '</p>' +
         '<p class="aid-lab-detail">' + say('analysis.generations', {g : sample.generation}) +
         ' · ' +
         (sample.parents >= 0 ? say('parentsTitle', {g : sample.parents})
                              : say('analysis.noParents')) +
         '</p>' +
         '<div class="aid-lab-meal">' + meal + '</div><p class="aid-lab-detail">' +
         say('analysis.raw') + '</p></section>';
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
  const verdict = breedingVerdict(worlds), metric = s.metric ?? 'population',
        selected = inspectedWorld(worlds, s.inspection, s.fingerprint, s.steps),
        top = Math.max(0, ...worlds.flatMap(w => sampleSeries(w, metric).flatMap(
                                                s => s.values.filter(v => v !== null)))) ||
              1;
  const runningSeed = s.running ? s.job?.runs.find(w => !w.done)?.seed : null, life = lifeView(s);
  return '<section class="aid-lab-results"><div class="aid-lab-verdict">' + verdictStamp(verdict) +
         '<span>' + verdictLine(verdict) + '</span></div>' + life +
         (life ? '<details class="aid-life-population"><summary>' + say('life.population') +
                     '</summary>'
               : '') +
         '<div class="aid-lab-metrics" role="group" aria-label="' + say('analysis.choose') + '">' +
         BREEDING_METRICS
             .map(key => '<button type="button" data-lab-metric="' + key + '" aria-pressed="' +
                         (key === metric) + '">' + say('analysis.metric.' + key) + '</button>')
             .join('') +
         '</div>' +
         '<p class="aid-lab-chart-key ' + metric + '">' + say('analysis.unit.' + metric) + '</p>' +
         '<p class="aid-lab-detail">' + say('analysis.hint') + '</p>' +
         '<div class="aid-lab-worlds">' +
         worlds.map(w => worldCard(w, top, runningSeed, metric, selected)).join('') + '</div>' +
         sampleInspection(selected) + '<p class="aid-lab-detail">' + say('analysis.deaths') +
         '</p>' + deathLegend(deathTotals(worlds)) + (life ? '</details>' : '') + '</section>';
}

export const runningLine = job => {
  const at = job.runs.findIndex(w => !w.done), world = job.runs[at];
  return say(
      'running',
      {world : at + 1, worlds : job.count, step : formatNumber(world?.samples?.at(-1)?.step ?? 0)});
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
