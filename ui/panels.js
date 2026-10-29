import {showBrain} from './brain.js';
import {resizeAquarium} from './camera.js';
import {el, redrawCharts} from './dom.js';
import {redrawFamilies} from './lineage.js';
import {sceneState} from './state.js';
export const panelsState = {};
export let screenWidth;

export let detailWidth;

export function panelWidth() { return Number(el('layout').dataset.panelWidth) || 420; }

export function applyPanelWidth(value) {
  const width =
      Math.round(Math.max(285, Math.min(Number(value) || 420, Math.max(285, screenWidth() - 280))));
  const layout = el('layout');
  layout.dataset.panelWidth = String(width);
  if (layout.style.setProperty)
    layout.style.setProperty('--cockpit-width', width + 'px');
  else
    layout.style['--cockpit-width'] = width + 'px';
  el('panel-divider').setAttribute('aria-valuenow', String(width));
  el('panel-divider').setAttribute('aria-valuemin', '285');
  el('panel-divider').setAttribute('aria-valuemax', String(Math.max(285, screenWidth() - 280)));
  resizeAquarium();
  redrawCharts();
  if (sceneState.frame && typeof showBrain === 'function')
    showBrain(sceneState.frame);
  if (sceneState.frame && typeof redrawFamilies === 'function')
    redrawFamilies();
}

// One width for all cockpit tabs; switching tabs never changes it.
export function savePanelWidth() {
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
    screenWidth = () => window.innerWidth || el('layout').getBoundingClientRect().width || 1400;
  },
  "detailWidth" : () => { detailWidth = () => Math.min(480, Math.max(285, screenWidth() - 280)); },
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
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key))
        return;
      e.preventDefault();
      applyPanelWidth(e.key === 'Home'  ? 420
                      : e.key === 'End' ? detailWidth()
                                        : panelWidth() + (e.key === 'ArrowLeft' ? 40 : -40));
      savePanelWidth();
    };
  },
  "addEventListener_resize" :
      () => { window.addEventListener?.('resize', () => applyPanelWidth(panelWidth())); },
  "applyPanelWidth" : () => { applyPanelWidth(panelsState.panelWidths.cockpit || 420); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
