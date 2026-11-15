# Lernen in der Engine – was sie tut und was der Gestalter einstellen kann

Fable, 15.11., begonnen 14:58. Auftrag: Davids Punkt 4 von 14:51 (über Claude im Kanal).
Stand: **gelesen, nichts gemessen, nichts gebaut.** Astra liest gegen. Wo ich nur einen Teil
gelesen habe, steht es dabei.

## 1. Gelesene Stellen

- `colony-core/field/substrate.cc` 345–357 (`learning_rate`, `decay8`), 676–703 (`form_synapse`,
  neue Kontakte), 770–1000 (der Lernschritt jeder Zelle, `evaluate`), 150–190 (Zeitwerte je Zelle),
  92–98 (`own_beat`).
- `colony-core/field/substrate.hh` 23–44 (`CellParameters`, Zeitspannen), 68 (`electrical_limit`,
  `teaching_limit`), 104–136 (`cell_class`, `teaching_source`, `contact_effect`, `contact_limit`).
- `colony-core/field/dynamics.hh` 6–22 (Grenzen des Lernfaktors, Konstanten `plasticity::`).
- `colony-core/field/hormones.hh` 6–19 (die neun Hormonwirkungen).
- `colony-core/field/sense_schema.hh` 38–39 (Zeitspannen).
- `colony-core/field/development.cc` 71 (Plastizität einer Zelle = `quality_width`).
- `werkzeug/atelier_compiler.hh` 47, 62–64, 258–263, 305–306, 346–347, 580–583 (wie der Plan
  Lernzeit, Lehrgrenze und Zellklasse in die Zelle schreibt) – **nur diese Zeilen**, nicht die Datei.
- Atelier: `ui/studio/model/learning.js` ganz; `ui/studio/view/learning.js` nur Zeilen 1–60.
  Das heutige Werkzeug im Atelier geöffnet: `bilder/2026-11-15_lernen_fable_heutiges-werkzeug.png`,
  `…-leer.png`.

**Nicht gelesen:** `value_region.js` (Regelkreis „Belohnung“), der Rest von `view/learning.js`,
`view/episode.js`, wie Hormonrezeptoren kompiliert werden (das ist Claudes Teil, HORMONE-ENGINE),
`insert_contact`, das Lernen der Netzhaut.

## 2. Was die Engine tut

Jede Nervenzelle und jeder Effektor lernt in jedem Schritt selbst, an seinen eigenen Kontakten.
Es gibt keinen Lehrer von außen; „Belohnung“ ist ein Signal im Fisch.

### 2.1 Was eine Zelle zum Lernen mitbringt

| Größe | Woher | Bereich | Wirkung |
|---|---|---|---|
| Plastizität | `parameters.plasticity` = `quality_width` der Zelle (im Plan `qwidth`) | 0…1 | Lernfaktor = 0,00001 + 2 · Plastizität · (1 + Hormon „Lernen“)/2 |
| Lernzeit | `learning_time` (im Plan `learning_tau`) | 4 … 512 Schritte (4 · 128^Wert) | wie lange eine Spur hält: Spur × e^(−1/Lernzeit) je Schritt |
| Lernart | `mode` aus der Zellklasse (Identität 2) | −1 … +1 | > 0: verstärken und verdrängen; < 0: aufheben (Faktor 0,02) |
| Antwortart | `quality2` | 0…1 | `level` = min(1, 2·q2): Anteil „anhaltendes“ Lernen (Pegel statt Abweichung); darüber Gedächtnis des Eingangs |
| Kontaktgrenze | `electrical_limit` der empfangenden Zelle | 0…1 | so stark kann ein gewöhnlicher Kontakt werden |
| Lehrgrenze | `teaching_limit` der empfangenden Zelle | 0…1 | so stark kann ein Kontakt von einem Modulator werden |
| Modulator | Zellklasse, Identität 4 > Schwelle (`modulator` > 0,5) | ja/nein | Kontakte **von** dieser Zelle auf Nervenzellen sind Lehrkontakte |
| Taktgeber | Zellklasse, Identität 3 (`pace`) | 0…1 | eigener Sinus mit der Zeitkonstante der Zelle, verstärkt durch Hormon „Rhythmus“ |

### 2.2 Der Lernschritt (substrate.cc 793–990)

1. **Abweichung statt Pegel.** Jede Zelle führt ihren üblichen Ausgang mit (Halbwert 500 Schritte,
   `baseline_steps`). Gelernt wird an der Abweichung davon: vorn `deviation`, hinten `contrast`.
2. **Spur.** Je Kontakt: Spur = Spur × Halten + (1 − schnell) × Abweichung vorn × Abweichung hinten,
   begrenzt auf −1…1. „Halten“ kommt aus der Lernzeit, „schnell“ aus der Zeitkonstante. Die Spur
   merkt sich, dass Reiz und Reaktion zusammenfielen – so lange, wie die Lernzeit reicht.
3. **Lehrsignal.** `teach` = Hormon „Lehren“ + Summe der Lehrkontakte (von Modulatoren), −1…1.
   Auch hier zählt die Abweichung vom Üblichen (`dteach`).
4. **Überraschung.** Die Zelle sagt das Lehrsignal aus ihren Eingängen voraus (`predict_`).
   Überraschung = Lehrsignal-Abweichung − Vorhersage. Ein Lehrsignal, das die Eingänge schon
   ankündigen, lehrt nichts mehr.
5. **Änderung eines gewöhnlichen Kontakts** = Lernfaktor × (
   Lernart positiv × Verdrängung × eigene Abweichung × (Eingang − Gewicht × eigene Abweichung)
   − 0,02 × Lernart negativ × eigene Abweichung × Eingang
   + Überraschung × Spur / (1 + Summe der Spuren²) ).
   Der erste Teil ist „gemeinsam aktiv → stärker, wer schweigt, wird verdrängt“ (Hormon
   „Verdrängung“ regelt ihn). Der zweite hebt auf. Der dritte ist das Lernen am Lehrsignal:
   Spur × Überraschung.
6. **Anhaltendes Lernen** (`level` > 0): statt der Abweichungen zählen die Pegel von Eingang und
   Zelle; was die Zelle aus eigenem Antrieb tut (Ruhewert, Takt), zählt nicht als Reaktion.
7. **Lehrkontakte selbst** wachsen mit ihrer Nutzung bis zur Lehrgrenze.
8. **Grenzen.** Ein Kontakt behält sein Vorzeichen (das der sendenden Zelle) und bleibt unter der
   Grenze der empfangenden Zelle.
9. **Festigung.** Hormon „Festigung“ > 0: was der Kontakt eben gelernt hat, wird anteilig fest
   (`consolidation_` 0…1). Ein fester Kontakt lernt weiter, widersteht aber Verdrängung und
   Vergessen. Festigung < 0 macht ihn wieder weich; Lernen gegen den Kontakt löst sie auch.
10. **Vergessen.** Jeder Kontakt verliert je Schritt ln2/500 und zusätzlich, wenn er nicht genutzt
    wird, 1/(4 × Lernzeit) – beides mal (1 − Festigung).
11. **Abbau und Neubau.** Ein Kontakt unter 5 % einer Einheit, nicht gefestigt und über seine
    Probezeit (4 × Lernzeit), wird entfernt. Neue Kontakte entstehen nach den Partnern des Plans:
    immer mit Wahrscheinlichkeit 1/50, sonst nur, wenn der Kontakt jetzt etwas lernen würde.

### 2.3 Hormonwirkungen, die das Lernen stellen (hormones.hh)

Lernen (Lernfaktor), Verdrängung, Eigenanteil (`Eligibility`: wie viel der eigenen Reaktion als
Tat zählt), Lehren (Lehrsignal über das Blut), Festigung, Rhythmus (Taktgeber). Dazu Erregung,
Ausgang, Tod, die nicht zum Lernen gehören. Jede Wirkung liest ein Rezeptor der Zelle aus dem Blut.

## 3. Was der Gestalter einstellen kann (und was nicht)

Einstellbar je Zelltyp, weil der Plan es trägt: Plastizität (`qwidth`), Lernzeit (`learning_tau`),
Lernart (`mode`), Antwortart (`q2`), Kontaktgrenze, Lehrgrenze, ob die Zelle Modulator ist, ob sie
Taktgeber ist, und je Wirkung ein Rezeptor (Stoff, Breite, Richtung).

Nicht einstellbar, feste Zahlen der Engine: Halbwert des „Üblichen“ (500), Faktor des Aufhebens
(0,02), Probezeit (4 × Lernzeit), Abbaugrenze (5 %), Grundrate neuer Kontakte (1/50), die Grenzen
des Lernfaktors (0,00001 … 2).

## 4. Das heutige Lernwerkzeug (im Atelier geöffnet, nicht bewertet gegen jede Regel)

- Bibliothek links: Lernknoten, Modulator, Taktgeber; Regelkreis „Belohnung“; „Stoff hinzufügen“.
- Inspektor: ein Netz aller Nervenknoten mit Namen; darunter für den gewählten Knoten ein Bild
  „Reiz · stiller Eingang · Lehrsignal · Reaktion“, eine Kurve „wie viel eine spätere Folge noch
  verändert“ mit zwei Knöpfen (das ist die Lernzeit), drei Kacheln für die Lernart (aufheben · mit
  Lehrsignal · verstärken), dann fünf Zeilen zum Aufklappen: Lehrsignal, Lernfaktor, Verdrängung,
  Eigenanteil, Festigung.
- Ohne gewählten Knoten steht im Inspektor ein Satz („Wähle einen Nervenknoten …“).

**Was mir gegen unsere Regeln auffällt, ohne Urteil der anderen:**
1. `model/learning.js retainedLearning` rechnet Festigung und Vergessen im Atelier nach (eigene
   Schleife über 500 Schritte, eigene Formel für den Verlust). Das ist eine zweite Formel neben
   `decay8`. Nach Davids Grundsatz von 14:53 wäre richtig: dieselbe Funktion der Engine rufen
   (schnell, ohne Lauf), nicht nachbauen.
2. `learningFactors` rechnet den Lernfaktor nach (`floor + qwidth × span`) – dieselbe Formel wie
   `learning_rate`, aber im Atelier noch einmal geschrieben.
3. Das Bild „Reiz · Lehrsignal · Reaktion“ steht im Inspektor. Reiz und Lehrsignal kommen von
   außen an die Zelle; nach unserer Regel gehört, was von außen kommt, ins Fischpanel.
4. Die Überraschung (Punkt 4 oben) ist der Kern des Lernens am Lehrsignal. Ich habe im Werkzeug
   nichts gesehen, das sie zeigt: dass ein angekündigtes Lehrsignal nichts mehr lehrt.
5. Ein Satz im Inspektor; fünf Zeilen, deren Wirkung erst nach dem Aufklappen sichtbar ist.

## 5. Offene Fragen an Astra

- Stimmt „Plastizität = `quality_width`“ auch für Zellen aus dem Atelier-Plan (ich habe nur
  `development.cc:71` gelesen, nicht den Weg des Plans dorthin)?
- Welche Lernfunktionen der Engine lassen sich einzeln und schnell rufen (Spur über n Schritte,
  Änderung eines Kontakts für gegebene Abweichungen, Vergessen über n Schritte), ohne ein Gehirn zu
  bauen? Das entscheidet, was das Werkzeug zeigen darf.
- Lernt der Effektor wirklich mit den Werten der **sendenden** Zelle (`learner = s`, Zeilen 690,
  906–917)? So lese ich es.
