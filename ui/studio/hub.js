import {sceneState} from '../state.js';
import {sessionState} from '../session.js';
import {populationOverview} from '../population_model.js';
import {laborRequest} from '../labor/station.js';
import {figureText, hubShell, LIVE_FIGURES, liveState, sparkline} from './view/hub.js';

const TICK_MS = 1000, OVERVIEW_TICKS = 5;

export function liveFigures(f) {
  if (!f?.fish)
    return null;
  return {
    fish : f.hatched,
    eggs : Math.max(0, (f.eggs ?? 0) - (f.nutrient_eggs_alive ?? 0)),
    species : (f.species ?? []).filter(s => s?.adults > 0).length,
    generation : populationOverview(f).generation,
    step : f.step,
    paused : !!f.paused
  };
}

// Fish over the whole run, as the aquarium's own history records them.
export const runHistory = data =>
    (data?.points ?? []).filter(p => !p.historical).map(p => [p.step, p.adults ?? 0]);

// The start page: live figures from the aquarium, the stations and the shelf of start fish.
export class StationHub {
  constructor(root) {
    this.root = root;
    this.timer = null;
    this.ticks = 0;
    this.state = {figures : null, history : [], overview : null, draft : ''};
  }
  open(draft) {
    this.state.draft = draft;
    this.sample();
    this.render();
    this.loadOverview();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  close() {
    clearInterval(this.timer);
    this.timer = null;
  }
  render() { this.root.innerHTML = hubShell(this.state); }
  sample() {
    this.state.figures = liveFigures(sceneState.frame);
    this.state.history = runHistory(sessionState.historyData);
  }
  tick() {
    this.sample();
    for (const key of LIVE_FIGURES) {
      const node = this.root.querySelector('[data-live="' + key + '"]');
      if (node)
        node.textContent = figureText(this.state, key);
    }
    const state = this.root.querySelector('[data-live-state]');
    if (state)
      state.textContent = liveState(this.state);
    const spark = this.root.querySelector('[data-live-spark]');
    if (spark)
      spark.innerHTML = sparkline(this.state.history);
    if (++this.ticks % OVERVIEW_TICKS === 0 && this.state.overview?.job?.status === 'running')
      this.loadOverview();
  }
  async loadOverview() {
    try {
      this.state.overview = await laborRequest({operation : 'overview'});
      if (this.timer)
        this.render();
    } catch (error) {
      const message = this.root.querySelector('.aid-message');
      if (message)
        message.textContent = error.message;
    }
  }
}
