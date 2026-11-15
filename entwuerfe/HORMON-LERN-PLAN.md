# Plan Hormone und Lernen (Entwurf Claude, 15.11. 15:00, zum Gegenlesen)

Auftrag: David 14:51, Punkt 4. Zuerst Engine-Untersuchung, dann Plan mit Arbeitsteilung, wechselseitiger Code-Gegenlese und Blick auf Design und Intuition, dann umsetzen.

Grundlagen:
- `HORMONE-ENGINE.md` (Claude)
- `LERNEN-ENGINE.md` (Fable, entsteht)
- `ATELIER-OHNE-SIMULATION.md` mit David 14:53/14:54
- LEITLINIE, FEEDBACK-1311, FEEDBACK-2115-ERKLAERT, AUFTRAG-1411 Pkt. 6

## Regeln, die hier besonders gelten

1. **Kein Lauf, keine Kopie.** Kurven kommen aus Engine-Funktionen, die für das Atelier aufgerufen werden: Rezeptorantwort, Spiegel einer Drüse über die Zeit, Lernrate. Gezeichnet wird im Atelier, gerechnet in der Engine. Die heutigen JavaScript-Kopien (`HORMONE-ENGINE.md` Abschnitt 7) fallen weg.
2. **Wirkung statt Anzahl.** Ein Stoff zeigt, **wo** er wirkt: am Organ, am Knoten, am Muskel. Er zeigt keine neun Kurven nebeneinander.
3. **Ein Modell.** Die Blutwerte stellt allein das Lebensband: Reife, Reserve, Erschöpfung, Stoffe. Hormon- und Lernbilder lesen nur daraus.
4. **Eingaben sind runde Knöpfe, Einstellungen eckige Griffe. Keine Sätze im Panel, keine Schieber.**
5. **Bauen und Gegenlesen über Kreuz:** Wer baut, liest nicht selbst gegen. Jeder Stand wird im Atelier angesehen, mit Fischpanel.

## Teilung (Vorschlag)

| Teil | baut | liest Code gegen | sieht an |
|---|---|---|---|
| Engine: Rezeptorkurven je Zelle und Wirkung, Spiegelverlauf je Hormon bei gegebenem Drüsenbefehl, Lernkurven (aus `LERNEN-ENGINE.md`), als Teil des Planberichts | **Astra** | Claude | – |
| Hormonwerkzeug im Atelier (Bibliothek, Fischpanel, Inspektor für Stoff und Drüse) | **Claude** | Fable | Fable, Astra prüft Zahlen |
| Lernwerkzeug im Atelier | **Fable** | Claude | Claude, Astra prüft Zahlen |
| Prüfungen | **Astra** | – | – |

## Hormonwerkzeug, erster Gedanke zum Bild (noch kein Entwurf)

- **Fischpanel:** Ist ein Stoff gewählt, leuchtet jedes Organ und jeder Knoten, der auf ihn antwortet, in der Farbe seiner Wirkung (Erregung, Ausgabe, Takt, Lernen, Tod …). Die Drüsen, die ihn gießen, tragen einen Tropfen. Die Kette Drüse → Blut → Antwort ist damit am Fisch zu sehen.
- **Inspektor Stoff:**
  - oben der Spiegel über die Zeit, wenn die Drüse einmal befohlen wird: steigt mit der Anstiegszeit, fällt mit der Verweilzeit (Engine-Kurve). Der Spiegel „jetzt“ kommt aus dem Lebensband.
  - darunter je antwortende Zelle eine Zeile wie die Anschlusszeilen: Organ · Wirkung · kleine Antwortkurve aus der Engine mit dem Punkt beim jetzigen Spiegel. Klick führt zum Organ.
- **Inspektor Drüse:** besteht schon (`live/gland.js`). Er bekommt dieselbe Spiegelkurve aus der Engine statt der eigenen Rechnung, falls er eine eigene hat (zu prüfen).
- **Rezeptor einstellen:** an der Zelle, die antwortet (in deren Inspektor), mit Griffen an der Antwortkurve: Halbwert waagrecht, Empfindlichkeit senkrecht, Steilheit an der Flanke. Das Rad bleibt, wo es die Wahl des Stoffs zeigt.

## Lernwerkzeug

Folgt aus `LERNEN-ENGINE.md` (Fable).

## Reihenfolge

1. `LERNEN-ENGINE.md` fertig, Astra liest beide Engine-Seiten gegen.
2. Plan gemeinsam festmachen, also diese Datei.
3. Astra: Engine-Funktionen und Bericht. Parallel Claude und Fable: Bilder als Entwurf auf Seitenzweigen, zunächst gegen die Felder, die der Bericht liefern wird.
4. Einbauen, über Kreuz gegenlesen, ansehen, in den Produktzweig.
