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
- **7 Drüse (Fables Vorschlag, David hat noch nicht entschieden):**
  - **Was begrenzt ist:** Wie lange eine Drüse abgibt, hängt nur von ihrem Eingang ab (`body_plan.cc:1338`), und ihre Abgabe folgt dem Befehl sofort (`substrate.cc:819`). Begrenzt ist die Verweilzeit des Stoffs im Blut. Sie entspricht der Zellzeit der Drüsenzellen, gemittelt nach Stärke und Stoffanteil, und beträgt 4–48 Schritte (`body_plan.cc:191`, `hormone_state.cc:45`).
  - **Folgen:** Nach dem Abschalten ist der Pegel nach höchstens etwa 33 Schritten halbiert. Der Dauerpegel beträgt 0,01 × Abgabe × Zellzeit, höchstens also 0,48 × Abgabe. Dass ein hoher Pegel mehr Zellen oder Knoten braucht, ist gewollt (David 18:15).
  - **Binden:** Eine Drüsenzelle bindet, wenn ihr Befehl negativ ist (`body_plan.cc:1338`). Dieselbe Drüse kann also abgeben und binden.
  - **Wozu das Zellzeit-Gen der Drüsenzelle sonst noch dient:**
    - Bauzeit der Zelle in der Entwicklung (`substrate.cc:610`). Das gilt für jede Zelle.
    - Spurdauer beim Lernen ihrer Eingangskontakte (`substrate.cc:172/851`).
    - Mit den Drüsenoptionen Stärke, Stoffanteil und Schwelle ist es nicht vermischt.
  - **Was Fables Vorschlag 4–1024 bewirken würde:** Der Stoff hält nach dem Abschalten an. Weil der Dauerpegel mit der Zellzeit wächst, wäre er dann aber bis zu 10 × Abgabe. Schon eine kleine Drüse käme an die Obergrenze 1, und die Zellzahl verlöre ihre Bedeutung für die Pegelhöhe. Binden räumt höchstens mit 0,01 × Bindung je Schritt ab und ist dann langsamer als heute das bloße Abklingen.
  - **Möglichkeiten zur Entscheidung:**
    - (a) so lassen;
    - (b) Spanne verlängern, mit den Folgen oben;
    - (c) trennen: Die Zellzeit bestimmt nur die Verweilzeit, und die Pegelhöhe hängt nur an der Abgabe, also an Zellen und Knoten;
    - (d) zusätzlich eine eigene Halbwertszeit je Stoff.
  - **David 18:19:** Er hält (c) für die beste Möglichkeit.
    - Länger bleibt ein Stoff aber nur, wenn zusätzlich die Spanne verlängert wird, also (c) zusammen mit (b).
    - Offen ist der Anstieg. In der einfachen Form steigt ein lange bleibender Stoff auch langsam an.
    - Alternative: Der Stoff steigt schnell mit der Abgabe und klingt dann langsam ab.
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
