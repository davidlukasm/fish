import {ATELIER_LIMITS} from '../schema.js';
import {
  allCenters,
  compileDocument,
  findCenter,
  findOrgan,
  shownSubstance
} from './model/document.js';
import {createProbePlayer} from './view/pulse.js';
import {routedLinks} from './model/regions.js';
import {label} from './view/kit.js';
import {API_WAIT, requestBody} from './requests.js';
import {builtAsDrawn} from './view/stimulus.js';
import {neuralContextOf} from './view/development.js';

export const MEASURE_LEVEL = .5;
const PULSE_STEPS = 24;
export const trialMethods = {
  markFocus() {
    const svg = this.bodyMap(), {selected, document : doc} = this.state;
    if (!svg || this.state.stimulus || !['organ', 'center'].includes(selected?.kind))
      return;
    const owner = id => {
      const found = findCenter(doc, id);
      return found && found.organ.type === 'brain' ? id : found ? found.organ.id : id;
    };
    const chosen = new Set([ selected.id, ...this.state.multi ].map(owner));
    const near = new Set(chosen), wires = new Set();
    for (const link of routedLinks(doc, this.state.sites)) {
      const from = owner(link.from), to = owner(link.to);
      if (!chosen.has(from) && !chosen.has(to))
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
  },
  wireMarks(id) {
    return [...this.bodyMap()?.querySelectorAll('[data-wires~="' + CSS.escape(id) + '"]') ?? [] ];
  },
  stimulusMarks(key) {
    const svg = this.bodyMap();
    if (!svg)
      return [];
    const escaped = CSS.escape(key);
    const marks = [
      ...svg.querySelectorAll('.aid-anatomy [data-organ="' + escaped + '"]'),
      ...svg.querySelectorAll('.aid-anatomy [data-center="' + escaped + '"]'),
      ...svg.querySelectorAll('.aid-centers [data-center="' + escaped + '"]'),
      ...svg.querySelectorAll('.aid-centers [data-organ="' + escaped + '"]')
    ];
    const owner = marks.length ? null : findCenter(this.state.document, key)?.organ;
    return owner && owner.type !== 'brain' ? this.stimulusMarks(owner.id) : marks;
  },
  async stimulate(centerIds, pulse = true) {
    if (!this.state.sites.length || !Array.isArray(centerIds) || !centerIds.length)
      return;
    if (!builtAsDrawn(this.state))
      return this.notice(label('status.needsCompiledProbe'));
    const requested =
        new Set([...this.playingPulses().flatMap(pulse => pulse.centers), ...centerIds ]);
    const groups = allCenters(this.state.document)
                       .flatMap((center, index) => requested.has(center.id) ? [ index ] : []);
    if (!groups.length)
      return;
    const {document, genome, tool} = this.state;
    const context = neuralContextOf(this.state);
    try {
      const result = await this.api(requestBody('probe', {
                                      genome,
                                      plan : compileDocument(document, this.state.sites),
                                      groups,
                                      steps : pulse ? PULSE_STEPS : 0,
                                      pulse,
                                      context
                                    }),
                                    API_WAIT.long);
      // The answer is for the fish as it was asked about, in the tool that asked.
      if (this.state.document !== document || this.state.genome !== genome ||
          this.state.tool !== tool || neuralContextOf(this.state) !== context)
        return;
      this.state.runtime = result.runtime;
      this.refreshInspector();
      this.refreshHeader();
      if (pulse && result.stimulated)
        this.playPulse(centerIds, result.frames);
      else
        this.refreshScene();
      this.notice(label(pulse && !result.stimulated ? 'status.noActiveProbe' : 'status.probed'));
    } catch (error) {
      this.notice(error.message);
    }
  },
  setNeuralContext(key, value) {
    const previous = neuralContextOf(this.state);
    const next = {...previous, hormones : [...previous.hormones ]};
    if (!Number.isFinite(value))
      return;
    if (key === 'developmentSteps')
      next.developmentSteps =
          Math.max(0, Math.min(ATELIER_LIMITS.max_development_steps, Math.round(value)));
    else if (key === 'maturity')
      next.maturity = Math.max(0, Math.min(1, value));
    else if (Number.isInteger(Number(key)) && Number(key) >= 0 &&
             Number(key) < next.hormones.length)
      next.hormones[Number(key)] = Math.max(0, Math.min(1, value));
    else
      return;
    this.stopPulse();
    this.state.neuralContext = next;
    this.state.measurement = this.state.runtime = this.state.stimulus = null;
    this.refreshViews();
  },
  async sampleNeuralState() {
    if (!builtAsDrawn(this.state))
      return;
    const centers = allCenters(this.state.document);
    if (centers.length)
      await this.stimulate([ centers[0].id ], false);
  },
  async measure() {
    if (!this.state.sites.length || !builtAsDrawn(this.state))
      return;
    const {document, genome} = this.state, context = neuralContextOf(this.state);
    try {
      const result =
          await this.api(requestBody('measure', {
                           genome,
                           plan : compileDocument(document, this.state.sites),
                           substance : shownSubstance(document, this.state.focusSubstance)?.index,
                           level : this.state.measureLevel,
                           steps : ATELIER_LIMITS.max_measure_steps,
                           context
                         }),
                         API_WAIT.long);
      if (this.state.document !== document || this.state.genome !== genome ||
          neuralContextOf(this.state) !== context)
        return;
      this.state.measurement = result;
      this.state.runtime = result.runtime;
      this.refreshLibrary();
      this.refreshViews();
    } catch (error) {
      this.notice(error.message);
    }
  },
  playPulse(centerIds, frames) {
    this.stopPulse();
    const centers = allCenters(this.state.document);
    if (!frames?.length)
      return;
    const stimulus = {real : true, fired : new Set(), quieted : new Set()};
    this.state.stimulus = stimulus;
    this.refreshScene();
    const clear = () => {
      for (const element of this.bodyMap()?.querySelectorAll(
               '.aid-pulse-active,.aid-pulse-quieting,.aid-pulse-twitch') ??
           [])
        element.classList.remove('aid-pulse-active', 'aid-pulse-quieting', 'aid-pulse-twitch');
    };
    const show = frame => {
      clear();
      // An organ can contain several measured groups; choose its strongest actual answer.
      const answers = new Map();
      centers.forEach((center, index) => {
        const value = frame[index] ?? 0;
        if (Math.abs(value) < .005)
          return;
        for (const element of this.stimulusMarks(center.id))
          if (!answers.has(element) || Math.abs(value) > Math.abs(answers.get(element)))
            answers.set(element, value);
        stimulus[value > 0 ? 'fired' : 'quieted'].add(center.id);
      });
      for (const [element, value] of answers)
        element.classList.add(value > 0 ? 'aid-pulse-active' : 'aid-pulse-quieting');
    };
    const player = createProbePlayer(frames, show, clear);
    this.pulsePlayers = [ {player, centers : centerIds} ];
    player.start();
  },
  playingPulses() { return this.pulsePlayers.filter(pulse => pulse.player.running());},
  clearStimulus() {
    this.stopPulse();
    if (!this.state.stimulus)
      return;
    this.state.stimulus = null;
    this.refreshScene();
  },
  stopPulse() {
    for (const {player} of this.pulsePlayers)
      player.stop();
    this.pulsePlayers = [];
  }
};
