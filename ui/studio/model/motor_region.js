// Motor coordination: where a stimulus lies, how urgent swimming is and whether to stop become the
// commands of fins, tail, mouth, jaw, gills, gut and buoyancy. "back" makes the fish retreat: the
// forward strokes of the pectoral fins push it back while the tail rests. Inputs name the side of
// the stimulus: "toward" turns to it, "away" and "feel" turn from it. With competing sides a
// request on one side also inhibits turning to the other, so two requests compete instead of
// cancelling at the muscle. Every node answers any input: contacts learn only between cells that
// both vary, so a cell held silent would never learn its inputs. "beat" and "pump" add inner
// pacemakers for swimming bouts and for a rhythmic mouth.
import {RHYTHM_TAU, TONIC_LEARNING, neuralPlan, pacemakerCell, regionCell} from './region_cells.js';

// Swim threshold for the resting command: silent, gentle cruising, steady cruising.
const SWIM_TONE = Object.freeze([ 0, -.5, -1 ]);
// The output nodes drive muscles directly, like motor neurons: more cells and full contacts.
const DRIVER = Object.freeze({copies : 8, electrical_limit : 1});
// A command first needed long after maturity (a retreat, a flight) stays faintly active: weak
// spontaneous activity keeps it learnable without making it act at rest.
const FAINT = Object.freeze({pace : .5, threshold : .25});
const RETREAT_DRIVER = Object.freeze({...DRIVER, ...FAINT});
// Listeners keep their resting rhythm for life: a meal or a second smell first arrives after
// hatching, and a contact grows only while its target cell is active.
const listener = (node, preset, set = {}) => regionCell(node, preset, 'in', set, TONIC_LEARNING);
export function motorPlan(doc, organ) {
  const r = organ.region;
  const nodes = [
    regionCell('turn', 'relay', 'out', DRIVER),
    // Successful early feeding can postpone the first search input until after maturity.
    regionCell('swim', 'relay', 'both', {...DRIVER, threshold : SWIM_TONE[r.tone]}, TONIC_LEARNING),
    regionCell('mouth', 'relay', 'both', DRIVER), regionCell('bite', 'relay', 'both', DRIVER),
    // The bladder empties only on a negative command, so lift answers with both signs.
    regionCell('lift', 'relay', 'both', {...DRIVER, q1 : 0}),
    // Stop signals: brake slows swimming; a full gut silences mouth and jaw; food at the mouth
    // holds the fish down while it eats. Brake and hold are as strong as the drivers, or a touch
    // could not stop the swimming drive.
    listener('brake', 'inhibit', DRIVER), listener('sated', 'inhibit'),
    listener('hold', 'inhibit', DRIVER)
  ];
  const inner =
      [ [ 'brake', 'swim' ], [ 'sated', 'mouth' ], [ 'sated', 'bite' ], [ 'hold', 'lift' ] ];
  // A fish with gills pumps them with the mouth; a full gut stops them too.
  const gills = doc.organs.some(o => o.type === 'gills');
  if (gills) {
    nodes.push(regionCell('gills', 'relay', 'out', DRIVER));
    inner.push([ 'sated', 'gills' ]);
  }
  // A fish with gut muscle can hurry a full gut along to make room for more food.
  if (doc.organs.some(o => o.type === 'gutmuscle'))
    nodes.push(regionCell('gut', 'relay', 'out', DRIVER));
  if (r.retreat) {
    // Retreat stops rowing on both sides: the fin request may be wired across the body while
    // the reverse muscle is wired on the same side.
    nodes.push(regionCell('reverse', 'relay', 'out', RETREAT_DRIVER, TONIC_LEARNING),
               listener('retreat', 'relay', FAINT),
               regionCell('backStop', 'inhibit', 'out', RETREAT_DRIVER, TONIC_LEARNING));
    inner.push([ 'retreat', 'reverse' ], [ 'retreat', 'brake' ], [ 'retreat', 'backStop' ],
               [ 'backStop', 'turn' ]);
  }
  const cross = [];
  // Mirrored pacemakers beat in antiphase. One pool on the left side drives both sides, so a beat
  // starts and stops the whole tail or mouth.
  const pacing = !organ.pair || organ.side < 0;
  const pacemakers = [
    [ 'beat', r.beat, [ 'swim' ] ],
    // Each beat opens the jaw and closes it again; a closer slower than its opener gulps first.
    [ 'pump', r.pump, [ 'mouth', 'bite', ...(gills ? [ 'gills' ] : []) ] ]
  ];
  for (const [node, level, targets] of pacemakers)
    if (level && pacing) {
      nodes.push(pacemakerCell(node, RHYTHM_TAU[level - 1]));
      for (const to of targets) {
        inner.push([ node, to ]);
        if (organ.pair)
          cross.push([ node, to ]);
      }
    }
  if (organ.pair) {
    if (r.retreat)
      cross.push([ 'retreat', 'backStop' ], [ 'retreat', 'brake' ]);
    // Danger on one side turns the fish away from it, with the fins and, through the spine, with
    // an escape stroke of the tail. Flight stays faint at rest: a full resting rhythm would beat
    // escape strokes all the time and starve the fish.
    nodes.push(listener('flee', 'relay', FAINT), regionCell('escape', 'relay', 'out', DRIVER));
    cross.push([ 'flee', 'turn' ], [ 'flee', 'escape' ]);
    if (r.compete) {
      nodes.push(listener('oppose', 'inhibit'));
      cross.push([ 'oppose', 'turn' ]);
    }
  }
  return neuralPlan(nodes, inner, cross);
}
