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
files=[Path(p) for p in '''Makefile VERSION README.md MODELL.md AGENTS.md .gitignore .clang-format
build.sh start.sh run.sh package.sh test.sh format.sh
viewer.py population_catalog.py file_io.py viewer_paths.py simulation.py render_transport.py frame_assets.py frame_store.py fps_report.py viewer_commands.py viewer_http.py viewer_worker.py view_transport.py scene_patches.py history.py journal.py journal_pedigree.py journal_species.py journal_records.py journal_population.py species_traits.py trait_context.py trait_rule.py trait_metrics.py trait_combinations.py trait_rules_anatomy.py trait_rules_ecology.py trait_rules_combined.py protocol_schema.py schema.py protocol_schema.json viewer.html genomes/cppn-start.genome genomes/manual-hunter.genome
ui/hormones.js ui/population_picker.js ui/animals.js ui/animal_worker.js ui/statistics_worker.js ui/binary_scene.js ui/scene_frame.js ui/scene_worker.js ui/app.js ui/behavior_view.js ui/brain.js ui/brain_geometry.js ui/brain_input.js ui/brain_layout.js ui/brain_model.js ui/brain_occlusion.js ui/brain_painter.js ui/brain_paths.js ui/brain_probe.js ui/brain_signals.js ui/brain_tissue.js ui/brain_tuning.js ui/camera.js ui/charts.js ui/cockpit.js ui/connection.js ui/controller.js ui/dom.js ui/effects.js ui/energy_view.js ui/event_view.js ui/evolution.js ui/feeding_view.js ui/fish_fins.js ui/fish_forms.js ui/fish_geometry.js ui/fish_organs.js ui/fish_painter.js ui/hover.js ui/lineage.js ui/organ_graphics.js ui/organ_readout.js ui/organ_tuning.js ui/organs.js ui/panels.js ui/particle_renderer.js ui/sperm_renderer.js ui/plant_geometry.js ui/renderer.js ui/report.js ui/diagnostics.js ui/diagnostics_worker.js ui/schema.js ui/render_schema.js ui/sediment_renderer.js ui/selection.js ui/session.js ui/state.js ui/tank.js ui/tank_scenery.js ui/tooltips.js ui/transport.js ui/vegetation.js ui/water_view.js ui/vision_view.js ui/world.js ui/rock_geometry.js ui/world_palette.js ui/world_parameters.js ui/world_sources.js ui/style.css'''.split()]
# Shipped example fish: the classes, their bred descendants and the own aquarium lines.
files.extend(sorted(Path('genomes/futtersammler').rglob('*.genome')))
files.extend(sorted(Path('genomes/futtersammler').glob('*.md')))
for directory in ('src','colony-core/ann','colony-core/cppn','colony-core/evolution','colony-core/field'):
    # World-view writers serialize read-only snapshots; view_cache owns template lifetimes.
    # Checkpoint sections preserve saves; command_input bounds whole commands.
    for suffix in ('.cc','.hh'):files.extend(sorted(Path(directory).glob('*'+suffix)))
files.extend(Path('tests')/name for name in '''manual_hunter.cc hunter_probe.cc v018b.cc actuators.cc animals.js build_check.py diagnostics.js dom_fixture.js environment.cc feeding.cc food_web.cc founders.cc history_check.py journal_check.py lifecycle.cc model19.cc modules.js opencl.cc organ_model.cc package_check.py physiology.cc population_check.py population_picker.js profile_delta.py program_check.py render_check.py render_wire.cc render_wire.js renderer.js report.js review_check.py run_suite.py scene_frame.js sensory_rules.cc state.cc suite.py test_support.hh tooltips.js traits_check.py transport.js transport_check.py ui_ecology.cc ui_modules.json ui_revision.js ui_source.js vegetation.js vision.cc waterborne.cc'''.split())
for path in files:
    if path.is_symlink() or not path.is_file():raise SystemExit(f'Datei fehlt oder ist ein Link: {path}')
for name,limit in (('README.md',4096),('AGENTS.md',1024)):
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
