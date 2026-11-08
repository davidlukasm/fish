# Fish

## Start

Python 3, Node.js (Nix: automatisch), Make, C++17: `./start.sh`, http://localhost:8765.
3.690 × 1.640 px, 800 Tierplätze. `--empty-world`: freies Becken.
`--fish N`, `--food N`, `--data-dir PFAD`, `--seed N`.
„Diagnose ↓“ beim FPS-Zähler lädt einen begrenzten Bericht; `--fps-report` ergänzt eine JSONL-Datei.

## Bedienung

- Mausrad zoomt, Ziehen im Wasser verschiebt. Klick ins Wasser wählt ab. Tiere und Pflanzenteile: drücken, im Kreismenü zur Aktion ziehen, loslassen; Mitte oder Esc bricht ab. Klick auf Sand öffnet die Platzierung.
- „Infopanel“ fixiert die Objektinfo zum Vergleichen beim Bewegen der Maus; der Duftkreis zeigt die örtlichen Gerüche.
- Leertaste: Pause / Weiter. „Schritt“ rückt die Welt vor. Maximaltempo lässt die Simulation ohne laufende Tankbilder rechnen.
- Naher Fischzoom folgt dem Tier und zeigt Sehkegel, Organe und Nervenzellen. Die Detailkarte erklärt den gewählten Sinn oder das Organ.
- „Welt bearbeiten“: Hindernisse, Strömung, Pflanzen, Sediment, Tiere und Nahrung. Polygone mit Enter schließen; Hindernisse mit R drehen.
- Einstellungen enthalten Energiezufuhr, Wachstum, Licht, Sediment und Evolution. „Welt merken“ speichert eine Welt dauerhaft; Autosave alle 30 Sekunden und beim Beenden.
- Telefon hochkant: eigene Ansicht mit Karten Becken, Fisch, Arten, Chronik; `?mobile=1`/`0` erzwingt bzw. sperrt sie.

- Atelier: Organe und Hirnregionen auf den Fisch ziehen; Regionen zeigen, was ihnen fehlt. Seiten sind gekoppelt. Sehfeld, Dichte und Breite am Sehfächer ändern. Farbtypen und optische Probe im Organfeld. Ziehen im freien Raum verschiebt; Mausrad zoomt. Entwürfe speichern automatisch.

## Startpopulation

Startauswahl: Beispielfische (alle Genome unter genomes/), bewährte Linien und ★ Favoriten oder „Genom öffnen …“. `genomes/handbau/handfisch.genome` ist von Hand entworfen; `make bin/fischbau && bin/fischbau` erzeugt ihn. Ohne Auswahl starten die handgebauten Fische aus genomes/handbau. Gewählte Linien starten an getrennten Futterquellen.

## Körper und Evolution

360 feste Plätze tragen bis zu 16 Zellen je Platz. Das CPPN hat 12 Eingänge und 25 Ausgänge. Es legt Zellpotenziale, Kontaktadressen, Rezeptoren und Höchststärken fest. Zellen entstehen im Ei und nach dem Schlupf. Kontakte beginnen bei null; lokale Aktivität verändert ihre Stärke, laufender Abbau entfernt ungenutzte Kontakte. Sinn → Innenlage 1 → Innenlage 2 → Organ; zwischen den Innenlagen gibt es Rückkopplung.

Sinneszellen messen örtliches Licht oder Nähe, Duft, Wasserbewegung, Berührung, Schaden, innere Druckziele oder Blutwerte. Sechs freie Hormone und die körperliche Reife beeinflussen Aktivität und Lernen. Der Körper wächst nur, solange ein Hormon seinen erblichen Wachstumsrezeptor besetzt; welches, bestimmt die Evolution. Hormoneller Zelltod bleibt dauerhaft; der Bauplan erhält seine Zellkennungen.

Die Pumpe bestimmt die erbliche Darmlänge. Tier- und Pflanzenspezialisten erreichen 100 % Verwertung ihrer passenden Nahrung und 10 % der Gegenquelle; der mittlere Allesfresser jeweils 65 %. Kunstfutter liefert unabhängig davon 80 %. Darmenergie, verdaulicher Anteil, Füllung und Reserve sind getrennt.

Die Zufuhr folgt der freien Wasserfläche. Kunstfutter, Plankton, Bodentiere und Pflanzen teilen das Budget; geförderte Pflanzen wachsen nur aus freier Energie; tatsächliche Importe und interne Transfers werden getrennt gebucht. Mutterreserve und Gonadenfüllschwelle wachsen mit √(Gewebe/40).

## Prüfung

`./build.sh`: Build und Prüfungen. `./test.sh`: dieselben Prüfungen mit 30-s-Zeitgrenze, `--only invariants` prüft eine. Geprüft wird nur Dauerhaftes: ein geschlossenes Becken erzeugt keine Energie, ein Speicherstand läuft genau wie das Original weiter, alle UI-Module verknüpfen sich, alle Texte existieren. `make objects`: nur kompilieren, ohne Linken. `./format.sh --write`: clang-format 18. Texte: `ui/text/<Sprache>/*.json`; Server und Engine senden Schlüssel und Werte. Die Build-Prüfungen starten keine Evolutionsläufe.
