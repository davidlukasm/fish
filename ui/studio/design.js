import {
  beyondHandles,
  clearOfFish,
  nearAnswers,
  nearObject,
  sightLegend,
  spectrumEditor,
  visionFan
} from './view/vision.js';
import {defaultSight, sightScene} from './model/sight.js';
import {probeFor, senseScene} from './model/probe.js';
import {
  groundOptions,
  gutProbeControls,
  probeFlow,
  probeGround,
  probeHandle,
  probeScents,
  probeWater,
  senseProbeSvg
} from './view/probes.js';
import {eyeSight, eyeTypeAnswers} from '../organ_readout.js';
import {drawOrganGraphic} from '../organ_graphics.js';
import {SENSE_TISSUE} from '../tissue.js';
import {PRESSURE_OF} from './model/organs.js';
import {RECEPTOR} from '../schema.js';
import {
  allCenters,
  centerIndex,
  compileDocument,
  findOrgan,
  pressureSites,
  organOf,
  placeNode,
  pressureMismatches
} from './model/document.js';
import {sideOf} from './model/layout.js';
import {dataAttribute} from './view/markup.js';
import {organSettingsBlock} from './view/panels.js';
import {mountLive} from './view/live/kit.js';
import {label} from './view/kit.js';
import {previewContextOf} from './view/development.js';
import {hormoneTime} from './view/substances.js';
import {requestBody} from './requests.js';
import {BODY_MAP, PROBE_LAYER} from './view/scene.js';
import {outlineSizes, paintMouthStep} from './view/body.js';
import {newFishDocument} from './canvas_placement.js';

const PRESSURE_TRIES = 12, PRESSURE_BATCH = 'pressure';
const nativeProbe = probe => probe?.kind === 'ground' ? null : probe;
export const designMethods = {
  async newFish(initial = false) {
    if (!this.state.sites.length) {
      this.notice(label('errors.sitesUnavailable'));
      return false;
    }
    const request = ++this.newFishRequest, previous = this.state.document, sites = this.state.sites;
    const current = () => request === this.newFishRequest && this.state.document === previous;
    if (!initial)
      this.notice('');
    try {
      let document = newFishDocument(label('app.newFish'), sites);
      const sensors = allCenters(document).filter(c => PRESSURE_OF[c.organType]?.key === c.key);
      const probe = async doc => {
        const answer = await this.api(requestBody('design', {plan : compileDocument(doc, sites)}));
        if (!Array.isArray(answer.pressure) ||
            sensors.some(c => !(answer.pressure[centerIndex(doc, c.id)] >= 0)))
          throw Error(label('errors.pressurePlacement'));
        return answer;
      };
      let anatomy = await probe(document), attempts = PRESSURE_TRIES * sensors.length;
      // The new body's actual geometry must settle before it enters history or the saved draft.
      while (current()) {
        const wrong = pressureMismatches(document, anatomy.pressure);
        if (!wrong.length) {
          if (initial)
            this.state.document = document;
          else {
            this.loadFish(document);
            this.refreshHubDraft();
          }
          return true;
        }
        let improved = false;
        for (const center of wrong) {
          for (const site of pressureSites(document, center.id, sites, anatomy)
                   .slice(0, PRESSURE_TRIES)) {
            if (attempts-- <= 0)
              break;
            const moved = placeNode(document, center.id, site.id, sites);
            if (!moved)
              continue;
            const answer = await probe(moved);
            if (!current())
              return false;
            if (pressureMismatches(moved, answer.pressure).length < wrong.length) {
              document = moved;
              anatomy = answer;
              improved = true;
              break;
            }
          }
          if (improved || attempts <= 0)
            break;
        }
        if (!improved)
          throw Error(label('errors.pressurePlacement'));
      }
    } catch (error) {
      if (current())
        this.notice(error.message);
    }
    return false;
  },
  bringProbes() {
    const id = this.state.selected?.id, doc = this.state.document;
    const organ = organOf(doc, id);
    if (!organ) {
      this.framedProbe = null;
      return;
    }
    const anatomy = this.shownDesign === doc ? this.state.anatomy : null;
    const sense = probeFor(organ, this.state.senseProbe, anatomy, doc);
    const faintest = this.state.anatomy?.lightDimmest;
    if (!sense || sense.kind === 'gut' || (sense.kind === 'ground' && sense.buried))
      this.framedProbe = null;
    else if ((sense.kind === 'ground' || faintest > 0) && sense !== this.framedProbe &&
             !this.handleDrag) {
      const flow = probeFlow(sense);
      this.framedProbe = sense;
      this.keepInView(probeHandle(sense, faintest, sense.kind, this.state));
      if (sense.kind === 'attack')
        this.keepInView(probeHandle(sense, faintest, 'attack-gape', this.state));
      if (flow && flow !== sense)
        this.keepInView(probeHandle(flow, faintest));
    }
    if (sense && sense !== this.state.senseProbe) {
      this.state.senseProbe = sense;
      if (nativeProbe(sense))
        this.requestDesign();
    }
    if (!organ.field || !this.state.capabilities)
      return;
    const side = sideOf(organ), probe = this.state.sightProbe;
    let next = !probe ? defaultSight(organ, this.state.capabilities, this.state.anatomy)
               : probe.side !== side ? {...probe, side, bearing : -probe.bearing}
                                     : probe;
    if (organ.type === 'proximity')
      next = nearObject(this.state, organ, next);
    next = clearOfFish(this.state, organ, next);
    if (!probe && organ.type === 'eye')
      next = beyondHandles(this.state, organ, next);
    // A short near field can pull a large object into the fish; clearing it restores its old
    // position. Keep that probe's identity so an anatomy answer cannot request itself again.
    if (next && next !== probe &&
        (!probe || Object.entries(next).some(([ key, value ]) => probe[key] !== value))) {
      this.state.sightProbe = next;
      this.requestDesign();
    }
  },
  senseScene() {
    const probe = this.state.senseProbe;
    return probe && findOrgan(this.state.document, probe.organ) ? senseScene(probe) : null;
  },
  // The mouth's inspector tries one beat of the mouth: the closer begins `delay` steps after the
  // opener, the gills pump along or not (anatomy.mouthCourse).
  setMouthCommand(organId, delay, gills) {
    this.tryCommand(organId, {kind : 'mouth', delay, gills});
  },
  // A command an inspector tries on its organ: asked of the engine once, not again for its own
  // answer.
  tryCommand(organId, scene) {
    const probe = this.state.senseProbe, key = JSON.stringify(scene);
    if (probe?.organ === organId && probe.key === key)
      return;
    this.state.senseProbe = {...scene, organ : organId, key};
    this.requestDesign();
  },
  showMouthStep(organId, sample) {
    if (organOf(this.state.document, this.state.selected?.id)?.id === organId)
      paintMouthStep(this.bodyMap(), sample);
  },
  setAttackCommand(command) {
    const probe = this.state.senseProbe;
    if (probe?.kind === 'attack' && probe.strength !== command) {
      this.state.senseProbe = {...probe, strength : command};
      this.requestDesign();
    }
  },
  requestDesign() {
    const draft = this.drafted && this.draftPreview;
    if (this.designRunning || (this.drafted && !draft)) {
      this.designPending = true;
      return;
    }
    const document = this.state.document, probe = this.state.sightProbe,
          sense = nativeProbe(this.state.senseProbe),
          plan = compileDocument(document, this.state.sites);
    this.designRunning = true;
    this.designPending = false;
    const request = ++this.designRequest, fishRequest = this.newFishRequest;
    const spineDraft = draft?.key.startsWith('spine-'), colourDraft = draft?.key === 'colour';
    const scene = draft ? {sense : spineDraft ? this.senseScene() : null} : {
      lightSpread : this.state.lightSpread?.document !== document,
      sight : sightScene(probe),
      sense : this.senseScene()
    };
    // The blood every estimate of the engine is made at is the life tool's (atelier_service.py,
    // learning_context_line).
    this.api(requestBody('design', {plan, ...scene, blood : previewContextOf(this.state)}))
        // An answer for the design shown is shown even when a test stimulus has moved on since:
        // the eyes and senses follow a dragged one step by step instead of waiting for it to
        // rest.
        .then(anatomy => {
          if (draft) {
            // Follow the drag with the last completed outline, even as the pointer moves on.
            if (this.drafted && this.draftPreview === draft &&
                this.state.document !== this.draftStart && this.newFishRequest === fishRequest) {
              const shape = () => {
                const report = this.state.outlinePreview ?? this.state.anatomy;
                if (colourDraft)
                  return JSON.stringify(report?.colour);
                return JSON.stringify([outlineSizes(this.state),
                                       spineDraft && [report?.spinesRest, report?.spinesRaised,
                                                      report?.spineGroups, report?.attackProbe],
                                       draft.key === 'field' && report?.lateral,
                                       draft.key === 'receptor' &&
                                           report?.groups?.map(g => g.responses)]);
              };
              const previous = shape();
              this.state.outlinePreview = anatomy;
              if (shape() !== previous) {
                this.refreshScene();
                if (colourDraft)
                  this.refreshLive();
                // A receptor's curve is the engine's: the inspector follows each answer.
                if (draft.key === 'receptor')
                  this.refreshDragged();
              }
            }
          } else if (this.state.document === document)
            this.showAnatomy(anatomy, request);
        })
        .catch(error => {
          if (!draft && this.newFishRequest === fishRequest && this.state.document === document &&
              this.state.sightProbe === probe && nativeProbe(this.state.senseProbe) === sense)
            this.notice(error.message);
        })
        .finally(() => {
          this.designRunning = false;
          if (this.designPending || this.state.document !== document ||
              this.state.sightProbe !== probe || nativeProbe(this.state.senseProbe) !== sense)
            this.requestDesign();
        });
  },
  showAnatomy(anatomy, request) {
    const probesOnly = this.shownDesign === this.state.document;
    const spineChange = JSON.stringify(this.state.anatomy?.attackProbe?.spines) !==
                        JSON.stringify(anatomy.attackProbe?.spines);
    this.shownDesign = this.state.document;
    if (anatomy.lightSpread)
      this.state.lightSpread = {document : this.state.document, report : anatomy.lightSpread};
    if (anatomy.senseSpread)
      this.state.senseSpread = {document : this.state.document, report : anatomy.senseSpread};
    this.state.outlinePreview = null;
    this.state.anatomy = anatomy;
    if (this.state.station === 'hub')
      this.refreshHubDraft();
    this.bringProbes();
    // A newly answered stimulus already rebuilds the scene and inspector with this anatomy.
    const traced = this.traceAnswered(request);
    if (probesOnly) {
      if (!traced) {
        if (spineChange)
          this.refreshScene();
        this.refreshVision();
        this.drawSight();
        this.refreshProbes();
      }
      return;
    }
    this.refreshHeader();
    if (!traced) {
      this.refreshScene();
      this.refreshGraphics();
    }
    if (this.state.tool === 'hormone' && !this.state.selected && !traced)
      this.refreshInspector();
    this.checkPressure();
  },
  async checkPressure() {
    const doc = this.state.document, pressure = this.state.anatomy?.pressure;
    if (!Array.isArray(pressure) || this.pressureChecked === doc)
      return;
    this.pressureChecked = doc;
    const wrong = pressureMismatches(doc, pressure);
    for (const center of wrong) {
      const index = centerIndex(doc, center.id);
      for (const site of pressureSites(doc, center.id, this.state.sites, this.state.anatomy)
               .slice(0, PRESSURE_TRIES)) {
        const moved = placeNode(doc, center.id, site.id, this.state.sites);
        const answer =
            moved &&
            await this.api(requestBody('design', {plan : compileDocument(moved, this.state.sites)}))
                .catch(() => null);
        if (this.state.document !== doc)
          return;
        if (answer?.pressure?.[index] === PRESSURE_OF[center.organType].source) {
          // The move belongs to the change that misplaced the sensor: it joins that undo step, so
          // undo steps back past both instead of being redone at once.
          this.historyBatch = PRESSURE_BATCH;
          this.changeDocument(moved, this.state.selected, true, PRESSURE_BATCH, true);
          return this.notice(label('status.pressureMoved'));
        }
      }
    }
  },
  refreshVision() {
    this.redrawBlocks('visionOrgan', findOrgan, organ => visionFan(this.state, organ), BODY_MAP);
  },
  refreshGraphics() {
    this.redrawBlocks('hormoneTime', (doc, id) => ({index : Number(id)}),
                      item => hormoneTime(this.state, item.index));
    if (!this.handleDrag)
      this.redrawBlocks('organSettings', findOrgan, organ => organSettingsBlock(this.state, organ));
    else {
      this.refreshSpectrum();
      this.refreshProbeControls();
    }
    this.drawSight();
    // The scene and organSettings already include their probe graphics and controls.
  },
  refreshProbes() {
    const map = this.bodyMap(), layer = map?.querySelector('#' + PROBE_LAYER),
          ground = map?.querySelector('[data-probe-ground]');
    if (ground)
      ground.innerHTML = probeGround(this.state);
    if (layer) {
      const controls = layer.querySelector('[data-probe-controls]'),
            water = layer.querySelector('[data-probe-water]'), current = probeWater(this.state);
      controls.innerHTML = senseProbeSvg(this.state);
      if (water.dataset.probeWater !== (current?.key ?? '')) {
        water.dataset.probeWater = current?.key ?? '';
        water.innerHTML = current?.svg() ?? '';
      }
    }
    const scents = this.root.querySelector('[data-probe-scents-layer]');
    if (scents)
      scents.innerHTML = probeScents(this.state) + groundOptions(this.state);
    this.refreshProbeControls();
  },
  refreshProbeControls() {
    this.redrawBlocks('nearAnswers', findOrgan, organ => nearAnswers(this.state, organ));
    this.redrawBlocks('gutProbeControls', findOrgan, organ => gutProbeControls(this.state, organ));
    if ([ 'smell', 'taste', 'touch', 'wound', 'flow', 'balance', 'attack', 'ground', 'mouth' ].includes(
            this.state.senseProbe?.kind))
      mountLive(this.root, this);
  },
  drawSight() {
    const sight = this.state.anatomy?.sight;
    for (const canvas of this.root.querySelectorAll('[data-sight-eye]')) {
      const side = Number(canvas.dataset.sightEye);
      const receptors =
          (sight?.receptors ??
           []).filter(r => !r[RECEPTOR.proximity] && (r[RECEPTOR.lateral] < 0 ? 0 : 1) === side);
      canvas.closest('figure').hidden = !receptors.length;
      if (!receptors.length)
        continue;
      const seen = eyeSight(sight.bands, sight.samples, receptors, side);
      drawOrganGraphic(canvas, seen, null, {key : SENSE_TISSUE.light});
      // Each row's mark names its cell type below the picture.
      const legend = canvas.closest('figure').querySelector('[data-sight-legend]');
      if (legend)
        legend.innerHTML = sightLegend(eyeTypeAnswers(seen));
    }
  },
  refreshSpectrum() {
    const block = this.root.querySelector('[data-spectrum-block]');
    const editor = block?.querySelector('[data-spectrum]');
    const target = editor && this.spectrumTarget(editor.dataset);
    if (target)
      block.outerHTML = spectrumEditor(this.state, target.organ, target.tuning);
  },
  redrawBlocks(key, find, render, within = '') {
    const selector = `[${dataAttribute(key)}]`;
    for (const block of this.root.querySelectorAll(within ? within + ' ' + selector : selector)) {
      const found = find(this.state.document, block.dataset[key], block);
      if (found)
        block.outerHTML = render(found);
    }
    // A redrawn block has new places for the live inspectors.
    mountLive(this.root, this);
  }
};
