# Ende der Spontanphase: Reife der einzelnen Zelle (Claude, Entwurf 14.11. 06:00)

## Ausgangslage

- **David 05:24:** Die Schlupfgröße bestimmt die Mutter, und die Mutter bestimmt die Evolution. Eine feste Größe aus der Engine ist Deus ex Machina. 3a ist zurückgenommen (`79b89c34`).
- **David 05:27:** Wie machen es echte Fische?

## Echte Fische (Belege in Claudes Antwort an David 05:28)

- Das Eiprogramm endet nicht beim Schlupf. Es endet mit der Reife der einzelnen Zelle.
- Der Schlupf schwankt beim Zebrafisch zwischen 48 und 72 Stunden. Die Netzhautwellen liegen bei 66 bis 84 Stunden, also oft danach.
- Junge Nervenzellen werden von GABA erregt. Bildet die Zelle KCC2, hemmt GABA, und die Spontanphase endet. Das hängt am Entwicklungsstand der Zelle selbst (Zhang et al. 2010).
- Die Schlupfdrüsenzellen sterben nach dem Schlupf.

**Folgerung:** Die Anforderung „Ende genau beim Schlupf“ war falsch gestellt. Jede Zelle braucht eine eigene Uhr, und die Organe stellen sie erblich.

## Am Code

- Die Engine kennt keine Reife der einzelnen Zelle.
  - Sie kennt den Bildungsfortschritt bis zur Entstehung (`substrate.cc:609-627`).
  - Danach kennt sie nur gebildet oder tot (`substrate.hh:259`).
- Alle Rezeptoren lesen dieselben Blutgrößen: sechs Botenstoffe, Körperreife, Reserve, Erschöpfung (`hormones.hh:47-53`).

## Vorschlag A: Zellreife als Angebot der Engine, ruhend

- Jede Zelle zählt ihr Alter ab ihrer Bildung. Ihre Zellreife ist Alter ÷ eigene Reifezeit, begrenzt auf 0 bis 1.
- Die Reifezeit ist ein Gen der Zelle, über die Zellidentität wie `pace`. Ohne Gen ist sie 0, also sofort reif. Damit ändert sich für alte Genome nichts.
- Die Rezeptoren der Zelle können statt der Körperreife ihre eigene Zellreife lesen.
- **Offen:** wie, ohne die Plätze auf dem Rad zu verschieben. Ein Schalter je Rezeptor „eigene Reife statt Körperreife“ würde die Plätze nicht verschieben. Fable bitte prüfen.
- Die Vorlagen lesen dann Zellreife statt Körperreife:
  - Eigenfeuern der Sinneszellen
  - Netzhautwellen
  - Ei-Härtung
  - Rhythmus der sich entwickelnden Relais
- Die Reifezeit setzt das Organ, erblich, wie bei echten Fischen.
- **Für:**
  - Die Engine erzwingt nichts. Ohne Gen ist alles wie heute.
  - Unabhängig von Eienergie und Körpergröße.
  - Auch später gebildete Zellen haben ihre eigene Spontanphase, wie neue Nervenzellen bei echten Fischen.
- **Gegen:** Engine-Änderung, ein Zellgen mehr, ein Rezeptorschalter mehr.
- **Kein Deus ex Machina?** Bitte genau prüfen. Die Uhr läuft für jede Zelle, wirkt aber nur, wenn ein erblicher Rezeptor sie liest. Das ist dieselbe Art Angebot wie die Körperreife heute.

## Vorschlag B (Astra 05:29): Steuerzelle mit Zelltod

- Eine Zelle, die nur im Ei aktiv ist, stirbt beim ersten sicheren Signal. Ihr Tod hält das Ende dauerhaft fest, auch bei Hunger.
- **Offen bleibt das erste sichere Signal.** Reserve allein reicht nicht: Ein dotterreiches Ei kann denselben Pegel erreichen (Astra 05:26).
- Für den Schlupftakt passt B gut: Der Knoten `hatch` stirbt selbst (Vorbild: Schlupfdrüse).

## Schlupftakt

- B mit Zelltod, ausgelöst durch die Zellreife des Knotens aus A.
- Der letzte Eibefehl im Schlupfschritt (Astra 04:39) bleibt ein eigener Punkt.

## Bitte

- **Fable**, erst nach dem Darm: Rezeptorschalter ohne neue Radstelle? Wo käme das Gen „Reifezeit“ in die Zellidentität?
- **Astra:**
  - Bleibt A ohne Gen wirklich ohne Wirkung?
  - Was liest die Gewöhnung, was der Bau? Gibt es Stellen, an denen ein Rezeptor auf Reife heute etwas anderes als die Körperreife erwartet?
