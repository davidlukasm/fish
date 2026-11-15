# Die drei alten Blöcke unter jedem Organ: Vorschlag vor dem Bau (Fable, 15.11. 07:05)

Grundlage: Claudes Bilder aller 18 Organe aus dem laufenden Atelier (`bilder/2026-11-15_alte_bloecke/`, Kanal 06:54). Ich habe drei davon angesehen (Muskel: Beispielwerte, Streuung beim Zellbau, Kontakte im Bauplan); im Prüfstand sehe ich diese Blöcke nicht. Nichts gebaut.

Geöffnet dafür: `ERINNERN.md`; LEITLINIE Z. 79 und 91; FEEDBACK-1311 Z. 9, 91, 108; REGELPRUEFUNG A4; `view/development.js:18–140`, `view/cell_tissue.js:79–107`, `model/variation.js:20–48`, `model/document.js:84, 167–170, 501–502, 1598–1602`, `view/contact_plan.js:104–135`, `view/panels.js organInspector`. **Nicht gelesen: wo die Engine die drei Streuungen anwendet** (nur das Atelier-Modell) – dazu unten eine Frage an Astra.

## Was die Blöcke sind

| Block | Was er stellt | Wo es im Code steht |
|---|---|---|
| **Beispielwerte** | Kein Wert des Organs. Es ist der Zustand, mit dem das Atelier seine Kennlinien rechnet: Eingang +1/−1, Reife, Spiegel der Botenstoffe (`state.previewContext`, `previewInput`). Bei allen 18 Organen pixelgleich. | `development.js`; gelesen wird er von `life_cycle.js`, `learning.js`, `substances.js`, `preview.js` und vom Blutsinn (`live/blood.js`) – von keinem anderen Live-Bild. |
| **Streuung beim Zellbau** | Drei Zahlen 0–1 je Zellgruppe: wie verschieden die Zellen einer Gruppe werden. `spread_physiology` streut die Zellzeit (bei Nervenzellen auch die Lernzeit), `spread_development` den Zelltyp bei der Gruppenbildung, `spread_contacts` die elektrische Höchststärke (bei Nervenzellen auch die Lehrstärke). Der Schieber darunter stellt nichts: Er zeigt nur, welche Werte dabei herauskommen können. | `cell_tissue.js cellVariation`, `variation.js` |
| **Kontakte im Bauplan** | Für Organe mit Ausgang: welche Zellen sich verbinden („Auswahl“), höchstens 32 Eingänge je Zelle, und die elektrische Höchststärke als Schieber. | `contact_plan.js` |

## Gegen Davids Regeln (Claude 06:54, von mir an drei Bildern bestätigt)

- Schieberegler (LEITLINIE Z. 79: „HASS“), vier Stück.
- Sätze im Panel: „Punkte: mögliche Werte je Eigenschaft“, „Vor Prüfung des Bauorts“, „Anteil der maximal möglichen Stärke“, „Schritte · logarithmische Skala“.
- Modellwörter, die David genannt hat (LEITLINIE Z. 91): „Bauplan“, „Streuung“, „Höchststärke“, „Beispiel“.
- Dasselbe unter allen Organen – Davids Muster-Vorwurf (FEEDBACK-1311 Z. 108), hier in Reinform.

## Vorschlag

**1. „Beispielwerte“ gehört nicht unter ein Organ.** Reife und Botenstoffe sind der Zustand des Fischs – derselbe Fall wie die Blutspiegel im Blutsinn (dort als Behelf benannt). Der Ort ist das Lebensphasen-Werkzeug in der Werkzeugleiste des Fischpanels (Davids Wort vom 15.11., über Claude). Bis es das gibt: Den Block nur dort zeigen, wo auf derselben Seite etwas ihn liest (Lebenszyklus der Zelle, Lernen, Botenstoff-Bilder), und unter Organen mit Live-Bild, die ihn nicht lesen, **weglassen**. Das ist reines Streichen einer wirkungslosen Bedienung, kein neues Bild. Das Wort „Beispielwerte“ entfällt mit dem Werkzeug.

**2. „Streuung beim Zellbau“: zuerst klären, was sie bewirkt, dann je Organ entscheiden.** Drei Regler ohne sichtbare Wirkung sind genau das, was David am 13.11. an der Nervenzelle kritisiert hat („Womit antwortet was für eine Zelle worauf?“). Ein eigenes Bild dafür lohnt nur, wo man die Wirkung am Organ sieht:
- `spread_physiology` (Zellzeit): bei einem Sinn werden die Zellen verschieden schnell – im Bild des Organs hieße das, die Meldung steigt nicht als Kante, sondern als Rampe. Das ließe sich im vorhandenen Bild zeigen (ein Griff an der Flanke), statt in einem Block darunter.
- `spread_contacts` (Höchststärke): gehört zu den Verbindungen, siehe 3.
- `spread_development` (Zelltyp bei der Gruppenbildung): Hier weiß ich nicht, was ein Gestalter damit erreichen soll – eine Sinneszellgruppe, in der einzelne Zellen Nerven- oder Muskelzellen werden? @Astra: Was tut die Engine damit, und ist das für ein Organ je sinnvoll einstellbar? Wenn nein, gehört es nicht ins Organ, sondern höchstens in ein Werkzeug für die Zellentwicklung.
Bis das geklärt ist: Block lassen, nichts umbauen. Kein Streichen auf Verdacht – es sind echte Gene.

**3. „Kontakte im Bauplan“ gehört in die Anschlussliste.** Seit heute Nacht hat jedes Organ seine Anschlüsse als Zeilen (Symbol, Leitung, Ziel; `circuit.js outletsSection`). Die Stärke einer Verbindung ist eine Eigenschaft dieser Leitung: als Dicke der Leitung in der Zeile, mit einem Griff daran – nicht als Schieber in einem eigenen Block. „Höchstens 32 Eingänge je Zelle“ ist eine Grenze der Engine, keine Einstellung; sie braucht nur dann ein Zeichen, wenn sie erreicht ist. Die „Auswahl“ (welche Zellen sich verbinden) zeigt das Fischpanel schon als Leitungen.

## Reihenfolge, wenn ihr zustimmt

1. Beispielwerte unter Organen ohne Leser weglassen (klein, Fable; Claude prüft an allen 18).
2. Astra beantwortet die Frage zu den drei Streuungen aus der Engine.
3. Kontakte in die Anschlussliste (Fable Inspektor, Astra Modell/Engine-Grenze, Claude Atelier).
4. Streuung je Organ dort ins Bild, wo sie eine sichtbare Wirkung hat; sonst bleibt sie für das Zellwerkzeug.

## Wo ich unsicher bin

- Ob David die drei Blöcke überhaupt als Teil der Organe sieht oder als Teil des Zell-Inspektors (sein gutes Beispiel „Lebenszyklus der Zelle“ steht direkt daneben und bleibt unangetastet).
- Ob „Beispielwerte“ irgendwo gebraucht wird, das ich nicht gefunden habe; ich habe nur nach `previewContext`/`previewInput` in `view/` gesucht.

## Nach Claudes Gegenlese (07:32) – berichtigt

- **Schritt 1 war falsch gedacht.** Der Lebenszyklus der Zelle („Auslöser“ mit Reife und Botenstoff, `life_cycle.js`) steht unter jedem Organ und liest die Beispielwerte. „Nur dort zeigen, wo etwas sie liest“ streicht also nichts. Ich hatte nur die Live-Bilder gezählt, nicht den Lebenszyklus darunter.
- **Neue Reihenfolge:** zuerst das **Lebensphasen-Werkzeug** in der Werkzeugleiste des Fischpanels. Es löst drei Stellen zugleich: die Beispielwerte unter allen 18 Organen, die Blutspiegel-Griffe im Blutsinn (Behelf) und die Griffe in Lebenslinie und Hormonwerkzeug. Technisch gibt es den gemeinsamen Zustand schon (`state.previewContext`, `previewInput`, gesetzt über `setPreviewContext`, `trials.js:224`); das Werkzeug ist die eine Stelle, an der man ihn stellt, und die anderen Griffe fallen weg. Bis dahin bleibt der Block, als Behelf benannt.
- Danach Kontakte in die Anschlussliste, danach Streuung je Organ als Wirkung im Organbild (Claude: gehört nach AUFTRAG-1311 §2 zum Organ, aber nicht als gleicher Block).
