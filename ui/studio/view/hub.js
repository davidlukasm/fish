import {formatNumber, t} from '../../strings.js';
import {escapeText} from './markup.js';
import {shelfVerdict, START_FISH} from '../../labor/model.js';
import {runningLine, say, verdictLine, verdictStamp} from '../../labor/view.js';

const hub = (key, vars) => t('studio.hub.' + key, vars);
const SPARK = Object.freeze({width : 260, height : 64, edge : 4});
export const LIVE_FIGURES = Object.freeze([ 'fish', 'eggs', 'species', 'generation', 'step' ]);

export function sparkline(history) {
  const S = SPARK;
  if (history.length < 2)
    return '<svg class="aid-hub-spark" viewBox="0 0 ' + S.width + ' ' + S.height +
           '" preserveAspectRatio="none"></svg>';
  const first = history[0][0], span = Math.max(1, history.at(-1)[0] - first),
        top = Math.max(1, ...history.map(h => h[1]));
  const points =
      history.map(([ step, n ]) => [S.edge + (S.width - 2 * S.edge) * (step - first) / span,
                                    S.height - S.edge - (S.height - 2 * S.edge) * n / top]);
  const line = points.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  return '<svg class="aid-hub-spark" viewBox="0 0 ' + S.width + ' ' + S.height +
         '" preserveAspectRatio="none" role="img" aria-label="' + hub('sparkline') +
         '"><polygon points="' + points[0][0].toFixed(1) + ',' + S.height + ' ' + line + ' ' +
         points.at(-1)[0].toFixed(1) + ',' + S.height + '"/><polyline points="' + line +
         '"/></svg>';
}

export const liveState = h => !h.figures         ? hub('connecting')
                              : h.figures.paused ? hub('paused')
                                                 : hub('running');

export const figureText = (h, key) =>
    h.figures && Number.isFinite(h.figures[key]) ? formatNumber(h.figures[key]) : '–';

function station({action, index, title, visual, go, future = false, cls = ''}) {
  const tag = future ? 'div' : 'button';
  return '<' + tag + (future ? '' : ' type="button" data-action="' + action + '"') +
         ' class="aid-hub-station ' + (future ? 'future ' : '') + cls +
         '"><span class="aid-hub-index">' + index + '<i>' + hub(future ? 'later' : 'open') +
         '</i></span><strong>' + title + '</strong><span class="aid-hub-visual">' + visual +
         '</span>' +
         (go ? '<span class="aid-hub-go">' + go + '<b aria-hidden="true">→</b></span>' : '') +
         '</' + tag + '>';
}

function breedingVisual(h) {
  const job = h.overview?.job;
  if (job?.status === 'running')
    return '<span class="aid-hub-note">' + runningLine(job) + '</span>';
  const proven = START_FISH.filter(key => {
    const fish = h.overview?.fish.find(f => f.key === key);
    return fish && shelfVerdict(h.overview, fish.fingerprint)?.passed;
  });
  return '<span class="aid-hub-note">' + hub('provenCount', {n : proven.length}) + '</span>';
}

function shelf(h) {
  return START_FISH
      .map(key => {
        const fish = h.overview?.fish.find(f => f.key === key),
              verdict = fish && shelfVerdict(h.overview, fish.fingerprint);
        return '<article class="aid-hub-fish"><div class="aid-hub-fish-head"><strong>' +
               say('fish.' + key) + '</strong><span>' + say('role.' + key) +
               '</span></div><div class="aid-hub-stamps">' +
               (fish?.released
                    ? '<span class="aid-lab-stamp released">' + say('released') + '</span>'
                    : '') +
               verdictStamp(verdict) + '</div><p>' +
               (verdict ? escapeText(verdictLine(verdict)) + ' · ' +
                              say('stepsShort', {steps : formatNumber(verdict.steps)})
                        : '') +
               '</p><div class="aid-hub-fish-actions"><button type="button" data-hub-breed="' +
               key + '">' + hub('breed') + '</button><button type="button" data-hub-atelier="' +
               key + '">' + hub('atelier') + '</button></div></article>';
      })
      .join('');
}

export function hubShell(h) {
  const live =
      LIVE_FIGURES
          .map(key => '<div><small>' + hub('figures.' + key) + '</small><strong data-live="' + key +
                      '">' + figureText(h, key) + '</strong></div>')
          .join('');
  const stations = [
    station({
      action : 'aquarium',
      index : hub('index.aquarium'),
      title : t('studio.app.hubAquarium'),
      visual :
          '<span class="aid-hub-spark-frame" data-live-spark>' + sparkline(h.history) + '</span>',
      go : hub('go.aquarium'),
      cls : 'aquarium'
    }),
    station({
      action : 'atelier',
      index : hub('index.atelier'),
      title : t('studio.app.hubAtelier'),
      visual : '<span class="aid-hub-note">' + escapeText(h.draft) + '</span>',
      go : t('studio.app.hubStart'),
      cls : 'atelier'
    }),
    station({
      action : 'breeding',
      index : hub('index.breeding'),
      title : say('title'),
      visual : breedingVisual(h),
      go : hub('go.breeding'),
      cls : 'breeding'
    }),
    station({
      action : 'trials',
      index : hub('index.behavior'),
      title : say('trials.title'),
      visual : '<span class="aid-hub-note">' + hub('trialsNote') + '</span>',
      go : hub('go.trials'),
      cls : 'trials'
    }),
    station({index : hub('index.field'), title : hub('field'), visual : '', future : true})
  ].join('');
  return '<div class="aid-hub"><header class="aid-header"><div class="aid-header-brand"><div><small>' +
         t('studio.app.hubBrand') + '</small><h1>' + t('studio.app.hubTitle') +
         '</h1></div></div><div class="aid-status aid-hub-live" role="status"><i></i><span data-live-state>' +
         liveState(h) + '</span></div></header><main class="aid-hub-content"><small>' +
         t('studio.app.hubStation') + '</small><h2>' + hub('lead') + '</h2>' +
         '<section class="aid-hub-figures" aria-label="' + hub('figuresTitle') + '">' + live +
         '</section><div class="aid-hub-section"><small>' + hub('stationsSmall') + '</small><h3>' +
         hub('stations') + '</h3></div><div class="aid-hub-stations">' + stations +
         '</div><div class="aid-hub-section"><small>' + hub('shelfSmall') + '</small><h3>' +
         hub('shelf') + '</h3></div><div class="aid-hub-shelf">' + shelf(h) + '</div></main>' +
         '<footer class="aid-station-footer"><span class="aid-message"></span><span>' +
         t('studio.app.hubFooter') + '</span></footer></div>';
}
