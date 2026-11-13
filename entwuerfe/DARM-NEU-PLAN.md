# Darm neu schreiben (Claude, 13.11. 22:10)

David 22:06: neu schreiben, nicht flicken. Ein Modell, alle Bilder und Zahlen daraus. Vor dem Zeigen prüft ein Skript (`organlook/darmcheck.cjs`) die Konsistenz. Danach wird die Abhakliste `DARM-ABNAHME.md` (Astra) Punkt für Punkt abgehakt.

## Modell (eine Quelle)
- **Darmlänge** `size` 0,5–4 → Ruhe-Verweildauer `T = 200 · size` (100–800). Fest ab Geburt (Fable FAKTEN 9).
- **Darmmuskel**: Knoten (wie beim Schwanz), je Knoten Stärke, Fasern (langsam/schnell), Lebensfenster (ab/bis Reife). Höchstes Tempo `speed(s)` = 1 + (4 − 1) · Antrieb · Körperwirkung(s), gedeckelt bei 4. Kürzeste Verweildauer `T / speed`.
- **Pendeln**: Innerhalb einer Zuckung pendelt die Verweildauer zwischen `T` und `T / (1 + 2(speed − 1))` (Fable FAKTEN 9 Punkt 3).
- **Ertrag** je Futter `gain(f, t)` (Stoffe wie bisher, Davids Vorgaben: Blatt max 92 %, Fleisch 82 %, Alge 78 % bleibt bis lang, Plankton 72 %, Alge 18 % und Plankton 34 % am linken Rand 50).
- **Bauchweh** je Futter `ache(f, t)`, deutlich häufiger als bisher. Fleisch tut bei langer Verweildauer weh (verdirbt), Blatt und Alge bei kurzer (unverdaut). Plankton etwas bei sehr langer. Flocken nie.
- **Fenster über das Leben**: die Verweildauern, die dieser Fisch je erreicht: von `min über das Leben der Pendel-Untergrenze` bis `T`. Alle Balkenzahlen = min/max der Kurve in genau diesem Fenster.

## Bilder (von oben)
1. **Kopfzeile**: Ruhebedarf, Gewicht, Platz für Eier, mit Rand, nicht zu breit.
2. **Fisch**: volle Breite, kein Auge. Magen (Form bleibt) mit Sättigungsschwellen und (+)/(−) am Magen. Darm mit Schlingen, letzte Schleife weit, Ende ziehbar = Darmlänge. Muskelzellen bräunlich in der Wand, Peristaltik deutlich. Schmerz- und Nährzellen nur angezeigt, keine Würste.
3. **Ertrag**: x = Zeit im Darm (kurz … lang, keine Zahlen), y = Ausbeute (wie viel der Energie im Futter ankommt). Kurven gestrichelt, wo ein voller Darm davon weh tut. Fenster der Verweildauer (Ruhe bis Muskel) als Band; Griffe: Mitte und Muskelbereich wie bisher.
4. **Leben**: fester Maßstab (unabhängig von Griffen), alle Futter als Bänder, Linie = mittlere Verweildauer über das Leben, Griffe = Lebensfenster des Muskels. Kein Ei. Gleiche Breite wie Ertrag.
5. **Balken**: je Futter Bereich über das Leben (inkl. Pendeln), Bauchweh-Rahmen breit wo es weh tut. Zahlen = Kurve im Fenster.
6. **Sättigungsgefühl**: senkrecht wie Bauchweh. Links Magen als Schwellenträger, Strichlinien bis zum Griff durch, Streuung hängt am gewählten Griff. Eingabe: Füllung über die Zeit (linear). Meldung darunter, ohne Gewöhnung.
7. **Bauchweh**: links Regler mit Schwellen, Strichlinien bis zum Griff. Eingabe: Bauchweh über die Zeit (linear), mit Band der Unsicherheit durch den Darmmuskel. Keine Futterauswahl. (×) am gewählten Griff. Meldung mit Gewöhnung, wie die Engine sie rechnet.
8. **Nährgefühl** (Name offen): wie Bauchweh. Eingabe: glatter Nährstoffzufluss einer Mahlzeit. Keine Futterauswahl, kein Bissengewitter.

## Prüfskript
- Balkenzahlen = min/max der Kurven im Fenster (auf 1 %).
- Bauchweh-Rahmen = Bereich, wo ache > Schwelle im Fenster.
- Kein Text überdeckt Text oder Kurvengriffe; alles innerhalb 320 px.
- Jeder Griff gezogen: keine Fehler, keine Achse springt, kein viewBox-Wechsel.
