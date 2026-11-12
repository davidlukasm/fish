#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
python3 - "${1:?Aufruf: ./package.sh /absoluter/pfad/fish-evolved-vXXX-JJJJ-MM-TT.tgz}" <<'PY'
from pathlib import Path
from datetime import date
import sys,tarfile,shlex,tempfile,os,re
output=Path(sys.argv[1])
version=Path('VERSION').read_text().strip()
match=re.fullmatch(r'fish-evolved-v'+re.escape(version)+r'-(\d{4}-\d{2}-\d{2})\.tgz',output.name)
if not output.is_absolute() or not match:
    raise SystemExit(f'Absoluter Pfad mit Dateiname fish-evolved-v{version}-JJJJ-MM-TT.tgz erforderlich.')
try:date.fromisoformat(match[1])
except ValueError:raise SystemExit('Ungültiges Paketdatum.')
# Runtime services own process, scenes, routes, rules and the shared schema.
# viewer_worker keeps statistics and archive in their own process, apart from the image front.
# The UI entry point imports the listed component modules directly.
# Editable starter blueprints accompany the shipped genomes.
# The Atelier keeps its own folder: model/ (design data and rules), view/ (drawing), controller.
files=[Path(p) for p in '''Makefile VERSION README.md AGENTS.md .gitignore .clang-format
build.sh start.sh run.sh package.sh test.sh format.sh
viewer.py atelier_service.py labor_service.py labor_recording.py studio_storage.py build_config.py population_catalog.py file_io.py viewer_paths.py simulation.py render_transport.py frame_assets.py frame_store.py fps_report.py viewer_commands.py viewer_http.py viewer_worker.py view_transport.py scene_patches.py history.py wording.py journal.py journal_pedigree.py journal_species.py journal_records.py journal_population.py species_traits.py trait_context.py trait_rule.py trait_metrics.py trait_expression.py traits.json protocol_schema.py schema.py protocol_schema.json viewer.html werkzeug/fischbau.mjs werkzeug/atelier.cc werkzeug/atelier_compiler.hh werkzeug/atelier_connections.hh werkzeug/atelier_plan_schema.hh
ui/organ_icons.js
ui/hormones.js ui/population_picker.js ui/animals.js ui/animal_worker.js ui/statistics_worker.js ui/statistics_frame.js ui/binary_scene.js ui/scene_frame.js ui/scene_worker.js ui/app.js ui/behavior_view.js ui/brain.js ui/brain_geometry.js ui/brain_input.js ui/brain_layout.js ui/brain_model.js ui/brain_occlusion.js ui/brain_painter.js ui/brain_paths.js ui/brain_probe.js ui/brain_signals.js ui/brain_tissue.js ui/body_model.js ui/body_view.js ui/activity_model.js ui/activity_view.js ui/camera.js ui/charts.js ui/cockpit.js ui/connection.js ui/controller.js ui/dom.js ui/effects.js ui/ecosystem_model.js ui/energy_view.js ui/trait_model.js ui/event_model.js ui/journal_model.js ui/event_view.js ui/species_model.js ui/evolution.js ui/feeding_view.js ui/fish_fins.js ui/fish_forms.js ui/fish_geometry.js ui/fish_organs.js ui/fish_painter.js ui/hover.js ui/object_info.js ui/fish_profile.js ui/fish_names.js ui/fish_life.js ui/fish_choice.js ui/egg_births.js ui/population_model.js ui/behavior_model.js ui/nutrition_model.js ui/family_model.js ui/lineage.js ui/organ_graphics.js ui/organ_readout.js ui/organ_tuning.js ui/organs.js ui/nerve_map.js ui/brain_plan.js ui/mind.js ui/thought_view.js ui/strings.js ui/thoughts.js ui/panels.js ui/particle_renderer.js ui/sperm_renderer.js ui/plant_geometry.js ui/renderer.js ui/report.js ui/diagnostics.js ui/diagnostics_worker.js ui/schema.js ui/fauna.js ui/fin_stroke.js ui/tissue.js ui/keys.js ui/path_data.js ui/units.js ui/tuning.js ui/render_schema.js ui/sediment_renderer.js ui/selection.js ui/session.js ui/state.js ui/tank.js ui/tank_scenery.js ui/tooltips.js ui/transport.js ui/vegetation.js ui/water_view.js ui/water_display.js ui/vision_view.js ui/world.js ui/rock_geometry.js ui/world_palette.js ui/world_parameters.js ui/world_sources.js ui/mobile.js ui/mobile_portrait.js ui/mobile_events.js ui/style.css ui/mobile.css'''.split()]
files.extend(sorted(p for p in Path('ui/studio').rglob('*') if p.suffix in ('.js','.css')))
files.extend(sorted(p for p in Path('ui/labor').iterdir() if p.suffix in ('.js', '.css')))
# Command-line diagnostics share the native aquarium and recording code.
files.append(Path('werkzeug/zuchtbecken.cc'))
files.append(Path('werkzeug/verhaltenslabor.cc'))
files.extend(sorted(Path('genomes/handbau').glob('*.fish.json')))
# Shipped fish: the example genomes below genomes/.
files.extend(p for p in sorted(Path('genomes').rglob('*.genome')) if p not in files)
# Wording of the interface and the fish, by locale.
files.extend(sorted(Path('ui/text').rglob('*.json')))
for directory in ('src','colony-core/ann','colony-core/cppn','colony-core/evolution','colony-core/field'):
    # World-view writers serialize read-only snapshots; view_cache owns template lifetimes.
    # Checkpoint sections preserve saves; command_input bounds whole commands.
    for suffix in ('.cc','.hh'):files.extend(sorted(Path(directory).glob('*'+suffix)))
files.extend(Path('tests')/name for name in '''build_check.py dom_fixture.js invariants.cc compiler.cc run_suite.py suite.py studio.js studio_canvas.js test_support.hh texts.js ui_link.js'''.split())
for path in files:
    if path.is_symlink() or not path.is_file():raise SystemExit(f'Datei fehlt oder ist ein Link: {path}')
for name,limit in (('README.md',4096),('AGENTS.md',2048)):
    if Path(name).stat().st_size>limit:raise SystemExit(f'{name}: auf höchstens {limit} Bytes kürzen.')
if output.exists():raise SystemExit('Das Ausgabepaket existiert bereits; neue Versionsnummer verwenden.')
if output.resolve() in {p.resolve() for p in files}:raise SystemExit('Ausgabe würde eine Projektdatei überschreiben.')
descriptor,staged=tempfile.mkstemp(prefix=output.name+'.',suffix='.tmp',dir=output.parent)
os.close(descriptor)
try:
    with tarfile.open(staged,'w:gz') as archive:
        for path in files:archive.add(path,arcname='fish-evolved/'+path.as_posix(),recursive=False)
    os.replace(staged,output)
finally:
    Path(staged).unlink(missing_ok=True)
PY
