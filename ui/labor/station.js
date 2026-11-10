import {BREEDING, ROUTE} from '../schema.js';
import {postJson, serverText} from '../session.js';
import {t} from '../strings.js';
import {DRAFT} from './model.js';
import {breedingShell, say} from './view.js';

const POLL_MS = 1000, FINGERPRINT_HEX = 16, HEX = 16, BYTE_DIGITS = 2;

// The same fingerprint the breeding service keeps results under.
async function fingerprintOf(genome) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(genome));
  return [...new Uint8Array(digest) ]
      .map(b => b.toString(HEX).padStart(BYTE_DIGITS, '0'))
      .join('')
      .slice(0, FINGERPRINT_HEX);
}

export async function laborRequest(body) {
  const response = await postJson(ROUTE.labor, body);
  const payload = await response.json();
  if (!response.ok || !payload.ok)
    throw new Error(payload.error?.key?.startsWith('labor.') ? t(payload.error.key)
                                                             : serverText(payload.error));
  return payload.result;
}

export class BreedingStation {
  constructor(root) {
    this.root = root;
    this.shown = false;
    this.timer = null;
    this.state = {
      overview : null,
      fish : 'brisa',
      worlds : BREEDING.worlds[1],
      steps : BREEDING.steps[1],
      job : null,
      running : false,
      error : '',
      draft : null,
      fingerprint : null
    };
  }
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
      this.root.innerHTML = breedingShell(this.state);
  }
  async refresh() {
    try {
      const overview = await laborRequest({operation : 'overview'});
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
      const job = await laborRequest({operation : 'status', job : this.state.job.id});
      const finished = job.status !== 'running';
      this.follow(job);
      if (finished)
        this.state.overview = await laborRequest({operation : 'overview'});
      this.render();
    } catch (error) {
      this.fail(error);
    }
  }
  async choose(fish) {
    this.state.fish = fish;
    this.state.fingerprint =
        fish === DRAFT ? await fingerprintOf(this.state.draft.genome)
                       : this.state.overview?.fish.find(f => f.key === fish)?.fingerprint ?? null;
    this.render();
  }
  async start() {
    const s = this.state, draft = s.fish === DRAFT;
    s.error = '';
    try {
      this.follow(await laborRequest({
        operation : 'start',
        fish : s.fish,
        worlds : s.worlds,
        steps : s.steps,
        ...(draft ? {genome : s.draft.genome, name : s.draft.name} : {})
      }));
    } catch (error) {
      this.fail(error);
      return;
    }
    this.render();
  }
  async cancel() {
    try {
      this.follow(await laborRequest({operation : 'cancel', job : this.state.job.id}));
      this.state.overview = await laborRequest({operation : 'overview'});
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
    const target = event.target.closest?.('[data-breed-fish],[data-breed-worlds],' +
                                          '[data-breed-steps],[data-breed]');
    if (!target || target.disabled)
      return false;
    const data = target.dataset;
    if (data.breedFish)
      this.choose(data.breedFish);
    else if (data.breedWorlds) {
      this.state.worlds = Number(data.breedWorlds);
      this.render();
    } else if (data.breedSteps) {
      this.state.steps = Number(data.breedSteps);
      this.render();
    } else if (data.breed === 'start')
      this.start();
    else if (data.breed === 'cancel')
      this.cancel();
    return true;
  }
}
