import {organFunction} from './model/organs.js';
import {ATELIER_LIMITS, MOTOR_KIND} from '../schema.js';
import {
  allCenters,
  compileDocument,
  endpointCenters,
  findCenter,
  findOrgan,
  organOf,
  wholeEndpoint
} from './model/document.js';
import {sideOf} from './model/layout.js';
import {SIGNAL, createSignalPlayer, signalSchedule} from './view/pulse.js';
import {routedLinks} from './model/regions.js';
import {label} from './view/kit.js';
import {signalLinks} from './view/wires.js';
import {API_WAIT, requestBody} from './requests.js';

// Trials on the developed fish: a stimulus runs through the network the design wires and the
// engine reports which parts answered; a measurement doses a substance and reports what it changes.
// The parts a trial or the selection reached stay marked on the scene.

// A measurement doses MEASURE_LEVEL of a substance into the grown fish (maturity MEASURE_MATURITY).
export const MEASURE_LEVEL = .5;
const MEASURE_MATURITY = 1;
// A stimulus runs PULSE_STEPS steps.
const PULSE_STEPS = 24;
// The studio's methods for trials and their marks on the scene (mixed into OrganStudio).
export const trialMethods = {
  markFocus() {
    const svg = this.bodyMap(), {selected, document : doc} = this.state;
    if (!svg || this.state.stimulus || !['organ', 'center'].includes(selected?.kind))
      return;
    const owner = id => {
      const found = findCenter(doc, id);
      return found && found.organ.type === 'brain' ? id : found ? found.organ.id : id;
    };
    const chosen = owner(selected.id), near = new Set([ chosen ]), wires = new Set();
    for (const link of routedLinks(doc, this.state.sites)) {
      const from = owner(link.from), to = owner(link.to);
      if (from !== chosen && to !== chosen)
        continue;
      near.add(from);
      near.add(to);
      if (!link.wire.inner)
        wires.add(link.wire.id);
    }
    svg.classList.add('aid-focus-view');
    for (const key of near)
      for (const element of this.stimulusMarks(key))
        element.classList.add('aid-focus-near');
    for (const key of near) {
      const organ = findOrgan(doc, key);
      for (const center of organ?.centers ?? [])
        for (const element of this.stimulusMarks(center.id))
          element.classList.add('aid-focus-near');
    }
    for (const id of wires)
      for (const element of this.wireMarks(id))
        element.classList.add('aid-focus-near');
  },
  // The network a stimulus reached stays marked, the rest stands back, until the wire tool is
  // taken or the design changes.
  markStimulus() {
    const svg = this.bodyMap(), stimulus = this.state.stimulus;
    if (!svg || !stimulus)
      return;
    svg.classList.add('aid-stimulus-view');
    for (const key of stimulus.fired)
      for (const element of this.stimulusMarks(key))
        element.classList.add('aid-pulse-fired');
    for (const key of stimulus.quieted)
      for (const element of this.stimulusMarks(key))
        element.classList.add('aid-pulse-quieted');
    for (const id of stimulus.wires)
      for (const element of this.wireMarks(id))
        element.classList.add('aid-pulse-used');
  },
  // What shows a wire on the scene.
  wireMarks(id) {
    return [...this.bodyMap()?.querySelectorAll('[data-wires~="' + CSS.escape(id) + '"]') ?? [] ];
  },
  // What shows a part of the network: an organ's glyph, a nerve center's node.
  stimulusMarks(key) {
    const svg = this.bodyMap();
    if (!svg)
      return [];
    const escaped = CSS.escape(key);
    return [
      ...svg.querySelectorAll('.aid-anatomy [data-organ="' + escaped + '"]'),
      ...svg.querySelectorAll('.aid-centers [data-center="' + escaped + '"]'),
      ...svg.querySelectorAll('.aid-centers [data-organ="' + escaped + '"]')
    ];
  },
  // Whether the fish as drawn is developed, developing it first if needed; a trial needs it.
  async developedGenome() {
    const ready = () => this.state.genome && !this.state.stale;
    if (!ready())
      await this.develop();
    if (!ready())
      this.notice(label('status.probeNoGenome'));
    return ready();
  },
  async stimulate(centerIds) {
    if (!this.state.sites.length || !Array.isArray(centerIds) || !centerIds.length)
      return;
    if (!await this.developedGenome())
      return;
    const requested = new Set(centerIds);
    const groups = allCenters(this.state.document)
                       .flatMap((center, index) => requested.has(center.id) ? [ index ] : []);
    if (!groups.length)
      return;
    try {
      const result = await this.api(requestBody('probe', {
                                      genome : this.state.genome,
                                      plan : compileDocument(this.state.document, this.state.sites),
                                      groups,
                                      steps : PULSE_STEPS
                                    }),
                                    API_WAIT.long);
      this.playPulse(centerIds, result.frames);
      this.notice(label('status.probed'));
    } catch (error) {
      this.notice(error.message);
    }
  },
  // What the focused substance does in the developed fish: the atelier runs its brain with and
  // without the substance and reports the change per cell group and organ drive.
  async measure() {
    if (!this.state.sites.length)
      return;
    if (!await this.developedGenome())
      return;
    try {
      this.state.measurement =
          await this.api(requestBody('measure', {
                           genome : this.state.genome,
                           plan : compileDocument(this.state.document, this.state.sites),
                           substance : this.state.focusSubstance,
                           level : this.state.measureLevel,
                           maturity : MEASURE_MATURITY,
                           steps : ATELIER_LIMITS.max_measure_steps
                         }),
                         API_WAIT.long);
      this.refreshLibrary();
      this.refreshViews();
    } catch (error) {
      this.notice(error.message);
    }
  },
  // The stimulus runs through the drawn network: the parts the engine found active fire in turn
  // along the wires from the stimulated ones.
  playPulse(centerIds, frames) {
    this.stopPulse();
    this.showDrawnContacts();
    if (!Array.isArray(frames) || !frames.length)
      return;
    // How far each part rose above and fell below where it stood at the first step.
    const doc = this.state.document, centers = allCenters(doc);
    const swing = (index, sign) =>
        Math.max(...frames.map(f => sign * ((f[index] ?? 0) - (frames[0][index] ?? 0))));
    const indexOf = new Map(centers.map((c, index) => [c.id, index]));
    const response = key => {
      const indices = endpointCenters(doc, key).map(c => indexOf.get(c.id));
      return indices.some(i => swing(i, 1) >= SIGNAL.cutoff)    ? 'rise'
             : indices.some(i => swing(i, -1) >= SIGNAL.cutoff) ? 'fall'
                                                                : null;
    };
    const starts = [...new Set(centerIds.map(id => wholeEndpoint(doc, id))) ];
    const schedule = signalSchedule(starts, signalLinks(this.state), response);
    this.state.stimulus = {fired : new Set(starts), wires : new Set(), quieted : new Set()};
    this.refreshScene();
    const svg = this.bodyMap();
    if (!svg)
      return;
    this.pulsePlayer = createSignalPlayer(svg, schedule, {
      marks : key => this.stimulusMarks(key),
      moves : key => this.stimulusMoves(key),
      reached : (key, link, quieted) => {
        if (key)
          this.state.stimulus?.fired.add(key);
        if (quieted)
          this.state.stimulus?.quieted.add(quieted);
        for (const id of link?.wires ?? []) {
          this.state.stimulus?.wires.add(id);
          for (const element of this.wireMarks(id))
            element.classList.add('aid-pulse-used');
        }
      }
    });
    this.pulsePlayer.start();
  },
  // What an effector moves as it fires: a tail muscle beats the tail fin, a steering one strokes
  // its side's fin, a biting one opens the mouth and its jaw, a sucking one widens the mouth,
  // cheeks and throat, defence raises its spines, pigment cells spread their pigment; every
  // effector's own glyph twitches.
  stimulusMoves(key) {
    const svg = this.bodyMap(), doc = this.state.document;
    const organ = organOf(doc, key);
    if (!svg || !organ?.centers.some(c => c.role === 'motor'))
      return [];
    const part = (selector, name) => [...svg.querySelectorAll(selector)].map(e => [e, name]);
    const own = this.stimulusMarks(organ.id).map(e => [e, 'aid-pulse-twitch']);
    const code = organ.type === 'muscle' ? organFunction(organ, this.state.sites) : -1,
          side = sideOf(organ);
    const moved = {
      [MOTOR_KIND.forward] : () => part('[data-part="tail"]', 'aid-move-tail'),
      [MOTOR_KIND.turn] : () => part('[data-part="fin"][data-side="' + side + '"]',
                                     side < 0 ? 'aid-move-fin-up' : 'aid-move-fin-down'),
      [MOTOR_KIND.aggression] :
          () => [...part('[data-part="mouth"]', 'aid-move-bite'),
                 ...part('[data-part="jaw"][data-side="' + side + '"]', 'aid-move-jaw')],
      [MOTOR_KIND.suction] : () => [...part('[data-part="mouth"]', 'aid-move-suck'),
                                    ...part('[data-part="cheek"]', 'aid-move-suck'),
                                    ...part('[data-part="intake"]', 'aid-move-suck'),
                                    ...part('[data-part="throat"]', 'aid-move-throat')]
    }[code];
    const raise = organ.type === 'defense'
                      ? part('[data-spines="' + CSS.escape(organ.id) + '"]', 'aid-move-raise')
                  : organ.type === 'pigment'
                      ? part('.aid-chromatophores .gathered', 'aid-move-spread')
                      : [];
    return [...own, ...(moved ? moved() : []), ...raise ];
  },
  clearStimulus() {
    this.stopPulse();
    if (!this.state.stimulus)
      return;
    this.state.stimulus = null;
    this.refreshScene();
  },
  stopPulse() {
    this.pulsePlayer?.stop();
    this.pulsePlayer = null;
  }
};
