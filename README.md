# Fish

## Start

Python 3, Node.js (Nix: automatisch), Make, C++17: `./start.sh`, http://localhost:8765.
3.690 × 1.640 px, 800 Tierplätze. `--empty-world`: freies Becken.
`--fish N`, `--food N`, `--data-dir PFAD`, `--seed N`.
„Diagnose ↓“ am FPS-Zähler lädt einen Bericht; `--fps-report` ergänzt JSONL.

## Bedienung

- Mausrad zoomt, Ziehen im Wasser verschiebt. Klick ins Wasser wählt ab. Tiere und Pflanzenteile: drücken, im Kreismenü zur Aktion ziehen, loslassen; Mitte oder Esc bricht ab. Klick auf Sand öffnet die Platzierung.
- „Infopanel“ fixiert die Objektinfo zum Vergleichen beim Bewegen der Maus; der Duftkreis zeigt die örtlichen Gerüche.
- Leertaste: Pause / Weiter. „Schritt“ rückt die Welt vor. Maximaltempo lässt die Simulation ohne laufende Tankbilder rechnen.
- Naher Fischzoom folgt dem Tier und zeigt Sehkegel, Organe und Nervenzellen. Die Detailkarte erklärt den gewählten Sinn oder das Organ.
- „Welt bearbeiten“: Hindernisse, Strömung, Pflanzen, Sediment, Tiere und Nahrung. Polygone mit Enter schließen; Hindernisse mit R drehen.
- Einstellungen enthalten Energiezufuhr, Wachstum, Licht, Sediment und Evolution. „Welt merken“ speichert eine Welt dauerhaft; Autosave alle 30 Sekunden und beim Beenden.
- Telefon hochkant: eigene Ansicht mit Karten Becken, Fisch, Arten, Chronik; `?mobile=1`/`0` erzwingt bzw. sperrt sie.

- Atelier: Organe und Hirnregionen auf den Fisch ziehen. Seh- und Riechverarbeitung, Körperzustand, Bewertung, Handlungswahl und Motorik verbinden sich über eigene Anschlüsse. Die Diagramme einer Region steuern Suchwellen, Seitenvergleich, Pausen, Reife und Lernfenster; ihre Zellen bleiben einzeln bearbeitbar. Sehfeld und Farbtypen am Auge einstellen. Entwürfe speichern automatisch.

## Startpopulation

Fertige Fische stehen im Fischregal (`genomes/regal`), getrennt davon die Entwürfe (`genomes/entwuerfe`). Beide sind überall wählbar. `make starter` baut ihre Genome. Pflanzenfresser starten an Blättern, andere Linien an Futterquellen.

## Körper und Evolution

720 feste Plätze tragen bis zu 16 Zellen je Platz. Das CPPN hat 12 Eingänge und 25 Ausgänge. Es legt Zellpotenziale, Kontaktadressen, Rezeptoren und Höchststärken fest. Zellen entstehen im Ei und nach dem Schlupf. Kontakte beginnen bei null; lokale Aktivität verändert ihre Stärke, laufender Abbau entfernt ungenutzte Kontakte. Innere Nervenzellen können sich frei verschalten; direkte Sinn-Organ-Kontakte sind gesperrt.

Der Schwanz schiebt, die Brustflossen drehen und schieben mit: Rückschlag vorwärts, der Vorschlag eines Gegenspielermuskels rückwärts, beide zugleich halten still. Ohne Schwimmen und ohne gefüllte Blase sinkt der Fisch; der Blasenauftrieb wirkt je Körpermasse.

Sinneszellen messen örtliches Licht oder Nähe, Duft, Wasserbewegung, Berührung, Schaden, innere Druckziele oder Blutwerte. Sechs freie Hormone, Reife, Reserve und Erschöpfung steuern Zellbildung, Aktivität, Lernen und Zelltod. Der Körper wächst bei Hormonbindung an seinen erblichen Wachstumsrezeptor. Tote Zellen bleiben tot; ihre Kennungen bleiben im Bauplan erhalten.

## Prüfung

`./build.sh`: Programme bauen. `./test.sh`: Prüfungen mit 60-s-Zeitgrenze, `--only invariants` prüft eine. Nur die dafür benötigten Programme werden gebaut; `--only texts` braucht keinen C++-Build. Prüft Energieerhaltung, Speicherstände, UI-Verknüpfungen und Texte. `make objects`: nur kompilieren. `./format.sh --write`: clang-format 18, unter NixOS holt es nix-shell; fehlt es, überspringt `./test.sh` die Formatprüfung. Texte: `ui/text/<Sprache>/*.json`; Server und Engine senden Schlüssel und Werte.

Zuchtstation: erbliche Varianten in zwei Aquarien beobachten, Nachkommen mit eigener Nahrung bewerten, Eltern auswählen und weiterzüchten.
Labor: Live-Aquarium mit Pfaden, Lebensläufen und Kontrollkopie; Motorik, Autopilot, Sinne, Energie und Laichabgabe steuern. Pause und Einzelschritte jederzeit. CLI: `make diagnostics` baut `bin/zuchtbecken` und `bin/verhaltenslabor` (JSONL).
