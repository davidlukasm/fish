# Schritt 3: Einbau von Darm und Schwanz ins Design Studio (Fable, 14.11. 07:58) – Plan zum Gegenlesen

Produkt `3a55d01`. Gelesen: `ui/studio/view/panels.js:96-140`, `effectors.js:518-558, 787-810`, `gut_meal.js` ganz, `gut_sense.js` ganz, `muscle_effect.js:1-72`, Liste der Operationen in `model/document.js`, `document.js:1533-1566`. **Nicht gelesen:** `handles.js` und `events.js` (wie ein gezogener Griff ins Dokument schreibt), `sense_curves.js`, `probes.js`, `studio.css`. Ohne die schreibe ich keinen Einbau.

## Wie das Atelier heute zeichnet

Ein Inspektor ist eine Funktion `(state, organ, center) → SVG-Text` (`ORGAN_PANELS`, `panels.js:101-118`). Griffe sind Elemente mit `data-effector-handle`; das Ziehen behandelt anderer Code, das Bild wird danach neu als Text erzeugt. Der Entwurf arbeitet anders: Bilder einmal gebaut, Teile neu gezeichnet, eine Uhr. **Das ist die eigentliche Arbeit des Einbaus**, nicht das Abzeichnen.

## Zwei Wege

| | A: Entwurf in die Textfunktionen übersetzen | B: Entwurfsbilder als eigenes Modul, das ins Panel gehängt wird |
|---|---|---|
| Wie | `gutGraphic`, `gutSensePictures`, `gutMuscleGraphic`, `tailGraphic`, `musclePicture` neu schreiben, Griffe über die bestehenden Wege | `ui/studio/view/gut_inspector.js` / `tail_inspector.js`: nimmt `state`, baut die Bilder im DOM wie der Entwurf, schreibt über die Operationen des Dokuments |
| Dafür | ein Zeichenweg im ganzen Atelier | Bewegung und Ziehen bleiben wie abgenommen; kein Neubau bei jedem Zug (Davids „Fisch verschwindet“) |
| Dagegen | Uhr, Bewegung und sofortiges Nachskalieren müssten in den Textweg hinein; viel Umbau am Ziehen | zweiter Zeichenweg neben dem alten, bis alle Organe umgestellt sind |

**Mein Vorschlag: B**, weil alle weiteren Organe denselben Weg nehmen und der alte Weg dann Organ für Organ verschwindet. Bitte widersprechen, wenn ihr im Code einen Grund dagegen seht.

## Darm: Einstellung des Entwurfs → Dokument

| Entwurf | Atelier | Stand |
|---|---|---|
| Darmlänge | `setGutLength` (`document.js:1077`) | Operation vorhanden |
| Muskelkraft jung / erwachsen | Organ `gutmuscle`: Kopien (`setNodeCopies`), je Knoten ab/bis Reife (`setLifePhase`) | **Lücke:** Der Entwurf hat zwei Stärken (Schlupf, erwachsen) mit Gerade dazwischen; das Atelier hat Knoten, die ab einer Reife arbeiten. Der Lebenszyklus des Darms muss beim Einbau wie beim Schwanz werden (Knoten über die Reife), sonst zeigt er etwas, das man nicht bauen kann |
| ein Organ statt zwei | heute `gut` und `gutmuscle` (`organs.js:167, 184`) | **Entscheidung nötig:** im Panel zusammen zeigen (wählt man eines, erscheint der gemeinsame Inspektor) und im Modell zwei lassen, oder im Modell vereinen. Pro Zusammenzeigen: kein Eingriff in Compiler und gespeicherte Fische. Contra: zwei Dinge in der Bibliothek für ein Organ |
| Schlüssel (Schwelle, Streuung, Gewöhnung) je Sinn | Zellgruppen `fullness`, `ache`, `food`: Schwelle und Zellzeit (`updateCenter`), Streuung (`updateCellDistribution`), mehrere Schlüssel = mehrere Typen (`addOrganType`) | Operationen vorhanden, Zuordnung der Felder **nicht gelesen** |
| Eingaben (Füllung, Bauchweh, Bissen) | Proben gehören ins Fischpanel (David, Grundsatz 2; `gutProbeControls`) | offen, wie Probe und Inspektor dieselbe Eingabe teilen |
| Ertragszahlen, Bauchweh-Grenzen | `state.capabilities.diet` (`gut_meal.js:44-52`) | Der Entwurf rechnet mit eigenen festen Zahlen; beim Einbau aus der Engine lesen |

## Schwanz: Einstellung des Entwurfs → Dokument

| Entwurf | Atelier |
|---|---|
| Bündel (+/×) | Knoten des Muskels: `setOrganNodes` |
| Stärke je Bündel | `setNodeCopies` (Kopien/16, Astra 07:53) |
| Fasern je Bündel | `setMuscleFibre` gilt heute **für das ganze Organ** (`document.js:1121-1122`, liest `centers[0].tau`). Der Entwurf stellt je Bündel ein. Lücke |
| Schwelle je Bündel | Zellschwelle (`updateCenter`); heute gibt es „Reservegruppen“ über `setMuscleSprint` | 
| Schlängeln | `setMuscleTrait` (q1 aller Schwanzzellen, Astra 07:43) |
| arbeitet ab / stirbt | `setLifePhase` |
| Befehl, gezeigte Reife | Eingaben, nicht im Dokument |
| bleibt daneben | Seitenschalter, vier Wirkungsknöpfe, „Hormone einstellen“ |

## Was vor dem ersten Code-Strich geklärt sein muss

1. Weg A oder B.
2. Darm: ein Organ im Panel, zwei im Modell – einverstanden?
3. Fasern je Bündel: Modell erweitern oder Entwurf auf „ein Fasertyp je Muskel“ zurücknehmen? (Die Engine hat den Fasertyp je Zelle, `muscle_fibre.hh:20`, also wäre je Bündel möglich.)
4. Prüfen kann den Einbau nur Astra (laufendes Atelier). Ich prüfe Syntax.

## Nachtrag 08:00: Schreibweg gelesen, Bauplan für Weg B

Gelesen: `ui/studio/handles.js:240-300, 595-640, 764-850`, `ui/studio/design.js:275-295, 336-358`, `ui/studio/controller.js:396-428`, `ui/studio/model/document.js:1038-1130, 1468-1492`, `organs.js:398-400`.

- **Wie ein Zug ins Dokument kommt:** Während des Ziehens `draftDesign(neuesDokument, Stapelname, Neuzeichner)` (`handles.js:768-783`): Das Dokument wird sofort gesetzt, einmal je Frame läuft der Neuzeichner. Beim Loslassen `settleGraphic()` (`:784-803`): Der ganze Zug wird ein Schritt für Rückgängig (`changeDocument`), danach wird der Inspektor neu als Text gesetzt (`refreshInspector`, `controller.js:396-410`: `innerHTML`).
- **Folge für Weg B:** Das Modul hängt an einem Platzhalter im Text des Inspektors. Nach jedem `refreshInspector`/`refreshDragged` ist der Platzhalter neu; das Modul hängt seine bestehenden Bilder dort wieder ein (DOM-Knoten umhängen, nicht neu bauen), darum verschwindet beim Loslassen nichts. Während des Ziehens nennt es einen eigenen Neuzeichner, der nur seine Bilder aus dem Dokument neu malt.
- **Schreiben nur über vorhandene Operationen:** `updateCenter(doc, Zell-Id, {copies, threshold, tau})` wirkt **je Knoten** (`document.js:1468-1492`). Fasern je Bündel brauchen also **keine Modellerweiterung**: `tau` des einen Knotens (`fibreTau`). `setMuscleFibre` setzt nur alle Knoten auf einmal. Frage 3 ist damit erledigt.
- **Bündelschwelle:** `threshold` je Knoten über `updateCenter`. Damit entfällt `sprint` (Anteil der Reserveknoten, `document.js:1093-1116`) als eigener Begriff. **Offen:** ob `sprint` beim Kompilieren die Schwelle der letzten Knoten überschreibt. Das lese ich, bevor ich es anfasse.
- **Reihenfolge des Einbaus:** zuerst der Schwanz (alle Operationen vorhanden), dann der Darm (zwei Organe im Panel als eines, Bibliothek nur „Darm“, Lebenszyklus des Darmmuskels auf Knoten über die Reife umstellen).
