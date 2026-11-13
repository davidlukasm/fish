# Offene Engine-Befunde (Stand 13.11. 18:10)

Hier stehen nur offene Befunde. Erledigte und zurückgenommene sind gelöscht; sie stehen im Git-Verlauf. Befunde an Entwurfsfischen gibt es nicht (Leitlinie 5).

## Lernen
- **17:** Ein Lehrpuls erzeugt seinen eigenen Gegenbeleg. Das mittelwertfreie Lehrsignal (`dteach`) wird am Pulsende negativ und lockert, was der Puls gerade gefestigt hat: A fällt in 800 stillen Schritten von 0,17 auf 0,02. Dass echte Gegenbelege lockern, ist gewollt (Festigungskonzept vom 12.11., 098bc1a6). Fables Patch streicht das Lockern ganz und passt deshalb nicht. Mit dem Konzept vereinbar wäre, nur den Netto-Rückgang über den ganzen Puls zu werten oder ein nicht mittelwertfreies Lehrsignal zu verwenden.
- **18:** Der Lernschritt ist absolut und hängt nicht von der Kontaktgrenze ab. Bei Lerntempo 0,8 ist ein Schritt größer als das ganze Gewicht.
- **20 Region, die Futter und Gefahr bewertet** (heute „Wertung“):
  - Ihre Merkmalszellen haben keinen Festigungsrezeptor. Alles Gelernte hat deshalb 500 Schritte Halbwertszeit.
  - Mit Festigung und Verknüpfung 0,75 / Lehre 0,5 lernt sie richtig, auch das Umlernen (3 Seeds).
  - Bei der Vorgabe 1/1 steigt B nach Schmerz. Die Ursache ist offen.

## Vorschläge, Erklärung an David fehlt noch
- **7 Drüse (Fables Vorschlag, David hat noch nicht entschieden):** Wie lange eine Drüse abgibt, hängt nur von ihrem Eingang ab, das kann 8000 Schritte dauern (`body_plan.cc:1338`). Begrenzt ist etwas anderes, nämlich wie lange der Stoff im Blut bleibt. Er zerfällt mit der Zellzeit der Drüsenzellen, die 4–48 Schritte beträgt (`body_plan.cc:191`, `hormone_state.cc:45`).
  - **Folge 1:** Nach dem Abschalten ist der Pegel spätestens nach etwa 33 Schritten halbiert.
  - **Folge 2:** Der Dauerpegel beträgt höchstens 0,48 × Abgabe. Ein hoher Pegel braucht deshalb viele Zellen.
  - **Fables Vorschlag:** Die Zeitspanne der Drüse wird wie bei der Gewöhnung auf 4–1024 Schritte erweitert. Damit hält ein Stoff auch nach dem Abschalten an (über eine Mahlzeit, eine Flucht, eine Laichzeit), und kleine Drüsen erreichen hohe Pegel.
  - **Dagegen:** Ein langer Stoff lässt sich nicht schnell wieder abstellen. Das geht dann nur, indem eine Drüse ihn bindet.
- **8 Schwimmblase:** Sie füllt sich träge, in etwa 250 Schritten. Vorschlag: viermal schneller.
- **14 Nervenzelle:** Die Schwelle zählt nur × 0,3. Vorschlag: × 1.

## Modell
- **2 Barteln:** Die Gewöhnung hat keine Wirkung.
- **3 Gleichgewicht:** Die Gewöhnung ist bewusst aus.
- **4 Nahsinn:** Die Engine mischt zwei Reichweiten.
- **6 Schwimmblase:** Bei einer Stärke unter 2/3 trägt sie nie.
- **10 Wirbelsäule:** Ein Takt unter 0,28 hat keine Wirkung.
- **11 Verhaltenswahl:** Die Suche bleibt klein.
- **15 Geruchsvergleich:** Bei langer Glättung und schwachem Kontrast trennt er nicht.
- **16 Körperzustand:** Die Reserve-Schwelle ändert nur die Stärke des Mangels.
