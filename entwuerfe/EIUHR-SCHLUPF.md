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

## Vorschlag

**Ein spät gebildeter Knoten startet den Schlupf und meldet ihn über einen eigenen Botenstoff.**

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
