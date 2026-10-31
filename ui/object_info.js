// What the interface says about any object in the tank: a title, a subtitle, a few metrics and a
// fill level, independent of where it is shown (tooltip, info panel or any other view).
import {brainSelectedTissue, brainState} from './brain.js';
import {
  brainConnectivity,
  brainMotorColors,
  brainSenseColors,
  cellColor,
  cellParts,
  neuronName,
  partShare
} from './brain_model.js';
import {rgb} from './dom.js';
import {brainOrganReadout} from './organ_readout.js';
import {CORPSE, FISH, FOOD, GAMETE, INVERTEBRATE, PLANT} from './schema.js';
import {fishTitle} from './fish_names.js';
import {formatNumber, t, tList, textArea} from './strings.js';
import {frameSpecies, sceneState} from './state.js';
import {foodColor} from './tank.js';
export const object_infoState = {};

// Names of the small animal families (morph = family + variation), as plants have theirs.
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
        energy = column => formatNumber(p[column], 1), age = v => formatNumber(v),
        metric = (label, value) => [label, value];
  if (hit.kind === 'brain') {
    const d = brainState.brainDrawing, n = hit.cell.id !== undefined && d.nodes.get(hit.cell.id),
          tissue = brainSelectedTissue(d, hit.cell), organ = brainOrganReadout(d, tissue);
    if (n) {
      const rec = d.receptors.get(n[5]), share = partShare(n, hit.cell.part),
            mix = cellParts(n).length > 1, wiring = brainConnectivity(d.b).get(n[5]) || [ 0, 0 ];
      return {kind:'cell',color:cellColor(n),title:t('object_info.cellTitle',{name:neuronName(n,hit.cell.part),id:n[5]}),subtitle:mix?t('object_info.mixedCell',{n:Math.round(share*100)}):organ.title,metrics:hit.cell.part==='s0'&&d.b.visual_samples?.some(s=>s[0]===n[5])?(()=>{const sample=d.b.visual_samples.find(s=>s[0]===n[5]);return [metric(t('object_info.lichtreiz'),formatNumber(sample[1],5)),metric(t('object_info.reizschwelle'),formatNumber(rec[13],5)),metric(t('object_info.rezeptorantwort'),t('units.percent',{n:Math.round(100*sample[3])})),metric(t('object_info.synapsenHineinHinaus'),t('units.ratio',{a:wiring[0],b:wiring[1]}))];})():[metric(t('object_info.aktivitaet'),formatNumber(n[3],2)),metric(rec?t('object_info.reizschwelle'):t('object_info.zeitkonstante'),rec?formatNumber(rec[13],3):t('units.steps',{n:Math.round(n[16]||0)})),metric(t('object_info.eingehend'),wiring[0]),metric(t('object_info.ausgehend'),wiring[1])],fill:Math.abs(n[3]),state:wiring[0]+wiring[1]===0?t('object_info.unwired',{bias:formatNumber(n[15],2)}):t('object_info.klickReizt')};
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
      state : t('object_info.klickReizt')
    };
  }
  if (hit.kind === 'rock')
    return {
      kind : 'rock',
      color : '#8b9997',
      title : hit.shape?.length === 4 ? t('object_info.plattformStein') : t('object_info.felsen'),
      metrics : [
        metric(t('object_info.breite'), formatNumber(hit.bounds.width, 1)),
        metric(t('object_info.hoehe'), formatNumber(hit.bounds.height, 1)),
        metric(t('object_info.licht'),
               t('units.percent',
                 {n : Math.round(100 * displayPhysicalLight(sceneState.frame, hit.x, hit.y))}))
      ]
    };
  if (hit.kind === 'water')
    return {
      kind : 'water',
      color : '#6aada0',
      title : t('object_info.wasser'),
      odors : hit.odors,
      metrics : [
        metric(t('object_info.plankton'), formatNumber(hit.plankton, 4)),
        metric(t('object_info.dichteJe1000Px2'), formatNumber(hit.planktonDensity * 1000, 3)),
        metric(t('object_info.schwebsediment'), formatNumber(hit.density, 2)),
        metric(t('object_info.licht'),
               t('units.percent',
                 {n : Math.round(100 * displayPhysicalLight(sceneState.frame, hit.x, hit.y))}))
      ],
      fill : hit.planktonDensity / (params.plankton_max_density || .01)
    };
  if ([ 'plant', 'algae', 'sediment' ].includes(hit.kind)) {
    const light = displayPhysicalLight(sceneState.frame, hit.x, hit.y),
          percent = v => t('units.percent', {n : Math.round(100 * v)});
    if (hit.kind === 'plant') {
      const o = hit.organ, type = Math.min(5, Math.floor(6 * (hit.trait ?? 0))),
            names = tList('object_info.plantNames');
      return {
        kind : 'plant',
        color : rgb(o?.color || p[PLANT.color] || [ .2, .6, .2 ]),
        title : names[type],
        subtitle : t('object_info.plantPart', {
          anchor : p[PLANT.root]?.[2] > 0 ? t('object_info.drifting') : t('object_info.rooted'),
          part : o?.kind === 0   ? t('object_info.blade')
                 : o?.kind === 1 ? t('object_info.stem')
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
          metric(t('object_info.bissfestigkeit'), formatNumber(params.hardness_algae ?? .01, 2))
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
          metric(t('object_info.gesundheit'),
                 t('units.percent', {n : Math.round(100 * p[FISH.health])})),
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
                ? [ metric(t('object_info.entwicklung'),
                           t('units.percent', {n : Math.round(100 * p[FISH.development])})) ]
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
      title : p[INVERTEBRATE.kind] === 9 && p[INVERTEBRATE.state] === 1 ? (p[INVERTEBRATE.morph]>=8?t('object_info.panzerbruchstuecke'):t('object_info.leereSchalen'))
                                        : smallAnimalName(p[INVERTEBRATE.kind], p[INVERTEBRATE.morph]),
      subtitle : p[INVERTEBRATE.kind] === 9 && p[INVERTEBRATE.state] === 1 ? t('object_info.nachDemAufbrechen')
                 : p[INVERTEBRATE.kind] === 9              ? (p[INVERTEBRATE.closed] ? t('object_info.geschlossenDoppelteSchalenhaerte')
                                                    : t('object_info.offenFiltriertPlankton'))
                 : p[INVERTEBRATE.kind] === 8              ? (p[INVERTEBRATE.closed] < .02 ? t('object_info.eingegraben') : p[INVERTEBRATE.state] === 5  ? t('object_info.schwimmtZurNaechstenFlaeche')
                                              : p[INVERTEBRATE.state] >= 4 ? t('object_info.graebtSichAus')
                                              : p[INVERTEBRATE.state] >= 3 ? t('object_info.fliehtVorEinemFisch')
                                              : p[INVERTEBRATE.state] >= 2 ? t('object_info.graebtSichEin')
                                                           : t('object_info.laeuftUndFrisstBodennahrung'))
                                           : (p[INVERTEBRATE.length] < .25 ? t('object_info.imBau') : t('object_info.ausDemSedimentHervorgetreten')),
      metrics : [ metric(t('object_info.energie'), energy(INVERTEBRATE.energy)), metric(p[INVERTEBRATE.kind]===7?t('object_info.sichtbareLaenge'):t('object_info.groesse'), formatNumber(p[INVERTEBRATE.kind]===7?p[INVERTEBRATE.length]:2*p[INVERTEBRATE.radius], 1)), ...(p[INVERTEBRATE.kind]===9&&p[INVERTEBRATE.state]!==1?[metric(t('object_info.planktonJe100'),formatNumber(100*(p[INVERTEBRATE.feeding_rate]||0),2)),metric(t('object_info.planktonGesamt'),formatNumber(p[INVERTEBRATE.filtered]||0,1))]:[]) ]
    };
  if (hit.kind === 'food') {
    const fresh = p[FOOD.origin] === 0 && Number.isFinite(p[FOOD.age])
                      ? 2 ** (-p[FOOD.age] / (params.food_half_life || 2000))
                      : undefined,
          risk = Number.isFinite(fresh) ? (params.disease_food ?? .005) * (1 - fresh) : undefined;
    return {
      kind : 'food',
      color : p.length > FOOD.blue ? rgb(p.slice(FOOD.red, FOOD.blue + 1))
                                   : foodColor(p[FOOD.energy], params.food_bright || 200),
      title : p[FOOD.id] >= 2 ** 48 ? t('object_info.nahrungsgruppe')
                                    : tList('object_info.foodNames')[p[FOOD.origin] || 0],
      subtitle : Number.isFinite(fresh) ? t('object_info.freshness', {n : Math.round(100 * fresh)})
                                        : '',
      metrics : [
        metric(t('object_info.naehrwert'), energy(FOOD.energy)),
        metric(t('object_info.durchmesser'), formatNumber(2 * p[FOOD.radius], 1)),
        metric(t('object_info.alter'), age(p[FOOD.age])),
        ...(Number.isFinite(risk)
                ? [ metric(t('object_info.ansteckungMahlzeit'),
                           t('units.percent', {n : formatNumber(100 * risk, 3)})) ]
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
        Math.max(0, Math.min(1, p[CORPSE.energy] / Math.max(.001, p[CORPSE.initial_energy])));
    return {
      kind : 'corpse',
      color : rgb(p.slice(CORPSE.red, CORPSE.blue + 1)),
      title : p[CORPSE.hatched] ? t('object_info.kadaver') : t('object_info.totesEi'),
      subtitle : t('object_info.nutritionLeft', {n : Math.round(100 * remaining)}),
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
    metrics : [ metric(t('object_info.konzentration'), formatNumber(p[GAMETE.density], 5)) ],
    fill : p[GAMETE.density] / Math.max(1e-12, params.sperm_opaque ?? .012)
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
