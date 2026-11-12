# Entwürfe

Baupläne aus dem Atelier, die (noch) keine fertigen Fische sind, je Art die neueste Fassung. Das
Spiel bietet sie als eigene Kategorie „Entwürfe" an, getrennt vom Fischregal (`genomes/regal`), in
das ein Fisch erst kommt, wenn er sich im Becken über Generationen hält. `werkzeug/fischbau.mjs`
baut zu jedem Bauplan das Genom daneben.

Alle Entwürfe sind auf den heutigen Starter Brisa portiert: Zustand, Motorik, Wirbelsäule mit
Flossentakt, Riechverarbeitung und die Schwimmmuskeln kommen von Brisa. Jede Art behält, was sie im
alten Entwurf ausmachte (Duft, Kiefer, Zähne, Augen, Barteln, Kiemen). Die alten Organe `circuit`
und `rhythm` gibt es nicht mehr.

| Datei | Art | Nische | Eigenes gegenüber Brisa |
| --- | --- | --- | --- |
| `gruendler.fish.json` | Gründler | gräbt Würmer aus dem Schlamm | kurzer Darm, Nase und Barteln für Würmer, Gleichgewichtssinn mit Haaren quer zum Körper (dreht ihn zum Grund), Brust- und Bauchflossen mit Vorziehern (rückwärts aus dem Schlamm, wenn satt), Flossen tragen ihn am Grund |
| `knacker.fish.json` | Knacker | knackt Muscheln | kurzer Darm, Nase und Barteln für Muscheln, Kiefer 24 Knoten, stumpfe Zähne, kurzer Kiefer, starke Schwanzwelle |
| `hecht.fish.json` | Hecht | jagt Fische nach Sicht | kurzer Darm, Augen (nah, alle Farben) über das Tectum zur Motorik, Kiefer 24 Knoten, spitze Zähne |
| `laichraeuber.fish.json` | Laichräuber | frisst Eier | kurzer Darm, Nase für Eier, Kiefer 12 Knoten |
| `planktonfresser.fish.json` | Planktonfresser | siebt Plankton | kurzer Darm, Nase für Plankton, Kiemen mit dichten Reusen |
| `sehtest.fish.json` | Seh | Sehtest | Augen für Futter über das Tectum zur Motorik |
| `brisa_kiemen.fish.json` | Brisa mit Kiemen | wie Brisa | Kiemen und Darmmuskel |

Aufgegangen in anderen Fassungen (in der Git-Geschichte erhalten): `gruendler_alt` im Gründler,
`plankter` im Planktonfresser, `moos` (sehender Weidegänger mit Schwimmblase und Berührung) im
Starter Liora.
