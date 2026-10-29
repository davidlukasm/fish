# Fish

## Start

Python 3, Node.js (Nix: automatisch), Make, C++17: `./start.sh`, http://localhost:8765.
3.690 × 1.640 px, 800 Tierplätze; Plattformen, Pflanzbecken und Steine. `--empty-world`: freies Becken.
`--fish N`, `--food N`, `--data-dir PFAD`, `--seed N`.
„Diagnose ↓“ beim FPS-Zähler lädt einen begrenzten Bericht; `--fps-report` ergänzt eine JSONL-Datei.

## Bedienung

- Mausrad zoomt, Ziehen im Wasser verschiebt. Klick ins Wasser wählt ab. Tiere und Pflanzenteile: drücken, im Kreismenü zur Aktion ziehen, loslassen; Mitte oder Esc bricht ab. Klick auf Sand öffnet die Platzierung.
- „Info offen halten“ fixiert die Objektinfo zum Vergleichen beim Bewegen der Maus; der Duftkreis zeigt die örtlichen Gerüche.
- Leertaste: Pause / Weiter. „Schritt“ rückt die Welt vor. Maximaltempo lässt die Simulation ohne laufende Tankbilder rechnen.
- Naher Fischzoom folgt dem Tier und zeigt Sehkegel, Organe und Nervenzellen. Die Detailkarte erklärt den gewählten Sinn oder das Organ.
- „Welt bearbeiten“: Hindernisse, Strömung, Pflanzen, Sediment, Tiere und Nahrung. Polygone mit Enter schließen; Hindernisse mit R drehen.
- Einstellungen enthalten Energiezufuhr, Wachstum, Licht, Sediment und Evolution. „Welt merken“ speichert eine Welt dauerhaft; Autosave alle 30 Sekunden und beim Beenden.

## Startpopulation

„Genom öffnen …“ lädt eine v019-Linie. Das mitgelieferte Startgenom ist ein zufällig erzeugter Körper; erst eine erfolgreiche Lebenszyklusprüfung qualifiziert ihn als Founder. Founder, bewährte Linien und Favoriten bleiben getrennt auswählbar. Ausgewählte Linien starten verteilt an Futterquellen.

„Founder suchen“ sucht bis zur nächsten geeigneten Linie. Im Terminal:
`bin/fish --search-founders --founder-target 1 --founder-candidates 0`.
Die Suche prüft Anatomie, tatsächlichen Schlupf und drei Lebenszyklusversuche von jeweils höchstens 4.000 Schritten. In mindestens zwei Versuchen muss ein eigener Nachkomme schlüpfen und fressen. Weitere Generationen verbessern die Bewertung. Suchstände lassen sich fortsetzen.

## Körper und Evolution

v019 verwendet 360 feste Plätze in Gesicht, Kopf, Brust und Hinterteil. Das Zell-CPPN hat zehn Eingänge und zwanzig Ausgänge. Torknoten besitzen getrennte Signal- und Schalterports. Kennungen, Reichweite und Seitenneigung bestimmen Kontakte; das Gehirn lernt nach Modell 19. Einzelheiten und Formeln stehen in `MODELL.md`.

Sinneszellen messen örtliches Licht oder Nähe, Duft, Wasserbewegung, Berührung, Schaden, innere Druckziele oder Blutwerte. Vier freie Hormone und die körperliche Reife beeinflussen Aktivität und Lernen. Hormoneller Zelltod bleibt dauerhaft; der Bauplan erhält seine Zellkennungen.

Die Pumpe bestimmt die erbliche Darmlänge. Tier- und Pflanzenspezialisten erreichen 100 % Verwertung ihrer passenden Nahrung und 10 % der Gegenquelle; der mittlere Allesfresser jeweils 65 %. Kunstfutter liefert unabhängig davon 80 %. Darmenergie, verdaulicher Anteil, Füllung und Reserve sind getrennt.

Die Zufuhr folgt der freien Wasserfläche. Kunstfutter, Plankton, Bodentiere und Pflanzen teilen das Budget; tatsächliche Importe und interne Transfers werden getrennt gebucht. Mutterreserve und Gonadenfüllschwelle wachsen mit √(Gewebe/40).

## Prüfung

`./build.sh`: Build und kurze Kernprüfungen. `./test.sh`: gebündelte Funktionsprüfungen mit 30-s-Zeitgrenze; `--only feeding` prüft ein Thema, `--core` die Kerntests, `--opencl` zusätzlich GPU. `./format.sh --write`: clang-format 18. Die Build-Prüfungen starten keine Founder-Suche und keine Evolutionsläufe.
