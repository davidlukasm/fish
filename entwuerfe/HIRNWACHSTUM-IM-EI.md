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

## 6. Darmorgan: wie es seine Bahnen vor dem Schlupf verdrahtet und festigt (Claude, neu 06:58, Stand Produkt `0c1950b`)

Ersetzt den Vorschlag von 02:15. Die Grundlage ist jetzt die Reife der einzelnen Zelle (Engine `cf10d185`, `fd176849`, Vorlagen `0c1950b`), nicht die Körperreife. Das Vorbild sind echte Fische: Jede Zelle beendet ihre Spontanphase mit ihrer eigenen Reife (KCC2), nicht beim Schlupf.

**Ablauf im Ei:**
1. **Bildung:** Füll-, Bauchweh- und Nährzellen entstehen im Ei, wenn ihre Bildungsantwort und das Baubudget es erlauben (`substrate.cc:609-627`). Ab dann zählt ihr Zellalter.
2. **Eigenfeuern:** Ihre Rhythmusantwort liest die eigene Zellreife (`EGG_RHYTHM`, Halbwert 0,5 = rund 2048 Schritte ab Bildung, Anfangswert, nicht geeicht).
   - Solange die Zelle jung ist, feuert sie von selbst in Stößen (Engine `8579edf5`).
   - Die Nährzellen haben im Ei zusätzlich echtes Signal aus dem Wachstum (`physiology.cc`, `embryo_nutrient_gain`).
3. **Bahnen wachsen, wenn das Ziel aktiv ist:** Ein Kontakt Sinneszelle → Nervenzelle entsteht mit Gewicht 0, wo der Gestalter den Darm angeschlossen hat (freie Verdrahtung). Er wächst nur mit dem Signal der Sinneszelle **und** ausreichender Aktivität des Ziels (`substrate.cc:899-944`).
   - Die Relais der Regionen schwingen im Ei über `DEVELOPING_RELAY` (Körperreife). Das gilt bei Körperreife im Ei um 0,2 bis 0,3.
   - **Gegenbeispiel (Astra 06:57):** Ein Plan mit Kapazität 7,75 steht im Ei auf Reife 1. Dort schweigen die Ziele, und die drei Darmwege blieben bei Gewicht 0. Solche Pläne meldet jetzt die Bauprüfung (`size`).
   - **Geprüft (Astra 07:02):** An einem eigens gebauten Fisch mit aktivem Zielrhythmus (Kapazität 156 und 27) begannen alle drei Pfade vor dem Schlupf zu lernen. Der erste Kontakt lag nach 18 bis 20 Schritten über 5 %, der Schlupf kam bei Schritt 46. Eine volle Festigung **vor** dem Schlupf ist damit nicht nachgewiesen.
4. **Festigung:** Die empfangenden Lernzellen festigen, was sie lernen, solange sie selbst jung sind (`EGG_HARDENING` auf Zellreife, Halbwert 0,5).
   - Ein Kontakt, der mindestens halb gefestigt ist, wird nicht beschnitten (`substrate.cc:976-985`).
   - So bleiben auch die Bahnen seltener Sinne nach dem Schlupf stehen, Bauchweh etwa kommt dann lange nicht.
5. **Ende:** Mit wachsender Zellreife schweigt das Eigenfeuern, und die Ei-Festigung klingt aus. Danach lernt die Bahn über echte Reize und das System Festigung (Sattheit).

**Bewusst offen:**
- **Eichung, auffällig zu lang:** Das Ei dauerte in Astras Bau nur 46 Schritte. Die Spontanphase von rund 2048 Schritten läuft also etwa 40-mal so lange nach dem Schlupf wie im Ei. Bei echten Fischen ist die Zeit nach dem Schlupf ähnlich lang wie die Zeit im Ei (Zebrafisch: Schlupf 48–72 h, Wellen bis 84 h). Kürzen erst nach einer Prüfung von Festigung und Fortbestand je Weg, nicht nach den ersten Gewichten (Astra 07:02).
- **Eichung:** 0,5 ist eine gemeinsame Anfangsvorgabe. Es gibt heute keinen Fisch, an dem man sie eichen könnte (Astra 06:28/06:29). Sie garantiert keine volle Kontaktprobe, weil die Uhr des Kontakts erst ab seiner Bildung läuft.
- **Nach dem Schlupf:** Schmerz- und Füllzellen können noch eine Weile von selbst feuern. Echte Larven tun Ähnliches. Am schwächsten begründet ist das bei Schmerz. Das Organ kann den Halbwert selbst kürzer setzen.
- **Darmmuskel:** Die Füllzellen spüren die eigenen Zuckungen der Darmwand nicht. Echte Dehnungszellen tun das vor dem ersten Fressen. Das wäre eine Engine-Frage.
- **Schlupftakt:** getrennt, braucht einen echten Auslöser (Astra 06:02).
