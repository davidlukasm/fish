# Futtersammler-Klassen für v018b

**Voraussetzung:** v018b vom 28.10., 21:31, plus `../bissen-schlucken.diff`. Ein Bissen, der in den Mund passt, geht dann direkt in den Darm; Schalentiere sind ausgenommen.

## Dateien

- `*.genome` – Endfassung, sieben Klassen (kleine Serie, Kiefer 8), handgebaut:
  - `schnapper.genome`
  - `siebmaul.genome`
  - `algenzupfer.genome`
  - `gruendler.genome`
  - `blattbeisser.genome`
  - `knacker.genome`
  - `geier.genome`
- `gezuechtet/` – Nachkommen aus den Mischbecken der Endfassung, Generation 2–17. Die Dateien `endfassung-*` stammen aus den Läufen mit dem neuen Geier. Die Dateien `zweite-runde-*` stammen aus Mischbecken, die mit diesen Nachkommen gestartet wurden (`knapp` = 30 % Kunstfutter).
- `varianten/` – die alte Geier-Fassung, nur mit Aasnase.
- `zucht/` – Nachkommen der Endfassung, jede Klasse allein gezüchtet (15.000 Schritte).
- `grosse-serie/` – die erste, größere Serie (Endgewebe 108–114) mit ihren gezüchteten Nachkommen. Darin `varianten/`: Fassungen ohne Lernen, mit Drüse oder mit scharfen Zähnen.
- `klassen-baukasten.cc` – Baukasten für die Klassen; jede Option ist über eine Umgebungsvariable schaltbar.
- `klassen-bauen.sh` – baut die sieben Genome der Endfassung exakt nach.

## Baukasten-Optionen

Alle Optionen setzen auf dem Schnapper-Körper auf (`EGGPUMP NOSEEGG FOODNOSE FWDZ FWD`).

| Option | Wirkung |
|---|---|
| `SMALL` | äußere Pumpenspalten entfallen, Körper kleiner |
| `JAW`, `JAWCAP`, `JAWTEETH` | Kiefer im inneren oberen Pumpenviertel, Stärke, Zahnform (−1 scharf … 1 stumpf) |
| `GUTQ` | Darmlänge (−1 Fleisch … 1 Pflanzen) |
| `PIGQ`, `PIGW`, `PIGCAP` | Pigment im äußeren oberen Pumpenviertel: absorbierter Farbton, Breite, Stärke |
| `HORM`, `GLANDCAP` | Fressdrüse (Hormon 0) in der äußersten unteren Pumpenspalte, Rezeptor auf den Vorwärtszellen (Empfindlichkeit) |
| `NICHE`, `NICHELAT`, `NICHEW` | Appetithälfte der Nase: Länge und Breite der Nischenduftnote, Abstimmbreite |
| `EYEGREEN` | eine Augenhälfte sieht Grün statt Rot |
| `WAVES` | retinale Wellen: 3 voll, 2,5 halb |
| `LEARNMODE`, `LEARNBAND` | Lernart (Konkurrenzlernen) in einem Relaisband: 2 Sehrelais, 3 Geruchsrelais |
| `LEARN`, `LEARNHORM` | Lerngewinn-Rezeptor: Grundwert, Hormonempfindlichkeit |
