import {
  contactCenters,
  findCenter,
  findOrgan,
  groupReport,
  organOf,
  substanceBound
} from './model/document.js';
import {organCells} from './view/vision.js';
import {isPelvicMuscle, organFunction} from './model/organs.js';
import {sideOf} from './model/layout.js';
import {HORMONE_EFFECT, MOTOR_KIND} from '../schema.js';
import {planTrace, cppnTrace} from './model/trace.js';
import {routedLinks} from './model/regions.js';
import {createPlanPlayer} from './view/pulse.js';
import {nodeLocation} from './view/places.js';
import {PREVIEW_INPUT_LOW, previewContextOf} from './view/development.js';
import {clamp} from '../units.js';
import {label} from './view/kit.js';
import {acceptedGenome} from './view/compiler.js';

// A sense cell answering less than this does not start a trace.
const ANSWERS = .05;
export const trialMethods = {
  setTraceSource(source) {
    if (!['plan', 'cppn'].includes(source))
      return;
    if (source === 'cppn' && (!acceptedGenome(this.state) || !this.state.report?.compiler))
      return;
    this.clearStimulus();
    this.state.traceSource = source;
    this.state.contactView = source === 'cppn' ? 'actual' : 'design';
    this.refreshLibrary();
    this.refreshSwitches();
    this.refreshViews();
  },
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
    for (const [keys, name] of [[ stimulus.modulated, 'aid-pulse-tuned' ],
                                [ stimulus.hormones, 'aid-pulse-hormone' ]])
      for (const key of keys)
        for (const element of this.stimulusMarks(key))
          element.classList.add(name);
    for (const leg of stimulus.sent)
      for (const element of this.legWires(leg)) {
        element.classList.add('aid-pulse-used');
        element.classList.toggle('aid-pulse-withdrawn', leg.kind === 'electrical' && leg.sign < 0);
      }
    for (const leg of stimulus.learned)
      for (const element of this.legWires(leg))
        element.classList.add('aid-pulse-learned');
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
      ...svg.querySelectorAll('.aid-centers [data-organ="' + escaped + '"]'),
      ...svg.querySelectorAll('[data-generated="' + escaped + '"]')
    ];
    const owner = marks.length ? null : findCenter(this.state.document, key)?.organ;
    return owner && owner.type !== 'brain' ? this.stimulusMarks(owner.id) : marks;
  },
  stimulate(centerIds) {
    if (!this.state.sites.length || !Array.isArray(centerIds) || !centerIds.length)
      return;
    this.clearStimulus();
    if (this.state.traceSource !== 'cppn')
      this.showDrawnContacts();
    const doc = this.state.document,
          trace = this.state.traceSource === 'cppn'
                      ? cppnTrace(this.state, centerIds)
                      : planTrace(doc, this.state.sites, centerIds, this.state.capabilities);
    if (!trace.starts.length)
      return this.notice(label('status.noPotential'));
    const stimulus = {
      starts : trace.starts,
      fired : new Set(trace.starts),
      quieted : new Set(),
      modulated : new Set(),
      hormones : new Set(),
      sent : [],
      learned : [],
      taught : new Map()
    };
    this.state.stimulus = stimulus;
    this.refreshViews();
    const svg = this.bodyMap();
    if (!svg)
      return;
    const centers = new Map(contactCenters(this.state).map(center => [center.id, center]));
    this.pulsePlayer = createPlanPlayer(svg, trace, {
      marks : id => this.stimulusMarks(id),
      point : id => {
        const center = centers.get(id);
        return center && nodeLocation(doc, this.state.sites, center, center.organType);
      },
      reached : part => {
        const set = part.kind === 'hormone'    ? stimulus.hormones
                    : part.kind === 'teaching' ? stimulus.modulated
                    : part.sign < 0            ? stimulus.quieted
                                               : stimulus.fired;
        set.add(part.id);
        const cls = part.kind === 'hormone'    ? 'aid-pulse-hormone'
                    : part.kind === 'teaching' ? 'aid-pulse-tuned'
                    : part.sign < 0            ? 'aid-pulse-quieted'
                                               : 'aid-pulse-fired';
        for (const element of this.stimulusMarks(part.id))
          element.classList.add(cls);
        if (part.kind === 'electrical' && part.sign > 0)
          for (const [element, move] of this.stimulusMoves(part.id))
            element.classList.add(move);
        this.learnedPaths(part, stimulus);
      },
      sent : leg => {
        if (leg.kind === 'hormone')
          return;
        stimulus.sent.push(leg);
        for (const element of this.legWires(leg)) {
          element.classList.add('aid-pulse-used');
          element.classList.toggle('aid-pulse-withdrawn',
                                   leg.kind === 'electrical' && leg.sign < 0);
        }
      }
    });
    this.pulsePlayer.start();
    this.notice(label('status.planTraced'));
  },
  // A physical stimulus is no impulse of its own: its trace starts at the sense cells that answer
  // it, once the design run has measured them.
  traceAnswered(request) {
    const pending = this.pendingTrace;
    if (!pending || !(request > pending.after))
      return;
    this.pendingTrace = null;
    const organ = findOrgan(this.state.document, pending.organ);
    if (!organ || !this.state.anatomy)
      return;
    const answers = new Map();
    for (const {center, answer} of organCells(this.state, organ))
      answers.set(center.id, Math.max(answers.get(center.id) ?? 0, answer));
    for (const center of organ.centers)
      if (!answers.has(center.id))
        answers.set(center.id,
                    groupReport(this.state.document, this.state.anatomy, 'senseProbe', center.id) ??
                        0);
    const answering = [...answers ].filter(([, answer ]) => answer > ANSWERS).map(([ id ]) => id);
    if (answering.length)
      this.stimulate(answering);
  },
  setPreviewContext(key, value) {
    if (!Number.isFinite(value))
      return;
    const previous = previewContextOf(this.state),
          next = {...previous, hormones : [...previous.hormones ]};
    if (key === 'maturity')
      next.maturity = clamp(value);
    else if (key === 'input')
      this.state.previewInput = clamp(value, PREVIEW_INPUT_LOW);
    else if (Number.isInteger(Number(key)) && Number(key) >= 0 &&
             Number(key) < next.hormones.length)
      next.hormones[Number(key)] = clamp(value);
    else
      return;
    this.clearStimulus();
    this.state.previewContext = next;
    // Only the inspector shows example values; the fish does not depend on them.
    this.previewFrame ??= requestAnimationFrame(() => {
      this.previewFrame = null;
      this.refreshInspector();
    });
  },
  legWires(leg) {
    const svg = this.bodyMap();
    if (!svg)
      return [];
    if (this.wireIndex?.svg !== svg) {
      const pairs = new Map();
      for (const element of svg.querySelectorAll('.aid-wire-group[data-signal-edges]'))
        for (const pair of element.dataset.signalEdges.split(' ')) {
          if (!pairs.has(pair))
            pairs.set(pair, []);
          pairs.get(pair).push(element);
        }
      this.wireIndex = {svg, pairs};
    }
    return this.wireIndex.pairs.get(leg.from + '>' + leg.to) ?? [];
  },
  // A substance teaches only cells whose teaching receptor holds that very substance.
  teaches(part) {
    if (part.kind === 'teaching')
      return true;
    const receptor =
        findCenter(this.state.document, part.id)?.center?.receptors[HORMONE_EFFECT.teaching];
    return part.kind === 'hormone' && substanceBound(HORMONE_EFFECT.teaching, receptor) &&
           receptor.substance === part.substance;
  },
  // A teacher reaching a cell that has fired, by then or in the same step: the inputs that made
  // it fire are what it learns, and those paths glow golden.
  learnedPaths(part, stimulus) {
    if (this.teaches(part) && !stimulus.taught.has(part.id))
      stimulus.taught.set(part.id, part.level);
    const taughtAt = stimulus.taught.get(part.id);
    const firing = part.kind === 'electrical' && part.sign > 0;
    if (!stimulus.fired.has(part.id) || taughtAt === undefined ||
        (firing && taughtAt !== part.level))
      return;
    for (const leg of stimulus.sent) {
      if (leg.to !== part.id || leg.kind !== 'electrical' || !(leg.sign > 0) ||
          stimulus.learned.includes(leg))
        continue;
      stimulus.learned.push(leg);
      for (const element of this.legWires(leg))
        element.classList.add('aid-pulse-learned');
    }
  },
  // How a reached organ shows that it acts: the tail beats, a fin turns, the mouth bites or sucks,
  // spines rise, pigment spreads.
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
      [MOTOR_KIND.turn] : () =>
          part('[data-part="fin"][data-fin="' + (isPelvicMuscle(organ) ? 'pelvic' : 'pectoral') +
                   '"][data-side="' + side + '"]',
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
    this.pendingTrace = null;
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
