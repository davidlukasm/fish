import {
  beyondHandles,
  clearOfFish,
  contrastFocus,
  nearAnswers,
  nearObject,
  refreshVisionAnswers,
  sightLegend,
  spectrumEditor
} from './view/vision.js';
import {defaultSight, sightScene} from './model/sight.js';
import {probeFor, senseScene} from './model/probe.js';
import {gutProbeControls, probeFlow, probeHandle} from './view/probes.js';
import {eyeSight, eyeTypes} from '../organ_readout.js';
import {drawOrganGraphic} from '../organ_graphics.js';
import {SENSE_TISSUE} from '../tissue.js';
import {PRESSURE_OF} from './model/organs.js';
import {RECEPTOR, VISUAL_SAMPLE} from '../schema.js';
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
import {label} from './view/kit.js';
import {previewContextOf} from './view/development.js';
import {hormoneTime} from './view/substances.js';
import {requestBody} from './requests.js';
import {BODY_MAP, invalidateFishLayer, paintFishProbes} from './view/scene.js';
import {outlineSizes, paintMouthStep} from './view/body.js';
import {newFishDocument} from './canvas_placement.js';

const PRESSURE_TRIES = 12, PRESSURE_BATCH = 'pressure';
const nativeProbe = probe => probe?.kind === 'ground' ? null : probe;
const TRANSIENT_REPORTS = [
  'lightSpread', 'sight', 'senseProbe', 'noseProbe', 'barbelProbe', 'mouthCourse',
  'attackProbe', 'gillFood', 'senseCourses'
];
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
    if (sense && this.fieldFrame && !organ.field) {
      this.frameField();
      this.showZoom();
    }
    if (!sense || sense.kind === 'gut' || (sense.kind === 'ground' && sense.buried))
      this.framedProbe = null;
    else if ((sense.kind === 'ground' || this.state.anatomy?.bodyRadius > 0) && sense !== this.framedProbe &&
             !this.handleDrag) {
      const flow = probeFlow(sense);
      this.framedProbe = sense;
      this.keepInView(probeHandle(sense, sense.kind, this.state), true);
      if (sense.kind === 'attack')
        this.keepInView(probeHandle(sense, 'attack-gape', this.state));
      if (flow && flow !== sense)
        this.keepInView(probeHandle(flow), true);
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
  // The example the learning inspector tries on a cell: a sender and the cell are active
  // together at middling strength, the teacher comes `delay` steps later, the cell expects
  // `prediction` of it the second time, and the two rounds lie `interval` steps apart
  // (anatomy.groups, learning: step1 without and step2 with that expectation, what stays of a
  // contact between the rounds, what being active together alone does).
  setLearnProbe(centerId, delay, prediction, interval) {
    const probe = this.state.learnProbe;
    if (probe?.center === centerId && probe.delay === delay && probe.prediction === prediction &&
        probe.interval === interval)
      return;
    this.state.learnProbe = {center : centerId, delay, prediction, interval};
    this.requestDesign();
  },
  // The mouth's inspector tries one beat of the mouth: the closer begins `delay` steps after the
  // opener, the gills pump along or not (anatomy.mouthCourse).
  setMouthCommand(organId, delay,
                  gills) { this.tryCommand(organId, {kind : 'mouth', delay, gills});},
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
  // The courses a sense's inspector tries on its cells (sense.js, lastCourses): asked of the
  // engine once, not again for its own answer, and only while their organ is chosen.
  trySenseCourses(key, courses) {
    if (this.state.courseProbe?.key === key)
      return;
    this.state.courseProbe =
        {key, courses, organ : organOf(this.state.document, this.state.selected?.id)?.id ?? null};
    this.requestDesign();
  },
  liveCourses() {
    const probe = this.state.courseProbe;
    return probe && probe.organ === organOf(this.state.document, this.state.selected?.id)?.id
               ? probe
               : null;
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
    const {document, sites, learnProbe} = this.state, probe = this.state.sightProbe,
          sense = nativeProbe(this.state.senseProbe), blood = previewContextOf(this.state);
    const previous = this.designContext;
    const samePlan = previous?.document === document && previous.sites === sites;
    const plan = samePlan ? previous.plan : compileDocument(document, sites);
    this.designRunning = true;
    this.designPending = false;
    const request = ++this.designRequest, fishRequest = this.newFishRequest;
    const spineDraft = draft?.key.startsWith('spine-'), colourDraft = draft?.key === 'colour',
          fieldDraft = draft?.key === 'field',
          learningDraft = draft?.key === 'learning', bladderDraft = draft?.key === 'bladder',
          gillDraft = draft?.key === 'gills';
    const keepSight = samePlan && probe === previous.probe;
    const probeOnly =
        !draft && samePlan && previous.blood === blood && previous.learnProbe === learnProbe;
    const planKey = !draft && samePlan ? previous.planKey : null;
    const scene = draft ? {sense : spineDraft || gillDraft ? this.senseScene() : null} : {
      lightSpread : !probeOnly && this.state.lightSpread?.document !== document,
      sight : keepSight ? null : sightScene(probe),
      sense : this.senseScene()
    };
    // The blood every estimate of the engine is made at is the life tool's (atelier_service.py,
    // learning_context_line).
    const group = learnProbe ? centerIndex(document, learnProbe.center) : -1,
          learning = group < 0 ? null : {
            group,
            delay : learnProbe.delay,
            pre : .5,
            post : .5,
            teaching : 1,
            prediction : learnProbe.prediction,
            interval : learnProbe.interval
          };
    const courses = this.liveCourses();
    const context = {
      ...scene,
      blood,
      ...(learning ? {learning} : {}),
      ...(courses ? {senseCourses : courses.courses} : {})
    };
    const body = requestBody('design', {
      ...context,
      ...(probeOnly ? {probeOnly : true} : {}),
      ...(planKey ? {
        planKey,
        ...(probeOnly && this.state.anatomy?.sight?.receptors ? {compactSight : true} : {})
      }
                  : {plan, ...(!probeOnly && !draft ? {rememberPlan : true} : {})})
    });
    this.api(body)
        .then(report => report.planExpired && planKey ? this.api(requestBody('design', {
          ...context,
          plan,
          rememberPlan : true,
          sight : sightScene(probe),
          lightSpread : this.state.lightSpread?.document !== document
        }))
                                                      : report)
        // An answer for the design shown is shown even when a test stimulus has moved on since:
        // the eyes and senses follow a dragged one step by step instead of waiting for it to
        // rest.
        .then(({planKey : preparedKey, ...report}) => {
          const before = this.state.anatomy;
          const partial = probeOnly && !preparedKey;
          const anatomy = {
            ...(partial ? before : null),
            ...report,
            learnProbe : learning ? learnProbe : null,
            senseCourseKey : courses?.key ?? null,
            gillProbeKey : scene.sense?.kind === 'gills' ? sense?.key : null
          };
          if (partial) {
            delete anatomy.probeOnly;
            for (const key of TRANSIENT_REPORTS)
              if (!(key in report))
                delete anatomy[key];
          }
          const sight = report.sight;
          if (sight?.samples[0]?.length === 2) {
            const samples = report.sight.samples.map(([ neuron, response ]) => {
              const sample = [];
              sample[VISUAL_SAMPLE.neuron] = neuron;
              sample[VISUAL_SAMPLE.response] = response;
              return sample;
            });
            anatomy.sight = {...(sight.receptors ? null : before?.sight), ...sight, samples};
          } else if (sight && !sight.receptors && before?.sight?.receptors) {
            anatomy.sight = {...before.sight, ...sight};
          }
          if (!draft && keepSight && before?.sight)
            anatomy.sight = before.sight;
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
                                       fieldDraft && [report?.lateral, report?.felt],
                                       draft.key === 'receptor' &&
                                           report?.groups?.map(g => g.responses),
                                       learningDraft && [
                                         report?.learnProbe,
                                         report?.groups?.[learning?.group]?.learning
                                       ],
                                       bladderDraft && report?.bladderEstimate,
                                       gillDraft && [report?.gills, report?.gillFood,
                                                     report?.gillProbeKey],
                                       courses && report?.senseCourses]);
              };
              const previous = shape();
              this.state.outlinePreview = anatomy;
              if (shape() !== previous) {
                this.refreshScene();
                if (colourDraft || fieldDraft || learningDraft || bladderDraft || gillDraft ||
                    courses)
                  this.refreshLive();
                // A receptor's curve is the engine's: the inspector follows each answer.
                if (draft.key === 'receptor')
                  this.refreshDragged();
              }
            }
          } else if (this.state.document === document) {
            this.designContext =
                {document, sites, plan, probe, blood, learnProbe, planKey : preparedKey ?? planKey};
            this.showAnatomy(anatomy, request);
          }
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
    const before = this.state.anatomy, sightChange = before?.sight !== anatomy.sight;
    const differs = (a, b) => a !== b && JSON.stringify(a) !== JSON.stringify(b);
    const spineChange = differs(before?.attackProbe?.spines, anatomy.attackProbe?.spines);
    // A new blood from the life band changes which cells are there and how receptors answer.
    const groupsDiffer = key => before?.groups !== anatomy.groups &&
                                differs(before?.groups?.map(g => g[key]),
                                        anatomy.groups?.map(g => g[key]));
    const lifeChange = groupsDiffer('life');
    const answerChange = groupsDiffer('effects') || differs(before?.hormoneCourse, anatomy.hormoneCourse);
    const learningChange = before?.learnProbe !== anatomy.learnProbe || groupsDiffer('learning');
    this.shownDesign = this.state.document;
    if (anatomy.lightSpread)
      this.state.lightSpread = {document : this.state.document, report : anatomy.lightSpread};
    this.state.outlinePreview = null;
    this.state.anatomy = anatomy;
    this.state.sightDocument = anatomy.sight ? this.state.document : null;
    if (this.state.station === 'hub')
      this.refreshHubDraft();
    this.bringProbes();
    // A newly answered stimulus already rebuilds the scene and inspector with this anatomy.
    const traced = this.traceAnswered(request);
    if (probesOnly) {
      if (!traced) {
        const redraw = spineChange || lifeChange;
        if (redraw)
          this.refreshScene();
        if (sightChange && !redraw)
          this.refreshVision();
        if (sightChange)
          this.drawSight();
        this.refreshProbeGraphics(!redraw && !!this.state.senseProbe);
        if ((answerChange && this.state.tool === 'hormone') ||
            ((answerChange || learningChange) && this.state.tool === 'learn')) {
          this.refreshInspector();
        } else {
          this.refreshLive();
        }
      }
      return;
    }
    if (!traced)
      this.drawSight();
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
    for (const fan of this.root.querySelectorAll(BODY_MAP + ' [data-vision-organ].selected')) {
      const organ = findOrgan(this.state.document, fan.dataset.visionOrgan);
      if (organ) {
        invalidateFishLayer(fan);
        refreshVisionAnswers(this.state, organ, fan);
      }
    }
  },
  refreshGraphics() {
    this.redrawBlocks('hormoneTime', (doc, id) => ({index : Number(id)}),
                      item => hormoneTime(this.state, item.index));
    if (this.root.querySelector('[data-sight-eye]'))
      this.refreshSpectrum();
    else if (!this.handleDrag)
      this.redrawBlocks('organSettings', findOrgan, organ => organSettingsBlock(this.state, organ));
    else {
      this.refreshSpectrum();
      this.refreshProbeControls();
    }
    this.refreshLive();
    // The scene and organSettings already include their probe graphics and controls.
  },
  refreshProbes() {
    this.refreshProbeGraphics();
    this.refreshLive();
  },
  refreshProbeGraphics(paint = true) {
    if (paint)
      paintFishProbes(this.root, this.state, this.handleDrag?.control !== 'flow');
    this.refreshProbeControls();
  },
  refreshProbeControls() {
    this.redrawBlocks('nearAnswers', findOrgan, organ => nearAnswers(this.state, organ));
    this.redrawBlocks('gutProbeControls', findOrgan, organ => gutProbeControls(this.state, organ));
  },
  drawSight() {
    const sight = this.state.anatomy?.sight;
    const source = sight?.receptors;
    if (!this.sightRows || this.sightRows.source !== source) {
      const sides = [ [], [] ];
      for (const receptor of source ?? [])
        if (!receptor[RECEPTOR.proximity])
          sides[receptor[RECEPTOR.lateral] < 0 ? 0 : 1].push(receptor);
      this.sightRows = {source, sides, legends : sides.map(rows => sightLegend(eyeTypes(rows)))};
    }
    const {sides, legends} = this.sightRows;
    for (const canvas of this.root.querySelectorAll('[data-sight-eye]')) {
      const side = Number(canvas.dataset.sightEye);
      const receptors = sides[side], figure = canvas.closest('figure');
      if (figure.hidden !== !receptors.length)
        figure.hidden = !receptors.length;
      if (!receptors.length)
        continue;
      const responses = eyeSight(sight.bands, sight.samples, receptors, side);
      drawOrganGraphic(canvas, {...responses, atelierEye : true}, null, {key : SENSE_TISSUE.light});
      // Each row's mark names its cell type below the picture.
      const legend = figure.querySelector('[data-sight-legend]');
      if (legend && legend._sightRows !== receptors) {
        legend.innerHTML = legends[side];
        legend._sightRows = receptors;
      }
    }
  },
  refreshSpectrum() {
    const block = this.root.querySelector('[data-spectrum-block]');
    const editor = block?.querySelector('[data-spectrum]');
    const target = editor && this.spectrumTarget(editor.dataset);
    if (target) {
      const parent = block.parentElement, restoreFocus = contrastFocus(block);
      block.outerHTML = spectrumEditor(this.state, target.organ, target.tuning);
      restoreFocus?.(parent);
    }
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
