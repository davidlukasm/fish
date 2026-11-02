import {eventKind} from './event_model.js';
import {formatNumber, t, tList} from './strings.js';
import {chartContext, chartSize, setChartHeight} from './dom.js';
import {updateCockpitState} from './cockpit.js';
import {cockpitState} from './cockpit.js';
import {journal} from './journal_model.js';
import {el, text} from './dom.js';
import {NICHE_OPEN_WATER, behaviorNiches} from './behavior_model.js';
import {FOOD_COLORS, paintEcologyIcon} from './feeding_view.js';
import {sessionState} from './session.js';
import {sceneState} from './state.js';
export const chartsState = {};
export let curveInfo;
// Habitat icons of the niche places bottom, surface, solid faces and grass.
const NICHE_PLACE_ICONS = [ 'buried', 'light', 'surface', 'grass' ];

// The charts show 20 000 steps; the two overview trends can be paged back and forth through the
// recorded run (older history is kept thinned) by half that span; the main chart always ends at
// the present.
const CHART_SPAN = 20000;

function chartHistory(data) {
  const until = sceneState.frame?.historical ? sceneState.frame.step : Infinity;
  return (data.points || []).filter(p => !p.historical && p.step <= until);
}

function recentChartPoints(data) {
  const points = chartHistory(data), last = points.at(-1)?.step ?? 0;
  return points.filter(p => p.step >= last - CHART_SPAN);
}

function overviewWindow(data) {
  const all = chartHistory(data), first = all[0]?.step ?? 0, latest = all.at(-1)?.step ?? 0,
        paged = chartsState.overviewPage?.session === sessionState.sessionId
                    ? chartsState.overviewPage.end
                    : latest,
        end = Math.min(latest, Math.max(first + CHART_SPAN, paged));
  return {
    points : all.filter(p => p.step >= end - CHART_SPAN && p.step <= end),
    earlier : end - CHART_SPAN > first,
    later : end < latest,
    end
  };
}

function pageOverview(direction) {
  const data = sessionState.historyData;
  if (!data)
    return;
  const view = overviewWindow(data), latest = chartHistory(data).at(-1)?.step ?? 0,
        end = view.end + direction * CHART_SPAN / 2;
  // The page belongs to this run; another run starts at its present again.
  chartsState.overviewPage = end >= latest ? null : {session : sessionState.sessionId, end};
  overviewPlots(data);
}

export function helpSummary(f) {
  const a = f.assistance || {};
  if (!f.safety)
    return t('charts.hilfeAus');
  return [
    a.target ? t('charts.helpTarget', {target : a.target, missing : a.shortfall})
             : t('charts.globaleHilfeAus'),
    ...(a.species_minimum ? [ t('charts.protection', {n : a.threatened || 0}) ] : [])
  ].join(' · ');
}

export function chart(data) {
  const c = el('chart'), g = chartContext(c, () => chart(data)), points = recentChartPoints(data),
        metric = el('chart-metric').value || 'population',
        info = curveInfo[metric] || curveInfo.population;
  g.clearRect(0, 0, chartSize(c).width, chartSize(c).height);
  g.font = '12px system-ui';
  g.fillStyle = '#9bb1b6';
  updateCockpitState({chartMarkers : []});
  chartsState.chartPoints = [];
  overviewPlots(data);
  const names =
      metric === 'population'
          ? [ [ t('charts.fische'), '#a2d9c6' ], [ t('charts.natuerlichGeboren'), '#e9c185' ] ]
          : [ [ info.name, info.color ] ];
  const legend = el('chart-legend');
  legend.replaceChildren();
  for (const [name, color] of names) {
    const item = document.createElement('span');
    item.textContent = name;
    item.style.color = color;
    item.title = info.explain;
    legend.appendChild(item);
  }
  el('chart-metric').title = info.explain;
  c.title = info.explain + ' ' + t('charts.axes', {unit : info.unit});
  if (points.length < 2) {
    g.fillText(t('charts.verlaufEntsteht'), 45, 110);
    return;
  }
  const value = p => metric === 'population'    ? p.adults || 0
                     : metric === 'replacement' ? p.support_ratio
                     : metric === 'assistance'  ? 100 * (p.support_need ?? 1)
                     : metric === 'species'     ? p.species_count || 0
                                                : (p.average || 0) / 10;
  const first = points[0].step, last = points.at(-1).step, range = Math.max(1, last - first),
        values = points.map(value), max = Math.max(1, ...values.filter(Number.isFinite));
  const x = step => 48 + (step - first) / range * 535, y = v => 175 - v / max * 135;
  g.fillText(info.unit, 48, 16);
  g.fillText(formatNumber(max, metric === 'population' || metric === 'species' ? 0 : 1), 4, 40);
  g.fillText('0', 18, 178);
  g.fillText(first.toLocaleString(t('units.locale')), 48, 198);
  g.textAlign = 'right';
  g.fillText(last.toLocaleString(t('units.locale')), 584, 198);
  g.fillText(t('charts.zeitSchritte'), 584, 217);
  g.textAlign = 'left';
  g.strokeStyle = '#38515c';
  g.beginPath();
  g.moveTo(48, 30);
  g.lineTo(48, 175);
  g.lineTo(584, 175);
  g.stroke();
  const line = (data, color, name) => {
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    let connected = false;
    data.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        connected = false;
        return;
      }
      const px = x(points[i].step), py = y(v);
      connected ? g.lineTo(px, py) : g.moveTo(px, py);
      connected = true;
      chartsState.chartPoints.push({
        x : px,
        y : py,
        label : t('charts.point', {
          name,
          value : formatNumber(v, 2),
          unit : info.unit,
          step : formatNumber(points[i].step)
        })
      });
    });
    g.stroke();
  };
  line(values, info.color, info.name);
  if (metric === 'population')
    line(points.map(p => p.natural_adults || 0), '#e9c185', t('charts.natuerlichGeboren'));
  for (const e of journal().events) {
    if (e.step < first || e.step > last)
      continue;
    const px = x(e.step);
    g.fillStyle = eventKind(e).color;
    g.beginPath();
    g.arc(px, 181, 3, 0, Math.PI * 2);
    g.fill();
    cockpitState.chartMarkers.push({x : px, event : e});
  }
}

function overviewPlots(data) {
  const {points, earlier, later} = overviewWindow(data);
  el('trend-earlier').disabled = !earlier;
  el('trend-later').disabled = !later;
  text('trend-range',
       points.length
           ? t('charts.stepRange',
               {from : formatNumber(points[0].step), to : formatNumber(points.at(-1).step)})
           : '');
  for (const [id, key, color,
              percent] of [[ 'replacement-trend', 'support_ratio', '#a2d9c6', false ],
                           [ 'assistance-trend', 'support_need', '#b6a5df', true ]]) {
    const canvas = el(id), g = chartContext(canvas, () => overviewPlots(data)),
          w = chartSize(canvas).width, h = chartSize(canvas).height,
          values = points.map(p => Number.isFinite(p[key]) ? p[key] * (percent ? 100 : 1) : null),
          max = percent ? 100 : Math.max(2, ...values.filter(Number.isFinite)),
          first = points[0]?.step || 0, last = points.at(-1)?.step || first;
    const x = step => 24 + (step - first) / Math.max(1, last - first) * (w - 32),
          y = v => h - 24 - v / max * (h - 39);
    g.clearRect(0, 0, w, h);
    g.font = '11px system-ui';
    g.fillStyle = '#78949e';
    g.strokeStyle = '#2d424b';
    g.lineWidth = 1;
    for (const v of percent ? [ 0, 50, 100 ] : [ 0, 1 ]) {
      g.beginPath();
      g.moveTo(24, y(v));
      g.lineTo(w - 8, y(v));
      g.stroke();
      g.fillText(String(v), 0, y(v) + 4);
    }
    g.fillText(percent ? '%' : t('charts.schlupfeVerlust'), 24, 11);
    g.textAlign = 'right';
    g.fillText(t('charts.schritte'), w - 8, h - 4);
    g.textAlign = 'left';
    if (!percent) {
      g.strokeStyle = '#a2d9c666';
      g.setLineDash([ 4, 4 ]);
      g.beginPath();
      g.moveTo(24, y(1));
      g.lineTo(w - 8, y(1));
      g.stroke();
      g.setLineDash([]);
    }
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.beginPath();
    let connected = false;
    values.forEach((v, i) => {
      if (v === null) {
        connected = false;
        return;
      }
      connected ? g.lineTo(x(points[i].step), y(v)) : g.moveTo(x(points[i].step), y(v));
      connected = true;
    });
    g.stroke();
    canvas.plotPoints =
        points
            .map((p, i) =>
                     values[i] === null ? null : {x : x(p.step), value : values[i], step : p.step})
            .filter(Boolean);
    canvas.onpointermove = e => {
      const rect = canvas.getBoundingClientRect(), px = (e.clientX - rect.left) / rect.width * w;
      const point = canvas.plotPoints.reduce(
          (best, p) => !best || Math.abs(p.x - px) < Math.abs(best.x - px) ? p : best, null);
      if (point)
        canvas.title = t(percent ? 'charts.helpPoint' : 'charts.replacementPoint',
                         {value : formatNumber(point.value, 2), step : formatNumber(point.step)});
    };
  }
}

export function rates(f) {
  const points =
      (sessionState.historyData?.points || []).filter(p => p.step < f.step && !p.historical);
  let base = points.filter(p => p.step <= f.step - 1000).at(-1) || points[0];
  if (f.historical || !base || f.step === base.step) {
    for (const id of ['birth-rate', 'support-rate', 'death-rate'])
      text(id, '–');
    return;
  }
  const delta = f.step - base.step,
        format = (now, old) =>
            Number.isFinite(old) ? formatNumber(Math.max(0, now - old) * 1000 / delta, 1) : '–';
  text('birth-rate', format(f.births, base.total_births));
  text('support-rate', format(f.rescues + f.imports, (Number.isFinite(base.total_rescues) &&
                                                      Number.isFinite(base.total_imports))
                                                         ? base.total_rescues + base.total_imports
                                                         : undefined));
  text('death-rate', format((f.death_causes?.[0] || 0) + (f.death_causes?.[1] || 0) +
                                (f.death_causes?.[6] || 0) + (f.death_causes?.[7] || 0),
                            base.total_adult_deaths));
}

// Which niches the fish occupy: rows are main foods, columns usual places; a cell shows how
// many observed fish live there (circle) and how many archived profiles keep it (gold diamond).
export function behaviorMap(f) {
  const c = el('behavior-map'), {cells, foods, places} = behaviorNiches(f),
        rows = Math.max(1, foods.length), left = 92, cellH = 26, top = 30;
  setChartHeight(c, top + rows * cellH + 6);
  const g = chartContext(c, () => behaviorMap(f)), size = chartSize(c);
  g.clearRect(0, 0, size.width, size.height);
  updateCockpitState({mapPoints : []});
  const placeNames = tList('behavior_model.placeNames'),
        foodNames = tList('behavior_model.foodNames'), selected = f.selected,
        cellW = (size.width - left) / places;
  g.font = '12px system-ui';
  for (let k = 0; k < places; ++k) {
    const x = left + (k + .5) * cellW;
    if (k < NICHE_OPEN_WATER)
      paintEcologyIcon(g, NICHE_PLACE_ICONS[k], x, 14, '#9bb1b6', 1);
    else {
      // Open water: two waves.
      g.strokeStyle = '#9bb1b6';
      g.lineWidth = 1.5;
      g.beginPath();
      for (const dy of [-3, 3]) {
        g.moveTo(x - 8, 14 + dy);
        g.bezierCurveTo(x - 4, 10 + dy, x, 18 + dy, x + 8, 14 + dy);
      }
      g.stroke();
    }
  }
  foods.forEach((food, row) => {
    const y = top + row * cellH + cellH / 2;
    g.fillStyle = '#29454d';
    g.fillRect(0, y + cellH / 2 - 1, size.width, 1);
    if (food >= 0)
      paintEcologyIcon(g, food, 10, y, FOOD_COLORS[food], .8);
    g.fillStyle = '#c9dcdb';
    g.fillText(food >= 0 ? foodNames[food] : t('charts.nochOhneNahrung'), 24, y + 4);
    for (let k = 0; k < places; ++k) {
      const cell = cells.get(food + ':' + k);
      if (!cell)
        continue;
      const x = left + (k + .5) * cellW, n = cell.fish.length,
            chosen = cell.fish.includes(selected);
      if (n) {
        g.fillStyle = chosen ? '#fff3d5' : '#a2d9c6';
        g.globalAlpha = .85;
        g.beginPath();
        g.arc(x - 10, y, Math.min(11, 4 + 2.2 * Math.sqrt(n)), 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = '#10232a';
        g.textAlign = 'center';
        g.fillText(String(n), x - 10, y + 4);
        g.textAlign = 'left';
      }
      if (cell.archive) {
        g.strokeStyle = '#e9c185';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(x + 9, y - 6);
        g.lineTo(x + 15, y);
        g.lineTo(x + 9, y + 6);
        g.lineTo(x + 3, y);
        g.closePath();
        g.stroke();
        if (cell.archive > 1) {
          g.fillStyle = '#e9c185';
          g.fillText(String(cell.archive), x + 17, y + 4);
        }
      }
      const fish = cell.fish[(cell.fish.indexOf(selected) + 1) % Math.max(1, n)];
      cockpitState.mapPoints.push({
        x : x,
        y,
        fish,
        label : t('charts.nicheLabel', {
          food : food >= 0 ? foodNames[food] : t('charts.nochOhneNahrung'),
          place : placeNames[k],
          fish : n,
          archive : cell.archive
        })
      });
    }
  });
  const occupied = [...cells.values() ].filter(cell => cell.fish.length).length,
        kept = [...cells.values() ].filter(cell => cell.archive).length;
  text('archive-count', t('charts.nicheCount', {n : occupied, kept}));
}

const initializers = {
  "curveInfo" : () => {
    curveInfo = {
      population : {
        name : t('charts.fische'),
        unit : t('charts.fische'),
        color : '#a2d9c6',
        explain : t('charts.alleGeschluepftenLebendenFische')
      },
      replacement : {
        name : t('charts.nachwuchsJeVerlust2'),
        unit : t('charts.schlupfeVerlust'),
        color : '#e9c185',
        explain : t('charts.schlupfeAbDerDritten')
      },
      assistance : {
        name : t('charts.globaleAuffuellhilfe'),
        unit : '%',
        color : '#b6a5df',
        explain : t('charts.fehlenderAnteilBisZum')
      },
      species : {
        name : t('charts.spezies'),
        unit : t('charts.spezies'),
        color : '#80c6db',
        explain : t('charts.genetischeGruppenMitMindestens')
      },
      nutrition : {
        name : t('charts.nahrungsertrag'),
        unit : t('charts.energie100Schritte'),
        color : '#e9c185',
        explain : t('charts.aufgenommeneEnergieJe100')
      }
    };
  },
  "chartPoints" : () => { chartsState.chartPoints = []; },
  "overviewPage" : () => { chartsState.overviewPage = null; },
  "trend_paging" : () => {
    el('trend-earlier').onclick = () => pageOverview(-1);
    el('trend-later').onclick = () => pageOverview(1);
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
