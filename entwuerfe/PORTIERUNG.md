# Portierung Entwurf → Produkt (erst nach Davids Freigabe)

Stand 13.11., Entwurf `entwuerfe/inspektoren.html` (Artifact Version 31). Ein Panel wird erst
übernommen, wenn David es freigegeben hat. Jede Übernahme: ein Commit je Panel, Suite grün,
Browserabnahme bei 275/320/405 px, Vorher/Nachher-Bild in KOORD.

## 1. Gemeinsame Bausteine zuerst (Claude)

| Entwurf | Produkt | Inhalt |
|---|---|---|
| `senseGroups`, `cellGates`, `senseAnswer` | `view/sense_curves.js`, `view/sense_marks.js` | gestapelte Gruppen, Reizstreifen mit Schwellenlinien und Spreizband, Spreizgriff, Gewöhnung, Log-Skala offener Sinne, Futter-Marken |
| `settle` | `view/markup.js` (neu: `settledScale`) | Skala wächst nur beim Ziehen, gleitet danach zurück |
| `regler` | vorhandene Griffe (`sensitivityHandle`) | senkrechter Regler mit Gruppenmarken |
| `traceChart`, `snapRow` | `view/region_controls.js` | Spur mit Eingangsstreifen, Rastgriff auf gerechnete Einstellungen |

## 2. Organe (Claude)

| Entwurf | Produktdatei / Funktion |
|---|---|
| Darm (Schlund, Ertrag, Leben, Füll-, Schmerz-, Futterzellen) | `effectors.js` `gutGraphic`, `gut_meal.js`, `probes.js`, Sinne über Baustein 1 |
| Schwanz (Zellen, Kraft, Tempo) | `effectors.js` `tailGraphic` |
| Maul | `effectors.js` `suctionGraphic`, `jawGraphic` |
| Flossen | `effectors.js` `sideGraphic`, `strokeChooser` |
| Kiemen (drei Kurven, Pumpen) | `effectors.js` `gillGraphic` (Bodennische schon oben, 3563d15f) |
| Schwimmblase, Eier und Samen | `sacs.js` `bladderGraphic`, `gonadGraphic` |
| Abwehr | `effectors.js` `spineField` |
| Pigment | `pigments.js` |
| Drüse, Blutsinn | `substances.js` `glandProfile`, `hormonePad` |
| Nase, Barteln | `scents.js` `scentMap`, `panels.js` `barbelFeel` |
| Tasten, Schmerz | `skin.js` `skinField` |
| Seitenlinie | `lateral.js` |
| Gleichgewicht | `balance.js` `hairField` |
| Nahsinn | neue Funktion neben `skin.js` |
| Nervenzelle | `nerve_cell.js` `nerveEditor` |
| Lebenszyklus | `life_cycle.js` |

## 3. Regionen aus echten Spuren (Astra besitzt die Spurmodi, Claude die Bilder)

| Entwurf | Produkt | Spurmodus |
|---|---|---|
| Wirbelsäule, Flossentakt | `circuit.js` `regionSettings` | spine, spine-fin, spine-rest |
| Auswahl | `circuit.js` | choice* |
| Körperzustand | `circuit.js` | state-hunger |
| Geruchsvergleich | `circuit.js` | olfaction |
| Lernen | `learning.js` `learningInspector` | learn |
| Wertung | offen | braucht einen Spurmodus `value` (Bitte an Astra) |

Im Produkt kommen die Spuren nicht als eingebettete Tabellen, sondern live aus `planTrace`
(Astra 8bbee333, 0,7–2,1 ms je Spur). Gerastete Griffe gibt es dort nicht mehr: jeder Griffwert
rechnet seine Spur selbst.

## 4. Auge, Sehzentrum, Motorik (Astra, schon im Produkt)

Keine Portierung aus dem Entwurf.
