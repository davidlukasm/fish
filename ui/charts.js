import {eventKind} from './event_model.js';
import {formatNumber, t} from './strings.js';
import {chartContext, chartSize} from './dom.js';
import {updateCockpitState} from './cockpit.js';
import {cockpitState} from './cockpit.js';
import {journal} from './journal_model.js';
import {el, text} from './dom.js';
import {featureNames} from './evolution.js';
import {BEHAVIOR_SCALE} from './schema.js';
import {sessionState} from './session.js';
import {frameSpecies, sceneState} from './state.js';
export const chartsState = {};
export let curveInfo;

function recentChartPoints(data, until = Infinity) {
  const points = (data.points || []).filter(p => !p.historical && p.step <= until),
        last = points.at(-1)?.step ?? 0;
  return points.filter(p => p.step >= last - 20000);
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
  const c = el('chart'), g = chartContext(c, () => chart(data)),
        points = recentChartPoints(data,
                                   sceneState.frame?.historical ? sceneState.frame.step : Infinity),
        metric = el('chart-metric').value || 'population',
        info = curveInfo[metric] || curveInfo.population;
  g.clearRect(0, 0, chartSize(c).width, chartSize(c).height);
  g.font = '12px system-ui';
  g.fillStyle = '#9bb1b6';
  updateCockpitState({chartMarkers : []});
  chartsState.chartPoints = [];
  overviewPlots(points);
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

function overviewPlots(points) {
  for (const [id, key, color,
              percent] of [[ 'replacement-trend', 'support_ratio', '#a2d9c6', false ],
                           [ 'assistance-trend', 'support_need', '#b6a5df', true ]]) {
    const canvas = el(id), g = chartContext(canvas, () => overviewPlots(points)),
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

export function behaviorMap(f) {
  const c = el('behavior-map'), g = chartContext(c, () => behaviorMap(f));
  g.clearRect(0, 0, chartSize(c).width, chartSize(c).height);
  g.font = '21px system-ui';
  g.fillStyle = '#9bb1b6';
  const ax = 0;
  g.fillText(t('charts.natuerlicheNahrung'), 0, 20);
  g.fillText('0', 28, 190);
  g.fillText('100 %', 0, 53);
  g.textAlign = 'right';
  g.fillText(t('charts.schwimmgeschwindigkeit'), 592, 227);
  g.textAlign = 'left';
  g.strokeStyle = '#38515c';
  g.strokeRect(60, 35, 510, 155);
  updateCockpitState({mapPoints : []});
  const speedMax = Math.max(.02, ...(f.behavior || []).map(p => p.descriptor?.[0] || 0)) * 1.1;
  const natural =
      d => [7, 8, 9, 20, 21, 26, 27, 28, 29, 30].reduce((sum, i) => sum + (d[i] || 0), 0);
  const pos = d => [60 + Math.max(0, Math.min(1, d[ax] / speedMax)) * 510,
                    190 - Math.max(0, Math.min(1, natural(d))) * 155];
  const archive = (f.archive || []).filter(a => a.environment === f.environment);
  for (const a of archive) {
    if (!a.descriptor)
      continue;
    const [x, y] = pos(a.descriptor);
    g.strokeStyle = '#e9c185';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y - 6);
    g.lineTo(x + 6, y);
    g.lineTo(x, y + 6);
    g.lineTo(x - 6, y);
    g.closePath();
    g.stroke();
    cockpitState.mapPoints.push({
      x,
      y,
      label : t('charts.archivePoint', {
        n : a.id + 1,
        feature : featureNames[ax],
        speed : formatNumber(a.descriptor[ax] * BEHAVIOR_SCALE.speed, 2, true),
        natural : Math.round(100 * natural(a.descriptor))
      })
    });
  }
  for (const p of f.behavior || []) {
    const [x, y] = pos(p.descriptor);
    const species = frameSpecies(f, p.species);
    cockpitState.mapPoints.push({
      x,
      y,
      fish : p.id,
      label : t('charts.fishPoint', {
        id : p.id,
        species : species?.name || '',
        feature : featureNames[ax],
        speed : formatNumber(p.descriptor[ax] * BEHAVIOR_SCALE.speed, 2, true),
        natural : Math.round(100 * natural(p.descriptor))
      })
    });
    g.globalAlpha = p.samples >= 80 ? .8 : .25;
    g.fillStyle = p.id === f.selected ? '#fff3d5' : '#a2d9c6';
    g.beginPath();
    g.arc(x, y, p.id === f.selected ? 6 : 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  text('archive-count', archive.length === 1 ? t('charts.oneBlueprint')
                                             : t('charts.blueprints', {n : archive.length}));
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
  "chartPoints" : () => { chartsState.chartPoints = []; }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
