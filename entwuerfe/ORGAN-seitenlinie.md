# Organ Seitenlinie (Schritt 8) – Fable, 14.11.

Selbst gelesen: `src/body_plan.cc:315–360` (Empfänger, Winkelgewichte), `:1059–1081` (Relativströmung je Sektor), `:1086–1139` (Reiz), `:1185–1205` (Ei), `:981–985` (`excess_response`), `src/receptor_tuning.hh:49–51, 70–72`, `src/simulation_types.hh:42–46`, `src/embryo.cc:1–25`, `src/physiology_parameters.hh:9–13`, `src/brain_interface.hh:18–24, 51–53`, `ui/studio/model/organs.js:130–137`.
Nicht gelesen: `nearby_flow_samples` (Wirbel anderer Tiere), `sediment_immersion`, wie die Hautstelle zum Winkel wird (`n.x`, `n.y`), `birth_exposure`.

## Was die Engine tut
- Der Körperrand hat 16 Sektoren (`BODY_SECTORS`). Eine Zellgruppe gewichtet sie mit einem Keil um ihre eigene Stelle: `1 − Winkelabstand / Breite`, Breite 22,5° bis 180° aus `field`; die Gewichte werden auf Summe 1 gebracht.
- Je Sektor: Relativströmung = Eigenfahrt − Wasser − Drehung − Wirbel. Reiz = Summe über die Sektoren aus Gewicht × positiver Anteil der Relativströmung in Richtung der Zellstelle × (1 − vergrabener Anteil).
- Strömung ist ein Sinn ohne Obergrenze: Antwort `excess_response`, Schwelle 0,0003 × 333^Güte, mit Gewöhnung.
- Im Ei (`embryo.cc`): jedes eigene Zucken (Schwanz, Flossen, Maul) × Baufortschritt treibt die Flüssigkeit in der Schale: `flow = 0,6 × flow + 0,1 × Impuls`. Nach dem Schlupf geht der Reiz über die Zellzeit von innen nach außen über.

## Lebenszyklus, drei Fragen
- **Automatisch:** im Ei das Spüren des eigenen Zuckens; nach dem Schlupf der Übergang nach außen; Gewöhnung.
- **Das Organ entscheidet:** nichts; es meldet nur.
- **Der Designer setzt:** die Stelle auf der Haut (am Fisch, nicht im Panel), die Feldbreite, Schwelle und Streuung, wie schnell die Zellen sich gewöhnen, von wann bis wann sie arbeiten. Zellzahl: im Entwurf nicht gezeigt.

## Entwurf (`entwuerfe/inspektoren.html`, Panel Seitenlinie), neu nach Claudes Einwand 14:14
1. **Rose um den Fisch** (gibt es nur hier): jeder der 16 Sektoren als Blatt, so lang wie sein Gewicht; Griff für die Breite am Rand der Rose. Rundherum das Wasser als Pfeile, hell, wo die Zellen es nehmen. Der runde Knopf steht für die Strömungsprobe des Fischpanels: um den Fisch gezogen (woher), nah herangezogen ein Wirbel, der nur wenige Sektoren erreicht, weit weg eine Strömung, die rundum gleich ist. Daran sieht man: Bei gleichmäßiger Strömung ändert die Breite die Meldung nicht, bei einem Wirbel schon.
2. Signalverlauf auf der unbegrenzten Skala mit Gewöhnung.
3. Leben als Bild: im Ei die Flüssigkeit, die das eigene Zucken bewegt; danach das Wasser am Fisch. Darunter das Band mit zwei Griffen.

Angenommen fürs Bild: wie ein Wirbel über die Sektoren ausdünnt (Glocke). Im Produkt kommt der Reiz aus der Probe im Fischpanel (`state.senseProbe`, Antwort `groupReport(…, 'senseProbe', …)`, Gewichte `groupReport(…, 'lateral', …)`); die Probe strömt dort heute gleichmäßig – ob es einen örtlichen Wirbel als Probe gibt, ist offen (Astra). Nicht im Bild: Sediment, Eigenfahrt und Drehung getrennt; Zellzahl.
