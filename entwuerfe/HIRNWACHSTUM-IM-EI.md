# Hirnwachstum im Ei: spontane Aktivität und Härtung (Claude, neu 14.11. 01:45)

David 00:50–01:32: Lernen ist Hirnwachstum, vor allem im Ei. Alle Verbindungen beginnen bei 0 und müssen gelernt werden. Härtung (Festigung) ist erblich und dynamisch steuerbar, über Modulatoren und Hormone, also auch im Ei möglich. Es ist Aufgabe des Organs, seine eigenen Verbindungen zum richtigen Zeitpunkt mit dem richtigen Ablauf zu härten, wie die Netzhaut es tut. **Kein Deus ex Machina** (LEITLINIE 0). Die erste Fassung dieses Entwurfs verstieß dagegen. Mein Commit `14762028` ist zurückgenommen (`f27e2cc0`).

## 1. Was es schon gibt (im Code geprüft)

| Mechanismus | wer ihn hat | gesteuert durch | Stelle |
| --- | --- | --- | --- |
| Wellen: spontanes Feuern, Nachbarn ziehen mit | nur Sinneszellen mit Licht | Schwelle der Zelle (Erregbarkeit 1 − Schwelle) und ihre Erregungsantwort (Hormone, Reife) | `substrate.cc:696-722` |
| Rhythmus: Sinus, Phase aus der Lage, Periode = Zellzeit | Nervenzellen mit Schrittmacheranteil `pace` | `pace` aus der Zellidentität (nur Nerven, `substrate.hh:105-119`) × Rhythmusantwort | `substrate.cc:790-804` |
| Bildung der Zelle | jede Zelle | Bildungsantwort (Hormone, Reife, Reserve, Erschöpfung); nur gebildete Zellen zählen | `substrate.cc:599-622` |
| Tod der Zelle | jede Zelle | Todesantwort über 0,5 | `substrate.cc:510-513, 602-605` |
| Ausgabe | jede Zelle | Ausgabeantwort skaliert Signal und Wirkung | `substrate.cc:744, 805` |
| Festigung eines Kontakts | die lernende Zelle: bei Nerv-zu-Nerv und Sinn-zu-Nerv das **Ziel**, bei Kontakten in einen Muskel der **Sender** | Festigungsantwort der lernenden Zelle; gefestigt wird, was der Kontakt selbst gelernt hat | `substrate.cc:888-903, 930-955` |
| Lernen | lernende Zelle | Lernrate, Lern-, Wettbewerbs- und Berechtigungsantwort | `substrate.cc:338-342, 880-960` |
| eigene Bewegung im Ei | Strömung und Tasten außen | Zuckungen des Embryos | `embryo.cc:10-26` |

**Wie die Organe des Ateliers das heute nutzen:**
- **Regionen:**
  - Ihre Relais tragen `DEVELOPING_RELAY`: Rhythmus im Ei, endet über die Reife (Halbwert 0,8).
  - Hochschwellige Relais tragen `THRESHOLD_RELAY` und behalten den Rhythmus lebenslang, damit Eingänge, die erst nach dem Schlupf kommen, noch lernbar sind (David `09b6b0e7`).
  - Spätes Fortpflanzen bleibt lernbar (David `70175f3c`).
- **Netzhaut:** Ihre Wellen endet die Reifeantwort der Zelle (Handfisch `792f1f53`).
- **Festigung:** nur über das System „Festigung“ (Sattheit → Drüse → Festigungsantwort der Lernzellen, `systems.js:40-50`).

## 2. Welche Lücke wirklich bleibt

1. **Eine Sinneszelle, die nicht Licht misst (alle außer der Netzhaut), hat keinen erblichen Weg, von selbst zu feuern.**
   - Sie wird nicht ausgewertet (`substrate.cc:983-984`), ihr Signal ist nur ihr Reiz (`:742-745`).
   - Ihr `pace` ist immer 0, weil die Klasse nur für Nerven gerechnet wird.
   - Ein Organ kann ihr also keine Spontanaktivität geben, mit keinem Gen und keinem Hormon.
   - Ihre Kontakte wachsen aber nur mit ihrem eigenen Signal (`:913-921`).
2. ~~Ein Sinnesorgan kann seine Bahnen nicht härten~~ **Keine Lücke (David 01:53):** Ein Organ kann eigene empfangende Nervenzellen enthalten, wie Hirnregionen ihre Zellen verdrahten. Die Kontakte von seinen Sinneszellen in diese Zellen festigt das Organ über deren Festigungsantwort selbst.

Alles andere geht schon mit vorhandenen Mitteln: Zeitpunkt über Bildung und Tod, Helferzellen, Ende über Reife, Härtung der Hirnseite über Antworten und Hormone.

## 3. Wie echte Fische es machen (Belege)

- **Netzhaut:** synchronisierte Wellen um den Schlupf, beim Zebrafisch 66–84 h nach Befruchtung, bis ins Tectum ([Zhang 2016](https://link.springer.com/10.1038/ncomms12650)).
- **Rückenmark:** Ab 17,5 h zuckt der Embryo von selbst. Gekoppelte Schrittmacher-Interneurone treiben das ([bioRxiv 2023](https://www.biorxiv.org/content/10.1101/2023.08.25.554828.full.pdf)).
- **Riechzellen:** Sie haben Grundaktivität ohne Duft, nicht gleichzeitig, aber mit ähnlichem Muster je Rezeptor. Für die Glomeruli zählt sie mehr als echte Düfte ([Frontiers 2024, Maus](https://frontiersin.org/articles/10.3389/fncir.2024.1409680/full)).
- **Darm:** Spontane, nervengesteuerte Wellen beginnen vor dem ersten Fressen ([Holmberg 2004](https://cob.silverchair.com/jeb/article/207/23/4085/15022/Ontogeny-of-the-gut-motility-control-system-in)).
- **Danach:** kritische Phasen, Festigung, und die Spontanaktivität klingt ab ([Frontiers 2016](https://frontiersin.org/journals/neural-circuits/articles/10.3389/fncir.2016.00040/full)).

## 4. Vorschlag (ruhende Mechanismen, die Organe schalten)

**Engine A: Sinneszellen dürfen von selbst feuern.** Dieselbe erbliche Rhythmus-Steuerung wie bei Nerven gilt auch für Sinneszellen. Das Signal bekommt den Anteil `pace · ½(1 + Rhythmusantwort) · Puls`, und `pace` wird auch für Sinneszellen aus ihrer Identität gelesen.
- **Für:** kein neuer Mechanismus, sondern derselbe wie in den Regionen. Ohne Gen ist er aus (pace 0).
- **Wider:** `cell_class` liefert dann auch für Sinneszellen Werte. Bestehende Genome mit zufälliger Identität könnten plötzlich Sinneszellen mit Rhythmus haben.
- **Fable bitte prüfen:**
  - Ist die Identität der Sinneszellen in Atelier-Genomen und in alten Genomen so gesetzt, dass `pace` 0 bleibt?
  - Oder braucht es ein eigenes Gen?

**Engine B entfällt:** Das Organ härtet über eigene Empfängerzellen.

**Organe im Atelier** (je Organ eigene Entscheidung, keine gemeinsame Vorgabe):
- **Darm:**
  - Füll-, Schmerz- und Nährzellen bekommen im Ei einen Rhythmus, der über die Reife endet, wie `DEVELOPING_RELAY`.
  - Eigene Empfängerzellen im Darmorgan härten die Bahn zum Schlupf über ihre Festigungsantwort auf Reife.
  - Die Nährzellen haben im Ei schon echtes Signal vom Wachstum.
- **Nase und Barteln:** Grundaktivität je Gruppe im Ei, nach dem Riechzellen-Beleg.
- **Netzhaut:** bleibt, wie sie ist.
- **Helferzellen**, die vor der Geburt Muster erzeugen und danach sterben: dort, wo ein Organ Muster braucht, die es aus sich selbst nicht hat.

**Zahlen:** Halbwerte und Stärken nicht schätzen. Astra misst je Organ, wie viele Kontakte bis zum Schlupf wachsen und wie viele 2000 Schritte danach noch stehen.

## 5. Reihenfolge

1. Fable liest 2 und 4 (Engine A und B) gegen die Engine.
2. David entscheidet über A und B.
3. Engine.
4. Organe.
5. Astra misst.

## 6. Darmorgan: wie es seine Bahnen vor dem Schlupf verdrahtet und härtet (Claude, 02:15, Vorschlag)

**Heute:**
- Füll-, Bauchweh- und Nährzellen speisen direkt die Relais `intake` und `satiety` der Region Körperzustand (`state_region.js:25`).
- Diese Relais schwingen im Ei (`DEVELOPING_RELAY`).
- Die Sinneszellen schweigen dort, bis auf die Nährzellen, die das Wachstum melden. Ihre Kontakte wachsen also nicht.
- Gehärtet wird nichts.

**Vorschlag für die Vorlage des Darmorgans:**
1. **Spontan im Ei:** Füll-, Bauchweh- und Nährzellen bekommen eine Rhythmusantwort auf Reife (Engine `8579edf5`).
   - Sie ist im Ei an und endet zum Schlupf.
   - Form wie `DEVELOPING_RELAY` (Grundwert, fallend mit Reife), nur mit dem Halbwert beim Schlupf statt bei 0,8.
   - Jede Zellart feuert in ihrem eigenen Takt (Zellzeit), Zeitpunkte nach Lage.
2. **Härten mit eigenen Zellen:** Das Darmorgan bekommt eigene Empfängerzellen, je Sinnesart eine kleine Gruppe, die zwischen Sinneszellen und Region sitzen.
   - Ihre Festigungsantwort auf Reife steigt zum Schlupf: Was im Ei gelernt wurde, wird mindestens halb gefestigt und bleibt, auch wenn Füllung und Bauchweh danach selten kommen.
   - Danach lernt die Bahn weiter, zum Beispiel über Sattheit (System Festigung).
   - **Wider:** eine Zwischenstufe mehr. Das Signal kommt einen Schritt später in der Region an und kostet Zellen.
   - **Alternative ohne Zwischenstufe:** Das Organ hängt der Region eine Festigungsantwort an ihre Relais `intake` und `satiety`. Dann härtet aber die Region, nicht der Darm.
3. **Darmmuskel:** zuckt im Ei auf Befehl. Die Füllzellen spüren das heute nicht. Ob sie die eigenen Wellen der Darmwand spüren sollen, wie Dehnungszellen echter Fische vor dem ersten Fressen, wäre eine Engine-Frage für später.
4. **Zahlen:** Halbwerte nicht schätzen. Astra misst am gebauten Darmorgan, wie viele Kontakte bis zum Schlupf wachsen und wie viele 2000 Schritte danach noch stehen.

**Entscheidung durch David:**
- Härtung mit eigenen Empfängerzellen im Darm (2) oder eine Festigungsantwort an den Relais der Region (Alternative)?
- Sollen die Füllzellen die eigenen Zuckungen des Darmmuskels spüren (3)?
