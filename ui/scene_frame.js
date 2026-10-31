import {t} from './strings.js';
import {BinaryScene} from './binary_scene.js';
import {FISH_FLAGS} from './render_schema.js';
import {FISH, INVERTEBRATE} from './schema.js';

const shapeColumns =
    [ FISH.organs, FISH.fins, FISH.forms, FISH.contour, FISH.regions, FISH.body_geometry ];
const fishColumns = Object.entries(FISH).filter(([, column ]) => column < FISH.count &&
                                                                 column !== FISH.morphology_asset);
const invertebrateColumns =
    Object.entries(INVERTEBRATE).filter(([, column ]) => column < INVERTEBRATE.count);
const flagColumns = {
  hatched : FISH.hatched,
  fertilised : FISH.fertilised,
  nutrient_egg : FISH.nutrient_egg,
  egg_laying : FISH.egg_laying,
  clonal : FISH.clonal,
  egg_organs : FISH.egg_organs,
  sperm_organs : FISH.sperm_organs
};

export class SceneDecoder {
  constructor() {
    this.binary = new BinaryScene();
    this.inspection = null;
    this.textDecoder = new TextDecoder();
  }
  accept(buffer) {
    const view = new DataView(buffer), textDecoder = this.textDecoder;
    if (view.byteLength < 16 || view.getUint32(0, false) !== 0x46535631)
      throw Error(t('scene_frame.unbekanntesBildpaket'));
    const sizes = [ 4, 8, 12 ].map(i => view.getUint32(i, true));
    if (sizes.reduce((a, b) => a + b, 16) !== view.byteLength)
      throw Error(t('scene_frame.unvollstaendigesBildpaket'));
    const [size, assetSize, inspectionSize] = sizes, assetStart = 16 + size,
                            inspectionStart = assetStart + assetSize,
                            assets = JSON.parse(
                                textDecoder.decode(new Uint8Array(buffer, assetStart, assetSize))),
                            packet = JSON.parse(textDecoder.decode(
                                new Uint8Array(buffer, inspectionStart, inspectionSize))),
                            previous = this.binary.records, light = this.binary.light,
                            sediment = this.binary.sediment, plankton = this.binary.plankton;
    let inspection;
    if (!this.inspection || packet.inspection_id !== this.inspection.inspection_id) {
      if (!('fish' in packet))
        throw Error(t('scene_frame.inspektionsdatenFehlen'));
      inspection = packet;
    }
    const header = this.binary.accept(new DataView(buffer, 16, size));
    if (inspection)
      this.inspection = inspection;
    return {
      header,
      assets,
      inspection,
      records : Object.fromEntries(
          Object.entries(this.binary.records).filter(([ kind, rows ]) => rows !== previous[kind])),
      light : light === this.binary.light ? undefined : this.binary.light,
      sediment : sediment === this.binary.sediment ? undefined : this.binary.sediment,
      plankton : plankton === this.binary.plankton ? undefined : this.binary.plankton
    };
  }
}

// Owns the display state independently of statistics and the DOM.
export class DisplayScene {
  constructor() { this.reset(); }
  reset() {
    this.decoder = new SceneDecoder();
    this.binary = new BinaryScene();
    this.assets = {};
    this.metadata = null;
    this.inspection = null;
    this.lastScene = this.lastMetadata = this.lastRecords = this.lastInspection = null;
    this.byId = new Map();
    this.lightSource = this.light = null;
    this.sedimentSource = this.sediment = null;
    this.planktonSource = this.plankton = null;
  }
  shape(row, id) {
    const shape = this.assets[id];
    if (!shape)
      throw Error(t('scene_frame.koerperformFehlt'));
    shapeColumns.forEach((column, i) => row[column] = shape[i]);
    return row;
  }
  fish(id, value, step) {
    const row = (this.byId.get(id) || new Array(FISH.count).fill(0)).slice();
    for (const [name, column] of fishColumns)
      if (name in value)
        row[column] = value[name];
    row[FISH.id] = id;
    row[FISH.age] = step - value.birth_step;
    row[FISH.adult_age] = value.hatch_step >= 0 ? step - value.hatch_step : 0;
    row[FISH.energy] = value.energy * value.reserve_capacity;
    row[FISH.egg_yolk] = value.egg_yolk * value.egg_capacity;
    row[FISH.sperm_store] = value.sperm_store * value.sperm_capacity;
    row[FISH.hatch_shape] = [ value.hatch_radius, value.birth_tissue ];
    for (const [flag, column] of Object.entries(flagColumns))
      row[column] = Number(!!(value.flags & FISH_FLAGS[flag]));
    const ages = [ value.fin_age_left, value.fin_age_right ],
          peaks = [ value.fin_peak_tail, value.fin_peak_left, value.fin_peak_right ];
    row[FISH.fin_pose] = peaks.map(
        (peak, i) => Math.abs(peak) * Math.pow(.55, Math.max(0, row[FISH.age] - ages[i ? 1 : 0])));
    row[FISH.fin_pose].push([...ages, ...peaks ]);
    return this.shape(row, value.morphology_asset);
  }
  accept(buffer, metadata) { return this.acceptPrepared(this.decoder.accept(buffer), metadata); }
  acceptPrepared(packet, metadata) {
    const {header, assets} = packet;
    if (packet.inspection)
      this.inspection = packet.inspection;
    const inspection = this.inspection;
    if (packet.plankton)
      this.binary.plankton = packet.plankton;
    this.binary.sequence = header.sequence;
    this.binary.header = header;
    this.binary.records = {...this.binary.records, ...packet.records};
    if (packet.light)
      this.binary.light = packet.light;
    if (packet.sediment)
      this.binary.sediment = packet.sediment;
    this.assets =
        Object.fromEntries(assets.ids.map(id => [id, assets.values[id] ?? this.assets[id]]));
    if (header.epoch !== String(metadata.render_epoch) ||
        (inspection.context ?? 0) !== (metadata.view_context ?? 0))
      return null;
    const records = this.binary.records;
    if (header.paused && this.lastMetadata === metadata && this.lastInspection === inspection &&
        this.lastScene?.step === header.step && this.lastScene.paused &&
        this.lightSource === this.binary.light && this.sedimentSource === this.binary.sediment &&
        this.planktonSource === this.binary.plankton &&
        Object.keys(records).every(kind => records[kind] === this.lastRecords?.[kind]))
      return this.lastScene;
    this.lastMetadata = metadata;
    this.lastInspection = inspection;
    this.lastRecords = records;
    if (this.metadata !== metadata.fish) {
      this.metadata = metadata.fish;
      this.byId = new Map(metadata.fish.map(p => [p[FISH.id], p]));
    }
    const visible = new Map(
        [...this.binary.records.fish ].map(([ id, p ]) => [id, this.fish(id, p, header.step)]));
    if (inspection.fish) {
      const row = inspection.fish.slice(), asset = row[FISH.morphology_asset];
      visible.set(row[FISH.id], this.shape(row, asset));
    }
    const fish = metadata.fish.map(row => visible.get(row[FISH.id]) || row);
    for (const [id, row] of visible)
      if (!this.byId.has(id))
        fish.push(row);
    const each = (kind, make) => [...this.binary.records[kind]].map(([ id, p ]) => make(p, id));
    if (this.lightSource !== this.binary.light || this.lightBase !== metadata.light) {
      this.lightSource = this.binary.light;
      this.lightBase = metadata.light;
      this.light = {...metadata.light, ...this.binary.light};
    }
    if (this.sedimentSource !== this.binary.sediment) {
      this.sedimentSource = this.binary.sediment;
      this.sediment =
          {...metadata.sediment, ...this.binary.sediment, amounts : this.binary.sediment.values};
    }
    if (this.planktonSource !== this.binary.plankton) {
      this.planktonSource = this.binary.plankton;
      this.plankton = {...this.binary.plankton, amounts : this.binary.plankton?.values};
    }
    return this.lastScene = {
      ...metadata,
      step : header.step,
      width : header.width,
      height : header.height,
      paused : header.paused,
      selected : inspection.selected,
      fish,
      visibleFish : new Set(visible.keys()),
      food : each('food', (p, id) => [p.x, p.y, p.energy, id, header.step - p.birth_step,
                                      p.bottom_step < 0 ? 0 : header.step - p.bottom_step, p.radius,
                                      p.origin, p.red, p.green, p.blue]),
      invertebrates : each('invertebrate',
                           (p, id) => {
                             const row = new Array(INVERTEBRATE.count).fill(0);
                             for (const [name, column] of invertebrateColumns)
                               if (name in p)
                                 row[column] = p[name];
                             row[INVERTEBRATE.id] = id;
                             row[INVERTEBRATE.red] = p.kind === 7 ? .7 : p.kind === 8 ? .55 : .25;
                             row[INVERTEBRATE.green] = p.kind === 7 ? .15 : .3;
                             row[INVERTEBRATE.blue] = p.kind === 7 ? .15 : p.kind === 8 ? .2 : .35;
                             return row;
                           }),
      plankton : this.plankton,
      corpses : each('corpse',
                     (p, id) => [p.x, p.y, p.energy, header.step - p.birth_step, p.red, p.green,
                                 p.blue, id, p.angle, p.radius, p.initial_energy, p.hatched,
                                 p.bone_age, this.assets[p.morphology_asset], p.source_id,
                                 p.species, p.death_cause, p.bone_time, p.resting, p.sink_phase]),
      gametes : each('gamete', (p, id) => [p.x, p.y, p.density, p.red, p.green, p.blue, id]),
      wounds : each('wound', (p, id) => [id, p.loss, p.x, p.y, p.nx, p.ny, p.radius, p.vx, p.vy]),
      light : this.light,
      sediment : this.sediment,
      vision : inspection.vision,
      brain : Object.hasOwn(inspection, 'brain') ? inspection.brain : metadata.brain
    };
  }
}
