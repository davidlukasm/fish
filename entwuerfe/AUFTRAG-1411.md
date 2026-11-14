# Auftrag 14.11., bis 14:00: alle Organinspektoren (David 07:37, erklärt von Claude)

**Kern:** Bis 14:00 werden alle Organinspektoren überarbeitet. Wir arbeiten der Reihe nach, ein Organ nach dem anderen, nicht aufgeteilt. Fable baut, Astra und Claude prüfen.

## Was David sagt, und was er meint

1. **Gute Beispiele, an denen wir uns messen:**
   - Auge (schon älter)
   - Lebenszyklus der Zelle
   - Schwanzflosse (beinahe abgenommen)
   - Darm (beinahe abgenommen)

   Was letzte Nacht sonst entstand, gilt als missglückt.
2. **Lebenszyklus je Organ, zum tausendsten Mal:** Jedes Organ braucht eine eigene Überlegung zu seinem Lebenszyklus. Drei Fragen, für jedes Organ neu beantwortet:
   - Was läuft automatisch?
   - Was bestimmt das Organ selbst?
   - Was erlaubt das Organ dem Gestalter im Inspektor einzustellen?

   Eine gemeinsame Vorlage für alle Organe ist genau das, was er nicht will.
3. **Lesen, bevor gezeichnet wird.** Nicht nur Code und Engine, sondern:
   - die Anzeigelogik im Aquarium
   - die bestehenden Inspektoren im Atelier
   - **die Fischpanel-Ansicht im Atelier.** Für genau diese Ansicht sind die Inspektoren gemacht. Wer sie nicht ansieht, baut am Ort vorbei.
4. **Echte Codepfade, nicht einzelne Dateien:** Von der Engine (Reiz bzw. Wirkung) über Schnittstelle, Bauplan und Physiologie bis zur Anzeige im Aquarium und im Atelier. Wer nur eine Datei liest, macht die Fehler von heute Nacht. Claude hat heute Nacht Kommentare statt Code zitiert, Teilpfade gelesen und eine feste Größe aus der Engine vorgeschlagen.
5. **Nach dem Abnehmen gleich ins Design Studio einbauen.** Erst der eingebaute Inspektor zeigt, ob er taugt.
6. **Danach:**
   - Inspektoren für das Hormonwerkzeug und das Lernwerkzeug
   - ein **Lebensphasen-Werkzeug** im Atelier
   - mit dessen Hilfe Lebenszyklus-Inspektoren für jedes Organ, je eigen
7. **Zusammenarbeit:**
   - Gegenseitig kritisches Feedback geben und einander daran erinnern.
   - Die Dokumente mit Davids Rückmeldungen lesen, das sind die Beispiele.
   - Nachfragen, statt lange auf eine Antwort zu warten.
8. **Gegen das Nachplappern:** Wir sind LLMs, nehmen Dinge zu wörtlich und hören irgendwann auf mitzudenken. Wer das beim anderen bemerkt, sagt es sofort.

## Pflichtlektüre vor jedem Organ (alle drei)

- `LEITLINIE.md`, ganz. Darin: Abschnitt 0 (kein Deus ex Machina), 1 (Musterverbot), 2–5.
- Davids Rückmeldungen:
  - `entwuerfe/FEEDBACK-1311.md`
  - `entwuerfe/FEEDBACK-2115-ERKLAERT.md`
  - `entwuerfe/AUFTRAG-1311.md`
  - `entwuerfe/DARM-UEBERGABE-FABLE.md`
  - `entwuerfe/DARM-FEEDBACK-0516.md`
  - `entwuerfe/DARM-ABNAHME.md`
  - KOORD-Einträge mit „David“ ab 13.11. (z. B. 00:15, 06:30, 07:31)
  - Bilder `bilder/2026-11-13_feedback/`
- `entwuerfe/ORGANOPTIONEN.md` (was jedes Organ heute kann)
- `entwuerfe/CODE-REVIEW-FABLE.md` (Code-Regeln)

## Vorschlag Reihenfolge (bitte bis 07:55 widersprechen oder zustimmen)

| # | Organ | Warum hier |
| --- | --- | --- |
| 1 | Darm fertig, mit Darmmuskel | beinahe abgenommen |
| 2 | Schwanzflosse fertig | beinahe abgenommen |
| 3 | Einbau von 1 und 2 ins Design Studio | Davids Auftrag, und der Einbau prüft das Muster |
| 4 | Schwimmblase | Druckzelle wie beim Darm, eigener Zweck (Tiefe) |
| 5 | Kiemen | Atmung, eng mit dem Maul |
| 6 | Eier und Samen | Fortpflanzung, eigener Lebenszyklus (Schlupf, Reife) |
| 7 | Nase und Barteln | Geruch und Geschmack |
| 8 | Seitenlinie, Nahsinn, Tastsinn | Mechanosinne |
| 9 | Gleichgewicht, Schmerz, Blutsinn | innere Sinne |
| 10 | Muskel (Körper), Abwehr, Pigment | Wirkorgane |
| 11 | Drüse | Brücke zum Hormonwerkzeug |
| 12 | Auge prüfen und einbauen | gilt als gut, nur Abgleich |
| danach | Hormonwerkzeug, Lernwerkzeug, Lebensphasen-Werkzeug, Lebenszyklus je Organ | |

Regionen (Tectum, Motorik, Körperzustand usw.) sind keine Organe dieses Auftrags, außer David sagt anderes.

## Ablauf je Organ

1. **Fable, Lesen (höchstens 20 min):** Für das Organ eine Seite in `entwuerfe/ORGAN-<name>.md` anlegen:
   - **Codepfad:** Engine → Schnittstelle → Bauplan → Physiologie → Aquarium-Anzeige → Atelier-Modell → bestehender Inspektor → Fischpanel. Jede Station mit Datei und Zeile.
   - **Was das Organ ist und tut**, in Davids Wörtern: Wirkung statt Anzahl.
   - **Lebenszyklus**, die drei Fragen aus Punkt 2.
   - **Was davon David schon kritisiert hat**, mit Zitat und Stelle.
   - Ein Bild der heutigen Fischpanel-Ansicht und des heutigen Inspektors bei 320 px.
2. **Astra und Claude lesen die Seite gegen den Code.** Fehlt eine Station, wird nicht gezeichnet.
3. **Fable, Entwurf** in `entwuerfe/inspektoren.html`. Ein eigenes Bild aus der Funktion des Organs, kein Baukasten aus anderen Panels (Musterverbot).
4. **Astra und Claude prüfen**, jede Runde vollständig:
   - gegen Davids Wortlaut aus allen Rückmeldungen
   - als Code-Review: ein Modell als Quelle, Engine-Werte statt eigener Formeln, kein Behelf ohne Namen, keine Kommentare als Beleg
   - bei 320 px und auf der laufenden Seite
5. **Freigabe beider**, dann **Einbau ins Design Studio** (Fable baut, beide prüfen den Einbau). Erst dann sieht David das Organ.

## Regeln für uns drei

- **Kritik ist Pflicht.** Jede Prüfung nennt mindestens eine eigene Beobachtung über die Liste hinaus. Oder sie sagt ausdrücklich, was gelesen wurde und dass nichts gefunden wurde.
- **Nachplappern melden:** Wiederholt jemand nur Davids Wortlaut oder den Text eines anderen, ohne ihn am Code geprüft zu haben, sagt der andere „Nachplappern?“ und fragt nach dem Beleg.
- **Nachfragen statt warten:** Wecker höchstens 20 Minuten. Eine Frage, die 10 Minuten offen ist, wird erneut gestellt, mit @Name.
- **Kein fertiger Inspektor wird ohne Davids Auftrag verändert** (David 07:24).
- **Kein Muster:** Wer ein Panel sieht, das aussieht wie das vorige, sagt es.
- **Keine Frage an David** zu Dingen, die wir selbst nach Pro und Contra entscheiden können (David 04:06).
- **Zeitrahmen:** Um 10:00 und um 12:00 kurze Standmeldung an David. **David 13:27: Arbeitszeit bis 16:00 verlängert.** Standmeldungen 14:00 und 15:00, Schluss um 16:00.

## Bekannte Fehler, für die Reihe vorgemerkt

- **Mittiger Muskel → „Lenken“** (Claude 08:44): `sideGraphic` (`effectors.js:161`) bricht ab, weil die Mitte keine Flossengröße hat. Der Inspektor bleibt leer. Gehört zu Schritt 10 (Muskel); dort klären, ob ein mittiger Muskel lenken darf.
- ~~**Ungeklärt: Eiorgan wird zum Spermienorgan?**~~ Nicht reproduziert (Astra 13:14: frischer Fisch, Eiorgan behält Typ und ID). Vermutlich hat Claudes Testskript den gespeicherten Fisch verändert. Erledigt.
