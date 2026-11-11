import {BREEDING, ROUTE, TRIAL_KIND, TRIAL_LAB} from '../schema.js';
import {postJson, serverText} from '../session.js';
import {t} from '../strings.js';
import {DRAFT} from './model.js';
import {breedingShell, say} from './view.js';
import {trialShell} from './trial_view.js';
import {inspectedTrial, shownSessions} from './trials.js';

const POLL_MS = 1000, FINGERPRINT_HEX = 16, HEX = 16, BYTE_DIGITS = 2;

// The same fingerprint the station service keeps results under.
async function fingerprintOf(genome, engine) {
  const digest =
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(engine + '\0' + genome));
  return [...new Uint8Array(digest) ]
      .map(b => b.toString(HEX).padStart(BYTE_DIGITS, '0'))
      .join('')
      .slice(0, FINGERPRINT_HEX);
}

export async function laborRequest(body, route = ROUTE.labor) {
  const response = await postJson(route, body);
  const payload = await response.json();
  if (!response.ok || !payload.ok)
    throw new Error(payload.error?.key?.startsWith('labor.') ? t(payload.error.key)
                                                             : serverText(payload.error));
  return payload.result;
}

// A station runs one job at a time for a chosen fish; its settings say how and where.
class LabStation {
  constructor(root, route, shell, settings) {
    this.root = root;
    this.route = route;
    this.shell = shell;
    this.shown = false;
    this.timer = null;
    this.state = {
      overview : null,
      fish : 'brisa',
      ...settings,
      job : null,
      running : false,
      error : '',
      draft : null,
      fingerprint : null
    };
  }
  request(body) { return laborRequest(body, this.route); }
  async open(draft) {
    this.shown = true;
    this.state.draft = draft;
    if (!draft && this.state.fish === DRAFT)
      this.state.fish = 'brisa';
    this.render();
    await this.refresh();
  }
  close() {
    this.shown = false;
    clearTimeout(this.timer);
  }
  render() {
    if (this.shown)
      this.root.innerHTML = this.shell(this.state);
  }
  async refresh() {
    try {
      const overview = await this.request({operation : 'overview'});
      this.state.overview = overview;
      this.follow(overview.job);
      await this.choose(this.state.fish);
    } catch (error) {
      this.fail(error);
    }
  }
  follow(job) {
    this.state.job = job;
    this.state.running = job?.status === 'running';
    if (job?.status === 'failed')
      this.state.error = typeof job.error === 'string' ? job.error : serverText(job.error);
    clearTimeout(this.timer);
    if (this.state.running && this.shown)
      this.timer = setTimeout(() => this.poll(), POLL_MS);
  }
  async poll() {
    try {
      const job = await this.request({operation : 'status', job : this.state.job.id});
      const finished = job.status !== 'running';
      this.follow(job);
      if (finished)
        this.state.overview = await this.request({operation : 'overview'});
      this.render();
    } catch (error) {
      this.fail(error);
    }
  }
  async choose(fish) {
    this.state.fish = fish;
    this.state.fingerprint =
        fish === DRAFT ? await fingerprintOf(this.state.draft.genome, this.state.overview.engine)
                       : this.state.overview?.fish.find(f => f.key === fish)?.fingerprint ?? null;
    this.render();
  }
  settings() { return {}; }
  async start() {
    const s = this.state, draft = s.fish === DRAFT;
    s.error = '';
    try {
      this.follow(await this.request({
        operation : 'start',
        fish : s.fish,
        ...this.settings(),
        ...(draft ? {genome : s.draft.genome, name : s.draft.name} : {})
      }));
      s.fingerprint = s.job.fingerprint;
    } catch (error) {
      this.fail(error);
      return;
    }
    this.render();
  }
  async cancel() {
    try {
      this.follow(await this.request({operation : 'cancel', job : this.state.job.id}));
      this.state.overview = await this.request({operation : 'overview'});
    } catch (error) {
      this.fail(error);
      return;
    }
    this.render();
  }
  fail(error) {
    this.state.error = error.message || say('errors.server');
    this.render();
  }
  click(event) {
    const target = event.target.closest?.('[data-lab-fish],[data-lab-setting],[data-lab]');
    if (!target || target.disabled)
      return false;
    const data = target.dataset;
    if (data.labFish)
      this.choose(data.labFish);
    else if (data.labSetting) {
      this.state[data.labSetting] = Number(data.labValue);
      this.render();
    } else if (data.lab === 'start')
      this.start();
    else if (data.lab === 'cancel')
      this.cancel();
    return true;
  }
}

export class BreedingStation extends LabStation {
  constructor(root) {
    super(root, ROUTE.labor, breedingShell,
          {worlds : BREEDING.worlds[1], steps : BREEDING.steps[1]});
  }
  settings() { return {worlds : this.state.worlds, steps : this.state.steps}; }
}

export class TrialStation extends LabStation {
  constructor(root) {
    super(root, ROUTE.trials, trialShell, {trial : TRIAL_KIND.mussel, seeds : TRIAL_LAB.seeds[1]});
  }
  settings() { return {trial : this.state.trial, seeds : this.state.seeds}; }
  render() {
    const step = this.root.ownerDocument?.activeElement?.dataset?.labStep;
    super.render();
    // Polling may add another finished trial while a keyboard user follows this one's path.
    if (this.shown && step)
      this.root.querySelector('[data-lab-step="' + step + '"]')?.focus();
  }
  click(event) {
    const target = event.target.closest?.('[data-lab-trial],[data-lab-frame],[data-lab-overview]');
    if (!target)
      return super.click(event);
    if (target.disabled)
      return true;
    const s = this.state, data = target.dataset;
    if (data.labTrial !== undefined)
      s.inspection = {
        fingerprint : s.fingerprint,
        kind : s.trial,
        seed : Number(data.labSeed),
        index : Number(data.labTrial),
        frame : 0
      };
    else if (data.labOverview !== undefined)
      s.inspection = null;
    else {
      const selected = inspectedTrial(shownSessions(s.overview, s.fingerprint, s.trial, s.job),
                                      s.inspection, s.fingerprint, s.trial);
      if (selected)
        s.inspection = {
          ...s.inspection,
          frame : Math.max(0, Math.min(selected.path.length - 1, Number(data.labFrame)))
        };
    }
    this.render();
    if (data.labStep)
      this.root.querySelector('[data-lab-step="' + data.labStep + '"]')?.focus();
    else if (data.labTrial !== undefined)
      this.root.querySelector('[data-lab-step="next"]')?.focus();
    return true;
  }
}
