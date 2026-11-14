# Organ Drüse (Schritt 11) – Leseseite von Claude, 14.11. 16:16

Stand: Produktzweig `b7e43b12`. Fable prüft gegen den Code und zeichnet daraus; Astra prüft die Seite. Die Drüse ist die Brücke zum Hormonwerkzeug: Sie macht den Spiegel, die Wirkung liegt bei den Rezeptoren der anderen Zellen (Hormonwerkzeug, nicht hier).

## Codepfad
- **Zellen:** innere Zellen in Zone 1 (Kopf) (`colony-core/field/development_sites.hh:79`). Atelier: Organ `gland`, Typen = Zahl der Stoffe, Gruppe `secretion`, 5 Kopien (`ui/studio/model/organs.js:276–282`).
- **Welcher Stoff:** Jede Zelle hat einen Ort auf dem Stoffrad (`q1`, `q2`) und eine Breite; ihr Anteil je Hormon kommt aus `hormone_affinity` (`src/body_plan.cc:423`; Rad und Formel `colony-core/field/hormones.hh:29–85`). Nur die sechs Hormone, nicht die drei Körperwerte.
- **Befehl:** Betrag des Befehls × Stärke (`body_plan.cc:1314–1319`). **Positiv schüttet aus, negativ bindet** (baut den Stoff ab) (`:1340–1342`).
- **Spiegel** (`HormoneState::advance`, `src/hormone_state.cc:40–60`):
  - Ziel = 0,139 × Ausschüttung (`height` = 0,01 × Grundzellzeit, `src/hormone_state.hh:12–15`).
  - Steigt mit der **Zellzeit** der Drüsenzellen (4–48 Schritte), fällt mit ihrer **Verweilzeit** (aus dem Feldbreiten-Gen, `residence_steps` = 4 bis 1024 Schritte, `colony-core/field/substrate.hh:38–40`). Beide kapazitätsgewichtet über alle Drüsen desselben Stoffs (`body_plan.cc:155–168, 191–200`).
  - Binden nimmt zusätzlich `exp(−1/32 × Bindung)` je Schritt.
  - Spiegel 0 bis 1.
- **Kosten:** je Schritt Neuronen-Unterhalt × (Ausschüttung + Bindung) (`work_cost`, `hormone_state.cc:26–36`), nur soweit bezahlt (`paid`).
- **Wer es liest:** Rezeptoren jeder Zelle (neun Wirkungen: Erregung, Lernen, Konkurrenz, Lernspur, Takt, Ausgabe, Tod, Lehre, Festigung, `hormones.hh:6–18`) und der Blutsinn (Schritt 9).
- **Bestehender Inspektor:** `glandProfile` (`ui/studio/view/substances.js`, `panels.js:117`) und `gland_effect.js`.
- **Bitte prüfen:** wo die sechs Hormone im Aquarium angezeigt werden (Spiegel im Fischpanel?).

## Was das Organ ist und tut (Wirkung statt Anzahl)
- Es hebt oder senkt einen Stoff im ganzen Körper, schnell hinauf (Zellzeit) und langsam oder schnell wieder herunter (Verweilzeit).
- Ein Befehl wird zu einem **Zustand**, der nachwirkt: Das ist der Kern, und genau das zeigt kein anderes Organ.

## Lebenszyklus, drei Fragen
- **Automatisch:** Der Spiegel fällt ohne Befehl mit der Verweilzeit.
- **Das Organ entscheidet:** wie lange ein Befehl nachwirkt (Verweilzeit) und wie schnell er wirkt (Zellzeit).
- **Der Designer setzt:** Stoff (Ort auf dem Rad), Breite (rein oder gemischt), Kopien (wie hoch), Zellzeit, Verweilzeit, Schwelle, Lebensspanne.
- **Eigen:** Drüsen arbeiten auch im Ei (die Eiprogramme hängen daran). Eine Drüse, die erst später gebildet wird oder mit Reife stirbt, ist eine Lebensphase.

## Vorschlag fürs eigene Bild (Musterverbot)
- Nicht wieder das Rad als Hauptbild (das hat der Blutsinn). Eigen ist die **Zeit**: ein kurzer Befehl (Knopf, Eingabe) und der Spiegel, der steigt und lange abklingt; Griffe für Zellzeit (Anstieg) und Verweilzeit (Abklingen). Der Stoff als Farbe; das Rad nur klein zur Wahl des Stoffs.
- Binden als zweiter Zustand: negativer Befehl drückt den Spiegel schneller hinunter.
