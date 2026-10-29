#!/bin/bash
# Briefkasten: holt Aufträge aus dem Zweig "box" (jobs/NAME.sh), startet jeden neuen Auftrag
# einmal im Hintergrund und schiebt Logs und Ergebnisse (results/NAME/) zurück.
# Aufruf per cron jede Minute:  * * * * * $HOME/fish/werkzeug/briefkasten.sh >> $HOME/briefkasten.log 2>&1
set -u
CODE="$HOME/fish"
BOX="$HOME/box"
exec 9>"$HOME/.briefkasten.lock"
flock -n 9 || exit 0
if [ ! -d "$BOX/.git" ]; then
  git clone -q -b box "$(git -C "$CODE" remote get-url origin)" "$BOX" || exit 1
fi
cd "$BOX" || exit 1
git pull -q --rebase origin box || { git rebase --abort 2>/dev/null; exit 1; }
for job in jobs/*.sh; do
  [ -e "$job" ] || continue
  name=$(basename "$job" .sh)
  out="results/$name"
  [ -d "$out" ] && continue
  mkdir -p "$out"
  echo "läuft seit $(date -Is)" > "$out/status"
  setsid nohup bash -c "cd '$CODE' && git pull -q origin main; mkdir -p '$BOX/$out/files'; \
    OUT='$BOX/$out/files' bash '$BOX/$job' > '$BOX/$out/log.txt' 2>&1; \
    echo \"fertig (Code \$?) \$(date -Is)\" > '$BOX/$out/status'" > /dev/null 2>&1 &
done
# Laufende Logs kurz halten, damit das Repo klein bleibt.
for log in results/*/log.txt; do
  [ -e "$log" ] || continue
  if [ "$(stat -c %s "$log")" -gt 2000000 ]; then tail -c 1000000 "$log" > "$log.tmp" && mv "$log.tmp" "$log"; fi
done
git add -A results
git commit -qm "Ergebnisse $(date -Is)" && git push -q origin box
exit 0
