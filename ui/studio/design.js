import {
  beyondHandles,
  clearOfFish,
  nearAnswers,
  nearObject,
  sightLegend,
  spectrumEditor,
  visionFan
} from './view/vision.js';
import {
  effectorGraphic,
  gillGraphic,
  gutGraphic,
  gutMuscleGraphic,
  spineField
} from './view/effectors.js';
import {lateralField} from './view/lateral.js';
import {hairField} from './view/balance.js';
import {bladderGraphic, gonadGraphic} from './view/sacs.js';
// Organs whose sense pictures are drawn again while one of their handles is dragged.
const SENSE_PICTURES = Object.freeze({
  lateral : lateralField,
  balance : (state, organ, held) => hairField(state, organ, selectedCenter(state, organ), held),
  blood : (state, organ, held) => hormonePad(state, organ, selectedCenter(state, organ), held),
  bladder : (state, organ, held) => bladderGraphic(state, organ, state.selected, held),
  gland : (state, organ) => glandProfile(state, organ, selectedCenter(state, organ)),
  eggs : (state, organ, held) => gonadGraphic(state, organ, selectedCenter(state, organ), held),
  sperm : (state, organ, held) => gonadGraphic(state, organ, selectedCenter(state, organ), held)
});
import {defaultSight, sightScene} from './model/sight.js';
import {probeFor, senseScene} from './model/probe.js';
import {probeHandle, probeScents, senseProbeSvg, gutProbeControls} from './view/probes.js';
import {scentMap} from './view/scents.js';
import {pigmentInspector} from './view/pigments.js';
import {skinField} from './view/skin.js';
import {eyeSight, eyeTypeAnswers} from '../organ_readout.js';
import {drawOrganGraphic} from '../organ_graphics.js';
import {SENSE_TISSUE} from '../tissue.js';
import {PRESSURE_OF} from './model/organs.js';
import {RECEPTOR} from '../schema.js';
import {
  centerIndex,
  compileDocument,
  findCenter,
  findOrgan,
  pressureSites,
  organOf,
  placeNode,
  pressureMismatches
} from './model/document.js';
import {sideOf} from './model/layout.js';
import {dataAttribute} from './view/markup.js';
import {organSettingsBlock, selectedCenter} from './view/panels.js';
import {label} from './view/kit.js';
import {glandProfile, hormonePad, hormoneTime} from './view/substances.js';
import {requestBody} from './requests.js';
import {BODY_MAP, PROBE_LAYER} from './view/scene.js';

const PRESSURE_TRIES = 12, PRESSURE_BATCH = 'pressure';
export const designMethods = {
  refreshPigment() {
    const selected = this.state.selected;
    this.redrawBlocks('pigmentBlock', findOrgan, organ => {
      const chosen = selected?.kind === 'center' && organ.centers.find(c => c.id === selected.id);
      return pigmentInspector(this.state, organ, chosen || organ.centers[0]);
    });
  },
  refreshSkin() {
    // A dragged sensitivity sits in the report below the skin.
    const drag = this.heldHandle('sense');
    this.redrawBlocks('skinBlock', findCenter,
                      found => skinField(this.state, found.organ, found.center,
                                         drag?.id === found.center.id ? drag.sensitive : null));
  },
  refreshSense() {
    const drag = this.heldHandle('sense');
    this.redrawBlocks('senseBlock', findOrgan, organ => {
      const draw = SENSE_PICTURES[organ.type];
      return draw ? draw(this.state, organ, drag?.organ === organ.id ? drag.sensitive : null) : '';
    });
  },
  refreshScentMaps() {
    const drag = this.heldHandle('sense');
    this.redrawBlocks('scentBlock', findCenter,
                      found => scentMap(found.organ, found.center, this.state,
                                        drag?.id === found.center.id ? drag.sensitive : null));
  },
  bringProbes() {
    const id = this.state.selected?.id, doc = this.state.document;
    const organ = organOf(doc, id);
    if (!organ)
      return;
    const sense = probeFor(organ, this.state.senseProbe);
    if (sense && sense !== this.state.senseProbe) {
      // A new scent lies a few lengths out; the view widens to show it.
      if (sense.kind === 'smell' && sense.organ !== this.state.senseProbe?.organ)
        this.keepInView(probeHandle(sense, this.state.anatomy?.lightDimmest));
      this.state.senseProbe = sense;
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
  requestDesign() {
    // A drag asks for its design run once, when it is let go.
    if (this.designRunning || this.drafted) {
      this.designPending = true;
      return;
    }
    this.designRunning = true;
    this.designPending = false;
    const request = ++this.designRequest;
    const document = this.state.document, probe = this.state.sightProbe,
          sense = this.state.senseProbe;
    this.api(requestBody('design', {
          plan : compileDocument(document, this.state.sites),
          sight : sightScene(probe),
          sense : this.senseScene()
        }))
        // An answer for the design shown is shown even when a test stimulus has moved on since:
        // the eyes and senses follow a dragged one step by step instead of waiting for it to
        // rest.
        .then(anatomy => {
          if (this.state.document === document)
            this.showAnatomy(anatomy, request);
        })
        .catch(error => this.notice(error.message))
        .finally(() => {
          this.designRunning = false;
          if (this.designPending || this.state.document !== document ||
              this.state.sightProbe !== probe || this.state.senseProbe !== sense)
            this.requestDesign();
        });
  },
  showAnatomy(anatomy, request) {
    const probesOnly = this.shownDesign === this.state.document;
    this.shownDesign = this.state.document;
    this.state.anatomy = anatomy;
    this.bringProbes();
    // A newly answered stimulus already rebuilds the scene and inspector with this anatomy.
    const traced = this.traceAnswered(request);
    if (probesOnly) {
      if (!traced) {
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
      this.refreshSkin();
      this.refreshSpectrum();
      this.refreshEffectors();
      this.refreshPigment();
      this.refreshProbeControls();
    }
    this.drawSight();
    // The scene and organSettings already include their probe graphics and controls.
  },
  refreshProbes() {
    const layer = this.bodyMap()?.querySelector('#' + PROBE_LAYER);
    if (layer)
      layer.innerHTML = senseProbeSvg(this.state);
    const scents = this.root.querySelector('[data-probe-scents-layer]');
    if (scents)
      scents.innerHTML = probeScents(this.state);
    this.refreshProbeControls();
  },
  refreshProbeControls() {
    this.redrawBlocks('nearAnswers', findOrgan, organ => nearAnswers(this.state, organ));
    this.redrawBlocks('gutProbeControls', findOrgan, organ => gutProbeControls(this.state, organ));
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
    // A dragged sensitivity shows its new edge before the design run answers.
    const held = this.heldHandle('spectrum');
    if (target)
      block.outerHTML =
          held?.handle === 'sensitivity' && held.answer
              ? spectrumEditor(this.state, target.organ, target.tuning, held.shift, held.answer)
              : spectrumEditor(this.state, target.organ, target.tuning);
  },
  refreshEffectors() {
    const sense = this.heldHandle('sense');
    this.redrawBlocks('effectorBlock', findOrgan,
                      organ => organ.type === 'gut'
                                   ? gutGraphic(this.state, organ, this.state.selected,
                                                sense?.organ === organ.id ? sense : null)
                               : organ.type === 'gills'     ? gillGraphic(this.state, organ)
                               : organ.type === 'gutmuscle' ? gutMuscleGraphic(this.state, organ)
                                                            : effectorGraphic(this.state, organ));
    this.refreshSense();
    this.redrawBlocks('spineBlock', findOrgan, organ => spineField(this.state, organ));
  },
  redrawBlocks(key, find, render, within = '') {
    const selector = `[${dataAttribute(key)}]`;
    for (const block of this.root.querySelectorAll(within ? within + ' ' + selector : selector)) {
      const found = find(this.state.document, block.dataset[key], block);
      if (found)
        block.outerHTML = render(found);
    }
  }
};
