import {BREEDING, ROUTE, TRIAL_KIND, TRIAL_LAB} from '../schema.js';
import {postJson, serverText} from '../session.js';
import {t} from '../strings.js';
import {BREEDING_METRICS, DRAFT, shownWorlds} from './model.js';
import {breedingShell, say} from './view.js';
import {trialShell} from './trial_view.js';
import {inspectedTrial, shownSessions} from './trials.js';
import {lifeKey, lifeWindow, lifeWorlds, nearestLifeTime, sceneKey, selectedLife} from './life.js';
import {paintLabScene} from './scene.js';
import {hydrateRender} from '../statistics_frame.js';

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
    if (this.shown) {
      const scroll = this.root.querySelector?.('.aid-lab-results')?.scrollTop ?? 0;
      this.root.innerHTML = this.shell(this.state);
      const results = this.root.querySelector?.('.aid-lab-results');
      if (results)
        results.scrollTop = scroll;
    }
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
        await this.refresh();
      else
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
      await this.refresh();
    } catch (error) {
      this.fail(error);
    }
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
          {worlds : BREEDING.worlds[1], steps : BREEDING.steps[1], metric : 'population'});
  }
  settings() { return {worlds : this.state.worlds, steps : this.state.steps}; }
  async loadLife(selected) {
    const key = lifeKey(selected), version = key + ':' + selected.summary.last;
    if (this.lifePending === version || this.lifeFailed === version)
      return;
    this.lifePending = version;
    const token = this.lifeToken = (this.lifeToken ?? 0) + 1;
    try {
      const data = await this.request({operation : 'life', ...selected.run, id : selected.fishId});
      const current = selectedLife(this.state);
      if (token !== this.lifeToken || !current || lifeKey(current) !== key)
        return;
      this.state.lifeDetail = {key, data};
      this.state.lifeError = '';
    } catch (error) {
      if (token !== this.lifeToken)
        return;
      this.lifeFailed = version;
      this.state.lifeError = error.message;
    } finally {
      if (token === this.lifeToken) {
        this.lifePending = null;
        this.render();
      }
    }
  }
  render() {
    const folds = [...(this.root.querySelectorAll?.('[data-lab-fold]') ?? []) ].map(
        el => [el.dataset.labFold, el.open]);
    const list = this.root.querySelector?.('.aid-life-list');
    const position = list && {top : list.scrollTop, left : list.scrollLeft};
    const data = this.root.ownerDocument?.activeElement?.dataset;
    const selector = data?.labLifeTime     ? '[data-lab-life-time="' + data.labLifeTime + '"]'
                     : data?.labLife       ? '[data-lab-life="' + data.labLife + '"]'
                     : data?.labSampleStep ? '[data-lab-sample-step="' + data.labSampleStep + '"]'
                     : data?.labMetric     ? '[data-lab-metric="' + data.labMetric + '"]'
                     : data?.labWorld      ? '.aid-lab-plot[data-lab-world="' + data.labWorld + '"]'
                                           : null;
    super.render();
    if (this.shown) {
      for (const [key, open] of folds) {
        const fold = this.root.querySelector('[data-lab-fold="' + key + '"]');
        if (fold)
          fold.open = open;
      }
      const nextList = this.root.querySelector?.('.aid-life-list');
      if (nextList && position) {
        nextList.scrollTop = position.top;
        nextList.scrollLeft = position.left;
      }
    }
    if (this.shown && selector)
      this.root.querySelector(selector)?.focus({preventScroll : true});
    const selected = selectedLife(this.state);
    if (this.shown && selected &&
        (!selected.detail || selected.detail.summary.last < selected.summary.last))
      this.loadLife(selected);
    if (this.shown && selected)
      this.showScene(selected);
  }
  // The recorded scene at or before the chosen step: painted when it is here, fetched once when
  // not.
  showScene(selected) {
    if (!Number.isFinite(selected.sceneStep))
      return;
    const key = sceneKey(selected), scene = this.state.labScene;
    this.sceneRequested = key;
    if (scene?.key === key) {
      const canvas = this.root.querySelector('[data-lab-scene] canvas');
      if (canvas)
        paintLabScene(canvas, scene.data.frame, selected.fishId);
      return;
    }
    if (this.scenePending === key || this.sceneFailed === key)
      return;
    this.scenePending = key;
    const token = this.sceneToken = (this.sceneToken ?? 0) + 1;
    return this.request({operation : 'scene', ...selected.run, step : selected.sceneStep})
        .then(data => {
          if (token !== this.sceneToken || this.sceneRequested !== key)
            return;
          // Each stored scene is complete; its asset numbers belong only to this frame.
          const frame = hydrateRender(data.frame, {renderAssets : data.frame.assets});
          this.state.labScene = {key, data : {...data, frame}};
          this.state.sceneError = null;
        })
        .catch(error => {
          if (token !== this.sceneToken || this.sceneRequested !== key)
            return;
          this.sceneFailed = key;
          this.state.sceneError = {key, reason : error.message};
        })
        .finally(() => {
          if (token !== this.sceneToken)
            return;
          this.scenePending = null;
          if (this.sceneRequested === key)
            this.render();
        });
  }
  click(event) {
    const lifeTarget = event.target.closest?.(
        '[data-lab-life],[data-lab-life-world],[data-lab-life-time],[data-lab-life-plane],[data-lab-life-focus]');
    if (lifeTarget && Object.keys(lifeTarget.dataset).some(k => k.startsWith('labLife')))
      return this.clickLife(event, lifeTarget);
    const target = event.target.closest?.('[data-lab-metric],[data-lab-sample]');
    if (!target)
      return super.click(event);
    if (target.disabled)
      return true;
    const s = this.state, data = target.dataset;
    if (data.labMetric) {
      if (!BREEDING_METRICS.includes(data.labMetric))
        return false;
      s.metric = data.labMetric;
    } else {
      const world = shownWorlds(s.overview, s.fingerprint, s.steps, s.job)
                        .find(w => w.seed === Number(data.labWorld));
      if (!world?.samples?.length)
        return false;
      const frame = data.labSample === 'latest' ? null : Number(data.labSample);
      if (frame !== null && !Number.isInteger(frame))
        return false;
      s.inspection = {
        fingerprint : s.fingerprint,
        steps : s.steps,
        seed : world.seed,
        frame : frame === null ? null : Math.max(0, Math.min(world.samples.length - 1, frame))
      };
    }
    this.render();
    if (data.labSampleStep)
      this.root.querySelector?.('[data-lab-sample-step="' + data.labSampleStep + '"]')?.focus({
        preventScroll : true
      });
    return true;
  }
  clickLife(event, target) {
    if (target.disabled)
      return true;
    const s = this.state, data = target.dataset, selected = selectedLife(s);
    if (!selected)
      return false;
    if (data.labLifeWorld !== undefined) {
      const world = lifeWorlds(s).find(w => w.seed === Number(data.labLifeWorld));
      const id = data.labLife === undefined ? Number(Object.keys(world?.lives ?? {})[0])
                                            : Number(data.labLife);
      if (!world?.lives[id])
        return false;
      s.lifeSelection = {run : {...selected.run, seed : world.seed}, fishId : id, step : null};
      s.lifeError = '';
      this.lifeFailed = null;
    } else if (data.labLifeFocus !== undefined)
      s.lifeFocused = data.labLifeFocus === '1';
    else {
      let step = Number(data.labLifeTime);
      if (data.labLifePlane !== undefined) {
        const box = target.getBoundingClientRect(), window = lifeWindow(selected, s.lifeFocused);
        step = nearestLifeTime(selected, window.from + (event.clientX - box.left) / box.width *
                                                           (window.to - window.from));
      }
      if (!Number.isFinite(step))
        return false;
      s.lifeSelection = {run : selected.run, fishId : selected.fishId, step};
      if (data.labLifePhase !== undefined)
        s.lifeFocused = true;
    }
    this.render();
    return true;
  }
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
