import {drawScentWheel} from './organ_graphics.js';
import {FISH, PLANT, CORPSE} from './schema.js';
import {updateSceneState} from './state.js';
import {brainSelectedTissue, brainState} from './brain.js';
import {brainHit} from './brain_input.js';
import {
  brainConnectivity,
  brainMotorColors,
  brainSenseColors,
  cellColor,
  cellParts,
  neuronName,
  partShare
} from './brain_model.js';
import {camera, cameraState, canvasPoint, screenToWorld} from './camera.js';
import {updateCockpit} from './cockpit.js';
import {canvas, el, rgb, text} from './dom.js';
import {evolutionState, setView} from './evolution.js';
import {fishRenderRadius} from './fish_fins.js';
import {fishBodyContains} from './fish_forms.js';
import {corpseFish} from './fish_painter.js';
import {brainOrganReadout} from './organ_readout.js';
import {
  algaeDisplay,
  bedScale,
  grassWakeCurve,
  plantCurvePoint,
  plantRibbon,
  plantFoot,
  animalFoot,
  plantRenderParts
} from './plant_geometry.js';
import {showSelection} from './selection.js';
import {
  blendFish,
  blendParticle,
  blendSmallAnimal,
  frameBlend,
  frameFish,
  frameCorpse,
  frameSpecies,
  horizontalDelta,
  sceneState
} from './state.js';
import {foodColor, tankState} from './tank.js';
import {grassPartPose, grassHitBounds} from './vegetation.js';
import {foodDisplayRadius} from './particle_renderer.js';
export const hoverState = {};
export let tankTooltipRows;

export let tankFormat;

export function tankPanelFrame(f) {
  const id = sceneState.tankPreviewFish;
  if (!id || id === f.selected || brainState.brainOpen || evolutionState.editing ||
      evolutionState.activeView !== 'fish')
    return f;
  const p = frameFish(f, id);
  if (!p && !frameCorpse(f, id))
    return f;
  return {
    ...f,
    selected : id,
    selected_death : null,
    selected_body : null,
    selected_genome_available : true,
    brain : p ? {neuron_count : p[38], edge_count : p[39], planning : false} : null
  };
}

export function tankHideTooltip() {
  hoverState.menuHit = null;
  el('tank-tooltip').hidden = true;
  hoverState.tankHoverKey = '';
  hoverState.tankHoverSince = 0;
}

export function tankTooltipPosition(pointer, size, bounds, object = {
  left : pointer.x - 5,
  right : pointer.x + 5,
  top : pointer.y - 5,
  bottom : pointer.y + 5
}) {
  const gap = 12, w = Math.min(size.width, bounds.right - bounds.left - 16), h = size.height,
        candidates = [
          [ Math.max(pointer.x + 18, object.right + gap), pointer.y - h / 2 ],
          [ Math.min(pointer.x - w - 18, object.left - w - gap), pointer.y - h / 2 ],
          [ pointer.x - w / 2, Math.max(pointer.y + 18, object.bottom + gap) ],
          [ pointer.x - w / 2, Math.min(pointer.y - h - 18, object.top - h - gap) ]
        ];
  return candidates
      .map(([ left, top ]) => {
        const x = Math.max(bounds.left + 8, Math.min(left, bounds.right - w - 8)),
              y = Math.max(bounds.top + 8, Math.min(top, bounds.bottom - h - 8)),
              overlap =
                  Math.max(0, Math.min(x + w, object.right + 5) - Math.max(x, object.left - 5)) *
                  Math.max(0, Math.min(y + h, object.bottom + 5) - Math.max(y, object.top - 5)),
              coversPointer = pointer.x >= x - 8 && pointer.x <= x + w + 8 && pointer.y >= y - 8 &&
                              pointer.y <= y + h + 8;
        return {
          x,
          y,
          score : overlap * 8 + (coversPointer ? 1e7 : 0) + Math.hypot(x - left, y - top) * 3 +
                      Math.hypot(x + w / 2 - pointer.x, y + h / 2 - pointer.y)
        };
      })
      .sort((a, b) => a.score - b.score)[0];
}

export function tankShowTooltip(info, hit) {
  const tip = el('tank-tooltip');
  if (!info) {
    tip.hidden = true;
    return;
  }
  text('tank-tooltip-title', info.title);
  text('tank-tooltip-subtitle', info.subtitle || '');
  text('tank-tooltip-state', info.state || '');
  el('tank-tooltip-state').hidden = !info.state;
  const icon = el('tank-tooltip-icon');
  icon.className = 'tank-object-' + info.kind;
  icon.style.background = info.color;
  tip.style.setProperty?.('--object-color', info.color);
  tankTooltipRows.forEach((row, i) => {
    const metric = info.metrics[i];
    row.box.hidden = !metric;
    if (metric) {
      if (row.label.textContent !== metric[0])
        row.label.textContent = metric[0];
      if (String(row.value.textContent) !== String(metric[1]))
        row.value.textContent = metric[1];
    }
  });
  const meter = el('tank-tooltip-fill');
  meter.parentElement.hidden = !Number.isFinite(info.fill);
  meter.style.width = 100 * Math.max(0, Math.min(1, info.fill || 0)) + '%';
  const rect = canvas.getBoundingClientRect(), bounds = {
    left : Math.max(0, rect.left),
    top : Math.max(0, rect.top),
    right : Math.min(window.innerWidth || rect.right || rect.left + rect.width,
                     rect.right || rect.left + rect.width),
    bottom : Math.min(window.innerHeight || rect.bottom || rect.top + rect.height,
                      rect.bottom || rect.top + rect.height)
  };
  tip.style.width = '244px';
  tip.style.maxWidth = Math.max(120, Math.min(260, bounds.right - bounds.left - 16)) + 'px';
  tip.hidden = false;
  const scents = el('tank-tooltip-scents');
  scents.hidden = !info.odors;
  if (info.odors)
    drawScentWheel(scents, info.odors);
  const size = tip.getBoundingClientRect(),
        radius = Math.min(35, (hit.radius || 4) * camera().scale * rect.width /
                                  cameraState.viewportWidth),
        object = {
          left : hoverState.tankPointer.x - radius,
          right : hoverState.tankPointer.x + radius,
          top : hoverState.tankPointer.y - radius,
          bottom : hoverState.tankPointer.y + radius
        },
        position = hoverState.persistent
                       ? {
                           x : Math.max(bounds.left + 8, bounds.right - size.width - 12),
                           y : Math.max(bounds.top + 8, bounds.bottom - size.height - 58)
                         }
                       : tankTooltipPosition(hoverState.tankPointer, size, bounds, object);
  tip.style.left = position.x + 'px';
  tip.style.top = position.y + 'px';
}

export function tankObjectInfo(hit) {
  const info = objectInfo(hit);
  if (info && hit.kind !== 'brain')
    info.odors = tankOdors(hit, sceneState.frame);
  return info;
}

export function tankOdors(point, f = sceneState.frame) {
  const g = f?.odors;
  if (!g?.columns || !g.rows || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return Array(8).fill(0);
  const x = Math.floor(((point.x % f.width + f.width) % f.width) / f.width * g.columns),
        y = Math.max(0, Math.min(g.rows - 1, Math.floor(point.y / f.height * g.rows)));
  return g.cells?.[y * g.columns + x] || Array(8).fill(0);
}

function objectInfo(hit) {
  const p = hit.item, params = sceneState.frame.parameters || {},
        energy = () => tankFormat(p[2], 1) + ' Energie', age = v => tankFormat(v) + ' Schritte',
        metric = (label, value) => [label, value];
  if (hit.kind === 'brain') {
    const d = brainState.brainDrawing, n = hit.cell.id !== undefined && d.nodes.get(hit.cell.id),
          tissue = brainSelectedTissue(d, hit.cell), organ = brainOrganReadout(d, tissue);
    if (n) {
      const rec = d.receptors.get(n[5]), share = partShare(n, hit.cell.part),
            mix = cellParts(n).length > 1, wiring = brainConnectivity(d.b).get(n[5]) || [ 0, 0 ];
      return {kind:'cell',color:cellColor(n),title:neuronName(n,hit.cell.part)+' · #'+n[5],subtitle:mix?Math.round(share*100)+' % · Mischzelle':organ.title,metrics:hit.cell.part==='s0'&&d.b.visual_samples?.some(s=>s[0]===n[5])?(()=>{const sample=d.b.visual_samples.find(s=>s[0]===n[5]);return [metric('Lichtreiz',tankFormat(sample[1],5)),metric('Reizschwelle',tankFormat(rec[13],5)),metric('Rezeptorantwort',Math.round(100*sample[3])+' %'),metric('Synapsen hinein / hinaus',wiring[0]+' / '+wiring[1])];})():[metric('Aktivität',tankFormat(n[3],2)),metric(rec?'Reizschwelle':'Zeitkonstante',rec?tankFormat(rec[13],3):Math.round(n[16]||0)+' Schritte'),metric('Eingehend',wiring[0]),metric('Ausgehend',wiring[1])],fill:Math.abs(n[3]),state:wiring[0]+wiring[1]===0?'Ohne Synapsen · Bias '+tankFormat(n[15],2)+' · Klick reizt':'Klick reizt'};
    }
    return {
      kind : 'organ',
      color : tissue.key[0] === 's'       ? brainSenseColors[Number(tissue.key.slice(1))]
              : tissue.key === 'internal' ? '#a7b6d5'
                                          : brainMotorColors[Number(tissue.key.slice(1))],
      title : organ.title,
      subtitle : organ.caption,
      metrics : [
        metric('', organ.hero), ...organ.metrics.slice(0, 1).map(m => metric(m.label, m.value))
      ],
      fill : organ.activity,
      state : 'Klick reizt'
    };
  }
  if (hit.kind === 'rock')
    return {
      kind : 'rock',
      color : '#8b9997',
      title : hit.shape?.length === 4 ? 'Plattform / Stein' : 'Felsen',
      metrics : [
        metric('Breite', tankFormat(hit.bounds.width, 1) + ' px'),
        metric('Höhe', tankFormat(hit.bounds.height, 1) + ' px'),
        metric('Licht',
               Math.round(100 * displayPhysicalLight(sceneState.frame, hit.x, hit.y)) + ' %')
      ]
    };
  if (hit.kind === 'water')
    return {
      kind : 'water',
      color : '#6aada0',
      title : 'Wasser',
      odors : hit.odors,
      metrics : [
        metric('Plankton', tankFormat(hit.plankton, 4) + ' Energie/Zelle'),
        metric('Dichte', tankFormat(hit.planktonDensity * 1000, 3) + ' Energie/1.000 px²'),
        metric('Schwebsediment', tankFormat(hit.density, 2)),
        metric('Licht',
               Math.round(100 * displayPhysicalLight(sceneState.frame, hit.x, hit.y)) + ' %')
      ],
      fill : hit.planktonDensity / (params.plankton_max_density || .01)
    };
  if ([ 'plant', 'algae', 'sediment' ].includes(hit.kind)) {
    const light = displayPhysicalLight(sceneState.frame, hit.x, hit.y),
          percent = v => Math.round(100 * v) + ' %';
    if (hit.kind === 'plant') {
      const o = hit.organ, type = Math.min(5, Math.floor(6 * (hit.trait ?? 0))), names = [
        'Feines Wiesengras', 'Langes Bandgras', 'Lanzettrosette', 'Feste Rundblattrosette',
        'Paarige Stängelpflanze', 'Wechselblättrige Stängelpflanze'
      ];
      return {
        kind : 'plant',
        color : rgb(o?.color || p[PLANT.color] || [ .2, .6, .2 ]),
        title : names[type],
        subtitle : (p[PLANT.root]?.[2] > 0 ? 'Treibendes Teil' : 'Verwurzelt') + ' · ' +
                       (o?.kind === 0   ? 'Halm'
                        : o?.kind === 1 ? 'Stängel / Knoten'
                                        : 'Blatt'),
        metrics : [
          metric('Biomasse', tankFormat(o?.energy ?? p[8], 1) + ' Energie'),
          metric('Bissfestigkeit', tankFormat(o?.biteHardness ?? 0, 2)),
          metric('Licht', percent(light)), metric('Lebenskraft', percent(o?.vitality ?? 1))
        ],
        fill : o?.vitality ?? 1
      };
    }
    if (hit.kind === 'algae')
      return {
        kind : 'plant',
        color : '#559c43',
        title : 'Algen / Moosbelag',
        subtitle : 'Wächst auf freier, beleuchteter Fläche',
        metrics : [
          metric('Biomasse', tankFormat(p[7], 1) + ' Energie'),
          metric('Dicke', tankFormat(hit.depth, 1) + ' px'), metric('Licht', percent(light)),
          metric('Bissfestigkeit', tankFormat(params.hardness_algae ?? .01, 2))
        ]
      };
    return {
      kind : 'sediment',
      color : '#ab8e61',
      title : 'Sedimentboden',
      subtitle : 'Maus macht die Stelle durchsichtig',
      metrics : [
        metric('Schichtdicke', tankFormat(hit.depth, 1) + ' px'),
        metric('Bodennahrung', tankFormat(p?.[PLANT.detritus], 1) + ' Energie'),
        metric('Würmer', tankFormat(p?.[PLANT.worms], 1) + ' Energie'),
        metric('Licht', percent(light))
      ],
      fill : undefined
    };
  }
  if (hit.kind === 'fish') {
    if (p[FISH.hatched]) {
      const species = frameSpecies(sceneState.frame, p[FISH.species]);
      return {
        kind : 'fish',
        color : rgb(p.slice(FISH.red, FISH.blue + 1)),
        title : 'Fisch #' + p[FISH.id],
        subtitle : species?.name || 'Art #' + p[FISH.species],
        metrics : [
          metric('Reserve', tankFormat(p[FISH.energy], 1) + ' Energie'),
          metric('Alter', age(p[FISH.age])),
          metric('Gesundheit', Math.round(100 * p[FISH.health]) + ' %'),
          metric('Tempo', tankFormat(p[FISH.speed], 2) + ' px/Schritt')
        ],
        fill : p[FISH.health]
      };
    }
    const maternal = frameSpecies(sceneState.frame, p[22] || p[29]);
    return {
      kind : 'egg',
      color : rgb(p.slice(16, 19)),
      title : (p[49] ? 'Nährei #' : 'Ei #') + p[4],
      subtitle : (!p[22] ? 'Von ' : '') + (maternal?.name || 'unbekannter Art'),
      metrics : [
        metric('Dotter', tankFormat(p[5], 1) + ' Energie'), metric('Alter', age(p[6])),
        ...(!p[49] ? [ metric('Entwicklung', Math.round(100 * p[9]) + ' %') ] : [])
      ],
      fill : p[49] ? undefined : p[9],
      state : p[49]   ? 'Nährei'
              : p[31] ? 'Entwickelt sich klonal'
              : p[13] ? 'Befruchtet'
                      : 'Unbefruchtet'
    };
  }
  if (hit.kind === 'invertebrate')
    return {
      kind : 'food',
      color : rgb(p.slice(8, 11)),
      title : p[7] === 9 && p[15] === 1 ? (p[14]>=4?'Panzerbruchstücke':'Leere Schalen')
                                        : ({7 : 'Wurmkopf', 8 : 'Krabbe', 9 : 'Muschel'})[p[7]],
      subtitle : p[7] === 9 && p[15] === 1 ? 'Nach dem Aufbrechen'
                 : p[7] === 9              ? (p[17] ? 'Geschlossen · doppelte Schalenhärte'
                                                    : 'Offen · filtriert Plankton')
                 : p[7] === 8              ? (p[17] < .02 ? 'Eingegraben' : p[15] === 5  ? 'Schwimmt zur nächsten Fläche'
                                              : p[15] >= 4 ? 'Gräbt sich aus'
                                              : p[15] >= 3 ? 'Flieht vor einem Fisch'
                                              : p[15] >= 2 ? 'Gräbt sich ein'
                                                           : 'Läuft und frisst Bodennahrung')
                                           : (p[13] < .25 ? 'Im Bau' : 'Aus dem Sediment hervorgetreten'),
      metrics : [ metric('Energie', energy()), metric(p[7]===7?'Sichtbare Länge':'Größe', tankFormat(p[7]===7?p[13]:2*p[6], 1) + ' px'), ...(p[7]===9&&p[15]!==1?[metric('Plankton / 100 Schritte',tankFormat(100*(p[21]||0),2)),metric('Plankton gesamt',tankFormat(p[25]||0,1))]:[]) ]
    };
  if (hit.kind === 'food') {
    const fresh = p[7] === 0 && Number.isFinite(p[4])
                      ? 2 ** (-p[4] / (params.food_half_life || 2000))
                      : undefined,
          risk = Number.isFinite(fresh) ? (params.disease_food ?? .005) * (1 - fresh) : undefined;
    return {
      kind : 'food',
      color : p.length > 10 ? rgb(p.slice(8, 11)) : foodColor(p[2], params.food_bright || 200),
      title : p[3]>=2**48 ? 'Nahrungsgruppe' : [
        'Futterstück', 'Fleischbrocken', 'Eistück', 'Aasbrocken', 'Algenstück', 'Pflanzenstück',
        'Planktonrest', 'Wurmstück', 'Krabbenstück', 'Muschelstück'
      ][p[7] || 0],
      subtitle : Number.isFinite(fresh) ? Math.round(100 * fresh) + ' % Frische' : '',
      metrics : [
        metric('Nährwert', energy()),
        metric('Durchmesser', tankFormat(2 * p[6], 1) + ' px'),
        metric('Alter', age(p[4])),
        ...(Number.isFinite(risk)
                ? [ metric('Ansteckung / Mahlzeit', tankFormat(100 * risk, 3) + ' %') ]
                : []),
        ...(p[5] > 0 ? [ metric('Ruhezeit', age(p[5])) ] : [])
      ],
      fill : fresh
    };
  }
  if (hit.kind === 'corpse') {
    const remaining =
        Math.max(0, Math.min(1, p[CORPSE.energy] / Math.max(.001, p[CORPSE.initial_energy])));
    return {
      kind : 'corpse',
      color : rgb(p.slice(4, 7)),
      title : p[CORPSE.hatched] ? 'Kadaver' : 'Totes Ei',
      subtitle : Math.round(100 * remaining) + ' % Nährwert',
      metrics : [ metric('Nährwert', energy()), metric('Seit dem Tod', age(p[3])) ],
      fill : remaining
    };
  }
  return {
    kind : 'sperm',
    color : rgb(p.slice(3, 6)),
    title : 'Spermienwolke',
    subtitle : 'Mit der Wasserströmung verteilt',
    metrics : [ metric('Konzentration', tankFormat(p[2], 5) + ' Energie/px²') ],
    fill : p[2] / Math.max(1e-12, params.sperm_opaque ?? .012)
  };
}

export function corpseBodyContains(p, x, y, padding, scale) {
  if (!p[CORPSE.morphology_asset])
    return Math.hypot(horizontalDelta(x - p[0]), y - p[1]) <= p[9] + padding;
  const q = corpseFish(p).slice();
  q[0] = p[0];
  q[1] = p[1];
  q[2] = p[8];
  return fishBodyContains(q, x, y, padding, scale);
}

export let tankHoverProviders;

export function displayPhysicalLight(f, x, y) {
  const l = f.light;
  if (!l?.values?.length)
    return 1;
  const gx = ((x % f.width + f.width) % f.width) / f.width * (l.columns - 1),
        gy = Math.max(0, Math.min(1, y / f.height)) * (l.rows - 1), i = Math.floor(gx),
        j = Math.floor(gy), fx = gx - i, fy = gy - j,
        at = (a, b) => l.values[Math.min(l.rows - 1, b) * l.columns + Math.min(l.columns - 1, a)];
  return ((1 - fy) * ((1 - fx) * at(i, j) + fx * at(i + 1, j)) +
          fy * ((1 - fx) * at(i, j + 1) + fx * at(i + 1, j + 1))) *
         (1 - (1 - l.bottom) * y / f.height);
}

export function tankSedimentHit(world, f = sceneState.frame) {
  for (const p of f.plants || []) {
    const ax = world.x + horizontalDelta(p[1] - world.x), ay = p[2], dx = p[3] - p[1],
          dy = p[4] - p[2], length = Math.max(.01, p[12]),
          t = ((world.x - ax) * dx + (world.y - ay) * dy) / (length * length);
    if (t < 0 || t > 1)
      continue;
    const gap = (world.x - ax) * p[5] + (world.y - ay) * p[6],
          depth = (p[PLANT.sediment_left] ?? 4 * p[11] / length) * (1 - t) +
                  (p[PLANT.sediment_right] ?? 4 * p[11] / length) * t;
    if (depth > 0 && gap >= 0 && gap <= depth)
      return {
        kind : 'sediment',
        item : p,
        key : 'sediment:' + p[0],
        depth,
        radius : 4,
        x : world.x,
        y : world.y
      };
  }
  return null;
}

export function tankVegetationHit(world, scale) {
  let best = null, distance = Infinity;
  for (const p of sceneState.frame.plants || []) {
    const bounds = p[9] ? grassHitBounds(p) : null,
          px = bounds ? (bounds[0] + bounds[2]) / 2 +
                            horizontalDelta(world.x - (bounds[0] + bounds[2]) / 2)
                      : 0,
          tolerance = 3 / scale,
          near = !bounds || (px >= bounds[0] - tolerance && px <= bounds[2] + tolerance &&
                             world.y >= bounds[1] - tolerance && world.y <= bounds[3] + tolerance);
    if (p[9] && near)
      for (const part of plantRenderParts(p)) {
        const shown = grassPartPose(p, part), q = shown.q,
              px = q[0] + horizontalDelta(world.x - q[0]), r = Math.max(shown.width, 3 / scale);
        if (px < Math.min(q[0], q[2], q[4], q[6]) - r ||
            px > Math.max(q[0], q[2], q[4], q[6]) + r ||
            world.y < Math.min(q[1], q[3], q[5], q[7]) - r ||
            world.y > Math.max(q[1], q[3], q[5], q[7]) + r)
          continue;
        const span = Math.hypot(q[2] - q[0], q[3] - q[1]) + Math.hypot(q[4] - q[2], q[5] - q[3]) +
                     Math.hypot(q[6] - q[4], q[7] - q[5]),
              steps = Math.max(8, Math.min(48, Math.ceil(span * scale / 8)));
        let before = plantRibbon(q, shown.width, part.kind, 0);
        for (let k = 1; k <= steps; k++) {
          const after = plantRibbon(q, shown.width, part.kind, k / steps),
                dx = after.p[0] - before.p[0], dy = after.p[1] - before.p[1],
                t = Math.max(0,
                             Math.min(1, ((px - before.p[0]) * dx + (world.y - before.p[1]) * dy) /
                                             Math.max(1e-9, dx * dx + dy * dy))),
                x = before.p[0] + dx * t, y = before.p[1] + dy * t,
                d = Math.hypot(px - x, world.y - y),
                radius = before.width + (after.width - before.width) * t + 2 / scale;
          if (d <= radius) {
            const hit = {
              kind : 'plant',
              item : p,
              organ : part,
              trait : p[PLANT.trait] ?? (p[PLANT.form] + .25) / 3,
              key : 'plant:' + p[0] + ':' + part.stem,
              radius,
              x,
              y
            };
            if (!best || hitDepth(hit) > hitDepth(best) ||
                hitDepth(hit) === hitDepth(best) && d < distance) {
              best = hit;
              distance = d;
            }
          }
          before = after;
        }
      }
    if (p[7] > 0 && (p[26] ?? 1) > (p[25] ?? 0) && (p[PLANT.sediment_left] ?? p[11]) <= 0 &&
        (p[PLANT.sediment_right] ?? p[11]) <= 0) {
      const dx = p[3] - p[1], dy = p[4] - p[2],
            t = Math.max(p[25] ?? 0, Math.min(p[26] ?? 1, (horizontalDelta(world.x - p[1]) * dx +
                                                           (world.y - p[2]) * dy) /
                                                              (p[12] * p[12]))),
            x = p[1] + dx * t, y = p[2] + dy * t,
            depth = algaeDisplay(p, sceneState.frame).thickness;
      if (Math.hypot(horizontalDelta(x - world.x), y - world.y) <= Math.max(depth, 3 / scale) &&
          !best)
        best = {kind : 'algae', item : p, key : 'algae:' + p[0], depth, radius : 3, x, y};
    }
  }
  if (best)
    return best;
  const bed = tankSedimentHit(world);
  if (bed)
    return bed;
  return tankSolidHit(world) || tankWaterHit(world);
}

export function tankSolidHit(world, f = sceneState.frame) {
  if (!f || world.x < 0 || world.x >= f.width || world.y < 0 || world.y >= f.height)
    return null;
  for (let k = 0; k < (f.obstacles?.length || 0); ++k) {
    const o = f.obstacles[k], shape = f.shapes?.[k],
          x = o[0] + ((world.x - o[0] + f.width / 2) % f.width + f.width) % f.width - f.width / 2;
    let inside = !shape?.length && Math.hypot(x - o[0], world.y - o[1]) <= o[2];
    if (shape?.length)
      for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
        const a = shape[j], b = shape[i];
        if ((a[1] > world.y) !== (b[1] > world.y) &&
            x < (b[0] - a[0]) * (world.y - a[1]) / (b[1] - a[1]) + a[0])
          inside = !inside;
      }
    if (inside) {
      const xs = shape?.map(p => p[0]), ys = shape?.map(p => p[1]);
      return {
        kind : 'rock',
        item : o,
        shape,
        key : 'rock:' + k,
        x : world.x,
        y : world.y,
        radius : 4,
        bounds : {
          width : xs?.length ? Math.max(...xs) - Math.min(...xs) : 2 * o[2],
          height : ys?.length ? Math.max(...ys) - Math.min(...ys) : 2 * o[2]
        }
      };
    }
  }
  return null;
}

export function tankWaterHit(world, f = sceneState.frame) {
  if (!f || world.x < 0 || world.x >= f.width || world.y < 0 || world.y >= f.height ||
      tankSolidHit(world, f))
    return null;
  const sample = grid => {
    if (!grid?.columns || !grid.rows)
      return {amount : 0, density : 0, cell : -1};
    const i = Math.floor(world.x / f.width * grid.columns),
          j = Math.floor(world.y / f.height * grid.rows), cell = j * grid.columns + i,
          amount = grid.amounts?.[cell] || 0;
    return {amount, density : amount * grid.columns * grid.rows / (f.width * f.height), cell};
  }, plankton = sample(f.plankton), sediment = sample(f.sediment);
  return {
    kind : 'water',
    item : [],
    key : 'water:' + plankton.cell + ':' + sediment.cell,
    odors : tankOdors(world, f),
    plankton : plankton.amount,
    planktonDensity : plankton.density,
    density : sediment.density * 64,
    radius : 4,
    x : world.x,
    y : world.y
  };
}

export function smallAnimalContains(p, x, y, tolerance) {
  const dx = horizontalDelta(x - p[0]), dy = y - p[1], a = p[11] || 0;
  const scale = bedScale(p[19] ?? .5), radius = p[6] * scale;
  if (p[7] !== 7) {
    const along = dx * Math.cos(a) + dy * Math.sin(a),
          across = -dx * Math.sin(a) + dy * Math.cos(a);
    return Math.hypot(along / (radius + tolerance), across / (radius + tolerance)) <= 1;
  }
  const length = p[13] || 0;
  if (length < .25)
    return Math.hypot(dx / (2.45 * radius + tolerance), dy / (.55 * radius + tolerance)) <= 1;
  const vx = -Math.sin(a) * length, vy = Math.cos(a) * length,
        t = Math.max(0, Math.min(1, (dx * vx + dy * vy) / Math.max(1e-9, length * length)));
  return Math.hypot(dx - t * vx, dy - t * vy) <= Math.max(radius, .6) + tolerance;
}

export function tankHit(pointer, select = false) {
  const local = canvasPoint({clientX : pointer.x, clientY : pointer.y});
  if (brainState.brainOpen && brainState.brainDrawing) {
    const cell = brainHit([ local.x, local.y ]);
    if (cell)
      return {
        kind : 'brain',
        cell,
        key : 'brain:' + (cell.id ?? cell.tissue) + ':' + cell.part,
        radius : 4
      };
  }
  const world = screenToWorld(local), scale = camera().scale;
  const f = sceneState.frame, candidates = [], bed = tankSedimentHit(world, f);
  for (const provider of tankHoverProviders) {
    if (select && !['fish', 'corpse', 'invertebrate'].includes(provider.kind))
      continue;
    for (const item of provider.items(f)) {
      const p = provider.pose(item), radius = provider.radius(p),
            dx = horizontalDelta(p[0] - world.x) * scale, dy = (p[1] - world.y) * scale,
            rx = Math.max(3, radius * scale),
            ry = Math.max(3, radius * scale * (provider.flatten || 1)),
            score = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (provider.kind === 'fish' && bed)
        continue;
      if (!(provider.hit ? provider.hit(p, world.x, world.y, 3 / scale, scale) : score <= 1))
        continue;
      const hit = {
        kind : provider.kind,
        item,
        provider,
        key : provider.kind + ':' + provider.id(item),
        radius,
        x : world.x,
        y : world.y,
        score
      };
      hit.depth = hitDepth(hit, p);
      candidates.push(hit);
    }
  }
  const plant = tankVegetationHit(world, scale);
  if (plant?.kind === 'plant')
    candidates.push({...plant, depth : hitDepth(plant), score : 0});
  candidates.sort((a, b) => b.depth - a.depth || a.score - b.score);
  return candidates[0] || (select && !['plant', 'algae'].includes(plant?.kind) ? null : plant);
}
export function hitDepth(hit, pose = hit.item) {
  const key = (hit.kind === 'invertebrate' ? 'animal' : hit.kind) + ':' +
              hit.item[hit.kind === 'plant'  ? 0
                       : hit.kind === 'fish' ? 4
                                             : 3],
        rank = tankState.pickingFrame === sceneState.frame ? tankState.pickingOrder?.get(key)
                                                           : undefined;
  if (rank !== undefined)
    return 1e6 + rank;
  return hit.kind === 'plant'          ? plantFoot(hit.item).y
         : hit.kind === 'invertebrate' ? animalFoot(pose).y
         : hit.kind === 'fish'         ? pose[1] + (pose[51] || 1)
                                       : -1e6;
}

export function clearFishPreview() {
  if (!sceneState.tankPreviewFish)
    return;
  updateSceneState({tankPreviewFish : 0});
  if (sceneState.frame && evolutionState.activeView === 'fish') {
    showSelection(sceneState.frame);
    updateCockpit(sceneState.frame);
  }
}

export function tankHoverReady(key, now) {
  if (!hoverState.tankHoverKey && !hoverState.tankHoverSince)
    hoverState.tankHoverSince = now;
  hoverState.tankHoverKey = key;
  return hoverState.persistent || now - hoverState.tankHoverSince >= 180;
}

export function tankHoverUpdate(now = Date.now()) {
  if (!hoverState.tankPointer || now - hoverState.tankHoverLast < 50)
    return;
  hoverState.tankHoverLast = now;
  if (!sceneState.frame || sceneState.frame.turbo || evolutionState.editing || cameraState.drag ||
      brainState.brainProbeArmed) {
    tankHideTooltip();
    return;
  }
  let hit;
  const locked = hoverState.menuHit;
  if (locked && locked.epoch === sceneState.frame.render_epoch) {
    const plant = locked.hit.kind === 'plant', idColumn = plant ? 0 : 3,
          item = (plant ? sceneState.frame.plants : sceneState.frame.invertebrates || [])
                     .find(p => p[idColumn] === locked.hit.item[idColumn]);
    if (item)
      hit = {...locked.hit, item};
    else
      hoverState.menuHit = null;
  }
  hit ||= tankHit(hoverState.tankPointer);
  if (!hit) {
    clearFishPreview();
    tankHideTooltip();
    return;
  }
  if (!tankHoverReady(hit.key, now))
    return;
  if ((hit.kind === 'fish' || hit.kind === 'corpse') && !brainState.brainOpen &&
      evolutionState.activeView === 'fish') {
    const id = hit.kind === 'corpse' ? hit.item[CORPSE.source_id] : hit.item[4];
    if (sceneState.tankPreviewFish !== id) {
      updateSceneState({tankPreviewFish : id});
      showSelection(sceneState.frame);
      if (typeof updateCockpit === 'function')
        updateCockpit(sceneState.frame);
    }
  } else
    clearFishPreview();
  tankShowTooltip(hit.provider?.describe ? hit.provider.describe(hit, sceneState.frame)
                                         : tankObjectInfo(hit),
                  hit);
}

export function tankHoverMove(e) {
  hoverState.menuHit = null;
  if (e.pointerType === 'touch' || e.buttons || cameraState.drag) {
    hoverState.tankPointer = null;
    tankHideTooltip();
    clearFishPreview();
    return;
  }
  const previous = hoverState.tankPointer;
  if (!previous || Math.hypot(e.clientX - previous.x, e.clientY - previous.y) >= 2) {
    hoverState.tankHoverSince = Date.now();
    if (!hoverState.persistent)
      el('tank-tooltip').hidden = true;
  }
  hoverState.tankPointer = {x : e.clientX, y : e.clientY};
  tankHoverUpdate();
}

export let tankPreviousLeave;

export function updateHoverState(patch) {
  Object.assign(hoverState, patch);
  return Object.values(patch)[0];
}

const initializers = {
  "tankPointer" : () => {
    // Aquarium objects share one hit test and one stable tooltip.
    hoverState.tankPointer = null;
    const toggle = el('keep-hover-info');
    hoverState.persistent = false;
    try {
      hoverState.persistent = window.localStorage?.getItem('fish-hover-persistent') === '1';
    } catch {
    }
    toggle.checked = hoverState.persistent;
    toggle.onchange = () => {
      hoverState.persistent = toggle.checked;
      try {
        window.localStorage?.setItem('fish-hover-persistent', toggle.checked ? '1' : '0');
      } catch {
      }
      if (!toggle.checked && !hoverState.tankPointer)
        tankHideTooltip();
      hoverState.tankHoverLast = 0;
      tankHoverUpdate();
    };
  },
  "tankHoverKey" : () => { hoverState.tankHoverKey = ''; },
  "tankHoverSince" : () => { hoverState.tankHoverSince = 0; },
  "tankHoverLast" : () => { hoverState.tankHoverLast = 0; },
  "tankTooltipRows" : () => { tankTooltipRows = []; },
  "createElement_div" : () => {
    for (let i = 0; i < 4; i++) {
      const box = document.createElement('div'), label = document.createElement('small'),
            value = document.createElement('strong');
      box.appendChild(label);
      box.appendChild(value);
      el('tank-tooltip-values').appendChild(box);
      tankTooltipRows.push({box, label, value});
    }
  },
  "tankFormat" : () => {
    tankFormat = (v, digits = 0) =>
        Number.isFinite(v) ? v.toLocaleString('de', {maximumFractionDigits : digits}) : '–';
  },
  "tankHoverProviders" : () => {
    tankHoverProviders = [
      {
        kind : 'fish',
        items : f => f.fish,
        id : p => p[4],
        pose : p => blendFish(p),
        radius : p => fishRenderRadius(p),
        hit : fishBodyContains
      },
      {
        kind : 'corpse',
        items : f => f.corpses || [],
        id : p => p[7],
        pose : p => blendParticle(p, sceneState.previousCorpses, 7, frameBlend()),
        radius : p => p[9],
        flatten : .55,
        hit : corpseBodyContains
      },
      {
        kind : 'invertebrate',
        items : f => (f.invertebrates || []).filter(p => p[7] !== 6),
        id : p => p[3],
        pose : p => blendSmallAnimal(p),
        radius : p => p[6],
        hit : smallAnimalContains
      },
      {
        kind : 'food',
        items : f => f.food || [],
        id : p => p[3],
        pose : p => blendParticle(p, sceneState.previousFood, 3, frameBlend()),
        radius : p => foodDisplayRadius(p)
      },
      {
        kind : 'sperm',
        items : f => f.gametes || [],
        id : p => p[6],
        pose : p => p,
        radius : () => Math.hypot(sceneState.frame.width / sceneState.frame.plankton.columns,
                                  sceneState.frame.height / sceneState.frame.plankton.rows) *
                       .5
      }
    ];
  },
  "tankPreviousLeave" : () => { tankPreviousLeave = canvas.onpointerleave; },
  "onpointerleave" : () => {
    canvas.onpointerleave = e => {
      tankPreviousLeave?.(e);
      hoverState.tankPointer = null;
      clearFishPreview();
      if (!hoverState.persistent)
        tankHideTooltip();
    };
  },
  "addEventListener_blur" : () => {
    window.addEventListener?.('blur', () => {
      hoverState.tankPointer = null;
      clearFishPreview();
      tankHideTooltip();
    });
  },
  "addEventListener_keydown" : () => {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        clearFishPreview();
        hoverState.tankPointer = null;
        tankHideTooltip();
      }
    });
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
