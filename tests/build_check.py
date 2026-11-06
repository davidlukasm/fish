import ast
import os
import re
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[1]


def ensure_node():
    if shutil.which('node'):
        return
    nix = shutil.which('nix-shell')
    if nix:
        print('Node.js wird über Nix für die automatisierten UI-Prüfungen bereitgestellt.',
              flush=True)
        # Check the new PATH before restarting, so failed setup cannot recurse.
        command = 'command -v node >/dev/null && ' + shlex.join(
            [sys.executable, '-B', *sys.argv])
        os.execv(nix, [nix, '-p', 'nodejs', '--run', command])
    raise SystemExit('Node.js fehlt (Befehl „node“). Node.js für die automatisierten '
                     'UI-Prüfungen installieren und den Aufruf wiederholen.')


def main():
    ensure_node()
    sys.path.insert(0, str(ROOT))
    for path in [*ROOT.glob('*.py'), *ROOT.glob('tests/*.py')]:
        ast.parse(path.read_text(), filename=str(path))
    subprocess.run([sys.executable, '-B', 'schema.py'], cwd=ROOT, check=True)
    css = dict(re.findall(r'--([a-z]+):(#[0-9a-f]{6})', (ROOT / 'ui/style.css').read_text()))
    palette = dict(re.findall(r"(\w+) : '(#[0-9a-f]{6})'", (ROOT / 'ui/palette.js').read_text()))
    assert palette and all(css.get(name) == value for name, value in palette.items()), (
        'ui/palette.js und ui/style.css nennen verschiedene Farben', palette, css)
    subprocess.run(['node', '--experimental-vm-modules', 'tests/ui_link.js'],
                   cwd=ROOT, check=True)
    print('Python, Schema und UI-Module: OK')


if __name__ == '__main__':
    main()
