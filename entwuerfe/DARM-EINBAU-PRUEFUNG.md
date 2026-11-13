# Darm-Entwurf gegen das Atelier: woran er im Produkt hängen würde (Claude, 13.11. 23:25)

Davids Frage von 23:18: Erst der Einbau zeigt, ob ein Entwurf taugt. Ich habe nur gelesen, nichts eingebaut. Produkt `708b566a`.

| Entwurf | Im Atelier vorhanden | Einbaubar? |
| --- | --- | --- |
| Darmlänge, Ruhe-Verweildauer | `gutLength(document)` (Gen `q1`), Ruhezeit `capabilities.gutTime × diet.gut.size` (`ui/studio/view/gut_meal.js:44-55`) | ja, direkt |
| Ertragskurven je Futter | `capabilities.diet.foods` mit den Stoffen der **Engine**, Kurven schon heute in `dietCurves` (`effectors.js:491`) | **nein, nicht mit Davids Zahlen.** Der Entwurf rechnet mit eigenen Stoffwerten (Fables Block „PROPOSAL TO THE ENGINE“). Eingebaut zeigt das Atelier die Engine-Kurven, also andere Zahlen als der Entwurf. Davids Zahlen brauchen erst eine Engine-Änderung, zwei neue Stoffe. |
| Muskel als ein Wert „Antrieb“ | Der Darmmuskel ist ein **eigenes Organ** (`gutmuscle`, 2 bis 8 Knoten, `organs.js:174-183`). Die echte Höchstgeschwindigkeit liefert die Anatomie: `anatomy.gutSpeed` bzw. `b.gut_speed` (`ui/organ_readout.js:404-405`). | **Mit Behelf.** Ein Griff im Ertrag müsste alle Knotenstärken im Verhältnis skalieren. Die Wirkung kommt dann aus `gutSpeed`, nicht aus der Formel des Entwurfs. Offen: Darm und Darmmuskel sind im Atelier **zwei Panels**. Der Entwurf legt den Muskel in den Darm. Das muss David entscheiden. |
| Jungfisch und Erwachsener | Lebensabschnitt je Knoten über `lifePhase` und `setLifePhase` (`document.js:1495-1526`). Die Körpergröße wirkt in der Engine im Quadrat (`physiology.hh:363-366`). | ja, aber die Reichweite des Jungfischs muss nach der Engine-Formel gerechnet werden, nicht mit `bodyDrive` des Entwurfs |
| Füll-, Schmerz- und Nährzellen: Schwelle | je Zellgruppe `center.threshold`, Antwort aus dem Designlauf über `groupReport` und `senseSensitivity` (`view/sense_marks.js:60-66`) | ja |
| Streuung der Schwellen | `distribution.spread_physiology` und `spread_receptors` je Zellgruppe (`document.js:82, 466`) | vermutlich `spread_physiology`, bitte nachsehen, was die Engine damit streut |
| (+) und (×) für weitere Schwellen | Der Darm hat **feste Zellgruppen**: 4 Nährzellen, 2 Füllzellen, 2 Schmerzzellen (`organs.js:158-172`), `scope : 'single'`. Eine Funktion, die einer Organgruppe eine weitere Sinnesgruppe gibt, habe ich nicht gefunden, nur `removeCenter`. | **wahrscheinlich nein, ohne Änderung am Organmodell.** Vor dem Vorschlag klären, sonst zeigt der Entwurf eine Einstellung, die es nicht gibt. |
| Gewöhnung, Erschöpfung | die Gewöhnungszeit je Zelle (4 bis 1024 Schritte), heute als `fadeRow` (`view/gut_sense.js`) | ja |
| Nährzellen-Reiz | Die Engine meldet Zufluss ÷ (Zufluss + Ruhebedarf) (`nutrient_signal`, `physiology.hh`), die heutige Ansicht markiert „Ruhebedarf gedeckt“ bei der Hälfte | ja, die Eingabe des Entwurfs muss in dieser Einheit sein |
| Bauchweh-Reiz | `gut_irritation` = Füllung × `gut_ache(stay, Fleisch, Faser)` (`physiology.cc:236-237`, `physiology.hh:373-379`) | Die Bauchwehformel des Entwurfs weicht ab (Fable, Teil 3). Eingebaut gilt die Engine. |
| Mahlzeit durch den Darm | `gut_meal.js`: drei Zeilen, hungrig in Ruhe, hungrig getrieben, satt getrieben, aus `gutMeal`/`gutPassage` (Spiegel der Engine) | Diese bestehende Ansicht des Muskelpanels kennt der Entwurf nicht. Bitte entscheiden, ob sie bleibt oder ersetzt wird. |

## Was daraus folgt

1. **Die Ertragskurven des Entwurfs sind heute nicht einbaubar.** Entweder ändert sich zuerst die Engine (Fables Vorschlag), oder der Entwurf zeigt die Engine-Kurven. David muss wissen, dass seine Zielzahlen eine Engine-Änderung sind.
2. **Darm und Darmmuskel sind zwei Organe und zwei Panels.** Der Muskel im Ertragsbild des Darms braucht entweder einen Verweis auf das Muskelorgan oder eine Zusammenlegung der Panels.
3. **(+)/(×) für Schwellen:** Erst klären, ob das Organmodell weitere Sinnesgruppen erlaubt.
4. **Alle Formeln des Entwurfs**, die nicht aus der Engine kommen (`bodyDrive`, `acheSwing`, `ache()`, `STUFFS`), müssen beim Einbau durch die Werte aus `capabilities` und `anatomy` ersetzt werden. Ein Entwurf, der vorher schon darauf rechnet, zeigt David das, was er später wirklich bekommt.
