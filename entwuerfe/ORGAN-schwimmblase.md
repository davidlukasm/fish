# Organ: Schwimmblase (Fable, 14.11. 09:09)

Produkt `8e2e2009`. **Selbst gelesen** heißt: die Zeilen selbst gelesen. Der Rest stammt aus Astras Pfad (KOORD 08:25) und Claudes Nachrechnung (08:47) und ist so gekennzeichnet. Kein Lauf.

## Codepfad

| Station | Stelle | Stand |
|---|---|---|
| Befehl | `src/body_plan.cc:1314-1319, 1336-1338`: je Zelle Betrag des Signals × Stärke; das Vorzeichen entscheidet, ob gefüllt oder geleert wird | selbst gelesen |
| Füllung, Kosten | `src/body_plan.cc:1502-1506`: Füllung += `bladder_rate` × (Füllen − Leeren), geklemmt auf 0–1; Kosten `bladder_cost` × Änderung; reicht die Energie nicht, wird gekürzt. Werte `src/physiology_parameters.cc:5-6`: Rate 0,002, Kosten 0,03, Auftrieb 0,03, Sinken 0,012 | selbst gelesen |
| Auftrieb | `src/movement.cc:124-130`: Auftrieb = 0,03 × c/(1+c) × Füllung gegen Sinken 0,012, beides mal Masse; die Schwebefüllung hängt nur an der Kapazität c | selbst gelesen |
| Tiefensinn | `src/body_plan.cc:1156-1162` (Druckzelle an der Blase liest `f.depth`), `:1063` (`depth` = y ÷ Beckenhöhe, auch im Ei) | selbst gelesen |
| Kapazität aus den Zellen, Tod, Wechsel der Druckquelle, keine Gewöhnung, kein eingebauter Regelkreis | Astra 08:25 (`body_plan.cc:390-403, 789-823, 903-909`, `brain_interface.hh:18-24`, `motor_region.js:29-38`) | **nicht selbst gelesen** |
| Im Ei | keine Schwimmbewegung, Füllung kann sich ändern (Astra, `movement.cc:52-64`) | nicht selbst gelesen |
| Atelier-Modell | `ui/studio/model/organs.js:197-206`: 8 Plätze, 3 zu Beginn, Stellzellen `float` (16 Kopien) und eine Druckzellgruppe `pressure` | selbst gelesen |
| Bestehender Inspektor | `ui/studio/view/sacs.js:268-405` (`bladderGraphic`, `bladderLift`, `pressureCurve`) | nur Kopf gelesen |
| Aquarium, Fischpanel | Astra 08:25 (`organ_readout.js:543-555`, `organ_graphics.js:301-318`, `body.js:382, 722-738`) | nicht selbst gelesen |

## Was das Organ ist und tut

Die Blase trägt den Fisch. Ihre Stellzellen füllen oder leeren sie auf Befehl; ohne Befehl bleibt die Füllung. Ab einer Füllung schwebt der Fisch, darüber steigt er, darunter sinkt er. **Die Größe der Blase (Kapazität c) wirkt auf zwei Dinge:** bei welcher Füllung der Fisch schwebt (0,4 × (1+c)/c; bei c = 3 sind das 53 %, unter c = ⅔ kann er nie schweben) und wie schnell sie sich füllt (0,002 × c je Schritt; bei c = 3 von leer bis zum Schweben 89 Schritte, bis voll 167). Füllen und Leeren kosten Energie, Halten nicht. Die Druckzellen an der Blase melden die Tiefe, nicht die Füllung, und gewöhnen sich nicht. Blase und Tiefensinn sind nur über die Verdrahtung verbunden.

## Lebenszyklus, die drei Fragen

- **Automatisch:** Auftrieb und Gewicht wachsen beide mit dem Körper; die Schwebefüllung ändert sich mit dem Wachsen nicht. Im Ei wird nicht geschwommen.
- **Bestimmt das Organ:** welche Zellgruppen wann arbeiten und sterben, also die Kapazität über das Leben. Fällt sie unter ⅔, kann der Fisch nicht mehr schweben.
- **Einstellbar:** je Zellgruppe „arbeitet ab“ und „stirbt“. Zum Beispiel ein Schlüpfling ohne Blase, der am Grund lebt, und ein erwachsener Fisch, der schwebt.

## Was David gesagt hat

- „Grafik hässlich. Ausgedehnte Blase berührt den Schwanz.“ (`FEEDBACK-1311.md:68`)
- Befehl und Ausgangsfüllung sind Eingaben, keine Einstellungen; eine Einstellung der Blase selbst fehlte; „Anzahl der Knoten ändert nichts?“ Die willkürliche Schritte-Skala ist ein Problem (`:69`).
- Druckzellen: schwache Darstellung, mehr Optionen, „nicht dieselben Zellen wie im Magen?“ (`:70`)
- „Wirkt unfertig. Warum ‚Nach dem Schlupf‘?“ Grund und Oberfläche brauchen Sand, eine Pflanze, eine Oberfläche, hell/dunkel. Beim Ziehen der Blasengröße zittert das Diagramm. Der Fisch soll oben bleiben, mit einem Pfeil für die Beschleunigung, nicht unten wieder auftauchen (`FEEDBACK-2115-ERKLAERT.md:81-85`).
- Tiefensinn: (+)/(−) zeigt nur das Was, nicht den Effekt; die Kurve ist eine Meldung ans Gehirn; Kurven „wie Felsen“: weniger deckend, über das ganze Diagramm (`:87-90`).

## Entwurf: das eigene Bild ist die Wassersäule

1. **Wassersäule** (oben hell mit Oberfläche, unten dunkel mit Sand und einer Pflanze): Darin der Fisch von der Seite mit der Blase im Leib. Die Blase füllt und leert sich mit dem Versuch; der Fisch steigt, schwebt oder sinkt, bleibt an der Oberfläche oder am Grund stehen, und ein Pfeil zeigt die Beschleunigung. **Einstellung:** Griff an der Blase für ihre Größe (bleibt im Leib, berührt den Schwanz nicht). Quer durch die Säule die Schwellen des Tiefensinns als Linien mit Griff am Rand; eine Linie leuchtet, wenn der Fisch tiefer ist.
2. **Füllen und Leeren:** über die Schritte der Befehl als Eingabe mit runden Knöpfen (füllen bis hier, danach leeren), darunter die Füllung als Fläche und die Schwebelinie quer. Die Linie wandert, wenn man die Blase größer zieht; über ihr steigt der Fisch, unter ihr sinkt er. Feste Schrittachse, damit nichts zittert.
3. **Tiefensinn:** Nervenzellen und Zeitbild wie bei den anderen Sinnen; der Reiz ist die Tiefe, die der Fisch im Versuch oben erreicht (ein Versuch, drei Ansichten). Schwelle, Streuung, (+)/(−); keine Gewöhnung.
4. **Lebenszyklus:** über die Reife die Füllung, bei der der Fisch schwebt (Stufen, wo Zellgruppen dazukommen oder sterben); wo die Blase zu klein zum Schweben ist, ist das Band als „sinkt“ gefärbt.

**Nur bei diesem Organ:** die Wassersäule mit Oberfläche und Grund, und dass Schweben eine Linie in der Füllung ist.
