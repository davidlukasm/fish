import {shownRate} from './nutrition_model.js';
import {plantType} from './plant_geometry.js';
import {PERCENT} from './units.js';
import {SENSE_TISSUE} from './tissue.js';
import {brainSelectedTissue, brainState} from './brain.js';
import {
  brainConnectivity,
  cellColor,
  cellParts,
  neuronName,
  partShare,
  scentColors,
  tissueColor
} from './brain_model.js';
import {rgb} from './dom.js';
import {brainOrganReadout} from './organ_readout.js';
import {
  CORPSE,
  CRAB_STATE,
  FAUNA,
  FISH,
  FOOD,
  FOOD_KIND,
  GAMETE,
  INVERTEBRATE,
  INVERTEBRATE_KIND,
  MUSSEL_STATE,
  NEURON,
  ORGAN_KIND,
  PLANT,
  PLANT_ROOT,
  RECEPTOR,
  RENDER_GROUP,
  TOLERANCE,
  VISUAL_SAMPLE
} from './schema.js';
import {fishTitle} from './fish_names.js';
import {formatNumber, t, tList, textArea, percent} from './strings.js';
import {frameSpecies, sceneState} from './state.js';
export const object_infoState = {};
const CRAB_BURIED_EXPOSURE = .02, WORM_IN_BURROW = .25;

function smallAnimalName(kind, morph) {
  const family = textArea('object_info').smallAnimals?.[kind], names = family?.variants;
  return names?.[Math.max(0, Math.min(names.length - 1, Math.floor(morph || 0)))] ?? family?.name;
}

export function tankObjectInfo(hit) {
  const info = objectInfo(hit);
  if (info && hit.kind !== 'brain')
    info.odors = tankOdors(hit, sceneState.frame);
  return info;
}

const DENSITY_AREA = 1000, PLATFORM_CORNERS = 4;
const DIGITS = Object.freeze({fine : 5, plankton : 4, coarse : 3});
export function tankOdors(point, f = sceneState.frame) {
  const g = f?.odors;
  if (!g?.columns || !g.rows || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return Array(scentColors.length).fill(0);
  const x = Math.floor(((point.x % f.width + f.width) % f.width) / f.width * g.columns),
        y = Math.max(0, Math.min(g.rows - 1, Math.floor(point.y / f.height * g.rows)));
  return g.cells?.[y * g.columns + x] || Array(scentColors.length).fill(0);
}

function objectInfo(hit) {
  const p = hit.item, params = sceneState.frame.parameters || {},
        energy = column => formatNumber(p[column], 1), age = v => formatNumber(v),
        metric = (label, value) => [label, value];
  if (hit.kind === 'brain') {
    const d = brainState.brainDrawing, n = hit.cell.id !== undefined && d.nodes.get(hit.cell.id),
          tissue = brainSelectedTissue(d, hit.cell), organ = brainOrganReadout(d, tissue);
    if (n) {
      const N = NEURON, rec = d.receptors.get(n[N.index]), share = partShare(n, hit.cell.part),
            mix = cellParts(n).length > 1,
            wiring = brainConnectivity(d.b).get(n[N.index]) || [ 0, 0 ], light = SENSE_TISSUE.light,
            sample = hit.cell.part === light &&
                     d.b.visual_samples?.find(s => s[VISUAL_SAMPLE.neuron] === n[N.index]),
            wired = t('units.ratio', {a : wiring[0], b : wiring[1]});
      return {
        kind : 'cell',
        color : cellColor(n),
        title : t('object_info.cellTitle', {name : neuronName(n, hit.cell.part), id : n[N.index]}),
        subtitle : mix ? t('object_info.mixedCell', {n : Math.round(PERCENT * share)}) : organ.title,
        metrics : sample
                      ? [
                          metric(t('object_info.lichtreiz'),
                                 formatNumber(sample[VISUAL_SAMPLE.light], DIGITS.fine)),
                          metric(t('object_info.reizschwelle'),
                                 formatNumber(rec[RECEPTOR.response_threshold], DIGITS.fine)),
                          metric(t('object_info.rezeptorantwort'),
                                 percent(sample[VISUAL_SAMPLE.response])),
                          metric(t('object_info.synapsenHineinHinaus'), wired)
                        ]
                      : [
                          metric(t('object_info.aktivitaet'), formatNumber(n[N.activity], 2)),
                          metric(rec ? t('object_info.reizschwelle') : t('object_info.zeitkonstante'),
                                 rec ? formatNumber(rec[RECEPTOR.response_threshold], DIGITS.coarse)
                                     : t('units.steps', {n : Math.round(n[N.time_constant] || 0)})),
                          metric(t('object_info.eingehend'), wiring[0]),
                          metric(t('object_info.ausgehend'), wiring[1])
                        ],
        fill : Math.abs(n[N.activity]),
        state : wiring[0] + wiring[1] === 0
                    ? t('object_info.unwired', {bias : formatNumber(n[N.bias], 2)})
                    : t('object_info.klickReizt')
      };
    }
    return {
      kind : 'organ',
      color : tissueColor(tissue.key),
      title : organ.title,
      subtitle : organ.caption,
      metrics : [
        metric('', organ.hero), ...organ.metrics.slice(0, 1).map(m => metric(m.label, m.value))
      ],
      fill : organ.activity,
      state : t('object_info.klickReizt')
    };
  }
  if (hit.kind === 'rock')
    return {
      kind : 'rock',
      color : '#8b9997',
      title : hit.shape?.length === PLATFORM_CORNERS ? t('object_info.plattformStein')
                                                     : t('object_info.felsen'),
      metrics : [
        metric(t('object_info.breite'), formatNumber(hit.bounds.width, 1)),
        metric(t('object_info.hoehe'), formatNumber(hit.bounds.height, 1)),
        metric(t('object_info.licht'),
               percent(displayPhysicalLight(sceneState.frame, hit.x, hit.y)))
      ]
    };
  if (hit.kind === 'water')
    return {
      kind : 'water',
      color : '#6aada0',
      title : t('object_info.wasser'),
      odors : hit.odors,
      metrics : [
        metric(t('object_info.plankton'), formatNumber(hit.plankton, DIGITS.plankton)),
        metric(t('object_info.densityPerArea', {area : DENSITY_AREA}),
               formatNumber(hit.planktonDensity * DENSITY_AREA, DIGITS.coarse)),
        metric(t('object_info.schwebsediment'), formatNumber(hit.density, 2)),
        metric(t('object_info.licht'),
               percent(displayPhysicalLight(sceneState.frame, hit.x, hit.y)))
      ],
      fill : hit.planktonDensity / params.plankton_max_density
    };
  if ([ 'plant', 'algae', 'sediment' ].includes(hit.kind)) {
    const light = displayPhysicalLight(sceneState.frame, hit.x, hit.y);
    if (hit.kind === 'plant') {
      const o = hit.organ, type = plantType(hit.trait), names = tList('object_info.plantNames');
      return {
        kind : 'plant',
        color : rgb(o?.color || p[PLANT.color]),
        title : names[type],
        subtitle : t('object_info.plantPart', {
          anchor : p[PLANT.root]?.[PLANT_ROOT.drift_age] > 0 ? t('object_info.drifting')
                                                             : t('object_info.rooted'),
          part : o?.kind === ORGAN_KIND.blade  ? t('object_info.blade')
                 : o?.kind === ORGAN_KIND.stem ? t('object_info.stem')
                                               : t('object_info.leaf')
        }),
        metrics : [
          metric(t('object_info.biomasse'), formatNumber(o?.energy ?? p[PLANT.grass], 1)),
          metric(t('object_info.bissfestigkeit'), formatNumber(o?.biteHardness ?? 0, 2)),
          metric(t('object_info.licht'), percent(light)),
          metric(t('object_info.lebenskraft'), percent(o?.vitality ?? 1))
        ],
        fill : o?.vitality ?? 1
      };
    }
    if (hit.kind === 'algae')
      return {
        kind : 'plant',
        color : '#559c43',
        title : t('object_info.algenMoosbelag'),
        subtitle : t('object_info.waechstAufFreierBeleuchteter'),
        metrics : [
          metric(t('object_info.biomasse'), formatNumber(p[PLANT.algae], 1)),
          metric(t('object_info.dicke'), formatNumber(hit.depth, 1)),
          metric(t('object_info.licht'), percent(light)),
          metric(t('object_info.bissfestigkeit'), formatNumber(params.hardness_algae, 2))
        ]
      };
    return {
      kind : 'sediment',
      color : '#ab8e61',
      title : t('object_info.sedimentboden'),
      subtitle : t('object_info.mausMachtDieStelle'),
      metrics : [
        metric(t('object_info.schichtdicke'), formatNumber(hit.depth, 1)),
        metric(t('object_info.bodennahrung'), formatNumber(p?.[PLANT.detritus], 1)),
        metric(t('object_info.wuermer'), formatNumber(p?.[PLANT.worms], 1)),
        metric(t('object_info.licht'), percent(light))
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
        title : fishTitle(p[FISH.id]),
        subtitle : species?.name || t('object_info.species', {id : p[FISH.species]}),
        metrics : [
          metric(t('object_info.reserve'), formatNumber(p[FISH.energy], 1)),
          metric(t('object_info.alter'), age(p[FISH.age])),
          metric(t('object_info.gesundheit'), percent(p[FISH.health])),
          metric(t('object_info.tempo'), t('units.pxPerStep', {n : formatNumber(p[FISH.speed], 2)}))
        ],
        fill : p[FISH.health]
      };
    }
    const maternal = frameSpecies(sceneState.frame, p[FISH.species] || p[FISH.maternal_species]),
          species = maternal?.name || t('object_info.unknownSpecies');
    return {
      kind : 'egg',
      color : rgb(p.slice(FISH.red, FISH.blue + 1)),
      title : p[FISH.nutrient_egg] ? t('object_info.nurseEgg', {id : p[FISH.id]})
                                   : t('object_info.egg', {id : p[FISH.id]}),
      subtitle : p[FISH.species] ? species : t('object_info.eggFrom', {species}),
      metrics : [
        metric(t('object_info.dotter'), formatNumber(p[FISH.energy], 1)),
        metric(t('object_info.alter'), age(p[FISH.age])),
        ...(!p[FISH.nutrient_egg]
                ? [ metric(t('object_info.entwicklung'), percent(p[FISH.development])) ]
                : [])
      ],
      fill : p[FISH.nutrient_egg] ? undefined : p[FISH.development],
      state : p[FISH.nutrient_egg] ? t('object_info.naehrei')
              : p[FISH.clonal]     ? t('object_info.entwickeltSichKlonal')
              : p[FISH.fertilised] ? t('object_info.befruchtet')
                                   : t('object_info.unbefruchtet')
    };
  }
  if (hit.kind === 'invertebrate')
    return {
      kind : 'food',
      color : rgb(p.slice(INVERTEBRATE.red, INVERTEBRATE.blue + 1)),
      title : p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.mussel &&
                  p[INVERTEBRATE.state] === MUSSEL_STATE.empty_shell ? (p[INVERTEBRATE.morph]>=FAUNA.crab_shell_morph?t('object_info.panzerbruchstuecke'):t('object_info.leereSchalen'))
                                        : smallAnimalName(p[INVERTEBRATE.kind], p[INVERTEBRATE.morph]),
      subtitle : p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.mussel &&
                  p[INVERTEBRATE.state] === MUSSEL_STATE.empty_shell ? t('object_info.nachDemAufbrechen')
                 : p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.mussel              ? (p[INVERTEBRATE.closed] ? t('object_info.geschlossenDoppelteSchalenhaerte')
                                                    : t('object_info.offenFiltriertPlankton'))
                 : p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.crab              ? (p[INVERTEBRATE.closed] < CRAB_BURIED_EXPOSURE ? t('object_info.eingegraben') : p[INVERTEBRATE.state] === CRAB_STATE.crossing  ? t('object_info.schwimmtZurNaechstenFlaeche')
                                              : p[INVERTEBRATE.state] === CRAB_STATE.emerging ? t('object_info.graebtSichAus')
                                              : p[INVERTEBRATE.state] === CRAB_STATE.fleeing ? t('object_info.fliehtVorEinemFisch')
                                              : p[INVERTEBRATE.state] === CRAB_STATE.digging ? t('object_info.graebtSichEin')
                                                           : t('object_info.laeuftUndFrisstBodennahrung'))
                                           : (p[INVERTEBRATE.length] < WORM_IN_BURROW ? t('object_info.imBau') : t('object_info.ausDemSedimentHervorgetreten')),
      metrics : [ metric(t('object_info.energie'), energy(INVERTEBRATE.energy)), metric(p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.worm?t('object_info.sichtbareLaenge'):t('object_info.groesse'), formatNumber(p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.worm?p[INVERTEBRATE.length]:2*p[INVERTEBRATE.radius], 1)), ...(p[INVERTEBRATE.kind] === INVERTEBRATE_KIND.mussel&&p[INVERTEBRATE.state]!==MUSSEL_STATE.empty_shell?[metric(t('object_info.planktonRate'),formatNumber(shownRate(p[INVERTEBRATE.feeding_rate]||0),2)),metric(t('object_info.planktonGesamt'),formatNumber(p[INVERTEBRATE.filtered]||0,1))]:[]) ]
    };
  if (hit.kind === 'food') {
    const fresh = p[FOOD.origin] === FOOD_KIND.feed && Number.isFinite(p[FOOD.age])
                      ? 2 ** (-p[FOOD.age] / params.food_half_life)
                      : undefined,
          risk = Number.isFinite(fresh) ? params.disease_food * (1 - fresh) : undefined;
    return {
      kind : 'food',
      color : rgb(p.slice(FOOD.red, FOOD.blue + 1)),
      title : p[FOOD.id] >= 2 ** RENDER_GROUP.key_bits
                  ? t('object_info.nahrungsgruppe')
                  : tList('object_info.foodNames')[p[FOOD.origin] || 0],
      subtitle : Number.isFinite(fresh)
                     ? t('object_info.freshness', {n : Math.round(PERCENT * fresh)})
                     : '',
      metrics : [
        metric(t('object_info.naehrwert'), energy(FOOD.energy)),
        metric(t('object_info.durchmesser'), formatNumber(2 * p[FOOD.radius], 1)),
        metric(t('object_info.alter'), age(p[FOOD.age])),
        ...(Number.isFinite(risk)
                ? [ metric(t('object_info.ansteckungMahlzeit'), percent(risk, DIGITS.coarse)) ]
                : []),
        ...(p[FOOD.bottom_steps] > 0
                ? [ metric(t('object_info.ruhezeit'), age(p[FOOD.bottom_steps])) ]
                : [])
      ],
      fill : fresh
    };
  }
  if (hit.kind === 'corpse') {
    const remaining =
        Math.max(0, Math.min(1, p[CORPSE.energy] /
                                    Math.max(TOLERANCE.negligible, p[CORPSE.initial_energy])));
    return {
      kind : 'corpse',
      color : rgb(p.slice(CORPSE.red, CORPSE.blue + 1)),
      title : p[CORPSE.hatched] ? t('object_info.kadaver') : t('object_info.totesEi'),
      subtitle : t('object_info.nutritionLeft', {n : Math.round(PERCENT * remaining)}),
      metrics : [
        metric(t('object_info.naehrwert'), energy(CORPSE.energy)),
        metric(t('object_info.seitDemTod'), age(p[CORPSE.age]))
      ],
      fill : remaining
    };
  }
  return {
    kind : 'sperm',
    color : rgb(p.slice(GAMETE.red, GAMETE.blue + 1)),
    title : t('object_info.spermienwolke'),
    subtitle : t('object_info.mitDerWasserstroemungVerteilt'),
    metrics :
        [ metric(t('object_info.konzentration'), formatNumber(p[GAMETE.density], DIGITS.fine)) ],
    fill : p[GAMETE.density] / Math.max(TOLERANCE.rounding, params.sperm_opaque)
  };
}

function displayPhysicalLight(f, x, y) {
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
