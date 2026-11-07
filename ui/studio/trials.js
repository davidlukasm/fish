import {organFunction} from './model/organs.js';
import {ATELIER_LIMITS, MOTOR_KIND} from '../schema.js';
import {
  allCenters,
  compileDocument,
  endpointCenters,
  findCenter,
  findOrgan,
  organOf,
  shownSubstance,
  wholeEndpoint
} from './model/document.js';
import {sideOf} from './model/layout.js';
import {createSignalPlayer, signalAnswer, signalSchedule} from './view/pulse.js';
import {routedLinks} from './model/regions.js';
import {label} from './view/kit.js';
import {signalLinks} from './view/wires.js';
import {API_WAIT, requestBody} from './requests.js';
import {builtAsDrawn} from './view/stimulus.js';
import {hormoneLegs} from './view/influence.js';

export const MEASURE_LEVEL = .5;
const MEASURE_MATURITY = 1;
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
    for (const id of stimulus.wires)
      for (const element of this.wireMarks(id))
        element.classList.add('aid-pulse-used',
                              ...stimulus.sent.has(id) ? [] : [ 'aid-pulse-withdrawn' ],
                              ...stimulus.learned.has(id) ? [ 'aid-pulse-learned' ] : []);
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
  async stimulate(centerIds) {
    if (!this.state.sites.length || !Array.isArray(centerIds) || !centerIds.length)
      return;
    if (!builtAsDrawn(this.state))
      return this.playPulse(centerIds, null);
    const requested =
        new Set([...this.playingPulses().flatMap(pulse => pulse.centers), ...centerIds ]);
    const groups = allCenters(this.state.document)
                       .flatMap((center, index) => requested.has(center.id) ? [ index ] : []);
    if (!groups.length)
      return;
    const {document, genome, tool} = this.state;
    try {
      const result = await this.api(requestBody('probe', {
                                      genome,
                                      plan : compileDocument(document, this.state.sites),
                                      groups,
                                      steps : PULSE_STEPS
                                    }),
                                    API_WAIT.long);
      // The answer is for the fish as it was asked about, in the tool that asked.
      if (this.state.document !== document || this.state.genome !== genome ||
          this.state.tool !== tool)
        return;
      this.playPulse(centerIds, result.frames);
      this.notice(label('status.probed'));
    } catch (error) {
      this.notice(error.message);
    }
  },
  async measure() {
    if (!this.state.sites.length || !builtAsDrawn(this.state))
      return;
    try {
      this.state.measurement = await this.api(
          requestBody('measure', {
            genome : this.state.genome,
            plan : compileDocument(this.state.document, this.state.sites),
            substance : shownSubstance(this.state.document, this.state.focusSubstance)?.index,
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
  playPulse(centerIds, frames) {
    this.pulsePlayers = this.playingPulses();
    const alongside = this.pulsePlayers.length > 0 && this.state.stimulus;
    this.showDrawnContacts();
    const doc = this.state.document, centers = allCenters(doc);
    const indexOf = new Map(centers.map((c, index) => [c.id, index]));
    const response =
        frames?.length
            ? key => signalAnswer(frames, endpointCenters(doc, key).map(c => indexOf.get(c.id)))
            : (key, push) => push;
    const starts = [...new Set(centerIds.map(id => wholeEndpoint(doc, id))) ],
          chosen = new Set(centerIds);
    const whole = key => chosen.has(key) || endpointCenters(doc, key).every(c => chosen.has(c.id));
    const shownAs = key =>
        !starts.includes(key) || whole(key)
            ? [ key ]
            : endpointCenters(doc, key).map(c => c.id).filter(id => chosen.has(id));
    const links = signalLinks(this.state).flatMap(link => {
      if (!starts.includes(link.from) || whole(link.from) || !link.startNodes.length)
        return [ link ];
      const kept = link.startNodes.map(id => chosen.has(id));
      return kept.some(Boolean) ? [ {...link, starts : link.starts.filter((_, i) => kept[i])} ]
                                : [];
    });
    const schedule = signalSchedule(starts, [...links, ...hormoneLegs(this.state) ], response);
    const before = this.state.stimulus;
    const stimulus = alongside ? before : {
      fired : new Set(),
      quieted : new Set(),
      wires : new Set(),
      sent : new Set(),
      learned : new Set(),
      earlier : before && { fired: before.fired, sent: before.sent }
    };
    stimulus.real = !!frames?.length;
    for (const part of starts.flatMap(shownAs))
      stimulus.fired.add(part);
    this.state.stimulus = stimulus;
    if (alongside)
      this.markStimulus();
    else
      this.refreshScene();
    const svg = this.bodyMap();
    if (!svg)
      return;
    const player = createSignalPlayer(svg, schedule, {
      marks : key => shownAs(key).flatMap(part => this.stimulusMarks(part)),
      moves : key => this.stimulusMoves(key),
      reached : ({key, mode, link}) => {
        for (const part of key ? shownAs(key) : [])
          stimulus[mode === 'fire' ? 'fired' : 'quieted'].add(part);
        for (const id of link?.wires ?? []) {
          stimulus.wires.add(id);
          if (mode === 'fire')
            stimulus.sent.add(id);
          for (const element of this.wireMarks(id)) {
            element.classList.add('aid-pulse-used');
            element.classList.toggle('aid-pulse-withdrawn', !stimulus.sent.has(id));
          }
        }
      },
      arrived : link => {
        if (!link.learners?.length)
          return;
        for (const id of this.taughtWires(link.learners))
          for (const set of [stimulus.wires, stimulus.sent, stimulus.learned])
            set.add(id);
        for (const id of stimulus.learned)
          for (const element of this.wireMarks(id))
            element.classList.add('aid-pulse-used', 'aid-pulse-learned');
      }
    });
    this.pulsePlayers.push({player, centers : centerIds});
    player.start();
  },
  playingPulses() { return this.pulsePlayers.filter(pulse => pulse.player.running());},
  // A teaching substance reaching learners that have just fired, in this preview or the one still
  // shown before it: the wires that made them fire are the ones they learn from.
  taughtWires(learners) {
    const {document : doc, sites, stimulus} = this.state;
    const fired = part => stimulus.fired.has(part) || stimulus.earlier?.fired.has(part);
    const cells = new Set(
        learners.filter(id => [id, wholeEndpoint(doc, id), organOf(doc, id)?.id].some(fired)));
    const sent = id => stimulus.sent.has(id) || stimulus.earlier?.sent.has(id);
    return [...new Set(routedLinks(doc, sites)
                           .filter(link => sent(link.wire.id) &&
                                           endpointCenters(doc, link.to).some(c => cells.has(c.id)))
                           .map(link => link.wire.id)) ];
  },

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
    for (const {player} of this.pulsePlayers)
      player.stop();
    this.pulsePlayers = [];
  }
};
