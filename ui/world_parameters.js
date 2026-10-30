import {t, formatNumber} from './strings.js';
import {updateWorldState} from './world.js';
import {movingSliders, sliderHold} from './controller.js';
import {el, text} from './dom.js';
import {command} from './session.js';
import {parameterLabels, toolSettings, worldState} from './world.js';
import {renderCurrentSources, renderFeeders} from './world_sources.js';
export const world_parametersState = {};
export let newEnergyFields;

export let energyParameterHelp;

export function parameterStep(p) { return p.step > 0 ? String(p.step) : "any"; }

function parameterInput(p, value) {
  const label = document.createElement('label'), name = document.createElement('span'),
        input = document.createElement('input');
  label.className = 'setting';
  name.textContent = p.label + (p.unit ? ' (' + p.unit + ')' : '');
  input.type = p.integer && p.min === 0 && p.max === 1 ? 'checkbox' : 'number';
  input.min = p.min;
  input.max = p.max;
  input.step = parameterStep(p);
  input.title = p.help;
  if (input.type === 'checkbox')
    input.checked = !!value;
  else
    input.value = value;
  label.append(name, input);
  return {label, input};
}

export let parameterSections;

export function parameterSection(p) {
  return Object.keys(parameterSections).find(key => parameterSections[key].includes(p.name)) ||
         (p.group === 'vision' || p.group === 'senses'   ? 'senses-settings'
          : p.group === 'foodweb'                        ? 'foodweb-settings'
          : p.group === 'sources'                        ? 'source-settings'
          : p.group === 'light'                          ? 'light-settings'
          : p.group === 'disease'                        ? 'disease-settings'
          : (p.group === 'energy' || p.group === 'body') ? 'energy-settings'
          : p.group === 'food'                           ? 'food-settings'
                                                         : 'evolution-settings');
}

const basicParameters = new Set([
  'cloud_density',   'energy_supply',     'food_cluster',          'source_motion',
  'food_size',       'food_sink',         'plankton_limit',        'fish_energy_density',
  'algae_rate',      'grass_rate',        'algae_capacity',        'grass_capacity',
  'algae_thickness', 'grass_length',      'egg_organ_capacity',    'gut_time',
  'fill_plant',      'food_supply_share', 'plankton_supply_share', 'benthic_supply_share',
  'fill_sediment',   'organ_mass_ref',    'undulation_loss',       'sperm_organ_capacity',
  'vision_range',    'day_period',        'night_light',           'water_clarity',
  'light_bottom'
]);
function filterParameters() {
  const search = el('settings-search').value.trim().toLocaleLowerCase(t('units.locale')),
        all = el('settings-advanced').checked, parameterLabelsShown = new Set();
  for (const [key, input] of worldState.parameterInputs) {
    const label = input.parentElement;
    parameterLabelsShown.add(label);
    label.hidden = search ? ![parameterLabels[key], energyParameterHelp[key], key]
                                 .join(' ')
                                 .toLocaleLowerCase(t('units.locale'))
                                 .includes(search)
                          : !all && !basicParameters.has(key);
  }
  for (const label of el('view-settings').querySelectorAll('.setting'))
    if (!parameterLabelsShown.has(label))
      label.hidden =
          !!search && !label.textContent.toLocaleLowerCase(t('units.locale')).includes(search);
  for (const group of el('view-settings').querySelectorAll('.settings-group')) {
    const settings = [...group.querySelectorAll('.setting') ];
    group.hidden =
        search ? settings.every(label => label.hidden) &&
                     ![...group.querySelectorAll('button, label, summary')].some(
                         node =>
                             !node.closest('.setting') &&
                             node.textContent.toLocaleLowerCase(t('units.locale')).includes(search))
               : settings.length > 0 && settings.every(label => label.hidden) &&
                     !group.querySelector('button, .burst-slider, .support');
    if (search && !group.hidden)
      group.open = true;
  }
}
function visionDiagram(parameters) {
  const sector = degrees => {
    if (degrees >= 360)
      return 'M60 16a44 44 0 1 1 0 88a44 44 0 1 1 0-88';
    const half = degrees * Math.PI / 360, x = 60 + 44 * Math.cos(half), dy = 44 * Math.sin(half);
    return 'M60 60L' + x + ' ' + (60 - dy) + 'A44 44 0 ' + Number(degrees > 180) + ' 1 ' + x + ' ' +
           (60 + dy) + 'Z';
  };
  const adaptation = 2 * parameters.vision_adaptation_angle;
  el('vision-adaptation-sector').setAttribute('d', sector(adaptation));
  el('vision-inhibition-sector').setAttribute('d', sector(adaptation));
  text('vision-adaptation-value',
       t('world_parameters.angle', {n : parameters.vision_adaptation_angle}));
  text('vision-inhibition-value',
       t('world_parameters.perEye', {n : parameters.vision_adaptation_angle}));
}

export function showWorld(f) {
  el('minimum-population').disabled = !!f.historical;
  const signature = JSON.stringify((f.parameter_info || []).map(p => p.name));
  if (signature !== worldState.parametersBuilt) {
    updateWorldState({parametersBuilt : signature});
    newEnergyFields = f.parameter_info.filter(p => p.initial).map(p => p.name);
    const initial = el('new-parameters');
    initial.replaceChildren();
    for (const p of f.parameter_info.filter(p => p.initial)) {
      const {label, input} = parameterInput(p, p.default);
      input.id = 'new-' + p.name.replaceAll('_', '-');
      initial.appendChild(label);
    }
    worldState.parameterInputs.clear();
    for (const id of Object.keys(parameterSections))
      el(id).replaceChildren();
    for (const p of f.parameter_info) {
      parameterLabels[p.name] = p.label;
      energyParameterHelp[p.name] = p.help;
    }
    for (const p of [...(f.parameter_info || [])].sort((a, b) => {
           const ka = parameterSection(a), kb = parameterSection(b);
           return ka.localeCompare(kb) ||
                  (parameterSections[ka].indexOf(a.name) - parameterSections[kb].indexOf(b.name));
         })) {
      if (p.group.startsWith('burst-') || [
            'assist_min_population', 'mutation', 'subgraph_mutation', 'step_evolution',
            'weight_share', 'add_node', 'add_connection', 'disable', 'node_edit', 'type_change',
            'gain_rate', 'gain_step', 'vision_water_red', 'vision_water_green', 'vision_water_blue'
          ].includes(p.name))
        continue;
      parameterLabels[p.name] = p.label;
      energyParameterHelp[p.name] = p.help;
      const {label, input} = parameterInput(p, f.parameters[p.name]);
      input.onchange = () => {
        if (!input.checkValidity()) {
          input.reportValidity();
          return;
        }
        command('parameter', {
          name : p.name,
          value : input.type === 'checkbox' ? Number(input.checked) : Number(input.value)
        });
      };
      worldState.parameterInputs.set(p.name, input);
      el(parameterSection(p)).appendChild(label);
    }
  }
  el('settings-search').oninput = el('settings-advanced').onchange = filterParameters;
  filterParameters();
  const color = el('water-color');
  color.disabled = !!f.historical;
  if (document.activeElement !== color)
    color.value =
        '#' + [ 'red', 'green', 'blue' ]
                  .map(channel => Math.round(255 * f.parameters['vision_water_' + channel])
                                      .toString(16)
                                      .padStart(2, '0'))
                  .join('');
  color.onchange = async () => {
    const hex = color.value;
    for (const [i, channel] of ['red', 'green', 'blue'].entries())
      await command('parameter', {
        name : 'vision_water_' + channel,
        value : parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255
      });
  };
  visionDiagram(f.parameters);
  for (const [name, input] of worldState.parameterInputs) {
    input.disabled = !!f.historical;
    if (document.activeElement !== input) {
      if (input.type === 'checkbox')
        input.checked = !!f.parameters[name];
      else
        input.value = String(f.parameters[name]);
    }
  }
  for (const [id, value] of [[ 'world-width', f.width ], [ 'world-height', f.height ],
                             [ 'flow', f.flow ], [ 'gravity', f.gravity ],
                             [ 'population-limit', f.population_limit ],
                             [ 'minimum-population', f.parameters.assist_min_population ]])
    if (document.activeElement !== el(id))
      el(id).value = String(value);
  renderCurrentSources(f);
  renderFeeders(f);
  toolSettings();
}

export function showBursts(f) {
  const parameters = (f.parameter_info || []).filter(p => p.group.startsWith('burst-'));
  const signature = parameters.map(p => p.name).join('/');
  if (signature !== world_parametersState.burstSignature) {
    world_parametersState.burstSignature = signature;
    world_parametersState.burstInputs.clear();
    el('burst-settings').replaceChildren();
    for (const [group, title] of [[ 'burst-food', t('world_parameters.futter') ],
                                  [ 'burst-mutation', t('world_parameters.mutation') ]]) {
      const box = document.createElement('fieldset'), legend = document.createElement('legend');
      legend.textContent = title;
      box.appendChild(legend);
      for (const suffix of ['strength', 'gap', 'duration']) {
        const p = parameters.find(p => p.group === group && p.name.endsWith('_' + suffix));
        if (!p)
          continue;
        const label = document.createElement('label'), name = document.createElement('span'),
              input = document.createElement('input'), output = document.createElement('output');
        label.className = 'burst-slider';
        name.textContent = suffix === 'gap'             ? t('world_parameters.abstandEtwa')
                           : suffix === 'duration'      ? t('world_parameters.dauerEtwa')
                           : group === 'burst-mutation' ? t('world_parameters.staerkereNachkommen')
                           : group === 'burst-food'     ? t('world_parameters.futterImSchub')
                                                        : t('world_parameters.hilfeImSchub');
        input.type = 'range';
        const log = suffix !== 'strength', lo = p.min, hi = p.max;
        input.min = 0;
        input.max = log ? 1000 : group === 'burst-mutation' ? 100 : p.max;
        input.step = log ? 1 : group === 'burst-mutation' ? 1 : .1;
        const decode = raw =>
                  log ? Math.round(Math.exp(Math.log(lo) +
                                            (Number(raw) / 1000) * (Math.log(hi) - Math.log(lo))))
                      : Number(raw),
              encode = value => log ? 1000 * (Math.log(Math.max(lo, value)) - Math.log(lo)) /
                                          (Math.log(hi) - Math.log(lo))
                                    : value;
        const format = value =>
            suffix === 'gap' || suffix === 'duration' ? t('units.steps', {n : Math.round(value)})
            : group === 'burst-mutation'
                ? t('units.percent', {n : Math.round(value)})
                : t('world_parameters.factor',
                    {n : formatNumber(group === 'burst-food' ? 1 + value : value, 1)});
        input.oninput = () => {
          movingSliders.add(p.name);
          output.textContent = format(decode(input.value));
        };
        input.onchange = async () => {
          try {
            await command('parameter', {
              name : p.name,
              value : decode(input.value) /
                          (group === 'burst-mutation' && suffix === 'strength' ? 100 : 1)
            });
          } finally {
            movingSliders.delete(p.name);
            sliderHold.set(p.name, Date.now() + 500);
          }
        };
        input.onpointercancel = () => movingSliders.delete(p.name);
        input.title = suffix === 'gap'        ? t('world_parameters.mittlererAbstandDerSchuebe')
                      : suffix === 'duration' ? t('world_parameters.mittlereDauerEinesSchubs')
                      : group === 'burst-food'
                          ? t('world_parameters.futterrateWaehrendEinesSchubs')
                          : t('world_parameters.anteilStarkMutierterNachkommen');
        world_parametersState.burstInputs.set(p.name,
                                              {input, output, group, suffix, format, encode});
        label.appendChild(name);
        label.appendChild(output);
        label.appendChild(input);
        box.appendChild(label);
      }
      el('burst-settings').appendChild(box);
    }
  }
  for (const [name, item] of world_parametersState.burstInputs) {
    const {input, output, group, suffix, format, encode} = item;
    input.disabled = !!f.historical || group === 'burst-support' && !!f.assistance?.top_up;
    if (movingSliders.has(name) || (sliderHold.get(name) || 0) > Date.now())
      continue;
    const value =
        f.parameters[name] * (group === 'burst-mutation' && suffix === 'strength' ? 100 : 1);
    input.value = String(encode(value));
    output.textContent = format(value);
  }
  text('burst-status',
       [ [ 'food', t('world_parameters.futter') ], [ 'mutation', t('world_parameters.mutation') ] ]
           .map(([ id, label ]) => label + ': ' +
                                   (!f.parameters?.['burst_' + id + '_strength']
                                        ? t('world_parameters.gleichmaessig')
                                    : f.bursts?.[id]?.active ? t('world_parameters.schub')
                                                             : t('world_parameters.ruhephase')))
           .join(' · '));
  const mutation = world_parametersState.burstInputs.get('burst_mutation_strength');
  if (mutation)
    mutation.input.title = t('world_parameters.anteilDerNachkommenMit');
}

const initializers = {
  "newEnergyFields" : () => { newEnergyFields = []; },
  "energyParameterHelp" : () => { energyParameterHelp = {}; },
  "parameterSections" : () => {
    parameterSections = {
      'source-settings' : [ 'cloud_density', 'energy_supply', 'fish_energy_density' ],
      'foodweb-settings' : [],
      'plant-settings' : [
        'algae_rate', 'grass_rate', 'algae_capacity', 'grass_capacity', 'algae_thickness',
        'grass_length'
      ],
      'light-settings' : [ 'light_bottom', 'light_shadow' ],
      'sediment-settings' : [ 'sediment_half_life', 'sediment_path', 'sediment_reach' ],
      'food-settings' : [
        'food_cluster', 'food_spread', 'source_motion', 'food_sink', 'food_min', 'food_max',
        'food_half_life', 'food_bright'
      ],
      'support-settings' : [
        'assist_min_population',
        'yolk',
        'breeder_slots',
        'breeder_offspring_weight',
      ],
      'reproduction-settings' : [
        'nutrient_egg_threshold', 'recruitment_target', 'egg_reserve', 'egg_fill_rate',
        'egg_capacity', 'egg_organ_capacity', 'egg_overhead', 'sperm_fill_rate', 'sperm_capacity',
        'sperm_portion', 'sperm_mixing', 'sperm_dilution', 'sperm_opaque', 'selfing_delay',
        'fertilisation_wait', 'egg_crowding_radius', 'egg_crowding_limit'
      ],
      'energy-settings' : [
        'sinking', 'bladder_strength', 'bladder_rate', 'bladder_cost', 'basal_metabolism',
        'muscle_work_cost', 'pump_volume_cost', 'suction_range', 'stroke_push', 'stroke_turn',
        'size_physics', 'bite_wound', 'wound_weakness', 'impact_damage', 'senescence_start',
        'senescence_rate'
      ],
      'senses-settings' : [
        'water_clarity', 'ink_density', 'vision_range', 'vision_inhibition', 'odor_emission',
        'odor_mixing', 'odor_lifetime_food', 'odor_lifetime_algae', 'odor_lifetime_plants',
        'odor_lifetime_worms', 'odor_lifetime_plankton', 'odor_lifetime_carrion',
        'odor_lifetime_eggs'
      ],
      'evolution-settings' :
          [ 'mating_distance', 'novelty_strength', 'novelty_neighbors', 'duplicate' ],
      'computation-settings' : [
        'development_queries',
        'development_query_limit',
        'development_finalizations',
      ],
      'disease-settings' : [
        'disease_rate', 'disease_duration', 'disease_harm', 'disease_reach', 'disease_spread',
        'disease_food', 'disease_carrion'
      ]
    };
  },
  "el" : () => {
    for (const [id, op] of [[ 'flow', 'flow' ], [ 'gravity', 'gravity' ],
                            [ 'population-limit', 'limit' ],
                            [ 'minimum-population', 'minimum-population' ]])
      el(id).onchange = e =>
          id === 'minimum-population'
              ? command('parameter',
                        {name : 'assist_min_population', value : Number(e.target.value)})
              : command(op, {value : Number(e.target.value)});
  },
  "resize_world_onclick" : () => {
    el('resize-world').onclick = () => command(
        'size',
        {width : Number(el('world-width').value), height : Number(el('world-height').value)});
  },
  "clear_food_onclick" : () => { el('clear-food').onclick = () => command('clear-food'); },
  "burstSignature" : () => { world_parametersState.burstSignature = ''; },
  "burstInputs" : () => { world_parametersState.burstInputs = new Map(); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
