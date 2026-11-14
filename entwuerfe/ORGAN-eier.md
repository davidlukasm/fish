# Organ Eier

Am Produktstand `64a6bef7` gelesen (Fable, 14.11. 12:10). Grundlage ist Astras Pfad von 11:47; was ich selbst gelesen habe, steht mit Datei und Zeile da, der Rest ist als übernommen gekennzeichnet.

## Was das Organ tut

- **Füllen:** Solange der Fisch geschlüpft ist und nicht gerade ablegt, wandert Reserve in den Dotter: je Schritt `Befehl/(1+Befehl) × 2 × Körpergröße` (`body_plan.cc:1451–1454`, `reproduction.cc:27–32`, `ecology_types.hh:70`). Der Befehl ist das Signal der Füllzellen mal ihre Stärke.
- **Grenzen des Füllens:** der freie Platz im Organ, und die Reserve über der Mutterreserve `150 × √(Gewebe/Bezugsgewebe)` (`reproduction.cc:38–43`, `physiology.cc:61–63`). Füllen Eier und Samen zugleich, teilen sie sich das Verfügbare anteilig. Das Verschieben kostet je Schritt `0,004 × Befehl` (`body_plan.cc:1498`, `physiology_parameters.hh:41`).
- **Fassungsvermögen:** `Bauchraum × Körpergröße × min(160, 10 × Eizellen)` (`physiology.cc:116–128`, `ecology_types.hh:70–71`). Der Bauchraum sinkt mit der Darmlänge (`physiology.hh:224–227`). Sechzehn Zellen erreichen die Decke.
- **Ablegen:** Ein Schlag der Ablegezellen und mindestens 95 % Füllung (`body_plan.cc:1460`, `reproduction.cc:58–62`, `physiology.hh:56`). Das Ei bekommt den ganzen Dotter und liegt hinter dem Fisch; der Fisch zahlt 2 dazu (`reproduction.cc:110–128`).
- **Nährei:** Hat der Dotter weniger als das, was ein Junges dieses Bauplans bis zum Schlupf braucht, wird es ein Nährei ohne Junges (`reproduction.cc:65–66`, `physiology.cc:93–98`).
- **Kein Ei trotz vollem Organ:** bei voller Population oder wenn schon zu viele Eier der Art in der Nähe liegen (`reproduction.cc:67–76`), oder wenn hinter dem Fisch kein Platz ist (`:77–90`).
- **Drucksinn:** Die Druckzellen des Organs lesen Dotter ÷ Fassungsvermögen (`physiology.cc:120–122`; Zuordnung von Astra übernommen, `body_plan.cc:1045–1049,1158–1161` nicht selbst gelesen).

## Lebenszyklus

- Im Ei füllt das Organ nicht (`reproduction.cc:20–23`, `body_plan.cc:1452`).
- Das Fassungsvermögen wächst mit dem Körper (`growth_fraction`, `physiology.hh:85–87`).
- Arbeiten ab/Sterben der Zellen über Reife wie bei jedem Organ (`setLifePhase`); eine tote Zelle zählt nicht mehr zum Fassungsvermögen (`active_interface`, `physiology.cc:117`).

## Atelier

- `organs.js:245–260`: ein Organ, beidseitig, bis 18 Knoten, zu Beginn 14: 8 Füllzellen, 4 Ablegezellen, 2 Druckzellen. Anschlüsse: Speicher (ein), Auslöser (ein), Füllung (aus).
- Planbericht `capabilities.gonads.eggs = {perCell, most, fill, spawnShare}` und `gonads.release` (`atelier.cc:975–985`).
- Heutiges Bild: `gonadGraphic` in `sacs.js` (von Astra übernommen, nicht selbst gelesen).

## Offen

- **Was ein Junges braucht** (`egg_energy_needed`) hängt am Bauplan und an der eigenen Brutzeit der Mutter. Der Planbericht liefert es nicht. Für die Linie „reicht für ein Junges“ braucht der Einbau diesen Wert aus dem Compiler; im Entwurf steht eine angenommene Zahl.
- Zählt `motor_counts[eggs]` Füll- und Ablegezellen zusammen? Der Kommentar in `organs.js:249` („sixteen motor chambers reach the ceiling“) spricht dafür; im Compiler habe ich es nicht gelesen.

## Für den Entwurf

- Fisch von der Seite mit Bauch: Darm und Eiorgan teilen sich den Raum. Griff am Organ für seine Größe.
- Ein Versuch über die Zeit: Füllbefehl und Ablegebefehl als Eingaben, Dotter als Sägezahn, die Marke „reicht für ein Junges“, gelegte Eier als Junges oder Nährei.
- Füllgefühl der Druckzellen mit Schwelle und Streuung.
- Lebenszyklus: Fassungsvermögen wächst mit dem Körper, beginnt mit dem Schlupf.
