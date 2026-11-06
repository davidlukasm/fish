import {brainState, resetBrainView} from './brain.js';
import {setFollowing, updateCameraState} from './camera.js';
import {el} from './dom.js';
import {evolutionState, previewSpecies, setView} from './evolution.js';
import {feeding_viewState, updateFeedingViewState} from './feeding_view.js';
import {tankHideTooltip} from './hover.js';
import {FISH} from './schema.js';
import {showSelection} from './selection.js';
import {command, sessionState, updateSessionState} from './session.js';
import {frameFish, sceneState} from './state.js';

export function syncBrainRequest() {
  if (!sceneState.frame)
    return;
  return command('brain', {
    value : !sceneState.frame.turbo && !evolutionState.editing && sceneState.frame.selected &&
                    (brainState.brainOpen || el('observation-mode').value === 'senses')
                ? 1
                : 0
  });
}

export async function selectFish(
    id, {follow = true, details = true, fromZoom = false, preserveGroup = false} = {}) {
  const sequence =
            updateSessionState({selectionSequence : (sessionState.selectionSequence || 0) + 1}),
        requestGeneration = sessionState.generation || 0;
  if (evolutionState.previewSpecies)
    previewSpecies(0);
  sceneState.pendingSelection = id;
  if (id && !preserveGroup) {
    sceneState.highlightSpecies = 0;
    sceneState.highlightSick = false;
  }
  if (!fromZoom)
    updateCameraState({zoomIntent : null});
  sceneState.tankPreviewFish = 0;
  if (typeof tankHideTooltip === 'function')
    tankHideTooltip(true);
  if (await command('select', {value : id})) {
    if (sequence !== sessionState.selectionSequence ||
        requestGeneration !== (sessionState.generation || 0))
      return;
    sceneState.pendingSelection = null;
    sceneState.playback = null;
    resetBrainView();
    if (!id && typeof feeding_viewState.lastSelectedProfile !== 'undefined')
      updateFeedingViewState({lastSelectedProfile : null});
    if (sceneState.frame) {
      sceneState.frame = {
        ...sceneState.frame,
        selected : id,
        selected_body : id && sceneState.frame.selected === id ? sceneState.frame.selected_body
                                                               : null,
        selected_death : null,
        brain : id && sceneState.frame.selected === id ? sceneState.frame.brain : null
      };
      showSelection(sceneState.frame);
    }
    setFollowing(
        !!(follow && !evolutionState.editing && frameFish(sceneState.frame, id)?.[FISH.hatched]),
        true);
    if (details && !evolutionState.editing && id)
      setView('fish');
    if (evolutionState.editing)
      await command('brain', {value : 0});
  }
  if (sequence === sessionState.selectionSequence)
    sceneState.pendingSelection = null;
}
