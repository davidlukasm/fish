import {acceptedGenome, compilerPanel, compilerProgress} from './compiler.js';
import {cppnGraph, cppnInspector, cppnToolbar} from './graph.js';
import {inspector} from './panels.js';
import {fishScene} from './scene.js';
import {escapeText} from './markup.js';
import {percent, t} from '../../strings.js';
import {libraryOf, toolPalette} from './library.js';
import {label} from './kit.js';
import {GENOME_SUFFIX} from '../requests.js';
import {LAYER_KEYS, layerMode, layerShown} from './layers.js';
import {CONTACT_LIMITS} from './wires.js';

const button = (attributes, text, {active = false, disabled = false, cls = ''} = {}) =>
    '<button ' + attributes +
    (active || cls ? ' class="' + [ cls, active ? 'active' : '' ].filter(Boolean).join(' ') + '"'
                   : '') +
    (disabled ? ' disabled' : '') + '>' + text + '</button>';
const group = (body, name = null, cls = '') =>
    '<div class="aid-button-group' + (cls ? ' ' + cls : '') + '"' +
    (name ? ' role="group" aria-label="' + name + '"' : '') + '>' + body + '</div>';
const footer = (message, brand) => '<footer class="aid-station-footer"><span class="aid-message">' +
                                   escapeText(message) + '</span><span>' + brand +
                                   '</span></footer>';

export const panelStyle = panels =>
    Object.entries(panels).map(([ key, width ]) => `--aid-${key}:${width}px`).join(';');
export const headerStatus = state =>
    state.compileProgress ? compilerProgress(state) : cellStatus(state);
export function developAction(state) {
  if (state.compileProgress)
    return {action : 'cancel-build', text : label('compiler.cancel'), disabled : false};
  return {
    action : 'develop',
    text : label(state.busy ? 'app.developBusy' : 'app.develop'),
    disabled : state.busy
  };
}
export const zoomStamp = camera => percent(camera.zoom);
function cellStatus(state) {
  const {report, stale, anatomy} = state;
  if (report && !stale)
    return t('studio.app.developedCount', {cells : report.neurons, contacts : report.synapses});
  return Number.isFinite(anatomy?.neurons) ? t('studio.app.plannedCount', {cells : anatomy.neurons})
                                           : label('app.draft');
}

export function hubShell() {
  const tile = (action, title, text) => '<button class="aid-hub-tile active" data-action="' +
                                        action + '"><strong>' + label(title) + '</strong><span>' +
                                        label(text) + '</span></button>';
  return '<div class="aid-hub"><header class="aid-header"><div class="aid-header-brand"><div><small>' +
         label('app.hubBrand') + '</small><h1>' + label('app.hubTitle') +
         '</h1></div></div><div class="aid-status">' + label('app.hubStatistics') +
         '</div></header><main class="aid-hub-content"><small>' + label('app.hubStation') +
         '</small><h2>' + label('app.hubTitle') + '</h2><div class="aid-hub-grid">' +
         tile('aquarium', 'app.hubAquarium', 'app.hubStatistics') +
         tile('atelier', 'app.hubAtelier', 'app.hubStart') + '</div></main>' +
         footer(label('status.waiting'), label('app.hubFooter')) + '</div>';
}

function stationHeader(s) {
  const accepted = acceptedGenome(s);
  return '<header class="aid-header"><div class="aid-header-brand">' +
         button('data-action="home"', '<span aria-hidden="true">' + label('app.backMark') +
                                          '</span>' + label('app.home')) +
         '<div><small>' + label('app.stationBrand') + '</small><h1>' + label('app.title') +
         '</h1></div></div>' +
         '<div class="aid-status" role="status">' + escapeText(headerStatus(s)) + '</div>' +
         '<div class="aid-header-actions">' +
         group(
             button('data-action="new"', label('app.newFish')) +
                 button('data-action="example"', label('app.example')) +
                 '<select data-start-fish aria-label="' + label('app.startFish') + '"' +
                 (s.busy ? ' disabled' : '') + '><option value="">' + label('app.startFish') +
                 '</option><option value="start">' + label('app.miro') +
                 '</option><option value="plants">' + label('app.alva') +
                 '</option><option value="brisa">' + label('app.brisa') + '</option></select>' +
                 button('data-action="open"', label('app.open')) +
                 button('data-action="download"', label('app.saveGenome'), {disabled : !accepted}),
             label('app.groupPlan')) +
         group(button('data-action="' + developAction(s).action + '"', developAction(s).text,
                      {cls : 'primary', disabled : developAction(s).disabled}) +
                   button('data-action="eggs"', label('app.placeEggs'),
                          {disabled : !accepted || !s.report?.viable}),
               label('app.groupFish'), 'flow') +
         '</div>' +
         '<input type="file" id="' + GENOME_FILE_ID + '" accept="' + GENOME_SUFFIX +
         ',text/plain" hidden/></header>';
}
export const GENOME_FILE_ID = 'aid-genome-file', CPPN_SCENE_ID = 'aid-cppn-scene';
function layerSwitch(s, key) {
  const mode = layerMode(s, key), shown = layerShown(s, key);
  return button('data-layer="' + key + '" data-layer-mode="' + mode + '" aria-pressed="' + shown +
                    '" title="' + label('layers.mode.' + mode) + '"',
                label('layers.' + key), {active : shown});
}
export const layerSwitches = s => LAYER_KEYS.map(key => layerSwitch(s, key)).join('');
function stationStage(s, cppn) {
  if (cppn)
    return '<div class="aid-scene-top"><span>' + label('cppn.graph') + '</span></div>' +
           '<div id="' + CPPN_SCENE_ID + '" class="aid-scene-body">' + cppnGraph(s) + '</div>';
  return '<div class="aid-scene-top"><span>' + label('app.empty') +
         '</span><div class="aid-view-options">' +
         group(button('data-contacts="design"', label('tools.drawnContacts'),
                      {active : s.contactView === 'design'}) +
               button('data-contacts="actual"', label('tools.developedContacts'), {
                 active : s.contactView === 'actual',
                 disabled : s.stale || !s.report?.compiler
               })) +
         group(button('data-network="all"', label('tools.allNetworks'),
                      {active : s.wireScope === 'all'}) +
               button('data-network="focus"', label('tools.focusedNetwork'),
                      {active : s.wireScope === 'focus'})) +
         group(layerSwitches(s), label('layers.title'), 'aid-layer-switches') +
         '<label class="aid-contact-limit">' + label('tools.contactLimit') +
         '<select data-contact-limit>' +
         CONTACT_LIMITS
             .map(n => '<option value="' + n + '"' +
                       ((s.contactLimit ?? CONTACT_LIMITS[0]) === n ? ' selected' : '') + '>' +
                       (n || label('tools.allContacts')) + '</option>')
             .join('') +
         '</select></label>' +
         '</div></div><div class="aid-scene-body"><div class="aid-scene-frame">' + fishScene(s) +
         '</div>' + toolPalette(s) + '<span class="aid-canvas-toolbar">' + zoomStamp(s.camera) +
         '</span></div>';
}
const grip = panel => '<div class="aid-panel-grip" data-panel-grip="' + panel + '" title="' +
                      label('app.panelWidth') + '"></div>';
export function stationShell(s) {
  const cppn = s.mode === 'cppn', offered = libraryOf(s);
  return '<div class="aid-station">' + stationHeader(s) + '<nav class="aid-modes">' +
         button('data-mode="fish"', label('app.modeFish'), {active : !cppn}) +
         button('data-mode="cppn"', label('app.modeCppn'), {active : cppn}) + compilerPanel(s) +
         '</nav><div class="aid-workspace-main" style="' + panelStyle(s.panels) +
         '"><div class="aid-library">' + grip('library') +
         '<div class="aid-library-scroll" data-library="' + offered.kind + '">' +
         (cppn ? '<h3>' + label('cppn.graph') + '</h3>' + cppnToolbar(s) : offered.html) +
         '</div></div><section class="aid-stage">' + stationStage(s, cppn) +
         '</section><div class="aid-inspector">' + grip('inspector') +
         '<div class="aid-inspector-scroll">' + (cppn ? cppnInspector(s) : inspector(s)) +
         '</div></div></div>' +
         footer(s.notice || label('status.waiting'), label('app.stationFooter')) + '</div>';
}
