# Organ Schmerz (Schritt 9) – Fable, 14.11.

Selbst gelesen: `src/physiology.hh:66–81` (`harm_body`), `src/body_plan.cc:347–360` (Keil), `:1146–1153` (Reiz), `:988–992` (`bounded_response`), `src/physiology.cc:351–357` (Heilen), `src/physiology_parameters.hh:31`, `src/embryo.cc:32–37`, `src/brain_interface.hh:18–24`, die Aufrufer von `harm_body` (nur die Aufrufzeilen in `feeding.cc`, `disease.cc`, `ecology_step.cc`, `physiology.cc`, `movement.cc`).
Nicht gelesen: wie groß ein Biss in Gesundheit ist (`feeding.cc` im Ganzen), Unterhalt je Zelle, `view/skin.js` im Atelier.

## Was die Engine tut
- Jeder Schaden nimmt Gesundheit. Ein Biss wird auf den Sektor gebucht, aus dem er kommt (mit dem Nachbarn geteilt); Schaden ohne Ort (Hunger, Krankheit, Alter, Enge im Ei) gleichmäßig auf alle 16.
- Schmerzzellen der Haut gewichten die Sektoren mit demselben Keil wie Tasten und Seitenlinie. Reiz = 16 × Gewicht × Gebuchtes, höchstens 1. Ein Biss von einem Sechzehntel der Gesundheit an der Zellstelle ist für ein schmales Feld schon voller Schmerz.
- Ein satter Fisch (Reserve über 0,15) heilt 0,001 Gesundheit je Schritt; das Gebuchte schrumpft mit.
- Antwort begrenzt; die Zellen gewöhnen sich an eine Wunde, die bleibt (`adapting_sense` nennt `Damage`).
- Schmerzzellen im Körperinneren melden stattdessen das Bauchweh (steht im Darm-Inspektor).
- Im Ei: Enge in der Schale und Hunger schaden ohne Ort, also rundum.

## Lebenszyklus, drei Fragen
- **Automatisch:** Heilen, Gewöhnung; im Ei der Schaden durch Enge.
- **Das Organ entscheidet:** nichts.
- **Der Designer setzt:** Stelle auf der Haut (am Fisch), Feldbreite, Schwelle und Streuung, Gewöhnungszeit, Lebensspanne.

## Entwurf (Panel Schmerz), nach Claudes Prüfung 14:26
1. **Der Fisch mit dem Biss, der sich schließt** (gibt es nur hier): Der Biss am Rand ist so groß, wie die Wunde im gezeigten Schritt ist, und wird mit der Uhr kleiner; der Ring um die getroffene Zelle ist so dick wie ihr Reiz und so hell wie ihre Meldung, er verblasst also schon, während der Biss noch offen ist. Schmerzzellen in der Haut so groß wie ihr Gewicht, Griff für die Breite. Der runde Knopf steht für die Wundprobe des Fischpanels: am Rand entlang (wo der Biss sitzt), in den Körper gezogen: Schaden ohne Ort, als Saum rund um den ganzen Rand.
2. Signalverlauf: die Wunde entsteht mit dem Biss und geht mit 0,001 Gesundheit je Schritt zurück (Fisch mit sonst voller Gesundheit); Marke „ein voller Biss“ bei 0,25 (`bite_wound`, `physiology_parameters.cc:6`; `feeding.cc:38`: für einen Fisch von Referenzgröße). Ein Knopf: wann der Biss kommt und wie viel Gesundheit er nimmt. Schwelle, Streuung und Gewöhnung haben hier ihre Griffe.
3. Leben: im Ei Schaden rundum durch die enge Schale, danach der Biss.

Wirkung der Feldbreite (Claude 14:26, Punkt 3): Schmal meldet einen Biss an der Stelle bis 16-fach und daneben nichts; ganz breit meldet Biss und Schaden ohne Ort gleich, nämlich den Gesamtschaden. Nicht im Bild: dass ein hungriger Fisch nicht heilt; dass ein geschwächter langsamer schließt; Zellzahl.
