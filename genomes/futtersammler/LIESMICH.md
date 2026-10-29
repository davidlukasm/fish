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
- `varianten/` – die alte Geier-Fassung, nur mit Aasnase; außerdem `bogenjaeger-g20-geruchsabgestimmt.genome`: 20 Generationen im Jägertank, danach Geruchsschwelle und Maulhemmung manuell abgestimmt. Geprüft mit v018b `79c6690`: 50/50 geschlüpft und nach 750 Suchschritten am Leben, 15/50 mit ungiftigem Fang; insgesamt 735 E ungiftig und 412 E Gift aufgenommen (50:50 Gift, Seed 32000005). Noch nicht selbsttragend: mittlere Energie 147 → 33 E. Giftzuordnung im Test: Geruch 0 ungiftig, 5 giftig; normale Plastizität.
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

## Eigene Jäger

`eigene-jaeger/` enthält vier neu aufgebaute CPPNs, getrennt gezüchtet; keine Nachkommen der übrigen Futtersammler. Normale Eiphase und Plastizität.

| Genom | Bauweise | Zellen | Nerv-Nerv-Verbindungen |
|---|---|---:|---:|
| `faecher.genome` | Seitlicher Sehvergleich, sparsamer Antrieb | 148 | 0 |
| `kreuzblick.genome` | Gekreuzte Seh-Lenk-Verbindungen, große Mundorgane, Drüse | 270 | 0 |
| `nachhall.genome` | Lokale Rückkopplungen, Pigmentorgan | 157 | 93 |
| `taktjaeger.genome` | 18 Schrittmacher, seitenübergreifende Rückkopplungen, Abwehr | 288 | 372 |

Vergleich mit v018b `79c6690`, 750 Suchschritte, 50:50 Gift, fliehendes Futter, Seed 34200001; je 20 Exemplare. Mittlere ungiftige/giftige Aufnahme in E: Fächer 3,24/0; Kreuzblick 28,91/23,68; Nachhall 2,51/0,91; Taktjäger 10,24/17,12. Überlebende: 20/17/20/19. Der Bogenjäger erreichte bei 40 Exemplaren 15,58/29,78 E und 40 Überlebende. Keine Linie ist bereits selbsttragend; Fangertrag und Giftvermeidung hängen weiterhin deutlich von der Startsituation ab. Giftzuordnung wie beim Bogenjäger: Geruch 0 ungiftig, 5 giftig.
