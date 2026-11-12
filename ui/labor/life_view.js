import {formatNumber, t, tList} from '../strings.js';
import {escapeText} from '../studio/view/markup.js';
import {fishLives, lifeTimes, lifeWindow, lifeWorlds, selectedLife} from './life.js';

const say = (key, vars) => t('labor.life.' + key, vars);
const number = (n, digits = 0) => formatNumber(n, digits);
const C = {
  width : 720,
  height : 260,
  left : 12,
  right : 12,
  track : 48
};
const jump = (step, label, extra = '') =>
    '<button type="button" data-lab-life-time="' + step + '"' + extra + '>' + label + '</button>';

function lifeRows(world, selected) {
  const lives = fishLives(world), end = Math.max(1, ...lives.map(l => l.last));
  const x = step => 4 + 172 * step / end;
  return '<div class="aid-life-list">' +
         lives
             .map(l => {
               const active = l.id === selected.fishId;
               return '<button type="button" class="aid-life-row" data-lab-life="' + l.id +
                      '" data-lab-life-world="' + world.seed + '" aria-pressed="' + active + '">' +
                      '<span><b>' + say('fish', {id : l.id}) + '</b><small>' +
                      say('generation', {g : l.generation}) +
                      '</small></span><svg viewBox="0 0 180 16" aria-hidden="true"><path class="aid-life-span" d="M' +
                      x(l.start) + ',8H' + x(l.last) + '"/>' +
                      (l.hatch === null
                           ? ''
                           : '<circle class="hatch" cx="' + x(l.hatch) + '" cy="8" r="3"/>') +
                      (l.firstIntake === null ? ''
                                              : '<circle class="intake" cx="' + x(l.firstIntake) +
                                                    '" cy="8" r="3"/>') +
                      (l.death === null ? ''
                                        : '<path class="death" d="M' + (x(l.death) - 3) +
                                              ',4l6,8m-6,0l6,-8"/>') +
                      '</svg></button>';
             })
             .join('') +
         '</div>';
}

function signals(selected, focused) {
  const {detail, step} = selected, {from, to} = lifeWindow(selected, focused);
  const x = t => C.left + (C.width - C.left - C.right) * (t - from) / (to - from);
  const points = detail.points.filter(p => p.t >= from && p.t <= to);
  const events = detail.events.filter(e => e.t >= from && e.t <= to);
  const svg = (content, height = 58) =>
      '<svg viewBox="0 0 720 ' + height +
      '" preserveAspectRatio="none" aria-hidden="true"><path class="aid-life-grid" d="M12,' +
      (height - 6) + 'H708"/>' + content + '<path class="aid-life-cursor" d="M' + x(step) + ',0V' +
      height + '"/><rect data-lab-life-plane="true" x="12" y="0" width="696" height="' + height +
      '" fill="transparent"/></svg>';
  const track = (key, limit, content) => '<div class="aid-life-track ' + key + '"><div><span>' +
                                         say(key) + '</span><span>' + limit + '</span></div>' +
                                         svg(content) + '</div>';
  const tracks = [
    {key : 'gut', value : p => p.gut},
    {key : 'reserve', value : p => p.reserveCapacity > 0 ? p.energy / p.reserveCapacity : 0}
  ];
  const lines =
      tracks
          .map(({key, value}) => {
            const path =
                points
                    .map((p, i) =>
                             (i ? 'L' : 'M') + x(p.t).toFixed(1) + ',' +
                             (4 + C.track * (1 - Math.max(0, Math.min(1, value(p))))).toFixed(1))
                    .join('');
            return track(key, '100 %',
                         (key === 'gut' ? '<path class="aid-life-half" d="M12,28H708"/>' : '') +
                             '<path class="aid-life-signal" d="' + path + '"/>');
          })
          .join('');
  const meals = events.filter(e => e.kind === 'intake');
  const total = e => e.diet.reduce((a, b) => a + b, 0);
  const peak = Math.max(0, ...meals.map(total));
  const intake = track('intake', say('raw', {amount : number(peak, 1)}),
                       meals
                           .map(e => '<path class="aid-life-signal" d="M' + x(e.t).toFixed(1) +
                                     ',52v-' + (C.track * total(e) / peak).toFixed(1) + '"/>')
                           .join(''));
  const bites = events.filter(e => e.kind === 'close')
                    .map(e => '<circle class="' + (e.empty ? 'empty' : 'close') + '" cx="' +
                              x(e.t).toFixed(1) + '" cy="6" r="2"/>')
                    .join('');
  return '<div class="aid-life-signals" role="group" aria-label="' + say('signals') + '">' + lines +
         intake + '<div class="aid-life-bites">' + svg(bites, 12) + '</div></div>' +
         '<div class="aid-life-scale"><span>' + say('step', {step : number(from)}) +
         '</span><span>' + say('step', {step : number(to)}) + '</span></div>';
}

function history(selected) {
  const life = selected.summary, gap = life.longestNoFood,
        deathNames = tList('feeding_view.deathNames');
  const events = life.events.map(
      e => ({
        ...e,
        label : e.kind === 'death'  ? say('death', {cause : deathNames[e.cause] ?? e.cause})
                : e.kind === 'laid' ? say(e.nutrient ? 'nutrient' : 'laid', {id : e.child})
                                    : say('event.' + e.kind)
      }));
  if (gap.to > gap.from)
    events.push({
      t : gap.to,
      kind : 'gap',
      label : say('gap', {steps : number(gap.to - gap.from), from : number(gap.from)})
    });
  events.sort((a, b) => a.t - b.t);
  return '<details class="aid-life-events" data-lab-fold="events"><summary>' + say('events') +
         '</summary><ol>' +
         events
             .map(e => '<li>' +
                       jump(e.t,
                            '<time>' + number(e.t) + '</time><span>' + escapeText(e.label) +
                                '</span>',
                            ' aria-pressed="' + (e.t === selected.step) + '"') +
                       '</li>')
             .join('') +
         '</ol></details>';
}

function inspection(selected, s) {
  const {summary : life, detail, point, step} = selected;
  const title = '<div class="aid-life-title"><h3>' + say('fish', {id : life.id}) + '</h3><span>' +
                say('generation', {g : life.generation}) + '</span>' +
                (life.parent ? '<button type="button" data-lab-life="' + life.parent +
                                   '" data-lab-life-world="' + selected.run.seed + '">' +
                                   say('parent', {id : life.parent}) + '</button>'
                             : '') +
                '</div>';
  if (!detail)
    return title + '<p role="status">' + (s.lifeError ? escapeText(s.lifeError) : say('loading')) +
           '</p>';
  const times = lifeTimes(selected), index = Math.max(0, times.indexOf(step));
  const navigation =
      '<div class="aid-lab-time">' +
      jump(times[0], '↤', ' aria-label="' + say('first') + '"' + (index ? '' : ' disabled')) +
      jump(times[Math.max(0, index - 1)], '←',
           ' aria-label="' + say('previous') + '"' + (index ? '' : ' disabled')) +
      '<output aria-live="polite">' + say('step', {step : number(step)}) + '</output>' +
      jump(times[Math.min(times.length - 1, index + 1)], '→',
           ' aria-label="' + say('next') + '"' + (index === times.length - 1 ? ' disabled' : '')) +
      jump(times.at(-1), '↦',
           ' aria-label="' + say('last') + '"' + (index === times.length - 1 ? ' disabled' : '')) +
      '</div>';
  const phases =
      '<div class="aid-life-phases">' +
      [ 'feeding', 'full', 'emptying' ]
          .map(key => jump(life.phases[key] ?? step, say('phase.' + key),
                           ' data-lab-life-phase="' + key + '"' +
                               (life.phases[key] === undefined
                                    ? ' disabled'
                                    : ' aria-pressed="' + (life.phases[key] === step) + '"')))
          .join('') +
      '</div>';
  const status =
      point ? '<p class="aid-life-state">' + say('state', {
                gut : number(point.gut * 100),
                reserve : number(
                    point.reserveCapacity > 0 ? 100 * point.energy / point.reserveCapacity : 0),
                maturity : number(point.maturity * 100)
              }) + (point.t === step ? '' : ' · ' + say('measured', {step : number(point.t)})) +
                  '</p>'
            : '';
  const near =
      life.regularSamples ? number(life.nearSamples / life.regularSamples * 100) + ' %' : '—';
  return title + phases + '<div data-lab-scene></div>' + navigation + status +
         '<div class="aid-life-zoom"><button type="button" data-lab-life-focus="0" aria-pressed="' +
         !s.lifeFocused + '">' + say('whole') +
         '</button><button type="button" data-lab-life-focus="1" aria-pressed="' + !!s.lifeFocused +
         '">' + say('window') + '</button></div>' + signals(selected, s.lifeFocused) +
         '<p class="aid-life-key"><i class="close"></i>' + say('closing') +
         ' <i class="empty"></i>' + say('emptyClosing') + '</p>' +
         '<p class="aid-lab-detail">' + say('sampling', {steps : detail.observation.every}) +
         '</p>' +
         '<p class="aid-life-summary">' + say('summary', {
           near,
           empty : number(life.emptyClosings),
           total : number(life.closings),
           intake : number(life.intake, 1)
         }) +
         '</p>' + history(selected);
}

export function lifeView(s) {
  const selected = selectedLife(s);
  if (!selected)
    return '';
  const worlds = lifeWorlds(s), world = worlds.find(w => w.seed === selected.run.seed);
  return '<section class="aid-life"><nav class="aid-life-worlds" aria-label="' + say('worlds') +
         '">' +
         worlds
             .map(w => '<button type="button" data-lab-life-world="' + w.seed + '" aria-pressed="' +
                       (w.seed === world.seed) + '">' + t('labor.world', {seed : w.seed}) +
                       '</button>')
             .join('') +
         '</nav><div class="aid-life-layout"><aside><h3>' + say('lives') + '</h3>' +
         lifeRows(world, selected) + '<p class="aid-life-list-key">' + say('lifelineKey') +
         '</p></aside><article class="aid-life-inspection">' + inspection(selected, s) +
         '</article></div></section>';
}
