# Fish

## Start

Python 3, Node.js (Nix: automatisch), Make, C++17: `./start.sh`, http://localhost:8765.
3.690 × 1.640 px, 800 Tierplätze. `--empty-world`: freies Becken.
`--fish N`, `--food N`, `--data-dir PFAD`, `--seed N`.
„Diagnose ↓“ beim FPS-Zähler lädt einen Bericht; `--fps-report` ergänzt eine JSONL-Datei.

## Bedienung

- Mausrad zoomt, Ziehen im Wasser verschiebt. Klick ins Wasser wählt ab. Tiere und Pflanzenteile: drücken, im Kreismenü zur Aktion ziehen, loslassen; Mitte oder Esc bricht ab. Klick auf Sand öffnet die Platzierung.
- „Infopanel“ fixiert die Objektinfo zum Vergleichen beim Bewegen der Maus; der Duftkreis zeigt die örtlichen Gerüche.
- Leertaste: Pause / Weiter. „Schritt“ rückt die Welt vor. Maximaltempo lässt die Simulation ohne laufende Tankbilder rechnen.
- Naher Fischzoom folgt dem Tier und zeigt Sehkegel, Organe und Nervenzellen. Die Detailkarte erklärt den gewählten Sinn oder das Organ.
- „Welt bearbeiten“: Hindernisse, Strömung, Pflanzen, Sediment, Tiere und Nahrung. Polygone mit Enter schließen; Hindernisse mit R drehen.
- Einstellungen enthalten Energiezufuhr, Wachstum, Licht, Sediment und Evolution. „Welt merken“ speichert eine Welt dauerhaft; Autosave alle 30 Sekunden und beim Beenden.
- Telefon hochkant: eigene Ansicht mit Karten Becken, Fisch, Arten, Chronik; `?mobile=1`/`0` erzwingt bzw. sperrt sie.

- Atelier: Organe und vier Hirnbausteine (Sehzentrum, Schaltzentrum, Taktgeber, Lehrsignal) auf den Fisch ziehen. Anschlüsse zeigen fehlende Verbindungen. Sehfeld und Farbtypen am Auge einstellen. Ziehen im freien Raum verschiebt; Mausrad zoomt. Entwürfe speichern automatisch.

## Startpopulation

Ohne Auswahl startet die generationell geprüfte Brisa. Miro und Liora 32 (Pflanzenfresser) sind Atelier-Entwürfe. Baupläne: `genomes/handbau/*.fish.json`; `make starter` erzeugt die Genome. Pflanzenfresser starten an ausgewachsenen Blättern, andere Linien an Futterquellen.

## Körper und Evolution

720 feste Plätze tragen bis zu 16 Zellen je Platz. Das CPPN hat 12 Eingänge und 25 Ausgänge. Es legt Zellpotenziale, Kontaktadressen, Rezeptoren und Höchststärken fest. Zellen entstehen im Ei und nach dem Schlupf. Kontakte beginnen bei null; lokale Aktivität verändert ihre Stärke, laufender Abbau entfernt ungenutzte Kontakte. Innere Nervenzellen können sich frei verschalten; direkte Sinn-Organ-Kontakte sind gesperrt.

Sinneszellen messen örtliches Licht oder Nähe, Duft, Wasserbewegung, Berührung, Schaden, innere Druckziele oder Blutwerte. Sechs freie Hormone und die körperliche Reife beeinflussen Aktivität und Lernen. Der Körper wächst nur, solange ein Hormon seinen erblichen Wachstumsrezeptor besetzt; welches, bestimmt die Evolution. Hormoneller Zelltod bleibt dauerhaft; der Bauplan erhält seine Zellkennungen.

Die Pumpe bestimmt die erbliche Darmlänge. Tier- und Pflanzenspezialisten erreichen 100 % Verwertung ihrer passenden Nahrung und 10 % der Gegenquelle; der mittlere Allesfresser jeweils 65 %. Kunstfutter liefert unabhängig davon 80 %. Darmenergie, verdaulicher Anteil, Füllung und Reserve sind getrennt.

Kunstfutter, Plankton, Bodentiere und Pflanzen teilen das Budget der freien Wasserfläche. Importe und interne Transfers werden getrennt gebucht. Mutterreserve und Gonadenfüllschwelle wachsen mit √(Gewebe/40).

## Prüfung

`./build.sh`: Build und Prüfungen. `./test.sh`: Prüfungen mit 60-s-Zeitgrenze, `--only invariants` prüft eine. Prüft Energieerhaltung, Speicherstände, UI-Verknüpfungen und Texte. `make objects`: nur kompilieren. `./format.sh --write`: clang-format 18. Texte: `ui/text/<Sprache>/*.json`; Server und Engine senden Schlüssel und Werte.

Zuchtstation (Startseite): ein Fisch lebt ohne Hilfe in mehreren Welten; bewiesen, wenn Beckengenerationen Nachwuchs haben. Werkzeug `bin/zuchtbecken` (JSONL).
Verhaltenslabor (Startseite): der Fisch wird vor Futter aus zwölf Richtungen oder vor offene Muscheln gesetzt; jede Annäherung erscheint als Spur. Werkzeug `bin/verhaltenslabor` (JSONL, `path=N`).
