import {ctx} from './dom.js';
import {prepareTankProgram} from './renderer.js';
import {preparedShaders as shaders_particle_renderer} from './particle_renderer.js';
import {preparedShaders as shaders_vegetation} from './vegetation.js';
import {preparedShaders as shaders_sediment_renderer} from './sediment_renderer.js';
import {preparedShaders as shaders_sperm_renderer} from './sperm_renderer.js';
import {preparedShaders as shaders_animals} from './animals.js';
import {bindPopulationPicker} from './population_picker.js';
import {el} from './dom.js';
import './state.js';
import './evolution.js';
import {bindGenomeImport} from './world.js';
import {loadTexts} from './strings.js';
import {initMobile} from './mobile.js';
import {initialize as initialize_renderer} from './renderer.js';
import {initialize as initialize_transport} from './transport.js';
import {initialize as initialize_state} from './state.js';
import {initialize as initialize_dom} from './dom.js';
import {initialize as initialize_camera} from './camera.js';
import {initialize as initialize_session} from './session.js';
import {initialize as initialize_panels} from './panels.js';
import {initialize as initialize_report} from './report.js';
import {initialize as initialize_plant_geometry} from './plant_geometry.js';
import {initialize as initialize_vegetation} from './vegetation.js';
import {initialize as initialize_sediment_renderer} from './sediment_renderer.js';
import {initialize as initialize_particle_renderer} from './particle_renderer.js';
import {initialize as initialize_sperm_renderer} from './sperm_renderer.js';
import {initialize as initialize_fish_geometry} from './fish_geometry.js';
import {initialize as initialize_fish_forms} from './fish_forms.js';
import './fish_organs.js';
import {initialize as initialize_fish_fins} from './fish_fins.js';
import {initialize as initialize_tank_scenery} from './tank_scenery.js';
import {initialize as initialize_tank} from './tank.js';
import './fish_painter.js';
import {initialize as initialize_effects} from './effects.js';
import {initialize as initialize_water_view} from './water_view.js';
import {initialize as initialize_brain_model} from './brain_model.js';
import {initialize as initialize_brain} from './brain.js';
import {initialize as initialize_brain_geometry} from './brain_geometry.js';
import './brain_layout.js';
import './brain_paths.js';
import {initialize as initialize_brain_signals} from './brain_signals.js';
import './brain_occlusion.js';
import './brain_tissue.js';
import './brain_painter.js';
import {initialize as initialize_brain_input} from './brain_input.js';
import {initialize as initialize_brain_probe} from './brain_probe.js';
import './brain_tuning.js';
import {initialize as initialize_animals} from './animals.js';
import {initialize as initialize_organ_readout} from './organ_readout.js';
import {initialize as initialize_organs} from './organs.js';
import './organ_graphics.js';
import './organ_tuning.js';
import {initialize as initialize_hover} from './hover.js';
import {initialize as initialize_family_model} from './family_model.js';
import {initialize as initialize_lineage} from './lineage.js';
import {initialize as initialize_evolution} from './evolution.js';
import {initialize as initialize_world_parameters} from './world_parameters.js';
import {initialize as initialize_world} from './world.js';
import {initialize as initialize_world_sources} from './world_sources.js';
import {initialize as initialize_world_palette} from './world_palette.js';
import {initialize as initialize_cockpit} from './cockpit.js';
import {initialize as initialize_energy_view} from './energy_view.js';
import {initialize as initialize_behavior_view} from './behavior_view.js';
import {initialize as initialize_event_view} from './event_view.js';
import {initialize as initialize_charts} from './charts.js';
import {initialize as initialize_feeding_view} from './feeding_view.js';
import {initialize as initialize_selection} from './selection.js';
import {initialize as initialize_controller} from './controller.js';
import {initialize as initialize_connection} from './connection.js';
import {initialize as initialize_tooltips} from './tooltips.js';
import {initialize as initialize_schema} from './schema.js';
// Wording first: every module may ask for its texts from the start.
await loadTexts();
initialize_renderer([ "tankVertexSource", "tankFragmentSource", "tankIdentity", "tankPoint" ]);
initialize_transport([ "rawScene", "sceneKey", "lightCache" ]);
initialize_state([
  "highlightSpecies", "highlightSick", "layout", "renderInputRevision", "renderTime", "renderScale"
]);
initialize_dom([ "el", "text", "canvas", "ctx" ]);
initialize_tank([ "ctx_onRestore" ]);
initialize_state([ "eggBirths", "maternalBirths" ]);
initialize_camera([ "zoomIntent" ]);
initialize_state([
  "previousFish", "previousFood", "previousCorpses", "frameInterval", "frameRevision",
  "tankPreviewFish", "frame", "previous", "frameTime"
]);
initialize_camera([
  "zoom", "cameraX", "cameraY", "following", "followOffsetX", "followOffsetY", "zoomFollowing",
  "zoomFollowTime", "zoomSelectionPending", "drag", "viewportWidth", "viewportHeight", "pixelRatio"
]);
initialize_session([
  "neuronFocus", "historyData", "historyBusy", "lastHistory", "sessionId", "busy", "feedbackVersion"
]);
initialize_state([ "frameIndexes" ]);
initialize_dom([ "rgb" ]);
initialize_camera([ "new_ResizeObserver_resizeAquarium_observe" ]);
initialize_camera([ "addEventListener_resize" ]);
initialize_camera([ "resizeAquarium" ]);
initialize_panels([
  "panelDrag", "panelWidths", "JSON_parse", "screenWidth", "detailWidth",
  "panel_divider_onpointerdown", "panel_divider_onpointermove", "panel_divider_onpointerup",
  "panel_divider_onpointercancel", "panel_divider_onkeydown", "addEventListener_resize",
  "applyPanelWidth"
]);
initialize_dom([ "uiIconPaths" ]);
initialize_state(
    [ "addEventListener_input", "addEventListener_change", "addEventListener_scroll" ]);
initialize_report([ "fpsDisplay", "fpsReport", "addEventListener_visibilitychange" ]);
initialize_plant_geometry([
  "plantPartsCache", "grassWakeRevision", "grassWakeStep", "grassWakeStates", "grassWakeCurves"
]);
initialize_vegetation(
    [ "grassVertexShader", "flatFragmentShader", "grassFragmentShader", "gpuGrass" ]);
initialize_sediment_renderer([
  "sedimentVertexShader", "sedimentFragmentShader", "gpuSediment", "bedVertex", "bedFragment",
  "gpuSurface", "sedimentCloudVertex", "sedimentCloudFragment", "gpuSedimentCloud",
  "cloudLightFragment", "gpuCloudLight"
]);
initialize_particle_renderer(
    [ "foodVertexShader", "foodFragmentShader", "tankLightField", "gpuFood" ]);
initialize_sperm_renderer([ "renderer" ]);
initialize_fish_geometry([ "fishPlans", "fishPlanOrder" ]);
initialize_fish_forms([ "fishAnatomyCache", "fishOverviewEpoch", "fishOverviewShapes" ]);
initialize_fish_fins([ "fishTemplateScales" ]);
initialize_tank_scenery([
  "scenery", "sceneryPadding", "sceneryKey", "sceneryCamera", "sceneRevision", "sceneSignature"
]);
initialize_effects([
  "combatEpoch", "combatStep", "combatSeen", "combatEffects", "bloodRevision", "bloodSeen",
  "bloodParticles", "bloodReady"
]);
initialize_tank([ "onpointerdown", "onpointermove", "onpointerup", "onpointercancel" ]);
initialize_camera([ "onwheel", "fit_onclick", "follow_onclick", "deselect_onclick" ]);
initialize_water_view([
  "lightTexture", "lightRevision", "sedimentGeometryKey", "sedimentGeometryCache", "sedimentField",
  "sedimentRevision", "dustCells", "grainRevision", "grainScale", "grainView", "grainData"
]);
initialize_brain_model([
  "sensorNames", "motorNames", "brainSenseColors", "scentNames", "scentColors", "brainMotorColors"
]);
initialize_brain([
  "brainOpen",
  "brainPlaying",
  "brainBusy",
  "brainLastAuto",
  "brainZoom",
  "brainPan",
  "brainDrag",
  "brainDragged",
  "brainDrawing",
  "brainSelectionPart",
  "brainHover",
  "brainPackets",
  "brainTraceStep",
  "brainLayoutId",
  "brainEpoch",
  "brainOptionsKey",
  "brainDrawTime",
  "brainHoverText",
  "brainEdgeCache",
  "brainNerveCache",
  "brainView",
  "brainTissueFocus",
  "brainPinnedTissue",
  "brainWiringCache",
  "brainReferenceRadius",
  "brainLastFish",
  "brainAcquireCandidate",
  "brainReturnView",
  "brainOpacity",
  "brainLastZoomTime",
  "brainExitSince",
  "brainTempoBase",
  "brainLastTempo",
  "brainRequestedDelay",
  "brainProbeArmed",
  "brainProbePoint",
  "brainPointer",
  "brainDrawingKey",
  "brainTool",
  "brainHue",
  "brainMix",
  "brainProbeBearing",
  "brainDistance",
  "brainWheelDrag",
  "brainWheelComponent",
  "brainClamp",
  "brainWrap"
]);
initialize_brain_model([ "brainContext", "brainReduced" ]);
initialize_brain_geometry([ "brainPigmentCache", "brainPigmentLevels" ]);
initialize_brain_signals([
  "brainPacketLimit", "brainArrivals", "brainMotorEvents", "brainMotorInputs", "brainMotorCycles",
  "brainMotorTensions", "brainMotorLast"
]);
initialize_brain_input([ "brainPointerInside", "onpointerleave" ]);
initialize_brain_probe([
  "brainOdorMarks",
  "createElement_span",
  "brainMixInputs",
  "brainMixOutputs",
  "brainHandles",
  "createElement_label",
  "brainProbeLastPoint",
  "brainProbeLastSend",
  "brainProbeSending",
  "strong_edges_onchange",
  "brain_cell_onchange",
  "brain_probe_onclick",
  "brain_clear_probe_onclick",
  "brain_inputs_ontoggle",
  "brain_body_sense_onchange",
  "brain_hue_oninput",
  "brain_wheel_onpointerdown",
  "brain_wheel_onpointermove",
  "brain_wheel_onpointerup",
  "brain_wheel_onpointercancel",
  "brain_strength_oninput",
  "brain_body_input_oninput",
  "brainUpdateWheel"
]);
initialize_animals([
  "animalAtlasWidth", "animalAtlasHeight", "animalHeader", "animalVertex", "animalFragment",
  "animalMeshes", "animalEggMesh", "gpuAnimals", "animalSceneFish"
]);
initialize_organ_readout([ "organHistory", "organNumber", "organPercent" ]);
initialize_organs([ "brainOrganMetrics", "createElement_div", "organShownKey" ]);
initialize_hover([
  "tankPointer", "tankHoverKey", "tankHoverSince", "tankHoverLast", "tankTooltipRows",
  "createElement_div", "tankHoverProviders", "tankPreviousLeave", "onpointerleave",
  "addEventListener_blur", "addEventListener_keydown"
]);
initialize_family_model([ "familyRecords", "familyLive", "speciesHistory" ]);
initialize_lineage(
    [ "speciesFamilyFocus", "memberPage", "speciesBranch", "speciesTrail", "familyDiagrams" ]);
initialize_evolution([
  "featureNames",
  "speciesCards",
  "pinnedSpecies",
  "lineageFocus",
  "speciesPreviews",
  "individualCards",
  "individualSignature",
  "specimenRevision",
  "specimenGroups",
  "speciesRepresentatives",
  "activeView",
  "editing",
  "selectedSpecies",
  "lastSpecies",
  "el",
  "species_summary_onclick",
  "tree_overview_onclick",
  "individual_sort_onchange",
  "individual_previous_onclick",
  "individual_next_onclick",
  "species_tree_ontoggle",
  "species_members_ontoggle",
  "species_family_details_ontoggle",
  "fish_family_details_ontoggle",
  "species_deselect_onclick",
  "species_sort_onchange"
]);
initialize_world_parameters([ "newEnergyFields" ]);
initialize_world([
  "toolNames", "editorPlant", "polygonPoints", "rockControls", "tool", "worldDrag", "worldCursor",
  "lastPaint", "parameterInputs", "parametersBuilt", "currentSelection", "currentSignature",
  "feederSelection", "feederSignature", "querySelectorAll_data_tool_forEach",
  "undo_geometry_innerHTML", "edit_world_onclick"
]);
initialize_world_parameters(
    [ "parameterSections", "el", "resize_world_onclick", "clear_food_onclick" ]);
initialize_world_sources([ "el", "el_additional_2" ]);
initialize_world([
  "tankDown", "tankMove", "tankUp", "tankCancel", "onpointerdown", "onpointermove", "onpointerup",
  "onpointercancel", "addEventListener_keydown", "addEventListener_keydown_additional_2"
]);
initialize_world_parameters([ "burstSignature", "burstInputs" ]);
initialize_world([ "tankWheel", "onwheel" ]);
initialize_world_palette([ "plantNames", "createElement_button", "el" ]);
initialize_cockpit([
  "eventSeen", "archiveSignature", "mapPoints", "chartMarkers", "viewScroll", "lastObservationView",
  "speciesLabels", "speciesSummary", "diversityRows", "energyParts", "diversityOrder", "el",
  "energyTrend", "energyTrendEpoch"
]);
initialize_behavior_view([ "behaviorGroupNames" ]);
initialize_energy_view([ "deathChartSignature" ]);
initialize_event_view(
    [ "eventOffset", "event_filter_onchange", "open_event_log_onclick", "event_new_onclick" ]);
initialize_cockpit([
  "observationDescriptions",
  "patientRows",
  "patientSignature",
  "live_disease_onclick",
  "settings_toggle_onclick",
  "show_cockpit_onchange",
  "open_new_run_onclick",
  "open_worlds_onclick",
  "el_additional_2",
  "pulse_protection_onclick",
  "single_step_onclick",
  "return_live_onclick",
  "quick_feed_onclick",
  "undo_geometry_onclick",
  "species_sort_onchange",
  "clear_highlight_onclick",
  "observation_mode_onchange",
  "behavior_map_onpointermove",
  "behavior_map_onclick",
  "chart_onpointermove",
  "chart_onclick"
]);
initialize_charts([ "curveInfo", "chartPoints" ]);
initialize_feeding_view([
  "fishStatCells", "lastSelectedProfile", "fishStatEpoch", "deathNames", "foodSources",
  "foodColors", "foodShortNames", "habitatSources"
]);
initialize_selection([ "fish_sort_onchange" ]);
initialize_controller([
  "chart_metric_onchange", "pause_onclick", "speed_onchange", "movingSliders", "sliderHold",
  "bindSlider_mutation", "bindSlider_strong_share", "bindSlider_feeding",
  "bindSlider_bottom_residence", "support_onchange", "bookmark_onclick", "current_onclick",
  "new_onclick", "addEventListener_keydown"
]);
initialize_connection([
  "takeFrames", "stateVersion", "cachedBrainLayout", "profileKey", "cachedIndividualProfile",
  "renderAssets", "renderAssetsKey", "display"
]);
initialize_tooltips([ "installTooltips" ]);
initialize_schema();

bindGenomeImport();
bindPopulationPicker();
initMobile();

// Shader compilation is startup work, spread across tasks before the first tank frame.
async function prepareDrawing() {
  try {
    const shaders = [
      ...shaders_particle_renderer(), ...shaders_vegetation(), ...shaders_sediment_renderer(),
      ...shaders_sperm_renderer(), ...shaders_animals()
    ];
    for (const [vertex, fragment] of shaders) {
      await new Promise(resolve => setTimeout(resolve, 0));
      await prepareTankProgram(ctx.gl, vertex, fragment);
    }
  } finally {
    initialize_tooltips([ "requestAnimationFrame" ]);
  }
}
prepareDrawing().catch(error => { el('error').textContent = error.message; });
