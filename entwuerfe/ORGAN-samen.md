# Organ Samen

Am Produktstand `64a6bef7` gelesen (Fable, 14.11. 12:10). Grundlage ist Astras Pfad von 11:47 und 12:01; was ich selbst gelesen habe, steht mit Datei und Zeile da.

## Drei Aufgaben

1. **Befruchten (nach dem Schlupf).** Füllen wie beim Eiorgan, aber mit `0,2` je Schritt statt 2 und bis `Körpergröße × min(40, 10 × Samenzellen)` (`reproduction.cc:33–37,25–26`, `ecology_types.hh:74`, `physiology_parameters.cc:7`, `physiology.cc:116–119`). Ein Schlag der Ablegezellen gibt den **ganzen** Vorrat ab, sobald er mindestens die Mindestportion 2 erreicht (`reproduction.cc:144–153`). Die Wolke ist fruchtbar; ein Ei wird befruchtet, wenn die Dichte der passenden Wolken am Ei über der Verdünnungsgrenze liegt (`:203–218`). Eigener Samen zählt erst, wenn das Ei 60 Schritte alt ist (`:206–208`, `ecology_types.hh:68`).
2. **Schlupf (im Ei).** Der Embryo sammelt Sekret statt Samen, aus seiner Reserve über der Schlupfreserve (`reproduction.cc:262–271`). Ein Schlag der Ablegezellen gibt es ab: Die Schale wird um `Sekret ÷ Schalenradius` dünner (`:272–276`). Schlüpfen kann er erst mit dünner Schale **und** genug Kraft von Schwanz oder Flossen (`embryo.cc:38–41`).
3. **Tinte.** Das im Ei abgegebene Sekret erscheint außen als unfruchtbare Wolke (`reproduction.cc:279–296`). Jede Wolke, auch die fruchtbare, trübt das Wasser je Farbkanal (von Astra 12:01 übernommen: `sperm_field.cc:230–297`, nicht selbst gelesen).

## Drucksinn

Liest auch im Ei den normalen Vorrat ÷ Fassungsvermögen, nicht das Sekret (Astra 11:47, `body_plan.cc:1045–1049,1158–1161`, nicht selbst gelesen).

## Atelier

- `organs.js:262–275`: bis 16 Knoten: 8 Füllzellen, 4 Ablegezellen, 2 Druckzellen; Anschlüsse wie beim Eiorgan.
- Planbericht `capabilities.gonads.sperm = {perCell, most, fill, spawnLeast}` (`atelier.cc:975–985`).

## Für den Entwurf

- Zwei Lebensabschnitte mit verschiedenem Bild: im Ei die Schale, die dünner wird, und die Tintenwolke außen; nach dem Schlupf die Wolke, die ein Ei erreicht oder nicht.
- Tinte: ein Gegenstand hinter der Wolke verblasst (Astra 12:01).
- Der Entwurf kommt nach dem Eiorgan.
