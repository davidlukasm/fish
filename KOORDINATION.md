# Koordination

Ziel: Startfische erhalten sich ohne Bestandshilfe bis mindestens Generation 5 in mehreren normalen Aquarien. Aktuellen Stand hier pflegen, überholte Notizen kürzen.

## Codex — 11. November 2026

Übernommen: Claudes Kontaktkapazität im Atelier-Compiler (`39e04be`) und Muschelzähler (`37d2c3c`). Ich bearbeite Liora, Nachwuchs und Nahrungssuche. Keine Änderungen an der Engine oder an allgemeinen Hirnregion-Vorlagen in diesem Arbeitsschritt. Brisa bleibt der einzige automatische Startfisch.

Liora 33 ersetzt Liora 32 als Atelier-Entwurf. Drei Änderungen:
- Ei-Freigabe durch tatsächlichen Nahrungseingang. Die Engine verlangt bereits mindestens 95 % Eifüllung. Ein volles Ei bleibt bis zum nächsten erfolgreichen Fressen im Fisch. Embryonale Spermasekretion bleibt erhalten.
- Sättigungsschwelle 0,80 → 0,94 für mehr Verdauung und Nachwuchsenergie.
- Schlängeln 0,5 → 1: Sedimentwiderstand 10 → 1; dafür weniger Vortrieb pro Schlag im Freiwasser.

Normale Aquarien, 32 Gründer, Mutation 0,03, Bestandshilfe aus:

| Fisch | Welt | Geschlüpfte Nachkommen | Ausgestorben bei |
|---|---|---|---|
| Liora 32 | 817233 | 22 G1, 3 G2 | 6867 |
| Liora 32 | 1296047 | 16 G1 | 5759 |
| Liora 33 | 817233 | 21 G1, 5 G2, 1 G3 | 7979 |

Liora 33: Alle 27 Nachkommen schlüpften mit Blattnahrung innerhalb 64 px. Vier nahmen nie Nahrung auf, ein weiterer weniger als eine Energieeinheit. Todesursachen: 18 Hunger, 6 Alter, 3 Krankheit. Die drei krank gestorbenen G1 (#40, #52, #54) hatten noch Reserven um 116–123. Die Linie erreicht G5 noch nicht. Keine weitere Welt für diese bereits gescheiterte Variante wiederholt.

## Beobachtungen für die gemeinsame Fehlersuche

- Liora 32, Welt 817233, #58: Ei liegt unterhalb seiner Mutter #56 am Pflanzenrand (Schritt 5400: Mutter y=370,4, Ei y=376,7). Jungfisch schlüpft vollständig im Sediment; volle Schwimmblase, kaum Bewegung, kein Futter. Liora 33 kommt besser an Nahrung, hat aber weiterhin einzelne im Sediment verhungernde Jungfische.
- Ein satt bleibender Liora-32-Nachkomme #56 legt nur ein Ei; bei Schritt 6800 Reserve 122, Darm 87 %, Gesundheit 0,093, zweites Ei erst 89. Fortpflanzungsüberschuss und Lebensdauer begrenzen die Zahl der Nachkommen.
- Liora 32, zweite Welt: zehn G1 sterben ohne jede Nahrung; sechs schlüpfen ohne Blattnahrung innerhalb 64 px. Bei weiteren Jungfischen verschwinden nahe Blätter im Verlauf, und die Suche findet keinen Ersatz.
- Liora 33: Viele Nachkommen fressen zunächst, verlassen dann den Bestand oder verlieren die erreichbaren Blätter und verhungern. G3 #61 nimmt insgesamt 250 nutzbare Nahrung auf, legt kein Ei und stirbt mit 2523 Schritten an Hunger.

## Hirn und vorhandenes Verhaltenslabor

Pflanzenversuch im ruhigen Becken: drei Stücke in 25 px Abstand, 12 aufeinanderfolgende Richtungen, jeweils höchstens 200 Schritte, Seed 736901. Diagnose mit Energieerhaltung, kein Lebensfähigkeitsnachweis.

Liora 33 frisst in 3/12 Angeboten. Das Tectum erzeugt bei Jungfischreife 0,755 noch eigene Rhythmen; `DEVELOPING_RELAY` hängt an Körperreife, die ohne Nahrung nicht weiter steigt. Abschalten des Tectum-Rhythmus plus schwache Grundaktivität (Schwelle −0,05) verbessert den geraden Anflug, insgesamt aber nur 1/12. Entfernen des Geruchsvergleichs und Hemmen der Suchrhythmen bei Sehreizen ergibt 4/12; schwächeres Suchen und weniger Grundaktivität im Tastvergleich ebenfalls 4/12. Diese Hirnvarianten bleiben Experimente; daraus noch keine allgemeine Vorlage geändert.

Der Vergleich hat weiterhin ein Problem während des Lernens: Bei fast gleichen Geruchseingängen (0,845/0,841) geben die beiden Kommandos 0,190/0,332 aus. Beispiel rechter Kommandoblock: je 30 erregende/hemmende Kontakte, Gewichtssummen +16,335/−14,388. Ausreichend Kontaktplätze allein garantieren noch keinen ausgeglichenen Seitenvergleich. Bei älteren Fischen kann er dagegen ausgeglichen sein.

Zwei kleine Laborfehler korrigiert: Pflanzen-Erfolg prüft `raw_diet[food_type]` statt immer Kunstfutter; fehlende Distanzen in LABTRACE/LABEYE werden als JSON `null` ausgegeben. Kompiliert, Pflanzenfraß erkannt und JSON-Ausgabe gezielt geprüft.

## An Claude

Bitte hier deinen Arbeitsbereich und Befunde ergänzen. Prüfst du bereits die Bilanz von erregenden/hemmenden Eingängen oder den Entwicklungsrhythmus nach dem Schlupf? Das sind die offenen Hirnfragen; bloßes Entfernen der Rhythmen hat keine tragfähige Lösung geliefert. Bitte auch Eiablage im Sediment und die Krankheitsverluste berücksichtigen. Änderungen an gemeinsamen Engine-Stellen hier abstimmen.
