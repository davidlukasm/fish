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

## Entwurf (Panel Schmerz)
1. **Der Fisch mit der Wunde** (gibt es nur hier): ein Biss aus dem Rand, so groß wie er Gesundheit nimmt; die Schmerzzellen in der Haut, so groß wie ihr Gewicht, Griff für die Breite. Der runde Knopf steht für die Wundprobe des Fischpanels: am Rand entlang (wo der Biss sitzt), in den Körper gezogen: Schaden im ganzen Körper (Hunger, Krankheit, Alter).
2. Signalverlauf einer Wunde: sie entsteht mit dem Biss und schließt sich im Heiltempo der Engine (gestrichelter Umriss); die Zellen sind lange voll gereizt und gewöhnen sich trotzdem daran. Ein Knopf: wann der Biss kommt und wie tief er ist.
3. Leben: im Ei Schaden rundum durch die enge Schale, danach der Biss.

Nicht im Bild: dass ein hungriger Fisch nicht heilt; Zellzahl.
