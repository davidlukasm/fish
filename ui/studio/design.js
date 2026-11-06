import {
  beyondHandles,
  clearOfFish,
  nearAnswers,
  nearObject,
  sensitivityEditor,
  spectrumEditor,
  visionFan
} from './view/vision.js';
import {effectorGraphic, gutGraphic, spineField} from './view/effectors.js';
import {lateralField} from './view/lateral.js';
import {defaultSight, sightScene} from './model/sight.js';
import {probeFor, senseScene} from './model/probe.js';
import {probeScents, senseProbeSvg} from './view/probes.js';
import {scentMap} from './view/scents.js';
import {pigmentInspector} from './view/pigments.js';
import {eyeSight} from '../organ_readout.js';
import {drawOrganGraphic} from '../organ_graphics.js';
import {SENSE_TISSUE} from '../tissue.js';
import {PRESSURE_OF} from './model/organs.js';
import {RECEPTOR} from '../schema.js';
import {
  allCenters,
  centerIndex,
  compileDocument,
  findCenter,
  findOrgan,
  nodeSitesNear,
  organOf,
  placeNode
} from './model/document.js';
import {sideOf} from './model/layout.js';
import {dataAttribute} from './view/markup.js';
import {sensorAdaptation, sensorAnswer} from './view/panels.js';
import {label} from './view/kit.js';
import {requestBody} from './requests.js';
import {BODY_MAP, PROBE_LAYER} from './view/scene.js';

const PRESSURE_TRIES = 12;
export const designMethods = {
  refreshPigment() {
    const selected = this.state.selected;
    this.redrawBlocks('pigmentBlock', findOrgan, organ => {
      const chosen = selected?.kind === 'center' && organ.centers.find(c => c.id === selected.id);
      return pigmentInspector(this.state, organ, chosen || organ.centers[0]);
    });
  },
  refreshScentMaps() {
    this.redrawBlocks('scentBlock', findCenter, found => scentMap(found.organ, found.center));
  },
  bringProbes() {
    const id = this.state.selected?.id, doc = this.state.document;
    const organ = organOf(doc, id);
    if (!organ)
      return;
    const sense = probeFor(organ, this.state.senseProbe);
    if (sense && sense !== this.state.senseProbe) {
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
    if (next && next !== probe) {
      this.state.sightProbe = next;
      this.requestDesign();
    }
  },
  senseScene() {
    const probe = this.state.senseProbe;
    return probe && findOrgan(this.state.document, probe.organ) ? senseScene(probe) : null;
  },
  requestDesign() {
    if (this.designRunning) {
      this.designPending = true;
      return;
    }
    this.designRunning = true;
    this.designPending = false;
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
            this.showAnatomy(anatomy);
        })
        .catch(error => this.notice(error.message))
        .finally(() => {
          this.designRunning = false;
          if (this.designPending || this.state.document !== document ||
              this.state.sightProbe !== probe || this.state.senseProbe !== sense)
            this.requestDesign();
        });
  },
  showAnatomy(anatomy) {
    const probesOnly = this.shownDesign === this.state.document;
    this.shownDesign = this.state.document;
    this.state.anatomy = anatomy;
    this.bringProbes();
    if (probesOnly) {
      this.refreshVision();
      this.drawSight();
      this.refreshProbes();
      return;
    }
    this.refreshHeader();
    this.refreshScene();
    this.refreshGraphics();
    this.checkPressure();
  },
  async checkPressure() {
    const doc = this.state.document, pressure = this.state.anatomy?.pressure;
    if (!Array.isArray(pressure) || this.pressureChecked === doc)
      return;
    this.pressureChecked = doc;
    const centers = allCenters(doc);
    const wrong = centers.filter((c, index) => {
      const own = PRESSURE_OF[c.organType];
      return own?.key === c.key && pressure[index] >= 0 && pressure[index] !== own.source;
    });
    for (const center of wrong) {
      const organ = findOrgan(doc, center.organId);
      const motor = organ.centers.find(c => c.role === 'motor') ?? organ.centers[0];
      const index = centerIndex(doc, center.id);
      for (const site of nodeSitesNear(doc, center.id, motor.id, this.state.sites)
               .slice(0, PRESSURE_TRIES)) {
        const moved = placeNode(doc, center.id, site.id, this.state.sites);
        const answer =
            moved &&
            await this.api(requestBody('design', {plan : compileDocument(moved, this.state.sites)}))
                .catch(() => null);
        if (this.state.document !== doc)
          return;
        if (answer?.pressure?.[index] === PRESSURE_OF[center.organType].source) {
          this.changeDocument(moved, this.state.selected, true, 'pressure:' + center.id);
          return this.notice(label('status.pressureMoved'));
        }
      }
    }
  },
  refreshVision() {
    this.redrawBlocks('visionOrgan', findOrgan, organ => visionFan(this.state, organ), BODY_MAP);
  },
  refreshGraphics() {
    this.refreshSpectrum();
    this.refreshSensitivity();
    this.refreshEffectors();
    this.refreshPigment();
    this.drawSight();
    this.refreshProbes();
  },
  refreshProbes() {
    const layer = this.bodyMap()?.querySelector('#' + PROBE_LAYER);
    if (layer)
      layer.innerHTML = senseProbeSvg(this.state);
    const scents = this.root.querySelector('[data-probe-scents-layer]');
    if (scents)
      scents.innerHTML = probeScents(this.state);
    this.redrawBlocks('nearAnswers', findOrgan, organ => nearAnswers(this.state, organ));
  },
  drawSight() {
    const sight = this.state.anatomy?.sight;
    for (const canvas of this.root.querySelectorAll('[data-sight-eye]')) {
      const side = Number(canvas.dataset.sightEye);
      const receptors =
          (sight?.receptors ??
           []).filter(r => !r[RECEPTOR.proximity] && (r[RECEPTOR.lateral] < 0 ? 0 : 1) === side);
      canvas.closest('figure').hidden = !receptors.length;
      if (receptors.length)
        drawOrganGraphic(canvas, eyeSight(sight.bands, sight.samples, receptors, side), null,
                         {key : SENSE_TISSUE.light});
    }
  },
  refreshSpectrum() {
    const block = this.root.querySelector('[data-spectrum-block]');
    const editor = block?.querySelector('[data-spectrum]');
    const target = editor && this.spectrumTarget(editor.dataset);
    if (target)
      block.outerHTML = spectrumEditor(this.state, target.organ, target.tuning);
  },
  refreshSensitivity() {
    const drag = this.heldHandle('sensitivity');
    this.redrawBlocks(
        'sensitivityBlock', (doc, kind, block) => this.sensitivityTarget(block), target => {
          const own = drag?.block === (target.organ ? target.tuning.id : target.center.id);
          const shift = own ? drag.shift : 1, start = own && drag.log ? drag.answer : null;
          return target.organ
                     ? sensitivityEditor(this.state, target.organ, target.tuning, shift, start)
                     : sensorAnswer(this.state, target.center, shift, start,
                                    own ? drag.dragged : null);
        });
    const adapt = this.heldHandle('adaptation');
    this.redrawBlocks('adaptationId', (doc, id) => findCenter(doc, id)?.center, center => {
      const own = adapt?.id === center.id;
      return sensorAdaptation(this.state, center, own ? adapt.stretch : 1,
                              own ? adapt.adapt : null);
    });
  },
  refreshEffectors() {
    this.redrawBlocks('effectorBlock', findOrgan,
                      organ => organ.type === 'gut'
                                   ? gutGraphic(this.state, organ, this.state.selected)
                                   : effectorGraphic(this.state, organ));
    this.redrawBlocks('lateralBlock', findOrgan, organ => lateralField(this.state, organ));
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
