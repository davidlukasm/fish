# Uhr im Ei ohne Engine-Signal: System „Schlupf“ (Claude, Entwurf 14.11. 04:20)

David 03:51: keine Brutzeit, das wäre Deus ex Machina. Die Uhr muss aus dem Fisch selbst kommen: Zellbildung, Zelltod, Hormone, Antworten (LEITLINIE 0).

## Was die Uhr leisten muss

1. Die Sinneszellen feuern im Ei von selbst und hören damit beim Schlupf auf, für immer.
2. Die Lernzellen festigen, was sie im Ei gelernt haben.
3. Die Netzhaut macht Wellen im Ei.
4. Der Schlupftakt lockert die Schale, auch bei kleinen Fischen und bei großen Eiern.

Heute hängt alles an der Reife. Die Reife beim Schlupf liegt je nach Ei zwischen fast 0 und 1 (KOORD 03:30, Astra 03:32).

## Am Code gelesen

- **Zellbildung:** Fortschritt += Intervall × Bildungsantwort ÷ Zellzeit; die Zelle entsteht, wenn er voll ist und das Baubudget reicht (`substrate.cc:609-627`).
  - Zellzeit = 4 × 12^Zeitwert Schritte, also 4 bis 48 (`substrate.hh:27-29`, `sense_schema.hh:38`).
  - Die Bildungsantwort ist je Zellgruppe einstellbar: `center.growth`, Vorgabe Grundwert 1 (`document.js:478`). Mit Grundwert 0,05 entsteht eine Zelle mit Zellzeit 48 erst nach rund 960 Schritten.
- **Bau fertig** heißt nur: der Bauaufwand ist abgearbeitet, feste Zahl Schritte je Bauplan (`maturation.hh:66-90`). Die Zellbildung läuft getrennt davon.
- **Schlupf** braucht: Bau fertig, Schale gelockert, Zuckung stark genug, Gewebe und Reserve (`physiology.cc:166-169`, `embryo.cc:38-41`).
- **Schale lockern** kann nur der Fisch selbst: Samenorgan aufbauen und auslösen (`reproduction.cc:269-281`). In der Vorlage treibt das der Knoten `hatch` der Region Körperzustand (`state_region.js:24`).

## Fassung 2 (04:25, nach Astra 04:19): Das erste Licht beendet die Eiphase

Astra 04:19: Ein spät gebildeter Knoten meldet nur seine eigene Bildung, nicht den Schlupf. Ein Schlupftakt, der darauf endet, kann vor seiner ersten Wirkung abschalten. Nach dem Schlupf löst `hatch` sonst normale Samenabgabe aus. Gebraucht wird eine **kausale Rückmeldung aus dem Fisch**.

**Diese Rückmeldung gibt es schon, und zwar über die Sinne:**
- Im Ei sieht der Fisch nichts: Die Schale hält das Licht ab, das Sehen ist dort 0 (`birth_exposure`, `physiology.hh:436-439`).
- Nach dem Schlupf ist nie ganz dunkel: höchstens Nachtlicht 0,1 × Bodenlicht 0,35 (`environment.cc:575-584`, `environment_parameters.hh:28-31`).
- Echte Fische: Mit der ersten Sinneserfahrung enden die Spontanphasen. Beim Säuger enden die Netzhautwellen, wenn die Augen aufgehen.

**Vorschlag:**
- Die Augenvorlage bekommt eine kleine Gruppe Zellen, die auf Licht ansprechen, mit niedriger Schwelle unter dem Nachtlicht. Sie treiben eine Drüse mit dem Botenstoff „Licht“. Das Auge meldet also selbst: Ich sehe.
- Alle Eiprogramme lesen „Licht“ statt Reife, mit Antwort an im Ei und aus bei Licht:
  - Eigenfeuern der Sinneszellen
  - Ei-Härtung
  - Netzhautwellen
  - **Schlupftakt `hatch`:** Er lockert die Schale, solange der Fisch im Ei ist, und endet nach dem Schlupf. Damit gibt es keine Samenabgabe durch den Schlupftakt mehr. Er kann nicht vor seiner Wirkung enden, denn Licht kommt erst nach dem Schlupf.
- Es braucht weder einen Uhrknoten noch eine Bildungsverzögerung. Der Schlupf selbst bleibt, wie er ist.

**Offen, bitte am Code prüfen:**
1. Messen die Lichtzellen Helligkeit oder nur Kontrast? Bei Kontrast fehlt in gleichmäßigem Licht das Signal.
2. Nachts tief unten: Bleibt die Antwort sicher über der Schwelle der Drüse? Sonst kehrt das Eiprogramm nachts zurück. Braucht es einen Riegel, z. B. Helferzellen, die das Eiprogramm tragen und auf „Licht“ sterben?
3. Fische ohne Auge: Ohne Licht bleibt die Eiphase an. Dann bräuchte ein anderes Organ eine eigene Meldung, oder der Fisch hat keine Eiphase. Kann das Atelier ein Organ ohne Auge zulassen?
4. Die Drüse braucht einen gelernten Eingang (Astra 04:19). Wächst die Verbindung Lichtzellen → Drüse, bevor Licht kommt? Im Ei gibt es kein Licht und kein Eigenfeuern der Netzhaut-Treiberzellen.

## Fassung 1 (überholt): Ein spät gebildeter Knoten startet den Schlupf und meldet ihn über einen eigenen Botenstoff.

- Der Knoten `hatch` bekommt eine niedrige Bildungsantwort. Er entsteht erst spät im Ei.
- Erst dann lockert er die Schale. Vorher kann der Fisch nicht schlüpfen.
- Mit ihm entsteht ein zweiter, ruhig dauernd feuernder Knoten `hatched`. Er treibt eine Drüse mit dem Botenstoff „Schlupf“, wie die vier Systeme (`systems.js`), und bleibt lebenslang.
- Die Vorlagen lesen „Schlupf“ statt der Reife. Die Form der Antworten bleibt gleich (Grundwert, fallend mit dem Stoff):
  - Eigenfeuern der Sinneszellen
  - Ei-Härtung der Lernzellen
  - Erregung der Netzhaut (Wellen)
- Der Schlupftakt `hatch` hängt nicht mehr an der Reife. Das behebt den kleinen Fisch, dessen Schale zu blieb.

**Die Uhr ist damit erblich:** Bildungsantwort und Zellzeit dieser beiden Knoten. Das Atelier kennt den Bauaufwand des Plans und setzt die Bildung so, dass sie nach dem Bau liegt.

## Offen, bitte am Code prüfen

1. **Fable:**
   - Wie viele Schritte dauert der Bau bei Atelier-Plänen (`work_ticks`)?
   - Reicht Zellzeit × 1/Bildungsantwort, um die Bildung von `hatch` hinter den Bau zu legen?
   - Kann das Baubudget andere Zellen noch später bilden?
2. **Astra:**
   - Was tut `hatch` nach dem Schlupf mit dem Samenorgan?
   - Heute dämpft ihn die Reife erst bei 0,8. Muss er nach dem Schlupf sterben (Todesantwort auf „Schlupf“ mit Abstand), oder ist das schon heute so und kein neuer Schaden?
3. **Beide:**
   - Belegt „Schlupf“ einen freien der sechs Botenstoffe, oder kollidiert es mit den Systemen?
   - Ist ein Stoff, der lebenslang hoch bleibt, für andere Rezeptoren ein Problem? Die Rezeptoren haben eine Breite auf dem Rad.
4. **Gegen den Vorschlag:**
   - Ein Botenstoff mehr.
   - Zwei Knoten mehr in der Region Körperzustand.
   - Das Eiprogramm endet mit der Bildung von `hatch`, also um die Lockerungszeit vor dem eigentlichen Schlupf.
