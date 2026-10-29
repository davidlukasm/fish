# Futtersammler-Klassen: Nachtbericht 28./29.10.2026

## Ergebnis in Kürze

- **Sieben Klassen von Futtersammlern** liegen in `futtersammler/`. Sie unterscheiden sich in Darm, Kiefer, Zähnen, Pumpe, Nase, Augen, Farbe, Hormon und Lernen. Jede ist auf eine Nische angelegt:
  - Kunstfutter;
  - Plankton;
  - Algen;
  - Blätter;
  - Würmer und Schalentiere;
  - Aas;
  - Würmer und Boden.
- **Jede Klasse trägt sich allein im Tank** über 15.000 Schritte und 7–11 Generationen. Nach dem Start brauchte keine eine Rettung, nur die alte Geier-Fassung brauchte 3.
- **Im Mischbecken** erreichen alle Klassen Generation 5–17. Nach 30.000 Schritten leben in vier Seeds noch 3–5 Klassen nebeneinander. Welche neben dem Schnapper bleibt, wechselt mit dem Seed: Siebmaul, Algenzupfer oder Blattbeißer und Geier. Auf Dauer setzt sich aber die beste Kunstfutter-Klasse durch, denn alle leben zu 80–97 % von Kunstfutter.
- **Zweite Runde mit gezüchteten Nachkommen:** Jetzt gewinnt der Algenzupfer (G11 aus dem Mischbecken). Er verdrängt in Seed 2 alle anderen, auch den gezüchteten Schnapper.
- **Bei knappem Kunstfutter (30 %)** wechseln die Klassen deutlich in ihre Nischen: Das Siebmaul frisst dann 30 % Algen und 23 % Krebschen, der Algenzupfer 19 % Algen, der Knacker 17 % Krebschen. Die Organanlagen wirken also.
- **Voraussetzung:** v018b vom 28.10., 21:31, plus `bissen-schlucken.diff`. Ein Bissen, der in den Mund passt, geht direkt in den Darm; Schalentiere sind ausgenommen. Die Spezifikation dazu ist `SPEZ-nachtrag-bissen-schlucken.md`.

## Die Klassen (Endfassung)

Alle bauen auf dem Schnapper-Körper auf. Er hat acht Bänder: Auge, Nase, Sehrelais, Geruchsrelais, Steuerung, Pumpe, Sperma, Ei. Augen und Steuerung sind auf Rot gestimmt (Kunstfutter). Ei- und Spermaorgan sind vollständig (32/32). Eine Nasenhälfte meidet Eier, die andere ist die Appetitnase. Kiefer, Pigment und Fressdrüse ersetzen Viertel bzw. Spalten des Pumpenbands. Endgewebe 88–98.

Darm: 0 = Fleisch, 1 = Pflanzen. Zähne: 0 = scharf, 1 = stumpf. Zahlen bei Organen: Kapazität.

| Spitzname | Nische | Darm | Pumpe | Kiefer / Zähne | Appetitnase | Augen | Farbe | Hormon | Lernen im Ei |
|---|---|---|---|---|---|---|---|---|---|
| **Schnapper** | Kunstfutter | 0 | 64 | – | Futter | rot | weiß | – | – |
| **Siebmaul** | Plankton | 0 | 64 | – | Futter + Plankton/Krabben | rot | hellblau | – | – |
| **Algenzupfer** | Algen (Abschaben durch Saugen) | 1,0 | 64 | – | Futter + Algen | halb rot, halb grün | hellgrün | Fressdrüse | ja |
| **Gründler** | Würmer, Boden | 0,5 | 64 | – | Futter + Würmer/Muscheln | rot | orange-braun | Fressdrüse | ja |
| **Blattbeißer** | Blätter | 0,8 | 64 | 8 / 0,7 | Futter + Blätter | rot | gelb | – | – |
| **Knacker** | Würmer, Muscheln, Krabben | 0 | 64 | 8 / 0,8 | Futter + Würmer/Muscheln | rot | rosa | – | – |
| **Geier** | Aas | 0 | 64 | 8 / 0,35 | breit: Futter, Aas, Würmer/Krabben | rot | grau | – | – |

- **Fressdrüse:** Sie arbeitet mit der Pumpe und schüttet Hormon 0 aus (Spiegel im Test 0,93). Ein Rezeptor auf den Vorwärtszellen bremst damit das Schwimmen, solange der Fisch frisst.
- **Lernen im Ei:** Das Geruchsrelais hat Lernart 2, dazu kommen halbstarke retinale Wellen. Bis zum Schlupf ändern sich die Gewichte um ~170, in den 500 Schritten danach um ~1500.
- **Kiefer:** Er hängt an der Pumpenbahn, der Fisch beißt also beim Saugen. Mit Kapazität 8 ist er eine Anlage, die die Evolution verstärken kann. Kiefer ab 18 ließen die Linien im Wettbewerb aussterben.

Nachbau und Abwandlung: `klassen-baukasten.cc` und `klassen-bauen.sh`. Sie erzeugen die Genome exakt, die Optionen stehen im LIESMICH.

## Tests der Endfassung

**Zuchtbecken:** jede Klasse allein, 120 Gründer, 15.000 Schritte. Die 14 Rettungen vom Start sind bei allen gleich.

| Klasse | Fische am Ende | max. Generation | Kost |
|---|---|---|---|
| Schnapper | 62 | 10 | Futter 97 % |
| Siebmaul | 52 | 10 | Futter 93 %, Krebschen 6 % |
| Algenzupfer | 54 | 9 | Futter 94 %, Algen 4 % |
| Gründler | 41 | 11 | Futter 95 %, Krebschen 3 % |
| Blattbeißer | 52 | 8 | Futter 93 %, Algen 4 % |
| Knacker | 49 | 9 | Futter 92 %, Algen 3 %, Krebschen 2 % |
| Geier | 59 | 10 | Futter 89 %, Krebschen 6 %, Algen 4 % |
| Geier, alte Fassung (nur Aasnase) | 28 | 7 | Futter 83 %, Krebschen 14 %; 3 Rettungen nach dem Start |

**Mischbecken** (alle 7, je 17 Gründer, 30.000 Schritte; noch mit der alten Geier-Fassung):

| Linie | Seed 1, t 11.000 | Seed 1, t 30.000 | Seed 2, t 30.000 | Seed 3, t 30.000 |
|---|---|---|---|---|
| Schnapper | 12, G6 | 23, G15 | 35, G16 | 21, G15 |
| Algenzupfer | 8 | 12, G13 | † | 2 (nur aus Rettung) |
| Blattbeißer | 10 | 11, G13 | † | 8, G15 |
| Knacker | 5 | 4, G15 | 5, G6 | † |
| Siebmaul | 14, G7 | † (zuvor G15) | † | 21, G16 |
| Gründler | 19, G8 | † (zuvor G12) | † (zuvor G11) | 2, G5 |
| Geier (alt) | † | † | † (zuvor G9) | 5, G7 |

Kost in Seed 1, t 22.000:

| Linie | Kunstfutter | Algen | Krebschen |
|---|---|---|---|
| Algenzupfer | 85 % | 11 % | 3 % |
| Blattbeißer | 78 % | 5 % | 15 % |
| Siebmaul | 88 % | – | 11 % |
| Gründler | 84 % | 7 % | 9 % |
| Schnapper | 92 % | 7 % | – |
| Knacker | 95 % | – | 5 % |

**Mischbecken der Endfassung mit dem neuen Geier** (je 17 Gründer, 30.000 Schritte):

| Linie | Seed 1 | Seed 2 | Seed 3 | Seed 4 |
|---|---|---|---|---|
| Schnapper | 30, G15 | 37, G15 | 18, G14 | 44, G15 |
| Siebmaul | 21, G15 (Krebschen 12 %) | 19, G17 (Algen 11 %) | 4, G11 (Algen 12 %, Krebschen 8 %) | † |
| Knacker | 7, G13 (Algen 9 %) | 3, G15 | † | 3, G2 |
| Algenzupfer | 4, G5 | † | **29, G11** (Algen 4 %) | † |
| Gründler | 4, G2 | 4, G12 | † (bei t 21.000 noch 9) | † |
| Blattbeißer | † | † | † | **10, G12** |
| Geier | † (zuvor G5) | † (nur Fische aus Rettungen) | † | **7, G9** |

- Je nach Seed überlebt neben dem Schnapper eine andere Klasse am besten: Siebmaul (Seed 1, 2), Algenzupfer (Seed 3) oder Blattbeißer und Geier (Seed 4).
- Keine Klasse ist also grundsätzlich unterlegen. Welche Linien bleiben, entscheidet vor allem der Zufall in kleinen Beständen.
- Am Ende lebten 3–5 Klassen mit natürlich geborenen Fischen.

**Gezüchtete Nachkommen im Mischbecken** (5:00–5:45): je Klasse der beste Nachkomme aus den Mischbecken oben, G9–G17, je 17 Gründer. G zählt die Generationen in diesem Lauf:

| Linie | Seed 1, t 30.000 | Seed 2, t 30.000 | Seed 3, t 15.000 | knapp (30 %), t 30.000 |
|---|---|---|---|---|
| Algenzupfer (aus Seed 3, G11) | **46, G17** (Algen 3 %, zwischendurch 8 %) | **66, G14** (allein übrig) | **36, G9** (Algen 4 %, Boden 4 %) | † |
| Gründler (G12) | 7, G16 | † | 2, G2 | † |
| Siebmaul (G17) | 4, G5 | † | 13, G10 | **15, G12** |
| Schnapper (aus Seed 4, G15) | † (schon bei t 5.000) | † | 4, G2 | † |
| Knacker (G15) | † | † | † | † |
| Geier (aus Seed 4, G9) | † | † | 5, G2 | 5, nur aus Rettungen (Krebschen 45 %) |
| Blattbeißer (aus Seed 4, G12) | † | † | 8, G8 | † |

- Der im Mischbecken gezüchtete **Algenzupfer** ist jetzt der stärkste Kunstfutterfresser. Er schlägt sogar den gezüchteten Schnapper. Algen frisst er dabei weiter in kleinem Anteil.
- Die Nachkommen sind auf reichlich Kunstfutter gezüchtet. Bei knappem Futter halten sie sich schlechter als die handgebauten Gründer (16–20 statt 29–41 Fische).
- Der Verdrängungseffekt bleibt also: Gewinnen kann jede Klasse, die zufällig die beste Kunstfutterlinie hervorbringt.

**Ohne Schnapper** (6 Klassen, 30.000 Schritte):

| Linie | Seed 1 | Seed 2 |
|---|---|---|
| Siebmaul | 35, G16 | 51, G20 |
| Blattbeißer | 12, G7 | † |
| Gründler | † | 3, G6 |
| Algenzupfer, Knacker, Geier (alt) | † | † |

Ohne den Schnapper übernimmt das Siebmaul seine Rolle.

**Mit nur 30 % Kunstfutter** (Plankton 20 %, Bodentiere 25 %, Pflanzen mindestens 25 %), Kost bei t 13.000 (Knacker aus Seed 2, t 10.000):

| Linie | Kunstfutter | Algen | Krebschen |
|---|---|---|---|
| Siebmaul | 46 % | 30 % | 23 % |
| Algenzupfer | 77 % | 19 % | – |
| Knacker | 82 % | – | 17 % |
| Gründler | 84 % | – | 10 % |
| Schnapper | 94–97 % | – | – |

Die Bestände sind dabei klein (29–41 Fische). Bei t 13.000–16.000 lag der Schnapper mit 19–24 Fischen vorn. Daneben lebten nur noch Algenzupfer, Gründler und Knacker mit je 4–5.

## Folgerungen

- Alle 7 Klassen bilden im Tank mehrere Generationen, allein und gemischt.
- **Auf Dauer verdrängt die beste Kunstfutter-Klasse die anderen.** Die Nischen werden erst in Ansätzen genutzt. Wegen kleiner Linien (3–20 Fische) hängt viel am Zufall.
- **Für ein dauerhaftes Nebeneinander** sehe ich zwei Wege:
  1. Den Kunstfutteranteil langsam senken, sobald Nischen genutzt werden. Bei knappem Kunstfutter wechseln die Klassen ja in ihre Nischen.
  2. Die Klassen getrennt evolvieren lassen, bis jede ihre Nische nutzt, und sie erst dann zusammensetzen.
- **Kleinere Körper sind im Vorteil.** Im Größentest hielten sich 36 kleine (Endgewebe 88) gegen 21 große (114) Fische. Kleine Fische zahlen weniger Unterhalt, brauchen eine geringere Mutterreserve und stecken weniger Überschuss ins Wachstum.
- **Drüse und Lernen funktionieren.** Einen klaren Fitnessvorteil zeigten sie im Einzeltest nicht. Die Unterschiede lagen in der Streuung (±0,04 E je Schritt).

## Befunde zur Umgebung

- **Futter bleibt liegen.** Im Becken liegen 40–90 kE Futter, trotzdem ist Hunger eine Haupttodesursache. Große Stücke passen nicht in junge Münder und werden beim Anschwimmen weggeschoben, denn Futter kollidiert mit dem Körper. Die Bestände begrenzt eher die Fortpflanzung als das Futter.
- **Krankheit** springt zwischen Fischen derselben Linie über. Monokulturen leiden darunter mehr als gemischte Becken.
- **Lernen:** Nach Modell 19 braucht es Lernart > 0 oder ein Lehrsignal (Hormon oder Modulatorzellen). Retinale Wellen allein ändern nichts. Bisherige Genome mit Lernart 0 lernen gar nicht.
- **Rekurro** (von Astra) und die **g40-Linien** starben in allen Mischbecken früh aus.

## Weitere Ordner

- `futtersammler/zucht/` – Nachkommen aus den Zuchtbecken der Endfassung, Generation 7–11.
- `futtersammler/gezuechtet/` – Nachkommen aus den Mischbecken, Generation 6–16.
- `futtersammler/varianten/` – die alte Geier-Fassung.
- `futtersammler/grosse-serie/` – die erste, größere Serie. Sie hat Kiefer 18, die Pumpe 80–128 und ein Endgewebe von 108–114. Darunter liegen auch Fassungen ohne Lernen, mit Drüse und mit scharfen Zähnen.
