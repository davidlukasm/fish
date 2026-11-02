import {PALETTE} from './palette.js';
import {tracePath} from './path_data.js';
import {PERCENT} from './units.js';
import {DEATH_REASON, RATE_WINDOW} from './schema.js';
import {displayRate} from './nutrition_model.js';
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

// Main chart layout in pixels: the plot from LEFT to RIGHT and TOP to BOTTOM (values rise HEIGHT),
// event markers MARKER_Y below the axis.
const CHART = Object.freeze({
  marker_hit : 9,
  marker_hit_x : 8,
  point_hit : 22,
  empty_x : 45,
  empty_y : 110,
  left : 48,
  width : 535,
  bottom : 175,
  height : 135,
  unit_y : 16,
  max_x : 4,
  max_y : 40,
  zero_x : 18,
  zero_y : 178,
  step_y : 198,
  right : 584,
  axis_y : 217,
  top : 30,
  line_width : 2,
  digits : 2,
  marker_y : 181,
  marker_r : 3,
  text : PALETTE.muted,
  fish : PALETTE.mint,
  natural : PALETTE.gold,
  axis : '#38515c'
});
// The event marker, chart point and niche cell under a chart position, or nothing.
export function chartMarkerAt(x, y) {
  return cockpitState.chartMarkers.find(p => Math.abs(p.x - x) < CHART.marker_hit_x &&
                                             Math.abs(y - CHART.marker_y) <= CHART.marker_hit);
}
export function chartPointAt(x, y) {
  const best = chartsState.chartPoints.reduce((best, p) => {
    const distance = Math.hypot(p.x - x, p.y - y);
    return !best || distance < best.distance ? {p, distance} : best;
  }, null);
  return best && best.distance < CHART.point_hit ? best.p : null;
}
export function nichePointAt(x, y) {
  return cockpitState.mapPoints.find(p => Math.hypot(p.x - x, p.y - y) <= NICHE_MAP.max_dot + 1);
}
export function chart(data) {
  const c = el('chart'), g = chartContext(c, () => chart(data)), points = recentChartPoints(data),
        metric = el('chart-metric').value || 'population',
        info = curveInfo[metric] || curveInfo.population;
  g.clearRect(0, 0, chartSize(c).width, chartSize(c).height);
  g.font = '12px system-ui';
  g.fillStyle = CHART.text;
  updateCockpitState({chartMarkers : []});
  chartsState.chartPoints = [];
  overviewPlots(data);
  const names =
      metric === 'population'
          ? [ [ t('charts.fische'), CHART.fish ], [ t('charts.natuerlichGeboren'), CHART.natural ] ]
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
    g.fillText(t('charts.verlaufEntsteht'), CHART.empty_x, CHART.empty_y);
    return;
  }
  const value = p => metric === 'population'    ? p.adults || 0
                     : metric === 'replacement' ? p.support_ratio
                     : metric === 'assistance'  ? PERCENT * (p.support_need ?? 1)
                     : metric === 'species'     ? p.species_count || 0
                                                : displayRate(p.average || 0);
  const first = points[0].step, last = points.at(-1).step, range = Math.max(1, last - first),
        values = points.map(value), max = Math.max(1, ...values.filter(Number.isFinite));
  const x = step => CHART.left + (step - first) / range * CHART.width,
        y = v => CHART.bottom - v / max * CHART.height;
  g.fillText(info.unit, CHART.left, CHART.unit_y);
  g.fillText(formatNumber(max, metric === 'population' || metric === 'species' ? 0 : 1),
             CHART.max_x, CHART.max_y);
  g.fillText(formatNumber(0), CHART.zero_x, CHART.zero_y);
  g.fillText(first.toLocaleString(t('units.locale')), CHART.left, CHART.step_y);
  g.textAlign = 'right';
  g.fillText(last.toLocaleString(t('units.locale')), CHART.right, CHART.step_y);
  g.fillText(t('charts.zeitSchritte'), CHART.right, CHART.axis_y);
  g.textAlign = 'left';
  g.strokeStyle = CHART.axis;
  g.beginPath();
  g.moveTo(CHART.left, CHART.top);
  g.lineTo(CHART.left, CHART.bottom);
  g.lineTo(CHART.right, CHART.bottom);
  g.stroke();
  const line = (data, color, name) => {
    g.strokeStyle = color;
    g.lineWidth = CHART.line_width;
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
          value : formatNumber(v, CHART.digits),
          unit : info.unit,
          step : formatNumber(points[i].step)
        })
      });
    });
    g.stroke();
  };
  line(values, info.color, info.name);
  if (metric === 'population')
    line(points.map(p => p.natural_adults || 0), CHART.natural, t('charts.natuerlichGeboren'));
  for (const e of journal().events) {
    if (e.step < first || e.step > last)
      continue;
    const px = x(e.step);
    g.fillStyle = eventKind(e).color;
    g.beginPath();
    g.arc(px, CHART.marker_y, CHART.marker_r, 0, Math.PI * 2);
    g.fill();
    cockpitState.chartMarkers.push({x : px, event : e});
  }
}

// The two overview trends, in pixels inside their canvases: plot margins, label offsets and
// colours; replacement trends span at least MIN_MAX.
const OVERVIEW = Object.freeze({
  left : 24,
  right : 8,
  top : 15,
  bottom : 24,
  label_dy : 4,
  unit_y : 11,
  min_max : 2,
  dash : [ 4, 4 ],
  line_width : 2.5,
  digits : 2,
  text : '#78949e',
  grid : PALETTE.line,
  balance : '#a2d9c666',
  replacement : PALETTE.mint,
  assistance : PALETTE.lilac
});
function overviewPlots(data) {
  const {points, earlier, later} = overviewWindow(data);
  el('trend-earlier').disabled = !earlier;
  el('trend-later').disabled = !later;
  text('trend-range',
       points.length
           ? t('charts.stepRange',
               {from : formatNumber(points[0].step), to : formatNumber(points.at(-1).step)})
           : '');
  const O = OVERVIEW;
  for (const [id, key, color,
              percent] of [[ 'replacement-trend', 'support_ratio', O.replacement, false ],
                           [ 'assistance-trend', 'support_need', O.assistance, true ]]) {
    const canvas = el(id), g = chartContext(canvas, () => overviewPlots(data)),
          w = chartSize(canvas).width, h = chartSize(canvas).height,
          values =
              points.map(p => Number.isFinite(p[key]) ? p[key] * (percent ? PERCENT : 1) : null),
          max = percent ? PERCENT : Math.max(O.min_max, ...values.filter(Number.isFinite)),
          first = points[0]?.step || 0, last = points.at(-1)?.step || first;
    const x = step => O.left + (step - first) / Math.max(1, last - first) * (w - O.left - O.right),
          y = v => h - O.bottom - v / max * (h - O.bottom - O.top);
    g.clearRect(0, 0, w, h);
    g.font = '11px system-ui';
    g.fillStyle = O.text;
    g.strokeStyle = O.grid;
    g.lineWidth = 1;
    for (const v of percent ? [ 0, PERCENT / 2, PERCENT ] : [ 0, 1 ]) {
      g.beginPath();
      g.moveTo(O.left, y(v));
      g.lineTo(w - O.right, y(v));
      g.stroke();
      g.fillText(formatNumber(v), 0, y(v) + O.label_dy);
    }
    g.fillText(percent ? t('charts.prozent') : t('charts.schlupfeVerlust'), O.left, O.unit_y);
    g.textAlign = 'right';
    g.fillText(t('charts.schritte'), w - O.right, h - O.label_dy);
    g.textAlign = 'left';
    if (!percent) {
      // Replacement 1: each loss is made good.
      g.strokeStyle = O.balance;
      g.setLineDash(O.dash);
      g.beginPath();
      g.moveTo(O.left, y(1));
      g.lineTo(w - O.right, y(1));
      g.stroke();
      g.setLineDash([]);
    }
    g.strokeStyle = color;
    g.lineWidth = O.line_width;
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
        canvas.title =
            t(percent ? 'charts.helpPoint' : 'charts.replacementPoint',
              {value : formatNumber(point.value, O.digits), step : formatNumber(point.step)});
    };
  }
}

// Deaths of hatched fish, as the history counts them.
const ADULT_DEATHS =
    [ DEATH_REASON.hunger, DEATH_REASON.injury, DEATH_REASON.age, DEATH_REASON.disease ];
export function rates(f) {
  const points =
      (sessionState.historyData?.points || []).filter(p => p.step < f.step && !p.historical);
  let base = points.filter(p => p.step <= f.step - RATE_WINDOW.steps).at(-1) || points[0];
  if (f.historical || !base || f.step === base.step) {
    for (const id of ['birth-rate', 'support-rate', 'death-rate'])
      text(id, '–');
    return;
  }
  const delta = f.step - base.step,
        format = (now, old) =>
            Number.isFinite(old)
                ? formatNumber(Math.max(0, now - old) * RATE_WINDOW.steps / delta, 1)
                : '–';
  text('birth-rate', format(f.births, base.total_births));
  text('support-rate', format(f.rescues + f.imports, (Number.isFinite(base.total_rescues) &&
                                                      Number.isFinite(base.total_imports))
                                                         ? base.total_rescues + base.total_imports
                                                         : undefined));
  text('death-rate',
       format(ADULT_DEATHS.reduce((n, cause) => n + (f.death_causes?.[cause] || 0), 0),
              base.total_adult_deaths));
}

// Which niches the fish occupy: rows are main foods, columns usual places; a cell shows how
// many observed fish live there (circle) and how many archived profiles keep it (gold diamond).
// Niche map in pixels: food rows ROW high below TOP, place columns from LEFT; fish as dots growing
// by DOT_GROWTH per root count, archived profiles as diamonds.
const NICHE_MAP = Object.freeze({
  left : 92,
  row : 26,
  top : 30,
  pad : 6,
  icon_y : 14,
  wave_width : 1.5,
  wave : 3,
  wave_path : 'M-8 0C-4 -4 0 4 8 0',
  food_x : 10,
  food_icon : .8,
  name_x : 24,
  text_dy : 4,
  dot_alpha : .85,
  dot_dx : 10,
  max_dot : 11,
  min_dot : 4,
  dot_growth : 2.2,
  mark_width : 1.6,
  mark_x : 9,
  mark : 6,
  mark_tip : 15,
  mark_back : 3,
  count_x : 17,
  place : PALETTE.muted,
  rule : '#29454d',
  name : '#c9dcdb',
  chosen : '#fff3d5',
  fish : PALETTE.mint,
  count : '#10232a',
  archive : PALETTE.gold
});
export function behaviorMap(f) {
  const c = el('behavior-map'), {cells, foods, places} = behaviorNiches(f),
        rows = Math.max(1, foods.length), left = NICHE_MAP.left, cellH = NICHE_MAP.row,
        top = NICHE_MAP.top;
  setChartHeight(c, top + rows * cellH + NICHE_MAP.pad);
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
      paintEcologyIcon(g, NICHE_PLACE_ICONS[k], x, NICHE_MAP.icon_y, NICHE_MAP.place, 1);
    else {
      // Open water: two waves.
      g.strokeStyle = NICHE_MAP.place;
      g.lineWidth = NICHE_MAP.wave_width;
      for (const dy of [-NICHE_MAP.wave, NICHE_MAP.wave]) {
        g.save();
        g.translate(x, NICHE_MAP.icon_y + dy);
        g.beginPath();
        tracePath(g, NICHE_MAP.wave_path);
        g.stroke();
        g.restore();
      }
    }
  }
  foods.forEach((food, row) => {
    const y = top + row * cellH + cellH / 2;
    g.fillStyle = NICHE_MAP.rule;
    g.fillRect(0, y + cellH / 2 - 1, size.width, 1);
    if (food >= 0)
      paintEcologyIcon(g, food, NICHE_MAP.food_x, y, FOOD_COLORS[food], NICHE_MAP.food_icon);
    g.fillStyle = NICHE_MAP.name;
    g.fillText(food >= 0 ? foodNames[food] : t('charts.nochOhneNahrung'), NICHE_MAP.name_x,
               y + NICHE_MAP.text_dy);
    for (let k = 0; k < places; ++k) {
      const cell = cells.get(food + ':' + k);
      if (!cell)
        continue;
      const x = left + (k + .5) * cellW, n = cell.fish.length,
            chosen = cell.fish.includes(selected);
      if (n) {
        g.fillStyle = chosen ? NICHE_MAP.chosen : NICHE_MAP.fish;
        g.globalAlpha = NICHE_MAP.dot_alpha;
        g.beginPath();
        g.arc(x - NICHE_MAP.dot_dx, y,
              Math.min(NICHE_MAP.max_dot, NICHE_MAP.min_dot + NICHE_MAP.dot_growth * Math.sqrt(n)),
              0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = NICHE_MAP.count;
        g.textAlign = 'center';
        g.fillText(String(n), x - NICHE_MAP.dot_dx, y + NICHE_MAP.text_dy);
        g.textAlign = 'left';
      }
      if (cell.archive) {
        g.strokeStyle = NICHE_MAP.archive;
        g.lineWidth = NICHE_MAP.mark_width;
        g.beginPath();
        g.moveTo(x + NICHE_MAP.mark_x, y - NICHE_MAP.mark);
        g.lineTo(x + NICHE_MAP.mark_tip, y);
        g.lineTo(x + NICHE_MAP.mark_x, y + NICHE_MAP.mark);
        g.lineTo(x + NICHE_MAP.mark_back, y);
        g.closePath();
        g.stroke();
        if (cell.archive > 1) {
          g.fillStyle = NICHE_MAP.archive;
          g.fillText(String(cell.archive), x + NICHE_MAP.count_x, y + NICHE_MAP.text_dy);
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
        color : PALETTE.mint,
        explain : t('charts.alleGeschluepftenLebendenFische')
      },
      replacement : {
        name : t('charts.nachwuchsJeVerlust2'),
        unit : t('charts.schlupfeVerlust'),
        color : PALETTE.gold,
        explain : t('charts.schlupfeAbDerDritten')
      },
      assistance : {
        name : t('charts.globaleAuffuellhilfe'),
        unit : t('charts.prozent'),
        color : PALETTE.lilac,
        explain : t('charts.fehlenderAnteilBisZum')
      },
      species : {
        name : t('charts.spezies'),
        unit : t('charts.spezies'),
        color : PALETTE.blue,
        explain : t('charts.genetischeGruppenMitMindestens')
      },
      nutrition : {
        name : t('charts.nahrungsertrag'),
        unit : t('charts.energyRate'),
        color : PALETTE.gold,
        explain : t('charts.intakeRateHelp')
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
