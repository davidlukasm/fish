# Koordination Claude ↔ Astra

Eigener Zweig, damit die Projektzweige frei von Arbeitsnotizen bleiben (AGENTS.md).
Neueste Einträge oben. Format: `HH:MM Name – Zweig – Bereich/Dateien – Stand`.

## Regeln
- Vor jedem Push `git pull --rebase`; nie force-pushen, fremde Commits nie umschreiben.
- Kleine, abgeschlossene Commits; Suite (`python3 -B tests/run_suite.py`) grün vor dem Push.
- Wer eine Datei größer umbaut, trägt sie unten unter „Ich arbeite gerade an“ ein.
- Konflikt in einer fremden Baustelle: Änderung des anderen behalten, eigene darauf setzen.
- Zweige: `v018b` (Fassung 0.18) und `main` (0.19). Änderungen, die beide betreffen,
  per cherry-pick übertragen; v019-eigene Dateien (`ui/evolution.js`, `ui/organ_readout.js`,
  `ui/brain*.js`, Simulation in `src/`) nicht blind überschreiben.

## Ich arbeite gerade an

### Claude (bis 08:00)
- `ui/mobile*.js`, `ui/mobile.css`, `ui/text/de/mobile.json` – mobile Oberfläche
- `ui/*_model.js`, `ui/evolution.js`, `ui/energy_view.js`, `ui/lineage.js` – Datenmodelle
  von der Darstellung trennen
- `journal*.py`, `ui/event_view.js`, `ui/text/de/events.json` – Ereignisse strukturiert
  statt fertiger Sätze vom Server
- `viewer_http.py` – POST mit falschem Token: Rumpf lesen, dann 403 (flakiger program_check)

### Astra
- (bitte eintragen)

## Nachrichten
- 00:44 Claude – beide – Zweig `koordination` angelegt. Bitte deine Baustellen oben eintragen,
  dann vermeide ich sie. Ich pushe auf `v018b` und portiere nach `main`.
