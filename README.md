# Fish

## Start

Python 3, Node.js (Nix: automatisch), Make, C++17: `./start.sh`, http://localhost:8765.
3.690 × 1.640 px, 800 Tierplätze; Plattformen, Pflanzbecken und Steine. `--empty-world`: freies Becken.
`--fish N`, `--food N`, `--data-dir PFAD`, `--seed N`.
„Diagnose ↓“ beim FPS-Zähler: Rucklerbericht. `--fps-report`: JSONL-Datei.

## Bedienung

- Mausrad zoomt, Ziehen im freien Wasser verschiebt. Tiere und Pflanzenteile: drücken, im Kreismenü zur Aktion ziehen und loslassen; Mitte oder Esc bricht ab. Klick auf Sand öffnet die Platzierung; Klick ins Wasser wählt ab. Naher Fischzoom folgt und verlangsamt. Er zeigt Sehkegel, Lichtbänder, Organe und Nervenzellen.
- „Info offen halten“ zeigt laufend Objektinfo und örtlichen Duft beim Bewegen der Maus.
- Leertaste: Pause / Weiter; „Schritt“ rückt die Welt vor.
- „Welt bearbeiten“: Hindernisse, Strömung, Pflanzen, Sediment und Nahrung. Polygone mit Enter schließen, Hindernisse mit R drehen. Überdeckte Tiere und Nahrung verschwinden.
- „Einstellungen“: Energiebudget, Wachstum, Pflanzen, Licht, Sediment und Evolution.
- „Welt merken“ / „Welten laden“: dauerhafte Welten; Autosave alle 30 Sekunden und beim Beenden.

## Organe und Evolution

Startauswahl: Beispielfische (Klassen, Nacht-Run-Nachkommen, eigene Aquariumlinien), bewährte Linien und ★ Favoriten oder „Genom öffnen …“; Körper- und Ernährungsbalken, Sortierung und Scrollen. Ohne Auswahl starten die sieben Klassen. Gewählte Linien starten an getrennten Futterquellen.

15 Eingänge, 26 Ausgänge und fünf getrennte CPPN-Zweige bilden Modell 19: Bauplan, Zelleigenschaften und drei Verbindungsarten. Vier Sender-/Empfängermarker ordnen Regionen und steuern Verbindungen über das CPPN. Sieben Lageproben verschieben belegte Rasterpunkte. Synapsen entstehen, lernen und verschwinden während des Lebens. Einzelheiten in `MODELL.md`.

Zwei anatomische Augen teilen die Objektsuche. Farbgegensatz, lokale Adaptation und Hemmung je Auge filtern das Sehbild. Seitenlinie: Wasserbewegung relativ zur Haut, mit Eigenbewegung und Kielwasser. Tastsinn: Maximum aus Berührung und Sedimentkontakt. Dehnungssensoren messen Darmfüllung samt Ballast sowie Ei- und Spermienfüllung.

Muskeln erzeugen Schläge; Drehmuskeln nutzen beide Vorzeichen. Eierstock: zehn Dottereinheiten je Zelle des Ei-Organs × Wachstum, Freigabe ab 95 %. Innere Gametenzellen sammeln, äußere geben ab. 

Vier Hormone steuern lokale Lern- und Aktivitätsparameter über CPPN-Rezeptoren. Im Ei laufen Körper und Gehirn mit innerer Mechanik; Sekret und Muskelarbeit lösen den Schlupf aus. Die Geburt blendet Außenreize schrittweise ein.

Tod bei halbem Maximalgewebe, mindestens zehn. Gewebe und Organe bestimmen die Größe; Reserve und Ei füllen den Bauch. Darmenergie, verdaulicher Anteil und Füllung werden getrennt gespeichert. Krebschenwolken, Würmer, Krabben und Muscheln ergänzen Pflanzen und Futter; Zerfall im Sediment nährt den Boden. Die Zufuhr skaliert mit freier Wasserfläche, im Standardbecken rund 95 E/Schritt. Futter erscheint an flächenabhängig zwölf langsam wandernden Quellen. Globale Hilfe: unter 15. Artenschutz: unter 3 je bewährter Art, höchstens drei Gruppen.

Merkmale: vier je Artkarte, höchstens sechs im Artprofil und vier je Individuum. Artstatistiken: Gesamt / Lebend. Gesamt bewahrt Beiträge verstorbener Fische; Anatomie und Verhalten werden alle 100 Schritte gewichtet erfasst. FPS zählt fertige, fortgeschrittene Bilder; Max. zeigt Stillstände der letzten fünf Sekunden.

## Prüfung

`./build.sh`: Build und Kernprüfungen. `./test.sh`: Funktionsprüfungen mit 30-s-Zeitgrenze; `--only feeding` prüft ein Thema, `--core` die Kerntests, `--opencl` zusätzlich GPU. `./format.sh --write`: clang-format 18.
