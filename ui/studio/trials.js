import {contactCenters, findCenter, findOrgan} from './model/document.js';
import {planTrace, cppnTrace} from './model/trace.js';
import {routedLinks} from './model/regions.js';
import {createPlanPlayer} from './view/pulse.js';
import {nodeLocation} from './view/places.js';
import {PREVIEW_INPUT_LOW, previewContextOf} from './view/development.js';
import {clamp} from '../units.js';
import {label} from './view/kit.js';
import {acceptedGenome} from './view/compiler.js';

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
      fired : new Set(),
      quieted : new Set(),
      modulated : new Set(),
      hormones : new Set()
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
      }
    });
    this.pulsePlayer.start();
    this.notice(label('status.planTraced'));
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
    // Dragging an example value redraws once a frame.
    this.previewFrame ??= requestAnimationFrame(() => {
      this.previewFrame = null;
      this.refreshViews();
      this.refreshGraphics();
    });
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
