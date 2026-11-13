# Organoptionen aus der Engine: das Organ im ganzen Fisch

Grundlage für jeden Inspektor (Leitlinie 2.7 und 2.8). Jede Angabe mit Datei und Zeile. Astra ergänzt die übrigen Organe (`AUFTRAG-1311.md`, Abschnitt 5).

Ein Organ ist mehr als seine eigenen Gene. Je Organ werden fünf Abschnitte ausgefüllt:

1. **Eigene Optionen:** Gen, Wirkung, Wertebereich, Vorteil und Nachteil.
2. **Verwaltete Nervenknoten:**
   - Welche Zellgruppen gehören zum Organ?
   - Welche Optionen hat jede Gruppe (Schwelle, Gewöhnung, Rezeptoren, Kontakte …)?
   - Was davon steuert das Organ gemeinsam?
3. **Eigener Lebenszyklus:**
   - Was tut das Organ im Ei, beim Schlupf und erwachsen?
   - Beispiel Netzhaut: Sie bekommt schon im Ei Wellensignale und lernt damit.
   - Welche Reife-, Reserve- oder Hormonauslöser sind sinnvoll?
4. **Anschlüsse:**
   - Mit welchen Organen und Regionen ist es verbunden?
   - Welche Voreinstellungen ändert ein Anschluss dort? Beispiel: Das Tectum passt sich an die Netzhaut an.
   - Wo legt der Compiler das fest (`werkzeug/atelier_*`, `ui/studio/model/*`)?
5. **Spielfunktionen, die mit ihm zusammenwirken:**
   - Energiesystem (Unterhalt, Grundumsatz, Ertrag), Hormone, Wachstum, Bauchraum, Bewegung, Welt.
   - Beispiel: Maul, Kiefer, Kiemen und Darm bilden zusammen die Nahrungskette des Fischs.

## Allgemeine Zellmechanik des Lebenszyklus (was er je Organ bedeutet, steht beim Organ)
Die Lebensachse ist die Reife des Fischs: das höchste bisher erreichte Gewebe ÷ Gewebe des Erwachsenen (`physiology.hh:body_maturity`). Sie geht von 0 (Ei) über den Schlupf bis 1 (erwachsen). Bei welcher Reife ein Fisch schlüpft, hängt von der Eigröße ab (`hatch_tissue`).
- **Bildung** (`substrate.cc:grow`): Eine noch nicht gebaute Zelle wächst, solange ihre Antwort > 0 ist, mit der Geschwindigkeit Antwort ÷ Zellzeit. Bei 1 wird sie gebaut, wenn Energie da ist. Ohne Einstellung baut sie von Anfang an.
- **Aktivität** (`substrate.cc:733`): Die Zelle wirkt mit ½·(1 + Antwort). Bei −1 ist sie aus, ohne zu sterben.
- **Tod** (`substrate.cc:571`): Die Zelle stirbt, sobald ihre Antwort über ½ steigt.
- **Antwort:** Jede Antwort ist ein Übergang vom Anfangs- zum Endwert (`hormones.hh:HormoneReceptor`). Auslöser sind Reife, Reserve, Erschöpfung oder einer der Botenstoffe.

## Darm (Code-Stand 12.11. 23:28; Fables Darmumbau 414997d ist berücksichtigt)
- **Länge:** Das Gen 0–1 ergibt exponentiell 0,5–4 Körperlängen (`gut_size`). Ein längerer Darm fasst mehr und hat eine längere Verweildauerskala (`gut_capacity`, `gut_transit`): bei `gut_time=200` ruhend 100–800 Schritte.
- **Ertrag** (`gut_yield`): Er ergibt sich aus Aufschluss, Aufnahme, Verderb und Abgang. Pflanzen brauchen lange Verweilzeiten, tierisches Futter verdirbt bei zu langer Passage. Die laufende Engine berücksichtigt zusätzlich Füllung, Reserve und Durchfall.
- **Preis der Länge:** Der Grundumsatz steigt um 0,1 × Länge (bis +40 %). Dazu kommen Wandmasse und weniger Bauchraum für das Eiorgan (`belly_room`, bis −25 %).
- **Darmmuskel** (`gut_speed`): bis zum Vierfachen bei großer Muskelkraft. Die Passage schwankt mit der Zuckung (`gut_pace`). Unaufgeschlossenes oder verdorbenes Futter reizt den Darm (`gut_irritation`): Durchfall und Schaden.
- **Sinneszellen:**
  - Dehnung meldet die Füllung, mit begrenzter Antwort ohne Gewöhnung.
  - Futterzellen melden den erwarteten verwertbaren Anteil gerade geschluckter Nahrung im Verhältnis zum Ruhebedarf.
  - Schmerzzellen melden Bauchweh, mit Gewöhnung.
- **Wachstum:** Das Fassungsvermögen wächst mit dem Körper. Die relative Darmlänge bleibt lebenslang gleich, der Darmmuskel kann sich über Zellgeburt und Rezeptoren mit der Reife ändern.

## Schwanzflosse und Schwanzmuskeln
- **Zuckung** (`body_plan.cc:stroke_step`): Ein Muskel zuckt, wenn er ausgeruht ist und sein Antrieb die Schwelle 0,2 erreicht (`stroke_threshold`). Die Kraft folgt dem Antrieb.
- **Fasertyp** (`muscle_fibre.hh`):
  - Schnelle Fasern sind stark und kurz und ruhen billig, ermüden aber nach etwa 40 Schritten Vollgas und erholen sich erst nach Hunderten.
  - Langsame Fasern arbeiten billig und ermüden nie.
- **Zellen:** Mehr Zellen geben mehr Kraft und kosten mehr Unterhalt.
- **Schlängeln** (`movement.cc:93`): bringt im Sand Vorteile (Widerstand 3 statt 12) und kostet im freien Wasser Schub.
- **Richtung:** Laut README schiebt der Schwanz nur, die Brustflossen drehen. Fable prüft das im Code (Frage zur Wirbelsäule).

## Übrige Organe
Folgt (Astra).
