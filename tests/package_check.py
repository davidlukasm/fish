from pathlib import Path
from datetime import date
import subprocess, tarfile, tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as temporary:
    project = root
    version = (project / "VERSION").read_text().strip()
    archive = Path(temporary) / f"fish-evolved-v{version}-{date.today().isoformat()}.tgz"
    subprocess.run([str(project / "package.sh"), str(archive)], check=True)
    assert archive.read_bytes()[:2] == b"\x1f\x8b"
    with tarfile.open(archive, "r:gz") as packed:
        names = {p.name for p in packed.getmembers()}
        assert "fish-evolved/src/ecology.cc" in names
        assert "fish-evolved/species_traits.py" in names
        assert "fish-evolved/ui/lineage.js" in names
        assert "fish-evolved/ui/organs.js" in names
        assert "fish-evolved/genomes/cppn-start.genome" in names
        assert not any("/genomes/pool/" in name for name in names)
        assert len(names) == len(packed.getmembers())
        assert {n for n in names if n.endswith((".txt", ".log"))} == set()
        assert {n for n in names if n.endswith(".md") and "/genomes/" not in n} == {
            "fish-evolved/README.md",
            "fish-evolved/AGENTS.md",
            "fish-evolved/MODELL.md",
        }
        assert not any(
            n.endswith(".state")
            or n.endswith(".png")
            or "unused.genome" in n
            for n in names
        )
    original = archive.read_bytes()
    result = subprocess.run(
        [str(project / "package.sh"), str(archive)], capture_output=True
    )
    assert result.returncode != 0
    assert archive.read_bytes() == original
print("Paketinhalt und unveränderliche Ausgabe: OK")
