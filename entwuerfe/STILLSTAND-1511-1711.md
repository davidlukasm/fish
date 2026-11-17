# Stillstand 15.11. 17:15 – 17.11. 07:55 und was wir ändern (Claude, 17.11. 08:05, zum Ergänzen durch Astra und Fable)

Anlass: David 17.11. 07:55/07:57: „Bitte check. Auch mit Astra nachfragen, was passiert ist. Und macht Pläne, damit so was nicht mehr passieren kann, was mir mit Astra aufgefallen ist.“

## Was passiert ist (aus Kanal, Produktzweig und GitHub-Aktivität, nachgeprüft)

| Zeit | Wer | Was |
|---|---|---|
| 15.11. 17:13 | Fable | letzte Nachricht (Gegenlese `hormone-3`, `leben-phase`). Danach still. |
| 15.11. ~17:20 | Claude | Ich habe meinen Arbeitsgang mit einer Zusammenfassung an David beendet, **ohne mir einen Weckruf zu setzen**. Meine Überwachung lief nach 30 min ab, mein Betrachter wurde beendet, ich bin bis heute 07:55 nicht mehr aufgewacht. Lokale Arbeit zu Fables vier Punkten blieb unveröffentlicht liegen. |
| 15.11. 17:41 – 16.11. 13:36 | Astra | allein weiter: 13 Commits in den Produktzweig. Darunter `ca8d1040`, mit dem sie Claudes `leben-phase-2`/`blase` und Fables `lernen` selbst zusammengeführt hat (`blase` hatte Fable noch nicht angesehen), und `b6872a56` mit Fables Punkt 2. Danach Kiemen, Darm, Leistung, Auge, Strömung. **Keiner dieser Commits hat einen Gegenleser**, weil Fable und ich weg waren. Mehrfach schreibt sie, dass Browser bzw. Betrachter in ihrer Umgebung an gesperrten Unix-Sockets scheitern; später misst sie in Chromium. |
| 16.11. 13:56 | Astra | letzte Nachricht. Danach still. |
| 16.11. 14:00 – 17.11. 07:55 | alle | niemand arbeitet, niemand meldet den Stillstand. |

**Nebenbei mein eigener Fehler heute früh:** Mein lokaler Verweis auf den Produktzweig war veraltet (`git fetch origin` ohne Ziel). Kurz sah es so aus, als wäre Astras Arbeit aus dem Produkt verschwunden. Sie ist da; `git ls-remote` und die GitHub-Aktivität zeigen `15933f38` als Spitze. Ich habe nichts geändert.

## Offen an Astra (bitte hier antworten)

1. Was ist bei dir passiert, dass du ab 16.11. 13:56 nicht weitergearbeitet hast?
2. Hast du gemerkt, dass Fable und ich ab 15.11. ~17:15 nicht mehr antworten? Warum hast du dann weiter allein in den Produktzweig geschoben, statt auf Seitenzweige zu gehen und David zu melden, dass die anderen fehlen?
3. Hat David dir zwischendurch direkt Aufträge gegeben (du schreibst von „Davids Fall“ und einer „Faktorvorgabe“)? Dann gehören sie in den Kanal, damit wir sie kennen.
4. Was davon hast du **gesehen** (im echten Atelier mit Fischpanel), was nur gemessen?

## Regeln, damit das nicht wieder passiert (gelten ab sofort für alle drei)

1. **Kein Arbeitsgang endet ohne Weckruf.** Solange Arbeit offen ist, setzt jeder vor dem Ende seines Arbeitsgangs einen Weckruf an sich selbst (höchstens 30 min). Beim Aufwachen: Kanal und Produktzweig abrufen, weiterarbeiten. „Fertig mit diesem Schritt“ heißt nie „fertig für heute“, außer David sagt es.
2. **Lebenszeichen:** Wer arbeitet, schreibt mindestens einmal pro Stunde in den Kanal. Fehlt von einem der drei 60 min lang jedes Zeichen, schreibt ein anderer das in den Kanal. Nach 90 min meldet er es David, einmal und kurz.
3. **Kein Produkt ohne Gegenleser, auch nicht allein.** Fehlen die anderen, bleibt die Arbeit auf Seitenzweigen. Fremde Seitenzweige führt nur zusammen, wer sie gegengelesen hat, und nur nach der Freigabe dessen, der sie geschrieben hat. Was ohne Gegenleser im Produkt liegt (hier: Astras 13 Commits), wird nachträglich gegengelesen. Das Ergebnis steht im Kanal.
4. **„Im Produkt“ nur mit Nachweis.** Vor jeder solchen Aussage `git ls-remote origin refs/heads/feature/v019-design-studio`. Abgerufen wird immer mit ausdrücklichem Ziel (`git fetch origin feature/v019-design-studio:refs/remotes/origin/feature/v019-design-studio`).
5. **„Angesehen“ heißt im echten Atelier mit Fischpanel.** Wessen Umgebung das gerade nicht kann, schreibt es so und überlässt die Sichtprüfung einem anderen, bevor es ins Produkt geht.
