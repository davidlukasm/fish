import {KEY} from './keys.js';
import {showBrain} from './brain.js';
import {resizeAquarium, SCREEN} from './camera.js';
import {el, redrawCharts} from './dom.js';
import {redrawFamilies} from './lineage.js';
import {sceneState} from './state.js';
export const panelsState = {};
export let screenWidth;

export let detailWidth;

const PANEL = Object.freeze(
    {width : 420, min_width : 285, tank_room : 280, key_step : 40, detail_width : 480});
const panelLimit = () => Math.max(PANEL.min_width, screenWidth() - PANEL.tank_room);
export function panelWidth() { return Number(el('layout').dataset.panelWidth) || PANEL.width; }

export function applyPanelWidth(value) {
  const width =
      Math.round(Math.max(PANEL.min_width, Math.min(Number(value) || PANEL.width, panelLimit())));
  const layout = el('layout');
  layout.dataset.panelWidth = String(width);
  if (layout.style.setProperty)
    layout.style.setProperty('--cockpit-width', width + 'px');
  else
    layout.style['--cockpit-width'] = width + 'px';
  el('panel-divider').setAttribute('aria-valuenow', String(width));
  el('panel-divider').setAttribute('aria-valuemin', String(PANEL.min_width));
  el('panel-divider').setAttribute('aria-valuemax', String(panelLimit()));
  resizeAquarium();
  redrawCharts();
  if (sceneState.frame && typeof showBrain === 'function')
    showBrain(sceneState.frame);
  if (sceneState.frame && typeof redrawFamilies === 'function')
    redrawFamilies();
}

function savePanelWidth() {
  panelsState.panelWidths.cockpit = panelWidth();
  try {
    window.localStorage?.setItem('fish-panel-widths', JSON.stringify(panelsState.panelWidths));
  } catch {
  }
}

const initializers = {
  "panelDrag" : () => { panelsState.panelDrag = null; },
  "panelWidths" : () => { panelsState.panelWidths = {}; },
  "JSON_parse" : () => {
    try {
      const stored = JSON.parse(window.localStorage?.getItem('fish-panel-widths') || '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored))
        panelsState.panelWidths = stored;
    } catch {
    }
  },
  "screenWidth" : () => {
    screenWidth = () =>
        window.innerWidth || el('layout').getBoundingClientRect().width || SCREEN.width;
  },
  "detailWidth" : () => { detailWidth = () => Math.min(PANEL.detail_width, panelLimit()); },
  "panel_divider_onpointerdown" : () => {
    el('panel-divider').onpointerdown = e => {
      if (e.button !== 0)
        return;
      panelsState.panelDrag = {x : e.clientX, width : panelWidth()};
      el('panel-divider').setPointerCapture?.(e.pointerId);
      el('layout').classList.toggle('panel-resizing', true);
    };
  },
  "panel_divider_onpointermove" : () => {
    el('panel-divider').onpointermove = e => {
      if (panelsState.panelDrag)
        applyPanelWidth(panelsState.panelDrag.width + panelsState.panelDrag.x - e.clientX);
    };
  },
  "panel_divider_onpointerup" : () => {
    el('panel-divider').onpointerup = () => {
      if (!panelsState.panelDrag)
        return;
      panelsState.panelDrag = null;
      el('layout').classList.toggle('panel-resizing', false);
      savePanelWidth();
    };
  },
  "panel_divider_onpointercancel" :
      () => { el('panel-divider').onpointercancel = el('panel-divider').onpointerup; },
  "panel_divider_onkeydown" : () => {
    el('panel-divider').onkeydown = e => {
      if (![KEY.left, KEY.right, KEY.home, KEY.end].includes(e.key))
        return;
      e.preventDefault();
      applyPanelWidth(e.key === KEY.home ? PANEL.width
                      : e.key === KEY.end
                          ? detailWidth()
                          : panelWidth() + (e.key === KEY.left ? 1 : -1) * PANEL.key_step);
      savePanelWidth();
    };
  },
  "addEventListener_resize" :
      () => { window.addEventListener?.('resize', () => applyPanelWidth(panelWidth())); },
  "applyPanelWidth" : () => { applyPanelWidth(panelsState.panelWidths.cockpit || PANEL.width); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
