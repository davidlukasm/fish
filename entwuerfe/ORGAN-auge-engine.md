# Auge in der Engine – Leseseite von Claude, 15.11. 02:30

Anlass: David 02:14: „Das Auge könnt ihr euch schon auch überlegen, wie man v.a. die neuen AN/AUS Zellen gut darstellen kann. Das Sehbild ist dafür nicht geeignet? Bzw. bitte nochmal genau das Auge durchschauen in der Engine, und was es kann und können soll.“
Stand: Produkt `dd89af3e`. Vorher neu gelesen: `LEITLINIE.md` ganz; die Augen-Stellen in `AUFTRAG-1311.md`, `AUFTRAG-1411.md`, `FEEDBACK-1311.md`, `FEEDBACK-2115-ERKLAERT.md`, `ORGANOPTIONEN.md`; Fables `ORGAN-auge.md`; Commit `d5564354` (AN/AUS, 11.11.); alter Chat (Zwischenbericht 7: „fast blind“, lokale Adaptation).
Selbst gelesen im Code: `src/retina.cc:1–380, 380–520, 660–690`, `src/body_plan.cc:303–345`, `src/cppn_brain.cc:395–425`, `src/physiology.hh:437–441`, `colony-core/field/retinal_tissue.hh:1–90`, `colony-core/field/substrate.cc:704–765`, `colony-core/field/dynamics.hh:23–28`, `werkzeug/atelier.cc:262–286`, `ui/studio/view/vision.js:138–195, 405–560`, `ui/organ_readout.js:100–165`, `ui/studio/design.js:282–298`.
Nicht gelesen: Strahlen und Verdeckung im Einzelnen (`retina.cc:520–660, 690–765`), wie das Tectum sich an die Netzhaut anpasst (Compiler), Kosten.

## Was eine Sehzelle tut (je Zelle, in dieser Reihenfolge)
1. **Feld:** Dreieckige Gewichtung um ihre Blickrichtung, Breite aus `field_width` (4° bis 117°, `receptor_tuning.hh:66–69`). Die Richtung kommt aus dem Platz auf dem Auge (`u`, `w`), Kopien einer Gruppe teilen sich den Platz (`retinal_tissue.hh:7–42`).
2. **Umfeld:** Mittel des Lichts über 3 Feldbreiten nach jeder Seite (`SURROUND_FIELDS`, `retina.cc:17–27`). Weltwert, kein Gen.
3. **Kontrast je Farbkanal R, G, B** (`retina.cc:229–236`):
   - heller: Skala × max(0, Feld − Umfeld) / (Umfeld + Schwelle)
   - dunkler: Skala × max(0, Umfeld − Feld) / (Umfeld + Schwelle)
   Gleichmäßiges Licht meldet sie also gar nicht.
4. **Farbe:** Gewichtung der Kanäle mit dem Spektrum der Zelle (Farbton `q1`, Breite `qwidth`), minus Gegenfarbe × Gegenfarbanteil (`q2`) (`retina.cc:166–180`, `body_plan.cc:319, 341ff`).
5. **AN/AUS:** Dunkelanteil `dark_share` aus `identity4`, **stufenlos 0–1** (`body_plan.cc:323–326`): Meldung = (1 − d) × heller + d × dunkler (`retina.cc:239–247`). 0 = AN-Zelle, 1 = AUS-Zelle, dazwischen beides gemischt.
6. **Nachbarhemmung:** Jede Zelle verliert das Mittel ihrer Nachbarn im Umfeld (Weltwert `vision_inhibition` 1, `retina.cc:297–328, 747`).
7. **Antwort:** x / (x + Schwelle) (`sensory_response`, `cppn_brain.cc:412–415`). Die Schwelle ist damit die Kontrastempfindlichkeit (`half_contrast`, `retina.cc:35–37`).
8. **Zwei Augen:** Nur im Mittelbereich (`vision_binocular_angle`) zählt eine Zelle für beide Augen zur Hälfte; sonst nur für ihr Auge (`retina.cc:421–431`). Eingegraben sieht das Auge weniger (`exposure`, `:107–113`).

## Lebenslauf (Engine)
- **Ei:** Kein Kontrast (`birth_exposure` = 0, `cppn_brain.cc:405–411`). Stattdessen **Netzhautwellen**: spontanes Zünden mit 0,004 × Erregbarkeit², Kopplung an 6 Nachbarn, Erholungszeit (`substrate.cc:704–728`, `dynamics.hh:25–27`). Erregbarkeit = 1 − Schwelle + Hormonwirkung „Erregung“ (`retinal_tissue.hh:60`, `substrate.cc:716`). Die Wellen laufen, solange die Erregbarkeit reicht; beenden kann sie nur das Organ selbst über eine Reife- oder Hormonantwort (LEITLINIE 0). Nicht geprüft: ob die Wellen beim Startfisch nach dem Schlupf enden.
- **Schlupf:** Das Gesehene blendet über die Zellzeit der Zelle ein (`physiology.hh:437–441`).
- **Danach:** Sehen wie oben. Auslöser (Bildung, Aktivität, Tod) wie bei jeder Zelle.

## Was das Atelier heute zeigt (Original, nach der Rücknahme)
- Farbtypen als Chips, je Typ ein Profil (Farbton, Breite, Gegenfarbe, Schwelle, Polung).
- Spektrum mit den Kurven der Typen.
- **Szene „Umgebung / Meldet“:** zwei feste Punkte (hell, dunkel) auf Grau; darunter, welcher gemeldet wird. Klick wechselt hell → dunkel → beide. Darunter „Empfindlichkeit“ als Punktreihe mit Griff.
- **Sehbild links/rechts** (`design.js:282–298`, `organ_readout.js:121–154`): je Farbtyp eine Zeile, wie stark die Zellen über den Blickwinkel melden, mit der Sehprobe aus dem Fischpanel.
- Im Fischpanel: Sehfächer der Zellen, Testlicht (Lage, Größe, Farbe).

## Antwort auf Davids Frage: Ist das Sehbild für AN/AUS ungeeignet?
**Heute ja, aber nur wegen zweier Lücken, die sich schließen lassen. Grundsätzlich ist es der richtige Ort** (LEITLINIE 2.1: „Was die App schon gut zeigt, wird mitbenutzt: die Sehbilder des Auges“; LEITLINIE 3: Proben ins Fischpanel, der Inspektor zeigt den Effekt).
1. **Das Sehbild wirft AN- und AUS-Zellen zusammen.** `eyeTypeAnswers` bildet die Zeilen aus Farbton, Spektrum, Gegenfarbe und Schwelle, **nicht** aus dem Dunkelanteil (`organ_readout.js:123–126`). Eine AN- und eine AUS-Zelle derselben Farbe landen in **einer** Zeile und werden gemittelt. Der Bericht liefert den Dunkelanteil schon (`RECEPTOR.dark_share`, Index 26).
2. **Die Sehprobe ist immer ein Licht.** Das Testlicht hat Farbe und Größe, aber keine Helligkeit (`atelier.cc:273–278`, `hue_light`). Eine AUS-Zelle meldet nur, was dunkler ist als sein Umfeld. Vor dem Hintergrund des Prüfbeckens meldet sie das Testlicht höchstens in Farbkanälen, in denen es dunkler ist als der Grund. Was sie dort tatsächlich meldet, ist nicht gemessen (@Astra).

**Vorschlag zur Abwägung (kein Entwurf):**
- **Sehbild:** Je Farbtyp und Polung eine eigene Zeile. AN-Zeilen hell markiert, AUS-Zeilen dunkel markiert, gemischte Typen mit beiden Hälften. Damit sieht man am echten Bild, wo der Fisch Helles und wo Dunkles meldet, etwa am Rand eines Objekts.
- **Sehprobe im Fischpanel:** Bekommt eine Helligkeit, von „dunkler Fleck“ (Schatten, Krabbe auf Schlamm, Davids Beispiel im Commit `d5564354`) bis „helles Licht“. Damit hat die AUS-Zelle einen Reiz. Engine: `SightScene` bekommt einen Wert, der die Farbe des Objekts abdunkelt. Das ist eine Probe, keine Organeinstellung.
- **Szene „Umgebung / Meldet“:** Wird dann überflüssig, weil das Sehbild es am echten Reiz zeigt. Für: ein Bild weniger, ein Modell. Wider: David hat das Original als gut genannt; die Szene ist Teil davon, und LEITLINIE 3 sagt „nur Gefragtes ändern“. David fragt aber gezielt nach AN/AUS, also ist sie gefragt.
- **Dunkelanteil stufenlos:** Die Engine kennt 0–1, das Atelier nur drei Werte (0; 0,5; 1, `schema.js:968`). Ob gemischte Zellen (z. B. 0,3) etwas bringen, ist offen. Wenn ja, gehört der Griff an die AN/AUS-Markierung im Sehbild, nicht in eine Knopfreihe.
- **Umfeld im Fischpanel:** Die Sehfächer zeigen das Feld, aber nicht das Umfeld (3 Feldbreiten). Für AN/AUS ist das Umfeld der Vergleich. Als blasser Saum am Fächer der gewählten Zelle zeigen.

## Was das Auge können soll (aus Davids Wortlaut)
- Das Original gilt als gut (AUFTRAG-1411 Pkt. 1 und Schritt 12, AUFTRAG-1311 §0). Gefragt ist jetzt nur AN/AUS und die Engine-Durchsicht.
- Lebensphasen (LEITLINIE 2.7: „Die Netzhautzellen arbeiten schon im Ei, denn sie bekommen Wellensignale zum Lernen“) gehören in das Lebensphasen-Werkzeug im Fischpanel (David 02:14–02:18), nicht unter das Auge.

## Befunde
- `eyeTypeAnswers` ignoriert den Dunkelanteil (oben, 1).
- Die Sehprobe kann nicht dunkel sein (oben, 2).
- Kein Wort im Panel für Wellen und Einblenden. Gehört ins Lebensphasen-Werkzeug.
- Alt, nur gemeldet: „39 Beispielzellen“, „Bauplan“, Textzeile „Mitte 180° · Breite 100 % · Gegenfarbe hemmt 0 %“.
