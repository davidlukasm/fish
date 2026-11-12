const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {join} = require('node:path');

async function checkLiveFounders() {
  const {LiveStation} = await import('../ui/labor/live_station.js');
  const offered = [
    {key : 'drafts/liora', category : 'drafts', name : 'Liora'},
    {key : 'drafts/brisa', category : 'drafts', name : 'Brisa'}
  ];
  for (const breeding of [false, true]) {
    const nodes = new Map(), pending = [];
    const root = {
      addEventListener() {},
      querySelectorAll : () => [],
      querySelector(selector) {
        if (!nodes.has(selector))
          nodes.set(selector, {value : '', innerHTML : '', addEventListener() {}});
        return nodes.get(selector);
      }
    };
    const station = new LiveStation(root, breeding);
    station.poll = () => {};
    station.request = data =>
        new Promise((resolve, reject) => pending.push({data, resolve, reject}));
    const draft = {name : 'Atelier', genome : 'compiled genome'};
    let opening = station.open(draft);
    pending.at(-1).resolve({fish : offered, job : null});
    await opening;
    assert.equal(station.state.fish, 'draft');
    station.close();
    opening = station.open(null);
    pending.at(-1).resolve({fish : offered, job : null});
    await opening;
    assert.equal(station.state.fish, offered[0].key,
                 'Removing the Atelier draft selects an available catalog fish');
    assert.match(root.querySelector('[data-live-setting=fish]').innerHTML,
                 /value="drafts\/liora" selected/);
    let starting = station.start();
    assert.equal(pending.at(-1).data.fish, offered[0].key);
    assert.equal(pending.at(-1).data.genome, undefined);
    const count = pending.length;
    await station.start();
    assert.equal(pending.length, count, 'Repeated start clicks create only one run');
    pending.at(-1).resolve({id : 'one', status : 'running'});
    await starting;

    station.state.fish = offered[1].key;
    opening = station.open(draft);
    const overview = pending.at(-1);
    assert.equal(root.querySelector('[data-live-action=start]').disabled, true);
    await station.start();
    assert.equal(pending.at(-1), overview, 'Loading the catalog cannot cancel the current run');
    overview.resolve({fish : offered, job : station.job});
    await opening;
    assert.equal(station.state.fish, offered[1].key, 'An available explicit choice is retained');

    opening = station.open(null);
    pending.at(-1).resolve({fish : [], job : station.job});
    await opening;
    assert.equal(station.state.fish, null);
    assert.equal(root.querySelector('[data-live-action=start]').disabled, true);
    assert.ok(root.querySelector('[data-live-founders-status]').textContent);
    const emptyCount = pending.length;
    await station.start();
    assert.equal(pending.length, emptyCount, 'An empty catalog cannot cancel or start a run');

    opening = station.open(draft);
    pending.at(-1).resolve({fish : [], job : null});
    await opening;
    starting = station.start();
    assert.equal(pending.at(-1).data.genome, draft.genome,
                 'The current Atelier draft can start with an empty catalog');
    station.close();
    pending.at(-1).resolve({id : 'late', status : 'running'});
    await starting;
    assert.notEqual(station.job?.id, 'late', 'A late start response leaves a closed station alone');

    const oldOpen = station.open(null), oldRequest = pending.at(-1);
    station.close();
    opening = station.open(null);
    oldRequest.reject(Error('old overview failed'));
    await oldOpen;
    assert.equal(station.error, '', 'An old failure cannot overwrite the reopened station');
    pending.at(-1).resolve({fish : offered, job : null});
    await opening;
    assert.equal(station.state.fish, offered[0].key);
    assert.equal(root.querySelector('[data-live-action=start]').disabled, false);
    station.close();
  }
}

async function checkInspectorSubstances(model, capabilities, clicks) {
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const {newFishDocument} = await import('../ui/studio/canvas_placement.js');
  const {inspector} = await import('../ui/studio/view/panels.js');
  const {HORMONE_EFFECT, HORMONES} = await import('../ui/schema.js');
  const {receptorBody, glandProfile, hormonePad} = await import('../ui/studio/view/substances.js');
  const root = {querySelector : () => null, querySelectorAll : () => []};
  const studio = new OrganStudio(root), sites = capabilities.sites;
  Object.assign(
      studio.state,
      {sites, capabilities, station : 'studio', document : newFishDocument('Stoffwahl', sites)});
  studio.persist = studio.requestDesign = () => {};
  const organ = studio.state.document.organs.find(o => o.type === 'gut');
  const id = organ.centers[0].id, selected = {kind : 'organ', id : organ.id};
  studio.state.selected = selected;
  const before = studio.state.document;
  const click = (key, value, extra = {}) =>
      clicks.find(([ selector ]) => selector === '[data-' + key + ']')[1](studio, {
        dataset : {...extra, [key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : String(value)}
      });
  studio.change({
    target : {
      dataset : {receptorActive : id, receptorEffect : String(HORMONE_EFFECT.output)},
      checked : true
    }
  });
  assert.deepEqual(studio.state.selected, selected, 'Switching a receptor keeps the organ open');
  let center = model.findCenter(studio.state.document, id).center;
  const wheel = receptorBody(studio.state, center, HORMONE_EFFECT.output);
  assert.match(wheel, /data-receptor-substance="2"/,
               'An unnamed substance can be selected directly in the organ wheel');
  assert.doesNotMatch(wheel, /data-define-substance/);
  const binding = {centerId : id, receptorEffect : String(HORMONE_EFFECT.output)};
  click('receptor-substance', 2, binding);
  assert.equal(
      model.findCenter(studio.state.document, id).center.receptors[HORMONE_EFFECT.output].substance,
      2);
  assert.equal(studio.state.document.substances.length, 1);
  assert.deepEqual(studio.state.selected, selected);
  assert.equal(studio.state.tool, 'select', 'Choosing a substance keeps the current tool');
  const bound = studio.state.document;
  click('receptor-substance', 2, binding);
  assert.deepEqual(studio.state.document, bound,
                   'A second selection does not add the substance again');
  studio.stepHistory('undo');
  assert.equal(studio.state.document.substances.length, 0,
               'Creating and binding a substance is a single undo step');
  studio.stepHistory('redo');
  click('birth-substance', 4, {centerId : id});
  assert.equal(model.findCenter(studio.state.document, id).center.growth.substance, 4);
  click('birth-substance', HORMONES.levels, {centerId : id});
  assert.equal(studio.state.document.substances.length, 2, 'Maturity is not a new free hormone');
  assert.deepEqual(studio.state.selected, selected);
  assert.deepEqual(model.compileDocument(before, sites).groups.map(g => g.name),
                   model.compileDocument(studio.state.document, sites).groups.map(g => g.name));
  const markup = inspector(studio.state);
  assert.ok(markup.includes('data-organ-settings="' + organ.id + '"'),
            'The initial organ inspector is reachable by the native anatomy refresh');
  let replacement = '';
  root.querySelectorAll = selector => selector === '[data-organ-settings]' ? [ {
    dataset : {organSettings : organ.id},
    set outerHTML(value) { replacement = value; }
  } ]
                                                                           : [];
  studio.refreshGraphics();
  assert.ok(replacement.includes('data-organ-settings="' + organ.id + '"'));
  root.querySelectorAll = () => [];
  for (const [kind, draw] of [[ 'gland', glandProfile ], [ 'blood', hormonePad ]]) {
    const placed = model.addOrgan(model.newDocument(kind), kind, sites, {x : 550, y : 300});
    const organ = model.findOrgan(placed.document, placed.organId), center = organ.centers[0];
    studio.state.document = placed.document;
    studio.state.selected = {kind : 'organ', id : organ.id};
    const chosen = studio.state.selected;
    assert.match(draw(studio.state, organ, center), /data-wheel-substance="1"/);
    click('wheel-substance', 1, {centerId : center.id});
    const updated = model.findCenter(studio.state.document, center.id).center;
    assert.deepEqual([ updated.q1, updated.q2 ], model.wheelPlace(capabilities, 1));
    assert.equal(studio.state.document.substances[0].index, 1);
    assert.deepEqual(studio.state.selected, chosen);
  }
}

async function checkVariationPictures() {
  const {traitVariation, cellVariationExamples, receptorVariationExamples} =
      await import('../ui/studio/model/variation.js');
  const {variationGraphic, variationPatch} = await import('../ui/studio/view/cell_tissue.js');
  const {timeConstantSteps} = await import('../ui/tuning.js');
  const zero = traitVariation(.9, 0), clipped = traitVariation(.9, .2);
  assert.deepEqual(zero.examples, [ .9 ]);
  assert.deepEqual(zero.interval, [ .9, .9 ]);
  assert.deepEqual(clipped.interval, [ .5, 1 ]);
  assert.equal(
      clipped.examples.filter(value => value === 1).length, 3,
      'Clipping retains probability at the boundary instead of resampling a narrower range');
  const center = {
    role : 'nerve',
    tau : .8,
    learning_tau : .25,
    electrical_limit : .9,
    teaching_limit : .1,
    distribution : {spread_physiology : .1, spread_contacts : .2, spread_development : 1}
  };
  const times = cellVariationExamples(center, 'spread_physiology');
  assert.equal(times[0].blueprint, timeConstantSteps(.8));
  for (const [actual, expected] of times[0].interval.map(
           (v, i) => [v, timeConstantSteps(i ? .9 : .7)]))
    assert.ok(Math.abs(actual / expected - 1) < 1e-12);
  assert.ok(Math.abs(times[0].blueprint ** 2 / (times[0].interval[0] * times[0].interval[1]) - 1) <
                1e-12,
            'Symmetric gene spread gives multiplicative time intervals');
  const contacts = cellVariationExamples(center, 'spread_contacts');
  assert.deepEqual(contacts[0].interval, [ 70, 100 ]);
  assert.deepEqual(new Set(cellVariationExamples(center, 'spread_development')[0].examples),
                   new Set([ 0, 1, 2 ]));
  const wheel = {halfRange : [ .0003, 1 ], sensitivitySpan : 2};
  const receptor = {baseline : .8, sensitivity : -1, half : .01, spread_receptors : .2};
  const reception = receptorVariationExamples(receptor, wheel);
  assert.deepEqual(reception[0].interval, [ .4, 1 ]);
  assert.ok(Math.abs(reception[1].interval[0] + 1.8) < 1e-12);
  assert.ok(Math.abs(reception[1].interval[1] + .2) < 1e-12);
  assert.ok(Math.abs(reception[2].blueprint - receptor.half) < 1e-12);
  assert.ok(Math.abs(reception[2].interval[1] / receptor.half -
                     receptor.half / reception[2].interval[0]) < 1e-12);
  for (const value of [0, .1, .5, 1]) {
    const markup = variationGraphic(value, 'group', 'spread_physiology', times);
    assert.ok(!/NaN|undefined/.test(markup));
    assert.match(markup, /M226\.80 /,
                 'The blueprint remains at its actual time, away from the middle');
    const handle = markup.match(/data-variation-handle cx="([\d.]+)"/);
    assert.ok(Math.abs(variationPatch(Number(handle[1]) / 300) - value) < 1e-12);
  }
  assert.ok(!/NaN|undefined/.test(variationGraphic(.2, 'receptor', 'spread_receptors', reception)));
}

function checkSlotWiring(model, regions, sites, clickSlot) {
  const organ = id => ({kind : 'organ', id});
  const port = (id, slot) => ({kind : 'slot', id, slot});
  for (const type of ['eggs', 'sperm']) {
    const relay = model.addOrgan(model.newDocument('Anschlüsse'), 'state', sites,
                                 {x : 550, y : 365}, Infinity, false);
    const outlet = type === 'eggs' ? 'lay' : 'spermRelease';
    const inlet = type === 'eggs' ? 'eggFullness' : 'spermFullness';
    const added = model.addOrgan(relay.document, type, sites, {x : 700, y : 365});
    const editor = {
      state : {document : added.document},
      setTool() { this.pendingWire = null; },
      refreshViews() {},
      notice() {},
      connectSelections(from, to) {
        const wired = model.connectSelections(this.state.document, from, to, sites);
        if (wired)
          this.state.document = wired.document;
        return !!wired;
      }
    };
    clickSlot(editor, {dataset : {slotRegion : relay.organId, slotKey : outlet, slotDir : 'out'}});
    clickSlot(editor,
              {dataset : {slotRegion : added.organId, slotKey : 'trigger', slotDir : 'in'}});
    let doc = editor.state.document;
    assert.equal(doc.wires[0].fromPort, outlet);
    assert.equal(doc.wires[0].toPort, 'trigger');
    const compiledTargets = (doc, key) => {
      const plan = model.compileDocument(doc, sites);
      const wire = doc.wires.find(w => w.toPort === key);
      const ids = new Set(
          regions.routedLinks(doc, sites).filter(l => l.wire.id === wire.id).map(l => l.to));
      const centers = model.allCenters(doc);
      return plan.connections.filter(c => ids.has(centers[c.to].id))
          .map(c => plan.groups[c.to].name);
    };
    assert.ok(compiledTargets(doc, 'trigger').length);
    assert.ok(compiledTargets(doc, 'trigger').every(name => name === type + ':release'),
              'The release port never fills the gonad');
    const slots = regions.regionSlots(doc, model.findOrgan(doc, added.organId));
    assert.equal(slots.find(s => s.key === 'storage').filled.length, 0);
    assert.equal(slots.find(s => s.key === 'trigger').filled.length, 1);
    doc = model
              .connectSelections(doc, port(relay.organId, 'investment'),
                                 port(added.organId, 'storage'), sites)
              .document;
    assert.equal(doc.wires.length, 2, 'Storage and release retain separate wires');
    doc = model.setOrganNodes(doc, added.organId, type === 'eggs' ? 18 : 16, sites);
    assert.ok(compiledTargets(doc, 'storage').every(name => name === type + ':growth'));
    const releaseNodes =
        model.findOrgan(doc, added.organId).centers.filter(c => c.key === 'release');
    const reached = new Set(
        regions.routedLinks(doc, sites).filter(l => l.wire.toPort === 'trigger').map(l => l.to));
    assert.ok(releaseNodes.every(c => reached.has(c.id)),
              'A named port includes chambers added after wiring');
    doc = model
              .connectSelections(doc, port(added.organId, 'fullness'), port(relay.organId, inlet),
                                 sites)
              .document;
    const feedback = regions.routedLinks(doc, sites).filter(l => l.wire.fromPort === 'fullness');
    assert.ok(feedback.length &&
              feedback.every(l => model.findCenter(doc, l.from).center.key === 'pressure'));
    model.validateDocument(JSON.parse(JSON.stringify(doc)));
    const stored = model.placeStoredModule(model.newDocument('Kopie'),
                                           {name : type, organs : doc.organs, wires : doc.wires},
                                           sites, {x : 550, y : 365});
    assert.ok(stored);
    assert.deepEqual(stored.document.wires.map(w => [w.fromPort, w.toPort]),
                     doc.wires.map(w => [w.fromPort, w.toPort]));
  }
  const paired = model.addOrgan(model.newDocument('Wahl'), 'choice', sites, {x : 700, y : 300});
  const gate = model.addOrgan(paired.document, 'state', sites, {x : 500, y : 365});
  const sensed = model.connectSelections(gate.document, port(gate.organId, 'intake'),
                                         port(paired.organId, 'strength'), sites);
  const wired = model.connectSelections(sensed.document, port(gate.organId, 'pause'),
                                        port(paired.organId, 'pause'), sites);
  assert.ok(wired, 'A feeding pause and goal strength retain their separate inputs');
  const both = model.updateWire(wired.document, wired.wireId, {pairing : 'both'});
  const links = regions.routedLinks(both, sites).filter(l => l.wire.id === wired.wireId);
  assert.equal(links.length, 2);
  assert.ok(links.every(l => model.findCenter(both, l.to).center.node === 'pause'));
  const slots = regions.regionSlots(both, model.findOrgan(both, paired.organId));
  assert.equal(slots.find(s => s.key === 'pause').filled.length, 1);
  assert.equal(slots.find(s => s.key === 'strength').filled.length, 1);
  model.validateDocument(both);
}

async function checkForagingChoice(model, sites, root) {
  let doc = model.newDocument('Suchwechsel');
  const ids = {};
  for (const [type, x, y] of [[ 'choice', 600, 300 ], [ 'state', 550, 365 ], [ 'gut', 680, 365 ],
                              [ 'nose', 330, 260 ], [ 'pain', 400, 500 ]]) {
    const made =
        model.addOrgan(doc, type, sites, {x, y}, Infinity, type === 'choice' || type === 'nose');
    assert.ok(made);
    doc = made.document;
    ids[type] = made.organId;
  }
  const port = (id, slot) => ({kind : 'slot', id, slot});
  const link = (from, to) => {
    const wired = model.connectSelections(doc, from, to, sites);
    assert.ok(wired);
    doc = wired.document;
  };
  link(port(ids.gut, 'intake'), port(ids.state, 'intake'));
  link(port(ids.gut, 'intake'), port(ids.choice, 'pause'));
  link({kind : 'organ', id : ids.nose}, port(ids.choice, 'target'));
  link({kind : 'organ', id : ids.nose}, port(ids.choice, 'strength'));
  link({kind : 'organ', id : ids.pain}, port(ids.choice, 'threat'));
  const measure = mode => {
    const plan = model.compileDocument(doc, sites), centers = model.allCenters(doc);
    plan.groups.forEach((g, i) => {
      const c = centers[i];
      g.name = c.organType + ':' + (c.node ?? c.key) + ':' + g.side;
    });
    const output = execFileSync(
        'python3',
        [
          '-B', '-c',
          'import json,sys,subprocess; from atelier_service import encode_plan; print(subprocess.check_output(sys.argv[1:], input=encode_plan(json.load(sys.stdin)), text=True), end="")',
          join(resolve(process.env.BUILD_DIR ?? join(root, 'bin')), 'compiler-tests'), mode
        ],
        {cwd : root, input : JSON.stringify(plan), encoding : 'utf8', timeout : 10000});
    const [header, ...lines] = output.trim().split('\n').map(line => line.split(','));
    const rows = lines.map(row => row.map(Number));
    return (node, from, to, region = 'choice') => {
      const columns =
          header.flatMap((key, i) => key.startsWith(region + ':' + node + ':') ? [ i ] : []);
      const samples = rows.filter(row => row[0] > from && row[0] <= to)
                          .flatMap(row => columns.map(i => row[i]));
      assert.ok(samples.length);
      return samples.reduce((sum, x) => sum + x, 0) / samples.length;
    };
  };
  for (const mode of ['choice', 'choice-late', 'choice-pulsed', 'choice-late-pulsed']) {
    const mean = measure(mode);
    const feeding = mean('search', 2500, 2800), roaming = mean('search', 3500, 4000);
    assert.ok(roaming > 3 * feeding + .03,
              mode + ': unsuccessful feeding releases search despite the held target');
    assert.ok(mean('search', 2800, 2900) < roaming * .7,
              'The previous meal still delays departure');
    assert.ok(mean('target', 3500, 4000) < mean('target', 2500, 2800) * .8,
              'Search reduces fixation on the unrewarding target');
    assert.ok(mean('target', 4400, 4500) > mean('target', 4700, 5000) * 1.05,
              'A new target gets a fresh approach');
    assert.ok(mean('search', 5500, 5800) < roaming * .5, 'A later meal can still suppress search');
    assert.ok(mean('threat', 6000, 6200) > mean('threat', 3500, 4000) * 3,
              'Threat responses remain available during search');
  }
  const motor = model.addOrgan(doc, 'motor', sites, {x : 600, y : 500}, Infinity, true);
  assert.ok(motor);
  const {updateRegion} = await import('../ui/studio/model/regions.js');
  doc = updateRegion(motor.document, motor.organId, {tone : 0, beat : 0}, sites);
  link(port(ids.choice, 'search'), port(motor.organId, 'urge'));
  link(port(ids.gut, 'intake'), port(motor.organId, 'brake'));
  const mean = measure('choice-fed-start');
  assert.ok(mean('search', 3500, 4000) > .05, 'Search starts after a well-fed childhood');
  const travel = mean('swim', 3500, 4000, 'motor');
  assert.ok(travel > .15, 'The mature motor circuit can learn its first search input');
  assert.ok(mean('swim', 5500, 5800, 'motor') < travel * .5,
            'A new meal still stops the learned search movement');
}

async function spinalDocument(model, sites) {
  const {sitePoint} = await import('../ui/studio/model/layout.js');
  const {siteRole} = await import('../ui/studio/model/organs.js');
  let doc = model.newDocument('Wirbelsäule');
  const ids = {};
  // Native addresses keep this behavioural fixture independent of the Atelier projection.
  for (const [type, address, paired] of [[ 'spine', 704, true ], [ 'gut', 318, false ],
                                         [ 'balance', 417, true ], [ 'pain', 169, true ],
                                         [ 'muscle', 578, true ]]) {
    const home = sites.find(s => s.id === address);
    const made =
        model.addOrgan(doc, type, sites, sitePoint(home, siteRole(type)), Infinity, paired);
    assert.ok(made);
    doc = made.document;
    ids[type] = made.organId;
  }
  const port = (id, slot) => ({kind : 'slot', id, slot});
  for (const [from, to] of [[ port(ids.gut, 'intake'), port(ids.spine, 'urge') ],
                            [ {kind : 'organ', id : ids.balance}, port(ids.spine, 'steer') ],
                            [ {kind : 'organ', id : ids.pain}, port(ids.spine, 'escape') ],
                            [ port(ids.spine, 'stroke'), {kind : 'organ', id : ids.muscle} ]]) {
    const wired = model.connectSelections(doc, from, to, sites);
    assert.ok(wired);
    doc = model.updateWire(wired.document, wired.document.wires.at(-1).id,
                           {pairing : from.id === ids.gut ? 'both' : 'same'});
  }
  return {doc, ids};
}
// The two tail muscle commands of a spinal trace, step by step and clipped at zero.
function spinalTrace(model, sites, root, doc, mode) {
  const plan = model.compileDocument(doc, sites), centers = model.allCenters(doc);
  plan.groups.forEach((g, i) => {
    const c = centers[i];
    g.name = c.organType + ':' + (c.node ?? c.key) + ':' + g.side;
  });
  const output = execFileSync(
      'python3',
      [
        '-B', '-c',
        'import json,sys,subprocess; from atelier_service import encode_plan; print(subprocess.check_output(sys.argv[1:], input=encode_plan(json.load(sys.stdin)), text=True), end="")',
        join(resolve(process.env.BUILD_DIR ?? join(root, 'bin')), 'compiler-tests'), mode
      ],
      {
        cwd : root,
        input : JSON.stringify(plan),
        encoding : 'utf8',
        timeout : 20000,
        maxBuffer : 8 * 1024 * 1024
      });
  const [header, ...lines] = output.trim().split('\n').map(row => row.split(','));
  const left = header.indexOf('muscle:muscle:-1'), right = header.indexOf('muscle:muscle:1');
  assert.ok(left > 0 && right > 0);
  return lines.map(
      row => [Number(row[0]), Math.max(0, Number(row[left])), Math.max(0, Number(row[right]))]);
}
const meanOf = rows => (side, lo, hi) => {
  const part = rows.filter(row => row[0] > lo && row[0] <= hi);
  return part.reduce((sum, row) => sum + row[side], 0) / part.length;
};

async function checkSpinalPattern(model, sites, root) {
  let {doc, ids} = await spinalDocument(model, sites);
  const {updateRegion} = await import('../ui/studio/model/regions.js');
  const cycles = [];
  for (const cycle of [.6, .3]) {
    doc = updateRegion(doc, ids.spine, {cycle}, sites);
    const rows = spinalTrace(model, sites, root, doc, 'spine');
    const between = (lo, hi) => rows.filter(row => row[0] > lo && row[0] <= hi);
    const mean = meanOf(rows);
    const cruising = between(1600, 2500), drive = (mean(1, 1600, 2500) + mean(2, 1600, 2500)) / 2;
    assert.ok(drive > .2, 'A tonic request develops effective output to both tail muscles');
    const overlap = cruising.reduce((sum, row) => sum + Math.min(row[1], row[2]), 0),
          activity = cruising.reduce((sum, row) => sum + Math.max(row[1], row[2]), 0);
    assert.ok(overlap < .1 * activity, 'The two muscle commands alternate instead of stiffening');
    for (const side of [1, 2]) {
      assert.ok(cruising.filter(row => row[side] > row[3 - side] + .05).length >
                    cruising.length / 4,
                'Both half-centres take their turn');
      assert.ok(mean(side, 4950, 5200) < .3 * drive, 'Removing the request suppresses the tail');
      const start = side === 1 ? 3200 : 3600;
      assert.ok(mean(side, start, start + 200) > 1.4 * mean(3 - side, start, start + 200),
                'Steering biases the requested contraction side');
      const escape = side === 1 ? 3800 : 4000;
      assert.ok(mean(side, escape, escape + 40) > 3 * mean(3 - side, escape, escape + 40),
                'A late escape signal produces a one-sided burst');
    }
    cycles.push(
        cruising.slice(1)
            .filter((row, i) => row[1] - row[2] > .05 && cruising[i][1] - cruising[i][2] <= .05)
            .length);
  }
  assert.ok(cycles[1] > cycles[0] * 1.5, 'The period control changes the compiled rhythm');
}

// After a long swim the tail rests when the request ends, however long the rest lasts, and swims
// again at once when it returns: the brake the spine learned while it grew up outlasts the swim.
async function checkSpinalRest(model, sites, root) {
  const {doc} = await spinalDocument(model, sites);
  const rows = spinalTrace(model, sites, root, doc, 'spine-rest'), mean = meanOf(rows);
  const drive = (mean(1, 1600, 4700) + mean(2, 1600, 4700)) / 2;
  assert.ok(drive > .2, 'The long swim drives the tail');
  for (const side of [1, 2]) {
    assert.ok(mean(side, 5800, 8000) < .1 * drive, 'A long rest keeps the tail still');
    assert.ok(mean(side, 8100, 8600) > .5 * drive, 'The tail swims again after the rest');
  }
}

async function checkFinPattern(model, sites, root) {
  const {sitePoint} = await import('../ui/studio/model/layout.js');
  const {siteRole} = await import('../ui/studio/model/organs.js');
  let doc = model.newDocument('Rudern');
  const ids = {}, names = new Map();
  for (const [name, type, address] of [[ 'spine', 'spine', 704 ], [ 'balance', 'balance', 417 ],
                                       [ 'row', 'muscle', 676 ], [ 'recover', 'muscle', 293 ]]) {
    const made = model.addOrgan(doc, type, sites,
                                sitePoint(sites.find(s => s.id === address), siteRole(type)),
                                Infinity, true);
    assert.ok(made);
    doc = made.document;
    ids[name] = made.organId;
    const organ = model.findOrgan(doc, made.organId);
    names.set(organ.id, name);
    names.set(organ.pair, name);
  }
  const port = (id, slot) => ({kind : 'slot', id, slot});
  for (const [from, to] of [[ {kind : 'organ', id : ids.balance}, port(ids.spine, 'fin') ],
                            [ port(ids.spine, 'row'), {kind : 'organ', id : ids.row} ],
                            [ port(ids.spine, 'recover'), {kind : 'organ', id : ids.recover} ]]) {
    const wired = model.connectSelections(doc, from, to, sites);
    assert.ok(wired);
    doc = model.updateWire(wired.document, wired.document.wires.at(-1).id, {pairing : 'same'});
  }
  const {updateRegion} = await import('../ui/studio/model/regions.js');
  const cycles = [];
  for (const finCycle of [.6, .3]) {
    doc = updateRegion(doc, ids.spine, {finCycle}, sites);
    const plan = model.compileDocument(doc, sites), centers = model.allCenters(doc);
    plan.groups.forEach((g, i) => {
      const c = centers[i];
      g.name = names.get(c.organId) + ':' + (c.node ?? c.key) + ':' + g.side;
    });
    const output = execFileSync(
        'python3',
        [
          '-B', '-c',
          'import json,sys,subprocess; from atelier_service import encode_plan; print(subprocess.check_output(sys.argv[1:], input=encode_plan(json.load(sys.stdin)), text=True), end="")',
          join(resolve(process.env.BUILD_DIR ?? join(root, 'bin')), 'compiler-tests'), 'spine-fin'
        ],
        {
          cwd : root,
          input : JSON.stringify(plan),
          encoding : 'utf8',
          timeout : 10000,
          maxBuffer : 6 * 1024 * 1024
        });
    const [header, ...lines] = output.trim().split('\n').map(row => row.split(','));
    const columns = [ -1, 1 ].flatMap(
        side => ['row', 'recover'].map(name => header.indexOf(name + ':muscle:' + side)));
    assert.ok(columns.every(i => i > 0));
    const rows =
        lines.map(row => [Number(row[0]), ...columns.map(i => Math.max(0, Number(row[i])))]);
    const between = (lo, hi) => rows.filter(row => row[0] > lo && row[0] <= hi);
    const mean = (i, lo, hi) => {
      const part = between(lo, hi);
      return part.reduce((sum, row) => sum + row[i], 0) / part.length;
    };
    const steady = between(1800, 2500);
    for (const first of [1, 3]) {
      const strength = (mean(first, 1800, 2500) + mean(first + 1, 1800, 2500)) / 2;
      assert.ok(strength > .15, 'The fin request develops both antagonist commands');
      const overlap = steady.reduce((sum, row) => sum + Math.min(row[first], row[first + 1]), 0);
      const activity = steady.reduce((sum, row) => sum + Math.max(row[first], row[first + 1]), 0);
      assert.ok(overlap < .1 * activity, 'A fin alternates its own pull and return commands');
      for (const i of [first, first + 1]) {
        assert.ok(mean(i, 4950, 5200) < .3 * strength, 'Both antagonists rest after the request');
        const start = first === 1 ? 3100 : 3700, other = i <= 2 ? i + 2 : i - 2;
        assert.ok(mean(i, start, start + 200) > .15,
                  'The active fin keeps both phases while the opposite fin rests');
        assert.ok(mean(other, start, start + 200) < .3 * mean(i, start, start + 200),
                  'Each fin has its own request gate');
      }
    }
    cycles.push(steady.slice(1)
                    .filter((row, i) => row[1] - row[2] > .05 && steady[i][1] - steady[i][2] <= .05)
                    .length);
  }
  assert.ok(cycles[1] > cycles[0] * 1.5, 'The fin period changes independently of the tail period');
}

async function checkReversePattern(model, sites, root) {
  const {sitePoint} = await import('../ui/studio/model/layout.js');
  const {siteRole} = await import('../ui/studio/model/organs.js');
  let doc = model.newDocument('Rückwärts');
  const ids = {}, names = new Map();
  for (const [name, type, address] of [[ 'motor', 'motor', 422 ], [ 'spine', 'spine', 704 ],
                                       [ 'balance', 'balance', 105 ], [ 'pain', 'pain', 169 ],
                                       [ 'row', 'muscle', 676 ], [ 'reverse', 'muscle', 293 ]]) {
    const made = model.addOrgan(doc, type, sites,
                                sitePoint(sites.find(s => s.id === address), siteRole(type)),
                                Infinity, true);
    assert.ok(made);
    doc = made.document;
    ids[name] = made.organId;
    const organ = model.findOrgan(doc, made.organId);
    names.set(organ.id, name);
    names.set(organ.pair, name);
  }
  const {updateRegion} = await import('../ui/studio/model/regions.js');
  doc = updateRegion(doc, ids.motor, {retreat : 1, compete : 0, beat : 0, tone : 0}, sites);
  const port = (id, slot) => ({kind : 'slot', id, slot});
  for (const [from, to, pairing] of [
           [ {kind : 'organ', id : ids.balance}, port(ids.motor, 'toward'), 'same' ],
           [ {kind : 'organ', id : ids.pain}, port(ids.motor, 'back'), 'same' ],
           [ port(ids.motor, 'fins'), port(ids.spine, 'fin'), 'cross' ],
           [ port(ids.spine, 'row'), {kind : 'organ', id : ids.row}, 'same' ],
           [ port(ids.motor, 'reverse'), {kind : 'organ', id : ids.reverse}, 'same' ]]) {
    const wired = model.connectSelections(doc, from, to, sites);
    assert.ok(wired);
    doc = model.updateWire(wired.document, wired.document.wires.at(-1).id, {pairing});
  }
  const plan = model.compileDocument(doc, sites), centers = model.allCenters(doc);
  plan.groups.forEach((g, i) => {
    const c = centers[i];
    g.name = names.get(c.organId) + ':' + (c.node ?? c.key) + ':' + g.side;
  });
  const output = execFileSync(
      'python3',
      [
        '-B', '-c',
        'import json,sys,subprocess; from atelier_service import encode_plan; print(subprocess.check_output(sys.argv[1:], input=encode_plan(json.load(sys.stdin)), text=True), end="")',
        join(resolve(process.env.BUILD_DIR ?? join(root, 'bin')), 'compiler-tests'), 'motor-reverse'
      ],
      {
        cwd : root,
        input : JSON.stringify(plan),
        encoding : 'utf8',
        timeout : 10000,
        maxBuffer : 8 * 1024 * 1024
      });
  const [header, ...lines] = output.trim().split('\n').map(row => row.split(','));
  const rows = lines.map(row => row.map(Number));
  const mean = (node, side, from, to) => {
    const index = header.indexOf(node + ':muscle:' + side);
    assert.ok(index > 0);
    const part = rows.filter(row => row[0] > from && row[0] <= to);
    return part.reduce((sum, row) => sum + Math.max(0, row[index]), 0) / part.length;
  };
  for (const side of [-1, 1]) {
    const cruising = mean('row', side, 2200, 2800);
    assert.ok(cruising > .2, 'The crossed fin request produces normal rowing');
    assert.ok(mean('reverse', side, 2200, 2800) < .1 * cruising,
              'Rowing does not activate the reverse muscle');
    for (const from of [3200, 3800])
      assert.ok(mean('row', side, from, from + 200) < .2 * cruising,
                'A retreat stops both rowers despite the crossed request wiring');
    const from = side < 0 ? 3200 : 3800;
    assert.ok(mean('reverse', side, from, from + 200) > .25,
              'A first late retreat develops a direct reverse command');
    assert.ok(mean('reverse', -side, from, from + 200) < .1,
              'The direct reverse command keeps the requested side');
    assert.ok(mean('row', side, 4400, 4700) > .5 * cruising, 'Rowing returns after retreat ends');
    assert.ok(mean('reverse', side, 4400, 4700) < .1 * cruising,
              'The reverse muscle rests when normal rowing returns');
  }
}

async function checkResponseControls(model, capabilities, clicks) {
  const {responseHandle, responsePatch, responseTrace} =
      await import('../ui/studio/view/response.js');
  const {regionSettings} = await import('../ui/studio/view/circuit.js');
  const {settleRegions, updateRegion} = await import('../ui/studio/model/regions.js');
  const {HORMONE_EFFECT} = await import('../ui/schema.js');
  const sites = capabilities.sites;
  const placed =
      model.addOrgan(model.newDocument('Reizantwort'), 'choice', sites, {x : 600, y : 300});
  const organ = model.findOrgan(placed.document, placed.organId);
  const center = organ.centers.find(c => c.node === 'threat');
  assert.equal(center.q2, .5, 'A choice listener preserves a sustained cue');
  const bladder = model.addOrgan(placed.document, 'bladder', sites, {x : 650, y : 365});
  const sac = model.findOrgan(bladder.document, bladder.organId);
  assert.deepEqual(sac.centers.filter(c => c.key === 'float').map(c => c.copies), [ 16, 16, 16 ]);
  const reduced = model.setOrganNodes(bladder.document, bladder.organId, 2, sites);
  assert.equal(model.findOrgan(reduced, bladder.organId).centers.length, 3,
               'Resizing the bladder retains its depth sensor');
  const context = {
    scale : capabilities.biasScale,
    excitation : 0,
    output : 1,
    adaptationSpan : capabilities.neural.adaptationSpan,
    pace : 0,
    rhythmEffect : 0
  };
  for (const [q2, tau, sign] of [[ 0, .1, 1 ], [ .5, .5, 1 ], [ 1, 1, -1 ]]) {
    const cell = {...center, q2, tau, sign};
    const point = responseHandle(cell, context);
    const back = responsePatch(cell, point.fx, point.fy, context);
    assert.ok(Math.abs(back.tau - tau) < 1e-9);
    assert.ok(Math.abs(back.threshold - cell.threshold) < 1e-9);
  }
  for (const pace of [0, 1])
    for (const sign of [-1, 1])
      for (const q1 of [0, .4, 1])
        for (const q2 of [0, .25, .5, .75, 1]) {
          const cell = {...center, q1, q2, sign, tau : .6, threshold : 0};
          const situation = {...context, pace, excitation : .2, output : .7};
          for (const [handle, property] of [[ 'filter', 'q2' ], [ 'rectify', 'q1' ]]) {
            const at = responseHandle(cell, situation, handle);
            const back = responsePatch(cell, at.fx, at.fy, situation, handle);
            assert.ok(Math.abs(back[property] - cell[property]) < 1e-8,
                      'A curve grip retains its value for either sign and with rhythm');
          }
          if (pace) {
            const at = responseHandle(cell, situation);
            const back = responsePatch(cell, at.fx, at.fy, situation);
            assert.ok(Math.abs(back.tau - cell.tau) < 1e-8);
            assert.ok(Math.abs(back.threshold - cell.threshold) < 1e-8);
          }
        }
  const held = responseTrace(center, context);
  assert.ok(Math.abs(held.points[held.on + 1].value - held.points[held.off - 1].value) < 1e-9);
  const fading = responseTrace({...center, q2 : 0}, context);
  assert.ok(fading.points[fading.off - 1].value < fading.points[fading.on + 1].value / 2);
  const memory = responseTrace({...center, q2 : 1}, context);
  assert.ok(memory.points[memory.off + 1].value > held.points[held.off + 1].value);
  const point = responseHandle({...center, q2 : 1}, context);
  const patch = responsePatch({...center, q2 : 1}, point.fx + .08, point.fy - .025, context);
  let changed = model.updateCenter(placed.document, center.id, {q2 : 1, ...patch});
  changed = settleRegions(changed, sites);
  model.validateDocument(changed);
  const actual = model.findCenter(changed, center.id).center;
  assert.ok(actual.tau > center.tau);
  assert.ok(actual.threshold < center.threshold);
  assert.deepEqual(actual.receptors, center.receptors,
                   'Dragging a response must not silently enable a permanent pacer');
  const twin = model.findOrgan(changed, organ.pair).centers.find(c => c.node === center.node);
  assert.ok(Math.abs(twin.tau - actual.tau) < 1e-9);
  assert.ok(Math.abs(twin.threshold - actual.threshold) < 1e-9);
  const editor = {state : {document : changed}, changeDocument(doc) { this.state.document = doc; }};
  const click = clicks.find(([ selector ]) => selector === '[data-response-cell]')[1];
  click(editor,
        {dataset : {responseCell : center.id, responseProperty : 'q2', responseValue : '0'}});
  assert.equal(model.findCenter(editor.state.document, center.id).center.q1, actual.q1,
               'Choosing a time response keeps rectification independent');
  const group =
      model.compileDocument(changed, sites).groups.find(g => g.threshold === actual.threshold);
  assert.ok(group && group.tau === actual.tau && group.q2 === 1);
  const state = {document : changed, sites, capabilities};
  const html = regionSettings(state, model.findOrgan(changed, organ.id));
  assert.match(html, /data-region-handle="search"/);
  assert.doesNotMatch(html, /data-region-setting="(?:time|threshold|response|effect)"/);
  const {inspector} = await import('../ui/studio/view/panels.js');
  const selectedCell =
      inspector({...state, multi : new Set(), selected : {kind : 'center', id : center.id}});
  assert.match(selectedCell, /data-circuit-node=/);
  assert.match(selectedCell, /aid-region-graph-node selected/);
  assert.match(selectedCell, /data-response-handle="filter"/);
  assert.match(selectedCell, /data-response-handle="rectify"/);
  assert.doesNotMatch(selectedCell, /aid-center-tabs|aid-response-choices/);
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const {driveContext} = await import('../ui/studio/view/preview.js');
  const studio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
  Object.assign(studio.state, state,
                {station : 'studio', selected : {kind : 'organ', id : organ.id}});
  let requests = 0;
  studio.requestDesign = () => ++requests;
  studio.persist = () => {};
  const animation = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    studio.handleDrag = {id : center.id, rect : {left : 0, top : 0, width : 360, height : 220}};
    const at = responseHandle(actual, driveContext(studio.state, actual));
    for (const offset of [.015, .03])
      studio.responsePointer({clientX : (at.fx + offset) * 360, clientY : at.fy * 220 - 1});
    assert.equal(requests, 0, 'Dragging redraws the curve without rebuilding the fish');
    studio.settleGraphic();
    assert.equal(studio.undoHistory.length, 1, 'One drag is one undo step');
    const dragged = studio.state.document;
    studio.stepHistory('undo');
    assert.deepEqual(studio.state.document, changed);
    studio.stepHistory('redo');
    assert.deepEqual(studio.state.document, dragged);
    const graphic = {dataset : {response : center.id}};
    studio.responseKey({
      key : 'ArrowDown',
      preventDefault() {},
      target : {closest : () => ({closest : () => graphic})}
    });
    assert.deepEqual(studio.state.selected, {kind : 'organ', id : organ.id});
  } finally {
    globalThis.requestAnimationFrame = animation;
    globalThis.cancelAnimationFrame = cancel;
  }
}

async function checkFunctionalRegions(model, capabilities) {
  const {ORGAN_BY_KEY, ORGANS} = await import('../ui/studio/model/organs.js');
  const {regionPlan, updateRegion} = await import('../ui/studio/model/regions.js');
  const {regionPicture, regionHandle, regionPatch, REGION_PICTURE} =
      await import('../ui/studio/view/region_controls.js');
  const {HORMONE_EFFECT : E} = await import('../ui/schema.js');
  const {sites} = capabilities;
  assert.deepEqual(ORGANS.filter(o => o.category === 'regions').map(o => o.key).sort(),
                   [ 'choice', 'motor', 'olfaction', 'spine', 'state', 'tectum', 'value' ]);
  const cases = [
    [
      'spine', {cycle : .41, finCycle : .73, alternation : .83},
      [ 'spine', 'finCycle', 'alternation' ]
    ],
    [ 'choice', {searchTime : .61, searchDrive : .73}, [ 'search' ] ],
    [ 'olfaction', {smoothing : .47, contrast : .62}, [ 'scent' ] ],
    [ 'state', {reserve : .42, rest : .37, maturity : .67}, [ 'reserve', 'rest', 'maturity' ] ],
    [ 'value', {features : 3, association : .53, teaching : .8}, [ 'association' ] ],
    [ 'motor', {beat : 1, pump : 3, retreat : 1}, [ 'beat', 'pump' ] ],
    [ 'tectum', {resolution : 3, contrast : 2}, [] ]
  ];
  for (const [type, patch, handles] of cases) {
    const made = model.addOrgan(model.newDocument(type), type, sites, {x : 610, y : 315});
    const doc = updateRegion(made.document, made.organId, patch, sites);
    for (const built of [made.document, doc])
      for (const region of built.organs.filter(o => o.type === type))
        for (const node of regionPlan(built, region).nodes) {
          const center = region.centers.find(c => c.node === node.node);
          for (const [effect, values] of Object.entries(node.effects ?? {}))
            for (const [key, value] of Object.entries(values))
              assert.equal(center.receptors[effect][key], value,
                           `${type}.${node.node}: ${effect}.${key} follows its own role`);
        }
    model.validateDocument(JSON.parse(JSON.stringify(doc)));
    const organ = model.findOrgan(doc, made.organId), twin = model.findOrgan(doc, organ.pair);
    const html = regionPicture({document : doc, sites, capabilities}, organ);
    assert.match(html, /data-region-picture/);
    assert.doesNotMatch(html, /NaN|undefined|Infinity|type="range"/);
    if ([ 'choice', 'olfaction', 'state' ].includes(type)) {
      const {LONGEST_TIME_CONSTANT} = await import('../ui/tuning.js');
      const span = capabilities.neural.adaptationSpan;
      const duration = LONGEST_TIME_CONSTANT * span * (type === 'olfaction' ? 4 : 1);
      const visible = html.replace(/<title>.*?<\/title>/g, '');
      assert.ok(visible.includes('>' + duration + ' Schritte<'),
                'Regional time axes visibly include the native adaptation span');
      const changedSpan =
          regionPicture({
            document : doc,
            sites,
            capabilities :
                {...capabilities, neural : {...capabilities.neural, adaptationSpan : 2 * span}}
          },
                        organ)
              .replace(/<title>.*?<\/title>/g, '');
      assert.ok(changedSpan.includes('>' + (2 * duration) + ' Schritte<'));
      if (type === 'olfaction')
        assert.match(visible, /class="aid-picture-note"/);
      if (type === 'state')
        assert.match(visible, /Hemmung am Mangelkreis/,
                     'The state curve names the actual inhibitory input');
    }

    for (const key of handles) {
      const point = regionHandle(organ, key), back = regionPatch(organ, key, point.fx, point.fy);
      for (const [name, value] of Object.entries(back))
        assert.ok(Math.abs(value - organ.region[name]) < 1e-8, type + ':' + name);
    }
    if (twin)
      for (const key of Object.keys(patch))
        assert.equal(twin.region[key], organ.region[key]);
    const plan = model.compileDocument(doc, sites),
          node = key => organ.centers.find(c => c.node === key);
    const group = key => plan.groups[model.allCenters(doc).findIndex(c => c.id === node(key).id)];
    if (type === 'spine') {
      const clock = (html, name) =>
          html.match(new RegExp('<g data-clock="' + name + '">(.*?)</g>'))[1];
      const slower = updateRegion(doc, organ.id, {cycle : 1}, sites);
      const changed = regionPicture({document : slower, sites, capabilities},
                                    model.findOrgan(slower, organ.id));
      assert.notEqual(clock(html, 'tail'), clock(changed, 'tail'),
                      'Changing the tail period changes the drawn clock');
      assert.equal(clock(html, 'fin'), clock(changed, 'fin'),
                   'The independent fin period is preserved');
    }
    if (type === 'olfaction') {
      assert.equal(group('concentration').q2, 1);
      assert.ok(Math.abs(group('concentration').tau - (.47)) < 1e-8);
      assert.ok(Math.abs(group('opposite').tau - (.47)) < 1e-8);
      assert.ok(Math.abs(node('opposite').receptors[E.output].baseline - .24) < 1e-8);
      const custom = model.updateReceptor(doc, node('opposite').id, E.output,
                                          {baseline : .12, sensitivity : -.4, substance : 2});
      const adjusted = updateRegion(custom, organ.id, {contrast : .8}, sites);
      const response = model.findCenter(adjusted, node('opposite').id).center.receptors[E.output];
      assert.ok(Math.abs(response.baseline - .6) < 1e-8,
                'The regional control also changes a manually tuned field');
      assert.equal(response.sensitivity, -.4, 'The separate hormonal tuning survives');
      assert.equal(response.substance, 2);
      const direct = updateRegion(doc, organ.id, {smoothing : 0}, sites);
      assert.equal(model.findOrgan(direct, organ.id).centers[0].q2, .5);
    }
    if (type === 'state') {
      assert.ok(Math.abs(group('pause').tau - (.37)) < 1e-8);
      assert.ok(Math.abs(group('deficit').threshold - (-.42)) < 1e-8);
      for (const key of ['investment', 'eggReady', 'spermReady'])
        assert.ok(Math.abs(node(key).receptors[E.output].half - (.67)) < 1e-8);
    }
    if (type === 'choice') {
      assert.ok(Math.abs(group('seen').tau - (.61)) < 1e-8);
      assert.ok(Math.abs(group('pause').tau - (.61)) < 1e-8);
      assert.equal(group('seen').q2, 0);
      assert.equal(group('pause').q2, 1);
      assert.ok(Math.abs(node('search').receptors[E.output].baseline - .46) < 1e-8);
      const {OrganStudio} = await import('../ui/studio/controller.js');
      const studio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
      Object.assign(studio.state, {
        document : doc,
        sites,
        capabilities,
        station : 'studio',
        selected : {kind : 'organ', id : organ.id}
      });
      let builds = 0;
      studio.requestDesign = () => ++builds;
      studio.persist = () => {};
      const animation = globalThis.requestAnimationFrame, cancel = globalThis.cancelAnimationFrame;
      globalThis.requestAnimationFrame = () => 1;
      globalThis.cancelAnimationFrame = () => {};
      try {
        const p = regionHandle(organ, 'search');
        studio.handleDrag = {
          id : organ.id,
          handle : 'search',
          rect : {left : 0, top : 0, width : REGION_PICTURE.width, height : REGION_PICTURE.height}
        };
        studio.regionPointer({
          clientX : p.fx * REGION_PICTURE.width + 20,
          clientY : p.fy * REGION_PICTURE.height - 10
        });
        assert.equal(builds, 0, 'Region dragging does not rebuild the fish on every move');
        studio.settleGraphic();
        assert.equal(studio.undoHistory.length, 1);
        assert.notEqual(model.findOrgan(studio.state.document, organ.id).region.searchTime, .61);
        studio.stepHistory('undo');
        assert.deepEqual(studio.state.document, doc);
      } finally {
        globalThis.requestAnimationFrame = animation;
        globalThis.cancelAnimationFrame = cancel;
      }
    }
    if (type === 'value') {
      assert.ok(Math.abs(group('feature3').learning_tau - (.53)) < 1e-8);
      assert.ok(Math.abs(group('feature3').teaching_limit - (.8)) < 1e-8);
      const first = model.findOrgan(made.document, made.organId).centers[0];
      const tuned = model.updateReceptor(made.document, first.id, E.teaching,
                                         {active : 1, baseline : .73, sensitivity : .41});
      const expanded = updateRegion(tuned, made.organId, {features : 3}, sites);
      const features = model.findOrgan(expanded, made.organId).centers;
      assert.deepEqual(features.find(c => c.node === 'feature3').receptors,
                       features.find(c => c.node === 'feature1').receptors,
                       'New features inherit hormonal tuning from equivalent cells');
    }
  }
}

async function checkTectumPicture(model, capabilities) {
  const {regionPicture} = await import('../ui/studio/view/region_controls.js');
  const {regionPlan, updateRegion} = await import('../ui/studio/model/regions.js');
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const {sites} = capabilities;
  const eye = model.addOrgan(model.newDocument('Sehkarte'), 'eye', sites, {x : 345, y : 290});
  let doc = model.updateField(eye.document, eye.organId, {lo : 20, hi : 105}, sites);
  for (let i = 0; i < 2; ++i)
    doc = model.updateField(doc, eye.organId, {
      addProfile :
          {id : 'colour-' + i, q1 : .4 * i, q2 : -1, qwidth : .15, threshold : -.6, polarity : 0}
    },
                            sites);
  const added = model.addOrgan(doc, 'tectum', sites, {x : 610, y : 315});
  const source = model.findOrgan(added.document, eye.organId);
  const organ = added.document.organs.find(o => o.type === 'tectum' && o.side !== source.side);
  doc = model
            .connectSelections(added.document, {kind : 'organ', id : source.id},
                               {kind : 'organ', id : organ.id})
            .document;
  const studio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
  Object.assign(studio.state,
                {document : doc, sites, capabilities, selected : {kind : 'organ', id : organ.id}});
  studio.changeDocument = changed => { studio.state.document = changed; };
  const choose = (key, value) => {
    let prevented = false;
    const button = {
      dataset : {regionSetting : key, regionValue : String(value), organId : organ.id}
    };
    assert.equal(studio.regionKey({
      key : 'Enter',
      preventDefault() { prevented = true; },
      target : {closest : () => button}
    }),
                 true);
    assert.ok(prevented);
  };
  const current = () => model.findOrgan(studio.state.document, organ.id);
  const picture = () => regionPicture(studio.state, current());
  choose('resolution', 6);
  let html = picture();
  assert.match(html, /Sehfeld: 20–105°/);
  assert.match(html, new RegExp('data-tectum-side="' + source.side + '"'));
  assert.doesNotMatch(html, new RegExp('data-tectum-side="' + organ.side + '"'),
                      'Crossed nerves display the eye side, not the brain region side');
  assert.equal((html.match(/data-tectum-band=/g) ?? []).length, 6);
  assert.match(html, /data-region-setting="resolution" data-region-value="6"/);
  choose('colours', 1);
  html = picture();
  assert.equal((html.match(/data-tectum-channel="2"/g) ?? []).length, 2);
  assert.doesNotMatch(html, /data-region-setting="resolution" data-region-value="3"/,
                      'Three colour types leave room for two directional bands');
  const plan = regionPlan(studio.state.document, current());
  for (const node of plan.nodes.filter(n => n.band))
    assert.ok(html.includes('data-tectum-band="' + node.band.join(':') + '"'));
  assert.equal(model.findOrgan(studio.state.document, current().pair).region.colours, 1);
  choose('contrast', 2);
  assert.match(picture(), /class="tectum-inhibition"/);
  choose('contrast', 0);
  assert.doesNotMatch(picture(), /class="tectum-inhibition"/);
  assert.doesNotMatch(picture(), /NaN|undefined|Infinity|data-region-handle/);
  studio.state.document =
      model.updateField(studio.state.document, source.id, {lo : 30, hi : 90}, sites);
  assert.match(picture(), /Sehfeld: 30–90°/, 'Moving the eye field moves its regional map');
  current().region.cut = [ 'map0>map1' ];
  assert.match(picture(), /aid-picture-note/, 'A changed circuit is identified as a template view');
}

async function checkHormoneSystems(model, capabilities) {
  const {sites} = capabilities;
  const {HORMONE_EFFECT : E} = await import('../ui/schema.js');
  const {slotCenters, nerveClass} = await import('../ui/studio/model/organs.js');
  const {routedLinks} = await import('../ui/studio/model/regions.js');
  const {placeSystem, systemMissing} = await import('../ui/studio/model/systems.js');
  const {exampleDocument} = await import('../ui/studio/model/example.js');
  const example = exampleDocument({fish : 'B', growth : 'W'}, sites, capabilities);
  model.validateDocument(example);
  assert.ok(!example.organs.some(o => ['circuit', 'rhythm', 'teaching'].includes(o.type)));
  for (const type of ['tectum', 'olfaction', 'value', 'choice', 'state', 'motor'])
    assert.ok(example.organs.some(o => o.type === type), type);
  const state = example.organs.find(o => o.type === 'state');
  const choice = example.organs.find(o => o.type === 'choice');
  assert.equal(example.organs.filter(o => o.type === 'state').length, 1);
  assert.equal(systemMissing(example, 'growth'), 'needs');
  assert.equal(systemMissing(example, 'unknown'), 'needs');
  const bodyWires = example.wires.filter(w => w.from === state.id || w.to === state.id);
  const reward = placeSystem(example, 'reward', sites, capabilities, {x : 500, y : 400}, 'R');
  assert.ok(reward);
  assert.equal(reward.document.organs.length, example.organs.length + 1,
               'A food hormone reuses the existing body region and adds only its gland');
  assert.deepEqual(reward.document.wires.filter(w => bodyWires.some(old => old.id === w.id)),
                   bodyWires);
  for (const center of state.centers)
    assert.deepEqual(model.findCenter(reward.document, center.id).center.receptors[E.learning],
                     center.receptors[E.learning]);
  const alarm = placeSystem(example, 'alarm', sites, capabilities, {x : 500, y : 400}, 'A');
  assert.ok(alarm);
  assert.equal(alarm.document.organs.length, example.organs.length + 1);
  assert.deepEqual(
      model.findOrgan(alarm.document, choice.id).centers.filter(c => c.node !== 'threat'),
      choice.centers.filter(c => c.node !== 'threat'),
      'Adding an alarm keeps the unrelated parts of an existing choice region');
  for (const [added, expected] of [[ reward, 'intake' ], [ alarm, 'threat' ]]) {
    const gland = model.findOrgan(added.document, added.organId);
    const targets = new Set([ gland.id, ...gland.centers.map(c => c.id) ]);
    const incoming = routedLinks(added.document, sites).filter(l => targets.has(l.to));
    assert.ok(incoming.length);
    assert.ok(
        incoming.every(l => model.findCenter(added.document, l.from).center.node === expected),
        'Only the selected food/threat signal reaches the gland');
  }
  const bare =
      model.addOrgan(model.newDocument('Alarm'), 'muscle', sites, {x : 890, y : 350}).document;
  const fresh = placeSystem(bare, 'alarm', sites, capabilities, {x : 500, y : 400}, 'A');
  model.validateDocument(fresh.document);
  const hubs = fresh.document.organs.filter(o => o.type === 'choice');
  const gland = model.findOrgan(fresh.document, fresh.organId).centers[0];
  const sources = hubs.flatMap(o => slotCenters(o, 'avoid', 'out'));
  assert.equal(hubs.length, 2);
  assert.ok(sources.every(c => c.threshold < 0 && nerveClass(c).pace === 0));
  const idle =
      sources.reduce((sum, c) => sum + c.copies * Math.tanh(-capabilities.biasScale * c.threshold) *
                                           gland.electrical_limit,
                     0);
  assert.ok(idle > 0 && idle < capabilities.biasScale * gland.threshold,
            'Late pain can learn without resting activity secreting an alarm');
  assert.equal(systemMissing(fresh.document, 'alarm'), 'needs');
  for (const result of [alarm, fresh]) {
    const painLinks = routedLinks(result.document, sites).filter(l => l.wire.toPort === 'threat');
    assert.ok(painLinks.length);
    for (const link of painLinks)
      assert.equal(model.organOf(result.document, link.from).side,
                   model.organOf(result.document, link.to).side,
                   'Pain keeps its side before hormone pooling');
    for (const organ of result.document.organs.filter(o => o.type === 'choice')) {
      const threat = organ.centers.find(c => c.node === 'threat');
      assert.equal(threat.pace, -1);
      assert.equal(threat.threshold, -.05);
      assert.equal(threat.receptors[E.rhythm].active, 0);
      assert.equal(threat.receptors[E.learning].baseline, 1);
    }
  }
  const strength =
      fresh.document.organs.find(o => o.type === 'muscle').centers[0].receptors[E.excitation];
  assert.equal(strength.substance, fresh.substance);
  assert.equal(model.effectDirection(E.excitation, strength), 1);
  return {example, alarm : fresh};
}

(async () => {
  const root = join(__dirname, '..');
  const {ANATOMY, CONTRAST_POLARITY, HORMONE_EFFECT, HORMONES, MOTOR_KIND, TUNING} =
      await import('../ui/schema.js');
  const colourType = (id, q1, qwidth) =>
      ({id, q1, q2 : -1, qwidth, threshold : -.6, polarity : CONTRAST_POLARITY.bright});
  const {
    ORGANS,
    ORGAN_BY_KEY,
    eligible,
    functionFor,
    kindLimit,
    musclePlaces,
    nerveKind,
    nodeLimit,
    organFunction,
    PRESSURE_OF,
    isGillFlank,
    isGutWall,
    organSlots,
    siteRole
  } = await import('../ui/studio/model/organs.js');
  const {t, useTexts} = await import('../ui/strings.js');
  useTexts({default : 'de'}, {
    de : Object.fromEntries([
      'studio', 'organ_graphics', 'organ_readout', 'brain', 'units', 'labor', 'feeding_view'
    ].map(area => [area, JSON.parse(readFileSync(join(root, `ui/text/de/${area}.json`), 'utf8'))]))
  });
  await checkLiveFounders();
  if (process.argv.includes('--live-station')) {
    console.log('Labor/Zucht: Fischauswahl, Katalogwechsel und verspätete Antworten: OK');
    return;
  }
  await checkVariationPictures();
  {
    const {
      NEURON,
      NEURON_PARAMETER,
      EFFECTOR,
      ORGAN_PORT,
      STROKE,
      STROKE_KIND,
      FISH,
      MUSCLE_FIBRE
    } = await import('../ui/schema.js');
    const readout = await import('../ui/organ_readout.js');
    const {sceneState, updateSceneState} = await import('../ui/state.js');
    const {motorTissue} = await import('../ui/tissue.js');
    (await import('../ui/brain.js')).initialize([ 'brainClamp' ]);
    readout.initialize([ 'organNumber', 'organPercent' ]);
    const nodes = [ 0, 1 ].map((tau, i) => {
      const n = Array(NEURON.count).fill(0);
      n[NEURON.index] = i;
      n[NEURON.strength] = n[NEURON.ready] = n[NEURON.functional] = 1;
      n[NEURON.parameters] = [];
      n[NEURON.parameters][NEURON_PARAMETER.time_constant] = tau;
      return n;
    });
    const stroke = Array(STROKE.count).fill(0), p = Array(FISH.count).fill(0);
    stroke[STROKE.steps] = 12;
    const strokes = [];
    strokes[STROKE_KIND.tail_left] = stroke;
    const d = {
      p,
      nodes : new Map(nodes.map(n => [n[NEURON.index], n])),
      receptors : new Map(),
      b : {
        strokes,
        stroke_threshold : .2,
        effectors : nodes.map((n, i) => {
          const e = Array(EFFECTOR.count).fill(0);
          e[EFFECTOR.neuron] = n[NEURON.index];
          e[EFFECTOR.port] = ORGAN_PORT.forward;
          e[EFFECTOR.fibre] = 1 - i;
          e[EFFECTOR.strength] = i ? MUSCLE_FIBRE.force_slow : MUSCLE_FIBRE.force_fast;
          return e;
        })
      }
    };
    const tissue = {
      key : motorTissue(MOTOR_KIND.forward),
      side : 0,
      members : nodes.map(n => ({n, part : {share : 1}}))
    };
    const before = sceneState.frame;
    updateSceneState({frame : {parameters : {}}});
    try {
      for (const size of [1, 2]) {
        d.b.effectors[0][EFFECTOR.strength] = size * MUSCLE_FIBRE.force_fast;
        const forceMix = size * MUSCLE_FIBRE.force_fast /
                         (size * MUSCLE_FIBRE.force_fast + MUSCLE_FIBRE.force_slow);
        stroke[STROKE.fibre] = forceMix;
        for (const reserve of [0, .2, 1]) {
          stroke[STROKE.reserve] = reserve;
          const actual = readout.brainOrganReadout(d, tissue).fibre;
          assert.equal(actual.fast, size / (size + 1),
                       'The fibre picture shows the tissue share before its force multiplier');
          assert.equal(actual.forceMix, forceMix,
                       'The force mix comes from the active engine stroke');
          assert.ok(Math.abs(actual.available - (1 - forceMix + forceMix * reserve)) < 1e-12,
                    'Mixed cells show the force their fast fibres can still contribute');
        }
      }
    } finally {
      updateSceneState({frame : before});
    }
  }
  {
    const {NEURON, EFFECTOR, ORGAN_PORT} = await import('../ui/schema.js');
    const {brainMotorActivity} = await import('../ui/brain_signals.js');
    const {initialize : initializeBrain} = await import('../ui/brain.js');
    initializeBrain([ 'brainClamp' ]);
    const n = Array(NEURON.count).fill(0), e = Array(EFFECTOR.count).fill(0);
    n[NEURON.index] = 0;
    n[NEURON.state] = n[NEURON.activity] = .9;
    n[NEURON.ready] = n[NEURON.functional] = 1;
    e[EFFECTOR.port] = ORGAN_PORT.forward;
    const d = {effectors : new Map([ [ 0, [ e ] ] ])};
    assert.equal(brainMotorActivity(n, MOTOR_KIND.forward, d), 0,
                 'Membrane activity alone never animates an organ');
    n[NEURON.command] = .7;
    assert.equal(brainMotorActivity(n, MOTOR_KIND.forward, d), .7,
                 'The organ view follows its actual command');
  }
  const model = {
    ...await import('../ui/studio/model/document.js'),
    ...await import('../ui/studio/model/assemblies.js'),
    ...await import('../ui/studio/model/trace.js')
  };
  for (const v of [0, 1 / 3, 2 / 3, 1])
    for (const w of [0, 1 / 3, 2 / 3, 1]) {
      const a = {v}, b = {v : w}, sensor = {role : 'sensor'}, nerve = {role : 'nerve'},
            motor = {role : 'motor'};
      assert.ok(model.validCellLink(sensor, a, nerve, b));
      assert.ok(model.validCellLink(nerve, a, nerve, b));
      assert.ok(model.validCellLink(nerve, a, motor, b));
      assert.ok(!model.validCellLink(sensor, a, motor, b));
    }
  const views = {
    ...await import('../ui/studio/view/scene.js'),
    ...await import('../ui/studio/view/placing.js'),
    ...await import('../ui/studio/view/body.js'),
    ...await import('../ui/studio/view/places.js'),
    ...await import('../ui/studio/view/names.js')
  };
  const panels = {
    ...await import('../ui/studio/view/panels.js'),
    ...await import('../ui/studio/view/library.js'),
    ...await import('../ui/studio/view/substances.js')
  };
  const graph = await import('../ui/studio/view/graph.js');
  const {OrganStudio} = await import('../ui/studio/controller.js');
  const sitesResult =
      JSON.parse(execFileSync(join(resolve(process.env.BUILD_DIR ?? join(root, 'bin')), 'atelier'),
                              [ 'sites' ], {encoding : 'utf8', timeout : 10000}));
  if (process.argv.includes('--canvas')) {
    await require('./studio_canvas.js')(model, sitesResult, root);
    console.log('Atelier: 20/40 Regionen, Zoom, ZNS-Kabel, Reizpfade und Klickplatzierung: OK');
    return;
  }
  if (process.argv.includes('--spine') || process.argv.includes('--fin') ||
      process.argv.includes('--reverse')) {
    if (process.argv.includes('--spine')) {
      await checkSpinalPattern(model, sitesResult.sites, root);
      await checkSpinalRest(model, sitesResult.sites, root);
    }
    if (!process.argv.includes('--reverse'))
      await checkFinPattern(model, sitesResult.sites, root);
    if (!process.argv.includes('--fin'))
      await checkReversePattern(model, sitesResult.sites, root);
    await checkFunctionalRegions(model, sitesResult);
    console.log('Atelier: angeforderte Bewegungsregionen und ihre Bedienung: OK');
    return;
  }
  const clicks = (await import('../ui/studio/events.js')).FISH_CLICKS;
  await checkInspectorSubstances(model, sitesResult, clicks);
  if (process.argv.includes('--ui') && process.argv.includes('--region-controls')) {
    await checkResponseControls(model, sitesResult, clicks);
    await checkFunctionalRegions(model, sitesResult);
    await checkTectumPicture(model, sitesResult);
    console.log('Atelier: Reizantwort, Regionsbilder, Bedienpunkte und Seitenkopplung: OK');
    return;
  }
  await checkTectumPicture(model, sitesResult);
  const hormoneSystems = await checkHormoneSystems(model, sitesResult);
  if (!process.argv.includes('--ui')) {
    if (process.argv.includes('--hormone-systems')) {
      const result = JSON.parse(execFileSync(
          'python3',
          [
            '-B', '-c',
            "import json,sys; from atelier_service import run; r=run({'operation':'build','plan':json.load(sys.stdin)}); print(json.dumps({k:r[k] for k in ('compiler','viable','neurons','synapses')}))"
          ],
          {
            cwd : root,
            input :
                JSON.stringify(model.compileDocument(hormoneSystems.example, sitesResult.sites)),
            encoding : 'utf8',
            timeout : 60000,
            maxBuffer : 8 * 1024 * 1024
          }));
      assert.ok(result.compiler.ok, JSON.stringify(result.compiler));
      assert.ok(result.viable);
      console.log('Atelier: Hormonregionen, getrennte Anschlüsse und Beispielfisch: OK',
                  result.neurons, result.synapses);
      return;
    }
    if (!process.argv.includes('--blueprints')) {
      await checkSpinalPattern(model, sitesResult.sites, root);
      await checkSpinalRest(model, sitesResult.sites, root);
      await checkFinPattern(model, sitesResult.sites, root);
      await checkReversePattern(model, sitesResult.sites, root);
      await checkForagingChoice(model, sitesResult.sites, root);
      await checkResponseControls(model, sitesResult, clicks);
      await checkFunctionalRegions(model, sitesResult);
      checkSlotWiring(model, await import('../ui/studio/model/regions.js'), sitesResult.sites,
                      clicks.find(([ selector ]) => selector === '[data-slot-region]')[1]);
      if (process.argv.includes('--region-controls')) {
        console.log('Atelier: Reizantwort, Bedienpunkte, Seitenkopplung und native Planwerte: OK');
        return;
      }
    }
    // Offered blueprints remain editable and compile to their offered fish.
    const offeredFish = JSON.parse(execFileSync(
        'python3',
        [ '-B', '-c', 'import json, fish_shelf; print(json.dumps(fish_shelf.offered()))' ],
        {cwd : root, encoding : 'utf8', timeout : 10000}));
    assert.ok(offeredFish.length &&
                  offeredFish.every(f => ['shelf', 'drafts'].includes(f.category)),
              'The game offers fish, each on the shelf or among the drafts');
    for (const example of offeredFish.map(f => f.key)) {
      const source = JSON.parse(execFileSync(
          'python3',
          [
            '-B', '-c',
            "import json, fish_shelf; from atelier_service import run; example=__import__('sys').argv[1]; d=run({'operation':'new','example':example}); r=run({'operation':'inspect','genome':fish_shelf.genome(example).read_text()}); r.update(d); print(json.dumps(r))",
            example
          ],
          {cwd : root, encoding : 'utf8', timeout : 10000, maxBuffer : 8 * 1024 * 1024}));
      assert.equal(source.groups.reduce((sum, group) => sum + group.cells, 0) +
                       source.extraNodes.reduce((sum, group) => sum + group.copies, 0),
                   source.neurons);
      assert.equal(source.contacts.reduce((sum, edge) => sum + edge[2], 0), source.synapses,
                   'Every generated contact appears, including unplanned sites');
      const doc = source.document;
      model.validateDocument(doc);
      // A shipped blueprint follows the current region plan, as the atelier would settle it.
      const {settleRegions} = await import('../ui/studio/model/regions.js');
      assert.deepEqual(settleRegions(doc, sitesResult.sites), doc,
                       example + ': blueprint settled (make starter)');
      if (example === offeredFish[0].key) {
        // A simple body without regions, kept for this test only; the game does not offer it.
        const {updateRegion} = await import('../ui/studio/model/regions.js');
        let placed = settleRegions(
            JSON.parse(readFileSync(join(__dirname, 'fisch/einfach.fish.json'), 'utf8')),
            sitesResult.sites);
        placed.organs.find(o => o.type === 'brain').centers = [];
        placed.wires = [];
        placed.assemblies = [];
        placed = model.setOrganNodes(placed, 'eiorgan', 16, sitesResult.sites);
        for (const [type, x, y, settings] of [[ 'tectum', 390, 320, {resolution : 2} ],
                                              [ 'olfaction', 285, 415, {contrast : 1} ],
                                              [ 'choice', 700, 365, {searchTime : .6} ]]) {
          const r = model.addOrgan(placed, type, sitesResult.sites, {x, y});
          assert.ok(r, type + ' fits in an occupied body');
          placed = updateRegion(r.document, r.organId, settings, sitesResult.sites);
          model.validateDocument(placed);
        }
        const paired = placed.organs.find(o => o.type === 'olfaction');
        assert.ok(paired.pair);
        const eggWire = model.addWire(placed, paired.id, 'eiorgan', null, sitesResult.sites,
                                      {fromPort : 'presence'});
        const tailWire = model.addWire(eggWire.document, paired.id, 'schub--1', 'same',
                                       sitesResult.sites, {fromPort : 'presence'});
        const plan = model.compileDocument(tailWire.document, sitesResult.sites);
        const command = paired.centers.find(c => c.node === 'concentration').id;
        assert.equal(
            plan.groups[model.allCenters(tailWire.document).findIndex(c => c.id === command)]
                .crossing,
            0, 'One ovary contains targets on both physical sides');
        const both = model.updateWire(tailWire.document, eggWire.wireId, {pairing : 'both'});
        const projections = model.expandedWires(both).filter(w => w.wire.id === eggWire.wireId);
        assert.equal(projections.length, 2);
        assert.deepEqual(new Set(projections.map(p => p.from)),
                         new Set([ paired.id, paired.pair ]));
        const hub = model.addNeuron(both, 'modulate', sitesResult.sites, {x : 335, y : 365});
        const broadcast = model.addWire(hub.document, hub.centerId, paired.id, 'both',
                                        sitesResult.sites, {toPort : 'scent'});
        assert.equal(model.expandedWires(broadcast.document)
                         .filter(w => w.wire.id === broadcast.wireId)
                         .length,
                     2, 'A central teacher can reach both halves');
      }
      const saved = JSON.parse(JSON.stringify(doc));
      assert.ok(model.regenerateFields(saved, sitesResult.sites));
      assert.deepEqual(saved, doc);
      const plan = model.compileDocument(saved, sitesResult.sites);
      assert.equal(plan.source, undefined);
      assert.equal(plan.groups.length, model.allCenters(doc).length);
      assert.ok(doc.wires.length < plan.connections.length);
      // Brisa forages by smell alone and has no sensory field to retune.
      const near = doc.organs.find(o => o.type === 'proximity');
      if (near) {
        const tuned = model.updateField(
            doc, near.id, {profile : {...near.field.profiles[0], q1 : .2}}, sitesResult.sites);
        assert.equal(model.compileDocument(tuned, sitesResult.sites).groups.length,
                     plan.groups.length);
        assert.deepEqual(model.allCenters(tuned).map(c => [c.id, c.site, c.copies]),
                         model.allCenters(doc).map(c => [c.id, c.site, c.copies]));
      }
      const checked = JSON.parse(execFileSync(
          'python3',
          [
            '-B', '-c',
            "import json,sys,fish_shelf; from atelier_service import run; p=json.load(sys.stdin); r=run({'operation':'build','plan':p}); shipped=fish_shelf.genome(sys.argv[1]).read_text(); print(json.dumps({**{k:r[k] for k in ['neurons','synapses','viable','compiler']}, 'shipped': r['genome']==shipped}))",
            example
          ],
          {cwd : root, encoding : 'utf8', input : JSON.stringify(plan), timeout : 10000}));
      assert.ok(checked.shipped, example + ': shipped genome is the build of its blueprint');
      assert.ok(checked.compiler.ok, JSON.stringify(checked.compiler));
      assert.equal(checked.neurons, source.neurons);
      assert.equal(checked.synapses, source.synapses);
      assert.equal(checked.viable, source.viable);
    }
    if (process.argv.includes('--blueprints')) {
      console.log(
          'Atelier: mitgelieferte Baupläne bleiben bearbeitbar und ergeben ihre Fische: OK');
      return;
    }
  }
  await require('./studio_canvas.js')(model, sitesResult, root);
  {
    const {stimulusKind} = await import('../ui/studio/view/stimulus.js');
    const drawn =
        {genome : 'g', stale : false, report : {compiler : {ok : true}}, tool : 'stimulate'};
    assert.match(stimulusKind(drawn), /Bauplan-Reiz/);
    assert.match(stimulusKind({...drawn, genome : '', stale : true}), /Bauplan-Reiz/);
    assert.equal(stimulusKind({...drawn, tool : 'select'}), '');
  }
  {
    const {stimulusPicture} = await import('../ui/studio/view/stimuli.js');
    const {SENSE_KIND} = await import('../ui/schema.js');
    for (const kind of Object.values(SENSE_KIND)) {
      const [weak, strong] = [ 0, 1 ].map(s => stimulusPicture(kind, s, {x : 0, y : 0}, 'held'));
      assert.match(weak, /<title>held<\/title>/);
      assert.notEqual(weak, strong, 'A stronger stimulus looks stronger');
    }
  }
  const geometry = {
    ...await import('../ui/studio/model/layout.js'),
    ...await import('../ui/studio/view/frame.js')
  };
  assert.equal(geometry.cameraBox({zoom : .4, x : 560, y : 365}).width, 2500);
  const camera = {zoom : 2, x : 560, y : 365};
  const cameraBox = geometry.cameraBox(camera);
  const shortViewport = {width : 1200, height : 480};
  const scale = geometry.cameraScale(shortViewport, camera);
  assert.equal(scale, Math.min(shortViewport.width / cameraBox.width,
                               shortViewport.height / cameraBox.height));
  assert.ok(Math.abs(120 / scale - 91.25) < .01);
  assert.ok(geometry.CAMERA_ZOOM.min < 1 && geometry.CAMERA_ZOOM.max > 1);
  assert.equal(geometry.cameraScale({width : 480, height : 1200}, camera), 480 / cameraBox.width);
  const sites = sitesResult.sites;
  const retina = await import('../ui/studio/model/retina.js');
  const vision = await import('../ui/studio/view/vision.js');
  (await import('../ui/brain.js')).initialize([ 'brainClamp' ]);
  const E = HORMONE_EFFECT;
  assert.equal(sitesResult.effects, Object.keys(E).length);
  {
    const {motorResponse} = await import('../ui/studio/view/drive.js');
    const motor = model.defaults(
        {key : 'muscle', role : 'motor', functionCode : MOTOR_KIND.turn, copies : 3}, sites[0]);
    motor.threshold = 1;
    const excitation = model.receptorResponse(sitesResult, motor.receptors[E.excitation], [], 1);
    assert.ok(excitation > sitesResult.biasScale * motor.threshold,
              'A motor with a closed action gate can still learn its first input');
    assert.equal(motorResponse(motor, 0, {scale : sitesResult.biasScale, excitation}), 0,
                 'The motor learning baseline alone produces no muscle command');
  }
  {
    const {EFFECT_ICON} = await import('../ui/studio/view/icons.js');
    const {EFFECT_ORDER, effectScene} = await import('../ui/studio/view/effects.js');
    assert.equal(new Set(EFFECT_ORDER).size, Object.keys(E).length);
    for (const effect of Object.values(E)) {
      assert.ok(EFFECT_ICON[effect]);
      assert.match(effectScene(effect, '#abcdef'), /aid-effect-scene/);
    }
    const excited = effectScene(E.excitation, '#abcdef');
    const taught = effectScene(E.teaching, '#abcdef');
    assert.doesNotMatch(excited, /aid-effect-line teach/);
    assert.match(taught, /aid-effect-line teach/);
    assert.doesNotMatch(taught, /aid-effect-spikes/);
    const {learningFactors, retainedLearning} = await import('../ui/studio/model/learning.js');
    const learner = model.defaults({key : 'relay', role : 'nerve'}, sites[0]);
    const context = {hormones : Array(HORMONES.levels).fill(0), maturity : 0};
    assert.equal(learningFactors(sitesResult, {...learner, qwidth : 0}, context).value,
                 sitesResult.neural.learningFloor,
                 'The learning preview preserves basal learning at zero plasticity');
    const memory = [ -1, 0, 1 ].map(r => retainedLearning(r, 100, sitesResult.neural));
    assert.ok(memory[0].weight < memory[1].weight && memory[1].weight < memory[2].weight);
    assert.ok(memory.every(m => m.weight < 1),
              'Consolidation preserves a learned contact; it does not strengthen it at rest');
    const eligibility = effectScene(E.eligibility, '#abcdef');
    assert.doesNotMatch(eligibility, /aid-effect-wave/,
                        'Eligibility never trades sensory credit for pacemaker credit');
    const {lifeResponses} = await import('../ui/studio/model/cell_life.js');
    const mortal = structuredClone(learner);
    mortal.receptors[E.death] = {
      ...mortal.receptors[E.death],
      active : 1,
      baseline : 1,
      sensitivity : -2,
      substance : HORMONES.levels,
      half : .3
    };
    const life = lifeResponses(sitesResult, mortal, context, [ 0, .3, .6, 1 ]);
    assert.ok(life.every(p => p.dead && p.output === 0 && p.birth === 0),
              'An early death remains final when its triggering receptor later quietens');
    const aquarium = JSON.parse(readFileSync(join(root, 'ui/text/de/nerve_map.json'), 'utf8'));
    assert.equal(aquarium.effects.length, Object.keys(E).length);
  }
  assert.deepEqual(sitesResult.roleEffects, [
    [ E.output, E.death ], Object.values(E).sort((a, b) => a - b),
    [ E.excitation, E.output, E.death ]
  ]);
  assert.deepEqual(sitesResult.lightEffects, [ E.excitation ]);
  assert.equal(retina.receptorWidth(0), 4);
  assert.ok(Math.abs(retina.receptorWidth(1) - 117) < 1e-8);
  assert.deepEqual(ORGANS.filter(o => ['mouth', 'fin', 'tail'].includes(o.key)), []);
  const organAudits = [];
  for (const definition of ORGANS.filter(o => !o.fixed)) {
    const site = sites.find(s => eligible(definition.centers[0], s));
    const added =
        model.addOrgan(model.newDocument('Organ'), definition.key, sites, geometry.sitePoint(site));
    assert.ok(added, definition.key);
    assert.doesNotThrow(() => model.compileDocument(added.document, sites));
    organAudits.push({document : added.document, id : added.organId, type : definition.key});
  }
  {
    const gut = model.addOrgan(model.newDocument('Auftrieb'), 'gut', sites,
                               geometry.sitePoint(sites.find(s => s.id === 390)));
    const bladder = model.addOrgan(gut.document, 'bladder', sites,
                                   geometry.sitePoint(sites.find(s => s.id === 366)));
    const cells = model.findOrgan(bladder.document, bladder.organId).centers;
    let document = cells[2].site === 368
                       ? bladder.document
                       : model.placeNode(bladder.document, cells[2].id, 368, sites);
    document =
        cells[3].site === 344 ? document : model.placeNode(document, cells[3].id, 344, sites);
    organAudits.push({document, id : bladder.organId, type : 'bladder', pressure : true});
  }
  {
    // The gut's own cells carry its length; the throat no longer does.
    const gut = model.addOrgan(model.newDocument('Darm'), 'gut', sites, {x : 600, y : 360});
    assert.equal(model.gutLength(gut.document), .5, 'A new gut is of middle length');
    const long = model.setGutLength(gut.document, 1);
    assert.equal(model.gutLength(long), 1);
    assert.equal(model.setGutLength(model.newDocument('Leer'), 1), null,
                 'Without a gut there is no length to set');
    organAudits.push({document : long, id : gut.organId, type : 'gut', gutLength : 1});
  }
  {
    // Gill pumps take the head's flanks and nothing else; their rakers are their first quality.
    const flank = sites.find(s => s.zone === 1 && s.outer && s.w === 1 && s.side < 0);
    const gills = model.addOrgan(model.newDocument('Kiemen'), 'gills', sites,
                                 geometry.sitePoint(flank, 'gills'));
    assert.ok(gills, 'Gills can be placed on the flank of the head');
    const organ = model.findOrgan(gills.document, gills.organId);
    assert.ok(organ.centers.length >= 2 && organ.centers.every(c => {
      const site = sites.find(s => s.id === c.site);
      return isGillFlank(site);
    }),
              'Every gill pump sits on a flank of the head');
    assert.equal(new Set(organ.centers.map(c => sites.find(s => s.id === c.site).side)).size, 2,
                 'Gills come in pairs');
    assert.ok(sites
                  .filter(s => isGillFlank(s) && functionFor(ORGAN_BY_KEY.muscle.centers[0], s) ===
                                                     MOTOR_KIND.suction)
                  .every(s => !eligible(ORGAN_BY_KEY.muscle.centers[0], s)),
              'No mouth muscle takes the place of a gill');
    const dense = model.setGillRakers(gills.document, gills.organId, 1);
    assert.equal(model.gillRakers(model.findOrgan(dense, gills.organId)), 1);
    assert.ok(model.isFibrous(organ), 'Gill pumps are muscles with fibres');
    organAudits.push({document : dense, id : gills.organId, type : 'gills', rakers : 1});
  }
  {
    // The gut muscle takes the gut wall in the trunk's midline and nothing else; the motor region
    // gets a gut output once there is a muscle to drive, fed by fullness.
    const wall = sites.find(s => isGutWall(s) && s.side < 0);
    const gut = model.addOrgan(model.newDocument('Darmmuskel'), 'gutmuscle', sites,
                               geometry.sitePoint(wall, 'gutmuscle'));
    assert.ok(gut, 'The gut muscle can be placed on the gut wall');
    const organ = model.findOrgan(gut.document, gut.organId);
    assert.ok(organ.centers.length >= 2 &&
                  organ.centers.every(c => isGutWall(sites.find(s => s.id === c.site))),
              'Every gut muscle node sits in the gut wall');
    assert.ok(sites
                  .filter(s => isGutWall(s) &&
                               functionFor(ORGAN_BY_KEY.muscle.centers[0], s) === MOTOR_KIND.turn)
                  .every(s => !eligible(ORGAN_BY_KEY.muscle.centers[0], s)),
              'No fin muscle takes the place of the gut muscle');
    assert.ok(!musclePlaces(sites, MOTOR_KIND.turn, -1).some(isGutWall),
              'Fin muscles are not offered the gut wall');
    assert.ok(model.isFibrous(organ), 'The gut muscle has fibres');
    const motor = model.addOrgan(gut.document, 'motor', sites, {x : 470, y : 300});
    const region = motor && model.findOrgan(motor.document, motor.organId);
    assert.ok(region?.centers.some(c => c.node === 'gut'), 'The motor region drives the gut');
    const slots = organSlots(region);
    assert.ok(slots.some(s => s.key === 'gut' && s.dir === 'out') &&
                  [ slots.find(s => s.key === 'full').node ].flat().includes('gut'),
              'A full gut reaches the gut driver');
    organAudits.push(
        {document : gut.document, id : gut.organId, type : 'gutmuscle', gutMuscle : true});
  }
  {
    // Organs added near each other take over the readings of earlier pressure cells.
    let crowded = model.newDocument('Gedränge');
    for (const type of ['bladder', 'gut', 'eggs'])
      crowded = model.addOrgan(crowded, type, sites, {x : 720, y : 330}).document;
    organAudits.push({document : crowded, type : 'eggs', crowded : true});
  }
  {
    const regions = await import('../ui/studio/model/regions.js');
    const site = sites.find(s => s.zone === 2 && !s.outer && s.w > 0 && s.side < 0);
    const placed = model.addOrgan(model.newDocument('Riechverarbeitung'), 'olfaction', sites,
                                  geometry.sitePoint(site, 'nerve'));
    const left = model.findOrgan(placed.document, placed.organId),
          right = model.findOrgan(placed.document, left.pair);
    assert.ok(right && left.side === -right.side);
    const inputs = left.centers.filter(c => ['concentration', 'opposite'].includes(c.node));
    for (const key of ['copies', 'threshold', 'tau', 'q1', 'q2', 'pace', 'electrical_limit'])
      assert.equal(inputs[0][key], inputs[1][key], 'Matched nasal input responses');
    const crossKey = regions.innerKey('opposite', 'gradient', true);
    const cut = regions.toggleInnerLink(placed.document, left.id, crossKey);
    assert.ok(!regions.routedLinks(cut, sites).some(l => l.key === crossKey));
    assert.equal(
        regions.routedLinks(cut, sites, true).filter(l => l.key === crossKey && l.cut).length, 2);
    assert.ok(regions.routedLinks(regions.toggleInnerLink(cut, right.id, crossKey), sites)
                  .some(l => l.key === crossKey));
    const circuit = panels.inspector({
      document : placed.document,
      sites,
      selected : {kind : 'organ', id : left.id},
      multi : new Set(),
      camera : {zoom : 1, x : 560, y : 365},
      tool : 'select',
      stale : true,
      wireScope : 'all',
      contactView : 'design'
    });
    assert.match(circuit, /aid-region-edge crossing inhibits[^]*?url\(#aid-region-bar\)/);
    const moved = model.moveOrgan(placed.document, left.id, sites, {x : 700, y : 420});
    assert.ok(moved);
    const another = model.addOrgan(placed.document, 'olfaction', sites, {x : 730, y : 335});
    assert.ok(another && another.organId !== left.id);
    const independent =
        regions.updateRegion(another.document, another.organId, {smoothing : .5}, sites);
    assert.deepEqual(model.findOrgan(independent, left.id), left);
    const nosed = model.addOrgan(placed.document, 'nose', sites, {x : 185, y : 318});
    const smelling =
        model.addWire(nosed.document, nosed.organId, left.id, 'same', sites, {toPort : 'scent'});
    const muscle = model.addOrgan(smelling.document, 'muscle', sites, {x : 800, y : 300});
    const driven = model.addWire(muscle.document, left.id, muscle.organId, 'same', sites,
                                 {fromPort : 'target'});
    const links = regions.routedLinks(driven.document, sites);
    assert.ok(links.some(l => l.from === nosed.organId && l.to === left.centers[0].id));
    assert.ok(links.some(l => l.from === left.centers.find(c => c.node === 'gradient').id &&
                              l.to === muscle.organId));
    const allCentersOf = doc => model.allCenters(doc).length;
    for (const definition of ORGANS.filter(o => o.category === 'regions')) {
      const home =
          sites.find(s => !s.outer && s.w > 0 && definition.centers[0].zones.includes(s.zone));
      const r = model.addOrgan(model.newDocument(definition.key), definition.key, sites,
                               geometry.sitePoint(home, 'nerve'));
      assert.ok(r);
      const o = model.findOrgan(r.document, r.organId);
      assert.equal(o.centers.length, regions.regionPlan(r.document, o).nodes.length,
                   'The entire regional circuit fits into its allocated tissue');
      assert.equal(!!o.pair, definition.scope === 'side');
      model.compileDocument(r.document, sites);
    }
    let wired =
        model.addOrgan(model.newDocument('Sehen'), 'eye', sites, {x : 345, y : 290}).document;
    const tectumSite = sites.find(s => s.zone === 1 && !s.outer);
    const tectum = model.addOrgan(wired, 'tectum', sites, geometry.sitePoint(tectumSite));
    assert.ok(tectum, 'The optic tectum can be placed');
    tectum.document = regions.updateRegion(tectum.document, tectum.organId,
                                           {resolution : 3, contrast : 1}, sites);
    const {nerveResponse} = await import('../ui/studio/view/drive.js');
    for (const c of model.findOrgan(tectum.document, tectum.organId).centers) {
      assert.equal(nerveResponse(c, 0, 0, {scale : sitesResult.biasScale}), 0,
                   'A mature tectum does not send a visual cue in darkness');
      assert.ok(nerveResponse(c, .2, .2, {scale : sitesResult.biasScale}) > 0,
                'A sustained visual cue remains available to downstream regions');
    }
    wired = tectum.document;
    const eyeOrgan = wired.organs.find(o => o.type === 'eye');
    const own = model.connectSelections(wired, {kind : 'organ', id : eyeOrgan.id},
                                        {kind : 'organ', id : tectum.organId});
    assert.equal(own.document.wires.at(-1).pairing, 'same');
    const directSight =
        regions.updateRegion(own.document, tectum.organId, {resolution : 1, contrast : 0}, sites);
    const directTectum = model.findOrgan(directSight, tectum.organId);
    assert.deepEqual(directTectum.centers.map(c => [c.node, c.port]), [ [ 'map0', 'both' ] ]);
    const sightMuscle = model.addOrgan(directSight, 'muscle', sites, {x : 800, y : 300});
    const sightMotor =
        model.addWire(sightMuscle.document, tectum.organId, sightMuscle.organId, 'same', sites);
    const directSightLinks = regions.routedLinks(sightMotor.document, sites);
    const crossedTectum = model.findOrgan(sightMotor.document, directTectum.pair);
    assert.ok(directSightLinks.some(l => eyeOrgan.centers.some(c => c.id === l.from) &&
                                         l.to === crossedTectum.centers[0].id),
              'An eye feeds the tectum of the other side');
    assert.ok(directSightLinks.some(l => l.from === directTectum.centers[0].id &&
                                         l.to === sightMuscle.organId));
    model.validateDocument(sightMotor.document);
    const retina = await import('../ui/studio/model/retina.js');
    // Sight crosses whatever side the wire was drawn on; only cells that see across the midline
    // also reach the tectum of their own side.
    const crossesOver = (doc, wireId) => {
      const links = regions.routedLinks(doc, sites).filter(l => l.wire.id === wireId);
      return links.some(l => model.findCenter(doc, l.from).organ.side !==
                             model.findCenter(doc, l.to).organ.side) &&
             links.every(l => {
               const cell = model.findCenter(doc, l.from), map = model.findCenter(doc, l.to);
               return cell.organ.side !== map.organ.side ||
                      retina.midlineCenters(cell.organ, sites).has(cell.center.id);
             });
    };
    assert.ok(crossesOver(own.document, own.wireId), 'Drawn on one side, optic wires still cross');
    const farTectum = model.findOrgan(wired, tectum.organId).pair;
    assert.ok(farTectum);
    const connected = model.connectSelections(wired, {kind : 'organ', id : eyeOrgan.id},
                                              {kind : 'organ', id : farTectum});
    assert.ok(connected);
    assert.equal(connected.document.wires.at(-1).pairing, 'crossed');
    const tectumLeft = model.findOrgan(connected.document, tectum.organId);
    assert.ok(crossesOver(connected.document, connected.wireId), 'Optic wires cross');
    assert.ok(tectumLeft);
    const settled = regions.settleRegions(connected.document, sites);
    const routed = regions.routedLinks(settled, sites);
    const mapNodes =
        model.findOrgan(settled, tectum.organId).centers.filter(c => c.node.startsWith('map'));
    assert.equal(mapNodes.length, 3);
    assert.ok(mapNodes.every(c => c.port === 'both') &&
                  tectumLeft.centers.some(c => c.node === 'inhibit'),
              'Every map band sends its own command');
    assert.ok(mapNodes.every((c, i) => i === 0 || c.copies > mapNodes[i - 1].copies),
              'Bands farther off the midline command larger turns');
    for (const link of routed.filter(l => mapNodes.some(c => c.id === l.to) && !l.wire.inner)) {
      const cell = model.findCenter(settled, link.from);
      const map = model.findCenter(settled, link.to).center;
      const angle = retina.bearing(sites.find(s => s.id === cell.center.site));
      assert.ok(cell.organ.type === 'eye' && cell.organ.side !== tectumLeft.side);
      const lowest = Math.min(...mapNodes.map(c => c.band[0])),
            highest = Math.max(...mapNodes.map(c => c.band[1]));
      // A cell whose view reaches past the field's edge feeds the outermost band.
      const from = map.band[0] === lowest ? -Infinity : map.band[0],
            to = map.band[1] === highest ? Infinity : map.band[1];
      assert.ok(angle >= from - 1e-9 && angle <= to + 1e-9,
                'A light cell reaches the map node of its direction');
    }
    assert.ok(mapNodes.every(c => routed.some(l => l.from === c.id && l.to.endsWith(':inhibit')) &&
                                  routed.some(l => l.to === c.id && l.from.endsWith(':inhibit'))),
              'Contrast cells inhibit the map bands themselves');
    const finer = regions.updateRegion(connected.document, tectum.organId, {resolution : 5}, sites);
    assert.equal(model.findOrgan(finer, tectum.organId).centers.filter(c => c.band).length, 5);
    assert.equal(model.findOrgan(finer, tectumLeft.pair).centers.filter(c => c.band).length, 5,
                 'Both tecta take the setting');
    assert.ok(finer.wires.some(w => w.id === connected.wireId), 'The optic wire stays');
    const slots = regions.regionSlots(connected.document, tectumLeft);
    assert.deepEqual(slots.map(slot => [slot.key, slot.filled.length > 0]),
                     [ [ 'sight', true ], [ 'near', false ], [ 'onward', false ] ]);
    const plan = model.compileDocument(connected.document, sites);
    assert.equal(plan.groups.length, allCentersOf(connected.document));
    {
      const {organSlots} = await import('../ui/studio/model/organs.js');
      const projections = new Set();
      const pairedTypes = ORGANS.filter(o => !o.fixed && o.category !== 'internal').map(o => o.key);
      const role = type => ORGAN_BY_KEY[type].category === 'regions' ? 'nerve' : '';
      const leftOf = type => {
        const site = sites.find(s => s.side < 0 && !geometry.onMidline(s) &&
                                     eligible(ORGAN_BY_KEY[type].centers[0], s));
        return site && model.addOrgan(model.newDocument('Seiten'), type, sites,
                                      geometry.sitePoint(site, role(type)));
      };
      for (const a of pairedTypes)
        for (const b of pairedTypes) {
          const first = leftOf(a);
          const site =
              first &&
              sites.find(s => s.side < 0 && !geometry.onMidline(s) &&
                              !model.allCenters(first.document).some(c => c.site === s.id) &&
                              eligible(ORGAN_BY_KEY[b].centers[0], s));
          const second =
              site && model.addOrgan(first.document, b, sites, geometry.sitePoint(site, role(b)));
          const near = second && model.findOrgan(second.document, second.organId);
          const from = second && model.findOrgan(second.document, first.organId);
          if (!near?.pair || !from?.pair || near.side !== from.side || near.id === from.id)
            continue;
          const port = (organ, dir) => ORGAN_BY_KEY[organ.type].namedPorts
                                           ? organSlots(organ).find(s => s.dir === dir)?.key
                                           : null;
          for (const [to, same] of [[ near.id, true ], [ near.pair, false ]]) {
            const wired = model.addWire(second.document, from.id, to, null, sites,
                                        {fromPort : port(from, 'out'), toPort : port(near, 'in')});
            if (!wired)
              continue;
            projections.add(a + '>' + b);
            const sideOf = id => model.organOf(wired.document, id).side;
            assert.equal(wired.document.wires.at(-1).pairing, same ? 'same' : 'crossed',
                         a + '>' + b);
            // Sight into the tectum crosses by where its cells look, whatever the pairing.
            assert.ok(model.chiasmWire(wired.document, wired.document.wires.at(-1)) ||
                          model.expandedWires(wired.document)
                              .filter(l => l.wire.id === wired.wireId)
                              .every(l => (sideOf(l.from) === sideOf(l.to)) === same),
                      a + '>' + b + ' joins the sides as drawn');
          }
        }
      for (const route of ['eye>tectum', 'nose>olfaction', 'motor>muscle', 'tectum>muscle',
                           'choice>choice'])
        assert.ok(projections.has(route), route + ' exercises both directions across a pair');
    }
    const twin = model.findOrgan(wired, tectumLeft.pair);
    const across = model.addWire(wired, eyeOrgan.id, twin.centers[0].id);
    assert.equal(across.document.wires.at(-1).pairing, 'crossed');
    const sideOf = id =>
        (model.findOrgan(across.document, id) ?? model.findCenter(across.document, id).organ).side <
        0;
    const retinaModel = await import('../ui/studio/model/retina.js');
    assert.ok(
        regions.routedLinks(across.document, sites)
            .filter(l => l.wire.id === across.wireId)
            .every(l => sideOf(l.from) !== sideOf(l.to) ||
                        retinaModel
                            .midlineCenters(model.findCenter(across.document, l.from).organ, sites)
                            .has(l.from)),
        'Optic wires cross whichever twin they were drawn to');
    {
      const doc = across.document, wire = doc.wires.find(w => w.id === across.wireId);
      const link = regions.routedLinks(doc, sites).find(l => l.wire === wire);
      const from = model.centerIndex(doc, model.endpointCenters(doc, link.from)[0].id);
      const to = model.centerIndex(doc, model.endpointCenters(doc, link.to)[0].id);
      const rows = [ [ from, to, 4, .5, 3, 1, 1, -1 ], [ to, from, 9, 1, 9, 0, 1, 0 ] ];
      const formed = model.wireContacts(doc, wire, rows, sites);
      assert.deepEqual([ formed.count, formed.positive, formed.negative, formed.weight ],
                       [ 4, 3, 1, .5 ], 'A wire counts only the contacts along its own links');
      assert.equal(model.wireContacts(doc, wire, [], sites).count, 0);
    }
    const commissure = model.addWire(wired, tectumLeft.centers[0].id, twin.centers[0].id);
    assert.ok(commissure);
    assert.ok(model.expandedWires(commissure.document).every(l => l.from !== l.to));
    const wirePanel = (document, id) => panels.inspector(
        {document, sites, capabilities : sitesResult, selected : {kind : 'wire', id}});
    assert.doesNotMatch(wirePanel(commissure.document, commissure.wireId), /data-wire-pairing/,
                        'A direct partner connection never offers ineffective side switches');
    const opticPanel = wirePanel(connected.document, connected.wireId);
    assert.match(opticPanel, /class="aid-wire-chiasm"/,
                 'Sight into the tectum names its crossing instead of offering side choices');
    assert.doesNotMatch(opticPanel, /data-wire-pairing/);
    const opticDoc = connected.document;
    assert.equal(model.addWire(opticDoc, eyeOrgan.id, twin.id), null);
    const steering =
        model.placeModule(model.newDocument('Modul'), 'vision-steering', sites, {x : 345, y : 290});
    assert.ok(steering);
    const steer = steering.document.wires.find(
        w => model.organOf(steering.document, w.from)?.type === 'tectum' && w.pairing);
    const steerPanel = wirePanel(steering.document, steer.id);
    assert.match(steerPanel, /<span>gleichseitig<\/span>/,
                 'The side choices are named without relying on tooltips');
    assert.match(steerPanel, /data-pairing-value="same" aria-pressed="true"/);
    for (const [key, motor] of [[ 'vision-steering', MOTOR_KIND.turn ]])
      for (const position of [{x : 345, y : 290}, {x : 560, y : 365}, {x : 850, y : 420}]) {
        const placed = model.placeModule(model.newDocument(key), key, sites, position);
        assert.ok(placed, key + ' can be placed');
        assert.ok(!model.oneSided(placed.document, sites, placed.document.assemblies[0]), key);
        const muscles = placed.document.organs.filter(o => o.type === 'muscle');
        assert.equal(muscles.length, 2, key + ' has both muscle sides');
        assert.ok(muscles.every(o => organFunction(o, sites) === motor),
                  key + ' always drives the intended muscle function');
      }
    assert.ok(!model.oneSided(steering.document, sites, steering.document.assemblies[0]));
    assert.equal(steering.document.assemblies.length, 1);
    assert.ok(steering.document.wires.every(w => model.findOrgan(steering.document, w.from) &&
                                                 model.findOrgan(steering.document, w.to)));
    assert.ok(steering.document.organs.some(o => o.type === 'tectum'),
              'Seeing and steering runs through the optic tectum');
    for (const id of [tectum.organId, tectumLeft.pair]) {
      const circuit = panels.inspector({
        document : commissure.document,
        sites,
        capabilities : sitesResult,
        selected : {kind : 'organ', id},
        multi : new Set(),
        camera : {zoom : 1, x : 560, y : 365},
        tool : 'select',
        stale : true,
        wireScope : 'all',
        contactView : 'design'
      });
      assert.match(circuit, /aid-region-edge crossing/);
      assert.ok(circuit.includes('data-circuit-wire="' + commissure.wireId + '"'));
    }
  }
  let doc = model.newDocument('Atelier-Test');
  const eye = model.addOrgan(doc, 'eye', sites, {x : 345, y : 290});
  assert.ok(eye);
  doc = eye.document;
  let left = model.findOrgan(doc, eye.organId), right = model.findOrgan(doc, left.pair);
  assert.ok(left.linked && right.linked && right.pair === left.id);
  assert.ok(left.centers.length > 1, 'An eye automatically covers multiple retinal sites');
  assert.equal(left.centers.length, right.centers.length);
  assert.equal(doc.organs.filter(o => o.type === 'eye').length, 2);
  assert.equal(model.addOrgan(doc, 'eye', sites, {x : 345, y : 290}).document.organs.length,
               doc.organs.length);
  assert.equal(model.addOrgan(doc, 'eye', sites, {x : 1400, y : 290}, geometry.SNAP_DISTANCE),
               null);
  const crowded = model.addOrgan(
      JSON.parse(readFileSync(join(__dirname, '../genomes/entwuerfe/brisa.fish.json'), 'utf8')),
      'eye', sites, {x : 320, y : 270});
  assert.ok(crowded, 'An occupied viewing direction must not block the rest of a new eye');
  const crowdedSites = model.allCenters(crowded.document).map(c => c.site);
  assert.equal(new Set(crowdedSites).size, crowdedSites.length);
  const id = left.id, pair = right.id;
  const retinaIds = left.centers.map(c => c.id);
  doc = model.updateField(doc, id, {density : 8}, sites);
  assert.deepEqual(model.findOrgan(doc, id).centers.map(c => c.id), retinaIds);
  assert.ok(model.findOrgan(doc, pair).centers.every(c => c.copies === 8));
  const width = model.findOrgan(doc, id).field.resolution;
  assert.equal(model.findOrgan(doc, pair).field.resolution, width,
               'Density does not change field width');
  doc = model.linkPair(doc, id);
  doc = model.updateField(doc, id, {density : 6}, sites);
  assert.equal(model.findOrgan(doc, pair).field.density, 8);
  doc = model.linkPair(doc, id);
  assert.equal(model.findOrgan(doc, id).field.density, 6, 'Relinking preserves asymmetry');
  assert.equal(model.findOrgan(doc, pair).field.density, 8);
  doc = model.updateField(doc, id, {density : 7}, sites);
  assert.equal(model.findOrgan(doc, pair).field.density, 9,
               'Linked adjustments preserve the difference');
  doc = model.updateField(doc, id, {density : 3, lo : 10, hi : 90}, sites);
  const profile = model.findOrgan(doc, id).field.profiles[0].id;
  doc = model.updateField(
      doc, id, {profile : {id : profile, q1 : -1, qwidth : .08, q2 : -1, threshold : -.8}}, sites);
  {
    let edited = null;
    const studio = {
      state : {document : doc, selected : {id}, visionProfile : profile},
      editField : (organ, patch) => { edited = model.updateField(doc, organ, patch, sites); }
    };
    const choose = clicks.find(([ selector ]) => selector === '[data-vision-polarity]')[1];
    choose(studio, {dataset : {visionPolarity : String(CONTRAST_POLARITY.dark)}});
    const groups =
        model.compileDocument(edited, sites).groups.filter(g => g.name.startsWith('eye:'));
    assert.ok(groups.length && groups.every(g => g.polarity === CONTRAST_POLARITY.dark),
              'The dark button makes both eyes report what is darker than its surround');
    assert.ok(model.compileDocument(doc, sites)
                  .groups.every(g => g.polarity === CONTRAST_POLARITY.bright),
              'New cells report what is brighter than their surround');
  }
  const retinalRelaySite = sites.find(s => s.zone === 2 && !s.outer && s.v >= .5 && s.w === 0);
  const relay = model.addNeuron(doc, 'relay', sites,
                                geometry.sitePoint(retinalRelaySite, geometry.NERVE_ROLE));
  assert.ok(relay);
  doc = relay.document;
  const muscle = model.addOrgan(doc, 'muscle', sites, {x : 620, y : 450});
  assert.ok(muscle);
  doc = muscle.document;
  let linked =
      model.connectSelections(doc, {kind : 'organ', id}, {kind : 'center', id : relay.centerId});
  assert.ok(linked);
  doc = linked.document;
  linked = model.addWire(doc, relay.centerId, muscle.organId, null, sites);
  assert.ok(linked);
  doc = linked.document;
  assert.equal(doc.wires[0].from, id);
  assert.equal(doc.wires.length, 2, 'One nerve cell can connect a sense to a muscle');
  assert.equal(model.addWire(doc, id, muscle.organId), null,
               'Sensor-to-motor shortcuts remain forbidden');
  const wires = structuredClone(doc.wires);
  doc = model.updateField(doc, id, {lo : 30, hi : 100}, sites);
  assert.deepEqual(doc.wires, wires, 'Regenerating an eye preserves its connections');
  const planAfter = model.compileDocument(doc, sites);
  const retinalIndices =
      planAfter.groups.map((g, i) => g.name.startsWith('eye:') && g.side === left.side ? i : -1)
          .filter(i => i >= 0);
  const targetIndex = model.allCenters(doc).findIndex(c => c.id === relay.centerId);
  const eyeLinks = planAfter.connections.filter(e => e.to === targetIndex);
  assert.ok(retinalIndices.length > 1);
  assert.deepEqual(eyeLinks.map(e => e.from).sort((a, b) => a - b), retinalIndices);
  assert.equal(new Set(eyeLinks.map(e => e.bundle)).size, 1);
  const node = model.findOrgan(doc, id).centers[0].id;
  assert.equal(model.addWire(doc, node, relay.centerId), null,
               'A node adds nothing to what its whole organ reaches');
  const organWire = doc.wires.find(w => w.from === id).id;
  const fromNode = model.addWire(model.removeWire(doc, organWire), node, relay.centerId);
  assert.ok(fromNode, 'A single retinal node can be wired');
  const absorbed = model.addWire(fromNode.document, id, relay.centerId);
  assert.ok(absorbed && absorbed.document.wires.every(w => w.from !== node),
            'Wiring the whole organ takes the place of its node\'s wire');
  assert.equal(fromNode.document.wires.at(-1).from, node);
  assert.equal(fromNode.document.wires.at(-1).spread, 0);
  const nodePlan = model.compileDocument(fromNode.document, sites);
  const nodeIndex = model.allCenters(fromNode.document).findIndex(c => c.id === node);
  const relayIndex = model.allCenters(fromNode.document).findIndex(c => c.id === relay.centerId);
  assert.deepEqual(nodePlan.connections.filter(e => e.to === relayIndex).map(e => e.from),
                   [ nodeIndex ]);
  const twoTypes =
      model.updateField(fromNode.document, id, {addProfile : colourType('extra', .4, .2)}, sites);
  const extraNode = model.findOrgan(twoTypes, id).centers.find(c => c.profile === 'extra').id;
  const extraWired = model.addWire(twoTypes, extraNode, relay.centerId).document;
  const extraIndex =
      model.findOrgan(extraWired, id).field.profiles.findIndex(p => p.id === 'extra');
  const withoutExtra = model.updateField(extraWired, id, {removeProfile : extraIndex}, sites);
  assert.ok(withoutExtra.wires.every(w => w.from !== extraNode),
            'Wires of removed nodes go with them');
  assert.doesNotThrow(() => model.compileDocument(withoutExtra, sites));
  assert.equal(model.removeOrgan(doc, id).wires.length, 1);
  assert.equal(model.findOrgan(model.removeOrgan(doc, id), pair).pair, null);
  const baseDoc = doc;
  for (let i = 1; i < 5; i++) {
    doc = model.updateField(doc, id, {addProfile : colourType('colour-' + i, i * .35 - 1, .1)},
                            sites);
    assert.ok(doc, 'Five colour types can share a retina');
  }
  assert.equal(model.findOrgan(doc, id).field.profiles.length, 5);
  assert.ok(model.findOrgan(doc, id).field.profiles.every(
      p => model.findOrgan(doc, id).centers.some(c => c.profile === p.id)));
  assert.doesNotThrow(() => model.compileDocument(doc, sites));
  const denseNear = model.addOrgan(doc, 'proximity', sites, {x : 330, y : 280});
  assert.ok(denseNear, 'Near sense fits after five retinal colour profiles');
  assert.ok(
      model.findOrgan(denseNear.document, id)
          .field.profiles.every(
              p => model.findOrgan(denseNear.document, id).centers.some(c => c.profile === p.id)));
  model.validateDocument(denseNear.document);
  const module = {name : 'Vision', organs : doc.organs, wires : doc.wires};
  const points = module.organs.filter(o => o.centers.length)
                     .map(o => geometry.sitePoint(sites.find(s => s.id === o.centers[0].site),
                                                  siteRole(o.type)));
  const position = {
    x : points.reduce((n, p) => n + p.x, 0) / points.length,
    y : points.reduce((n, p) => n + p.y, 0) / points.length
  };
  const placed = model.placeStoredModule(model.newDocument('Module'), module, sites, position);
  assert.ok(placed);
  model.validateDocument(placed.document);
  assert.equal(placed.document.wires.length, doc.wires.length);
  assert.ok(
      placed.document.wires.every(w => model.endpointCenters(placed.document, w.from).length &&
                                       model.endpointCenters(placed.document, w.to).length));
  assert.equal(placed.document.organs.filter(o => o.type === 'eye').length, 2);
  assert.ok(placed.document.organs.filter(o => o.type === 'eye')
                .every(o => o.field.profiles.length === 5));
  const regionsModel = await import('../ui/studio/model/regions.js');
  let withTectum =
      model.placeModule(model.newDocument('Sehen'), 'vision-steering', sites, {x : 345, y : 290})
          .document;
  const tectumId = withTectum.organs.find(o => o.type === 'tectum').id;
  withTectum =
      regionsModel.updateRegion(withTectum, tectumId, {resolution : 4, contrast : 2}, sites);
  const output = model.findOrgan(withTectum, tectumId).centers.find(c => c.node === 'map3');
  withTectum = model.updateCenter(withTectum, output.id, {tau : .9});
  const stored = model.placeStoredModule(
      model.newDocument('Wieder'),
      {name : 'Sehen', organs : withTectum.organs, wires : withTectum.wires}, sites,
      {x : 345, y : 290});
  assert.ok(stored, 'A module with a region can be placed again');
  const again = stored.document.organs.filter(o => o.type === 'tectum');
  assert.equal(again.length, 2);
  assert.ok(again.every(o => o.region.resolution === 4 && o.region.contrast === 2));
  assert.ok(again.some(o => o.centers.find(c => c.node === 'map3').tau === .9));
  model.validateDocument(stored.document);
  const malformed = structuredClone(module);
  malformed.organs.find(o => o.centers.length).centers[0].site = -1;
  assert.equal(model.placeStoredModule(model.newDocument(), malformed, sites, position), null);
  assert.ok(geometry.onMidline(
      sites.find(s => s.id === model.findCenter(baseDoc, relay.centerId).center.site)));
  const besideSite = sites.find(s => s.zone === geometry.ZONE.head && !s.outer && s.w > 0 &&
                                     !model.usedSites(baseDoc).has(s.id));
  const beside = model.addNeuron(baseDoc, 'relay', sites, geometry.sitePoint(besideSite, 'nerve'));
  assert.match(views.fishScene({
    document : beside.document,
    sites,
    capabilities : sitesResult,
    selected : {kind : 'center', id : beside.centerId},
    multi : new Set(),
    camera : {zoom : 1, x : 560, y : 365},
    tool : 'select',
    stale : true,
    wireScope : 'all',
    contactView : 'design'
  }),
               /class="aid-reach"/);
  const centred = model.moveCenterToSide(beside.document, beside.centerId, 0, sites);
  const siteOf = (d, c) => sites.find(s => s.id === model.findCenter(d, c).center.site);
  assert.ok(centred && geometry.onMidline(siteOf(centred, beside.centerId)));
  const leftward = model.moveCenterToSide(centred, beside.centerId, -1, sites);
  assert.ok(leftward && siteOf(leftward, beside.centerId).side < 0 &&
            !geometry.onMidline(siteOf(leftward, beside.centerId)));
  const circuit = model.assemble(
      beside.document, [ id, 'brain' ], 'Circuit',
      [...model.findOrgan(beside.document, id).centers.map(c => c.id), beside.centerId ]);
  const mirrored = model.mirrorAssembly(circuit, circuit.assemblies[0].id, sites);
  assert.ok(mirrored);
  model.validateDocument(mirrored.document);
  assert.equal(mirrored.document.organs.filter(o => o.type === 'eye').length, 2,
               'Mirroring a circuit reuses the opposite eye');
  assert.equal(mirrored.assemblyId, circuit.assemblies[0].id);
  assert.equal(mirrored.document.assemblies.length, 1);
  assert.ok(model.oneSided(circuit, sites, circuit.assemblies[0]));
  assert.ok(!model.oneSided(mirrored.document, sites, mirrored.document.assemblies[0]));
  // The module's picture offers its missing mirror image only while it lies on one side.
  const {moduleSides} = await import('../ui/studio/view/module_sides.js');
  assert.match(moduleSides({document : circuit, sites}, circuit.assemblies[0]),
               /class="aid-module-mirror" data-mirror-assembly=/);
  assert.doesNotMatch(
      moduleSides({document : mirrored.document, sites}, mirrored.document.assemblies[0]),
      /data-mirror-assembly/);
  // A cell group the CPPN added shows one mark per potential cell; its values are the tooltip.
  const {inspector} = await import('../ui/studio/view/panels.js');
  const generated = inspector({
    document : circuit,
    sites,
    stale : false,
    selected : {kind : 'generated', id : '@cppn-0'},
    report : {
      compiler : {},
      groups : [],
      sites : [],
      extraNodes : [ {
        index : 0,
        zone : -1,
        side : 0,
        u : 0,
        v : 0,
        w : 0,
        role : 1,
        copies : 5,
        nativeClass : {sign : -1, mode : 0, pace : 0, modulator : 0}
      } ]
    }
  });
  assert.equal(generated.match(/<g transform="translate\(/g)?.length, 5);
  assert.doesNotMatch(generated, /<dl/);
  const removed = model.removeAssembly(mirrored.document, mirrored.assemblyId);
  assert.equal(model.findOrgan(removed, id), null);
  assert.equal(model.findOrgan(removed, pair), null);
  assert.doesNotThrow(() => model.validateDocument(removed));
  const muscles = model.addOrgan(model.newDocument(), 'muscle', sites, {x : 600, y : 440});
  const m = model.findOrgan(muscles.document, muscles.organId),
        mSite = sites.find(s => s.id === m.centers[0].site);
  const target = sites.find(s => s.zone === mSite.zone && s.side === m.side && s.w === mSite.w &&
                                 s.v === mSite.v && s.u !== mSite.u);
  const moved =
      model.moveOrgan(muscles.document, m.id, sites, geometry.sitePoint(target, 'muscle'));
  assert.ok(moved);
  model.validateDocument(moved);
  const beforePair = model.findOrgan(muscles.document, m.pair).centers[0].site;
  assert.notEqual(model.findOrgan(moved, m.pair).centers[0].site, beforePair,
                  'Linked muscles move together');
  const ms = sites.find(s => s.id === model.findOrgan(moved, m.id).centers[0].site);
  const ps = sites.find(s => s.id === model.findOrgan(moved, m.pair).centers[0].site);
  assert.equal(ms.u, ps.u);
  assert.equal(ms.w, ps.w);
  assert.equal(ms.side, -ps.side);
  const grouped = model.assemble(muscles.document, [ m.id, m.pair ], 'Paired muscles');
  assert.ok(model.moveAssembly(grouped, grouped.assemblies[0].id, sites,
                               {x : position.x + 40, y : position.y}, position));
  doc = baseDoc;
  const near = model.addOrgan(doc, 'proximity', sites, {x : 330, y : 280});
  assert.ok(near);
  doc = near.document;
  const add = (type, position) => {
    const r = model.addOrgan(doc, type, sites, position);
    assert.ok(r, type);
    doc = r.document;
    return r;
  };
  add('eggs', {x : 820, y : 400});
  add('sperm', {x : 850, y : 330});
  const gland = add('gland', {x : 550, y : 400});
  add('muscle', {x : 850, y : 400});
  add('muscle', {x : 295, y : 300});
  doc = model.addSubstance(doc, HORMONES.levels);
  doc =
      model.updateGrowth(doc, {active : 1, substance : 0, sensitivity : 1, half : .01, width : .3});
  doc = model.updateCenter(doc, gland.centerId, {q1 : 1, q2 : 0, qwidth : 0});
  assert.ok(model.producers(doc, 0, sitesResult).length >= 1);
  const withoutSubstance = model.removeSubstance(doc, 0, sitesResult);
  assert.ok(!model.findOrgan(withoutSubstance, gland.organId), 'Its glands go with a substance');
  assert.equal(
      model.producers(model.addSubstance(withoutSubstance, HORMONES.levels), 0, sitesResult).length,
      0, 'A new substance inherits no gland');
  const wideGland =
      model.updateCenter(model.addSubstance(doc, HORMONES.levels), gland.centerId, {qwidth : 1});
  assert.ok(model.producers(wideGland, 1, sitesResult).length >= 1);
  assert.ok(model.findOrgan(model.removeSubstance(wideGland, 0, sitesResult), gland.organId),
            'A gland that also feeds a substance that stays is kept');
  const phased =
      model.setLifePhase(doc, model.findOrgan(doc, id).centers[0].id, {start : .6, end : .9},
                         sitesResult.sensitivitySpan, sitesResult.steepnessSteps);
  assert.deepEqual(model.lifePhase(model.findOrgan(phased, id).centers[0]), {start : .6, end : .9});
  assert.ok(model.growsWith(doc, 0, sitesResult));
  const phaseWithColor =
      model.updateField(phased, id, {addProfile : colourType('phase-color', .4, .2)}, sites);
  assert.ok(model.findOrgan(phaseWithColor, id).centers.every(c => model.lifePhase(c).end === .9),
            'New retinal colour cells inherit the organ life phase');
  const state = {
    document : doc,
    sites,
    capabilities : sitesResult,
    selected : {kind : 'organ', id},
    multi : new Set(),
    camera : {zoom : 1, x : 560, y : 365},
    tool : 'select',
    stale : true,
    wireScope : 'all',
    contactView : 'design'
  };
  const hormoneScene = views.fishScene({...state, tool : 'hormone', focusSubstance : 0});
  assert.match(hormoneScene, /aid-hormone-producer/);
  assert.match(hormoneScene, /aid-hormone-body/);
  const sightTile =
      panels.libraryOf(state).html.split('data-drag-value="tectum"')[1].split('</button>')[0];
  assert.match(sightTile, /title="Sehzentrum:/);
  assert.match(sightTile, /Tectum/, 'A region tile carries its technical term');
  const eyePanel = panels.inspector(state);
  assert.match(eyePanel, /data-open-tool="hormone"/);
  assert.match(eyePanel, /data-spectrum="field"/);
  assert.match(eyePanel, /data-sight-eye="0"/);
  assert.doesNotMatch(eyePanel, /type="range"/, 'The eye has no sliders');
  const spectrum = await import('../ui/studio/view/spectrum.js');
  const tuning = await import('../ui/tuning.js');
  const tuned = {q1 : -.5, qwidth : .4},
        sigmaAt =
            spectrum.huePoint(tuning.tuningHue(tuned.q1) + tuning.tuningSigma(tuned.qwidth), .5);
  assert.ok(Math.abs(spectrum.spectrumPatch(tuned, 'width', sigmaAt).qwidth - tuned.qwidth) < 1e-9);
  assert.ok(
      Math.abs(
          spectrum.spectrumPatch(tuned, 'centre', spectrum.huePoint(tuning.HUE_CIRCLE / 2, 1)).q1) <
      1e-9);
  // The pictures that replaced sliders set their values from where the handle is let go.
  const visionView = await import('../ui/studio/view/vision.js');
  assert.equal(visionView.sensitivityShare({x : 0, y : 0}), 0,
               'The left end of the light ramp answers the faintest light');
  assert.equal(visionView.sensitivityShare({x : 1e3, y : 0}), 1,
               'The right end answers only bright light');
  const developmentView = await import('../ui/studio/view/development.js');
  assert.deepEqual(developmentView.previewPatch('situation', {x : 0, y : 0}, {}),
                   {maturity : 0, input : 1}, 'The young corner holds the strongest input');
  assert.deepEqual(developmentView.previewPatch('situation', {x : 1e3, y : 1e3}, {}),
                   {maturity : 1, input : developmentView.PREVIEW_INPUT_LOW});
  const probesView = await import('../ui/studio/view/probes.js');
  assert.equal(probesView.gutProbePatch('strength', {x : 0, y : 0}).strength, 1,
               'Food up to the top fills the gut');
  assert.equal(probesView.gutProbePatch('strength', {x : 0, y : 1e3}).strength, 0);
  const planView = await import('../ui/studio/view/contact_plan.js');
  assert.equal(planView.contactCapacityPatch('teaching_limit', {x : 1e3, y : 0}, {}).teaching_limit,
               1, 'The wedge drawn out to its end allows the strongest contact');
  assert.equal(
      planView.contactCapacityPatch('electrical_limit', {x : 0, y : 0}, {}).electrical_limit, 0);
  const scents = await import('../ui/studio/view/scents.js'), M = scents.SCENT_MAP;
  const tunedAt = p => scents.scentMapTuning(p.x / M.size, p.y / M.height);
  for (let k = 0; k < TUNING.scent_latitudes.length; ++k) {
    const aim = tuning.scentTuning(k), affinity = tuning.scentAffinities(aim.q1, aim.q2, .25);
    assert.equal(affinity.indexOf(Math.max(...affinity)), k);
    const back = tunedAt(scents.scentMapPoint(aim.q1, aim.q2));
    assert.ok(Math.abs(back.q1 - aim.q1) < 1e-9 && Math.abs(back.q2 - aim.q2) < 1e-9);
  }
  const between = {q1 : .3, q2 : -.2}, back = tunedAt(scents.scentMapPoint(between.q1, between.q2));
  assert.ok(Math.abs(back.q1 - between.q1) < 1e-9 && Math.abs(back.q2 - between.q2) < 1e-9);
  const half = tuning.tuningHalfOffset(.3);
  assert.ok(Math.abs(tuning.tuningAffinity(half, .3) - .5) < 1e-9);
  const pigmentSite =
      sites.find(s => eligible(ORGANS.find(o => o.key === 'pigment').centers[0], s));
  const pigment = model.addOrgan(doc, 'pigment', sites, geometry.sitePoint(pigmentSite));
  assert.equal(model.findOrgan(pigment.document, pigment.organId).pair, null);
  const pigmentPanel = panels.inspector(
      {...state, document : pigment.document, selected : {kind : 'organ', id : pigment.organId}});
  assert.match(pigmentPanel, /data-pigment-wheel=/);
  assert.match(pigmentPanel, /data-pigment-amount=/);
  assert.match(pigmentPanel, /data-add-type=/);
  {
    const barbelSite =
        sites.find(s => eligible(ORGANS.find(o => o.key === 'barbels').centers[0], s));
    const barbels = model.addOrgan(doc, 'barbels', sites, geometry.sitePoint(barbelSite));
    const cell = model.findOrgan(barbels.document, barbels.organId).centers[0];
    assert.equal(cell.field, .5, 'A new barbel tip both tastes and feels');
    const barbelPanel = panels.inspector(
        {...state, document : barbels.document, selected : {kind : 'center', id : cell.id}});
    assert.equal((barbelPanel.match(/data-set-field="field"/g) ?? []).length, 3);
    assert.match(barbelPanel, /class="active" data-set-field="field" data-value="0.5"/);
  }
  const skinOrgan = model.findOrgan(pigment.document, pigment.organId);
  const kinds =
      model.addOrganType(pigment.document, pigment.organId, sites, model.nextTypeTuning(skinOrgan));
  const twoKinds = model.findOrgan(kinds.document, pigment.organId);
  assert.equal(model.organTypes(twoKinds).length, 2);
  assert.notEqual(twoKinds.centers[1].qwidth, twoKinds.centers[0].qwidth);
  const yellow = model.updateCenter(kinds.document, twoKinds.centers[1].id, {q1 : .3});
  assert.equal(model.findOrgan(yellow, pigment.organId).centers[0].q1, twoKinds.centers[0].q1,
               'A kind of cell keeps its pigment apart from the others');
  const moreYellow = model.setOrganNodes(kinds.document, pigment.organId, 3, sites, kinds.typeId);
  assert.equal(model.organTypes(model.findOrgan(moreYellow, pigment.organId))[1].centers.length, 3);
  assert.equal(
      model
          .organTypes(model.findOrgan(
              model.removeOrganType(moreYellow, pigment.organId, kinds.typeId), pigment.organId))
          .length,
      1);
  assert.match(eyePanel, /data-link-pair/);
  assert.doesNotMatch(eyePanel,
                      /data-add-center|aid-center-tabs|data-field="tau"|data-field="copies"/);
  assert.match(
      panels.inspector({...state, tool : 'hormone', effect : E.output, focusSubstance : 0}),
      /data-phase-handle="start"/);
  assert.deepEqual(panels.phasePatch('start', 0), {start : null});
  assert.deepEqual(panels.phasePatch('end', 1), {end : null});
  assert.ok(panels.phasePatch('end', 0).end > 0, 'A cell dies at some maturity, never at none');
  assert.ok(Math.abs(panels.phasePatch('end', (36 + 107) / 260).end - .5) < 1e-9);
  assert.ok(sitesResult.nearDepth[0] > 0 && sitesResult.nearDepth[1] > sitesResult.nearDepth[0]);
  const sensorEffects = [
    ...panels.inspector({...state, tool : 'hormone', effect : E.output, focusSubstance : 0})
        .matchAll(/data-effect="(\d)"/g)
  ].map(m => +m[1]);
  assert.deepEqual(
      sensorEffects,
      model.effectsFor(model.chosenCenter(state.document, state.selected, state.visionProfile),
                       sitesResult));
  const learner = panels.inspector({
    ...state,
    selected : {kind : 'center', id : relay.centerId},
    tool : 'learn',
    effect : E.learning
  });
  assert.match(learner, /data-learning-memory/);
  assert.match(learner, /aid-episode-arrow teach none/);
  for (const effect of [E.teaching, E.learning, E.competition, E.eligibility])
    assert.match(learner,
                 new RegExp('data-learn-substance="off"[^>]*data-learn-effect="' + effect + '"'));
  const learnShelf = panels.libraryOf({...state, tool : 'learn'});
  assert.equal(learnShelf.kind, 'learn');
  for (const key of ['learn', 'modulate', 'pacemaker'])
    assert.match(learnShelf.html, new RegExp('data-drag-kind="neuron" data-drag-value="' + key));
  for (const effect of [E.teaching, E.learning, E.competition, E.eligibility])
    assert.match(learnShelf.html, new RegExp('data-drag-value="0:' + effect + '"'));
  assert.doesNotMatch(learnShelf.html, new RegExp('data-drag-value="0:' + E.death + '"'));
  assert.equal(panels.libraryOf({...state, tool : 'hormone'}).kind, 'hormone');
  assert.equal(panels.libraryOf({...state, tool : 'select'}).kind, 'select');
  const guide = panels.inspector({...state, selected : null});
  assert.match(guide, /aid-workflow/);
  assert.match(guide, /data-tool="wire"/);
  assert.match(panels.inspector({...state, selected : {kind : 'wire', id : doc.wires[0].id}}),
               /data-remove-wire/);
  assert.match(graph.cppnGraph({...state, report : null}), /aid-cppn/);
  const plan = model.compileDocument(doc, sites);
  const python = `import json,sys,tempfile,time
from atelier_service import run, CompileJobs
from studio_storage import run as store
payload=json.load(sys.stdin); plan=payload['plan']; doc=payload['doc']
with tempfile.TemporaryDirectory(prefix='fish-atelier-test-') as directory:
    assert store(directory,{'operation':'save-draft','document':doc})['saved']
    assert store(directory,{'operation':'load-draft'})['document']==doc
    module={'id':'test','name':'Test','organs':doc['organs'],'wires':doc['wires']}
    store(directory,{'operation':'save-module','module':module})
    assert store(directory,{'operation':'list-modules'})['modules']==[module]
    store(directory,{'operation':'delete-module','id':'test'})
    assert not store(directory,{'operation':'list-modules'})['modules']
jobs=CompileJobs()
start=time.perf_counter();job=jobs.request({'operation':'build-start','plan':plan},None)
phases=set()
while job['status']=='running':
    phases.add(job['phase'])
    assert time.perf_counter()-start<12
    time.sleep(.02)
    job=jobs.request({'operation':'build-status','job':job['job']},None)
assert job['status']=='done',job
built=job['result'];duration=time.perf_counter()-start
assert 'search' in phases
cancelled=jobs.request({'operation':'build-start','plan':payload['example']},None)
jobs.request({'operation':'build-cancel','job':cancelled['job']},None)
while cancelled['status']=='running':
    time.sleep(.02)
    cancelled=jobs.request({'operation':'build-status','job':cancelled['job']},None)
assert cancelled['status']=='cancelled' and 'result' not in cancelled
jobs.close()
assert len(built['groups'])==len(plan['groups'])
assert all(g['cells']==p['copies'] if p['role']!=2 else g['cells']==1 for g,p in zip(built['groups'],plan['groups']))
assert all(len(c)==8 and c[2]>0 for c in built['contacts'])
# The design view: the same cells from the planned groups, without CPPN or development.
designed=run({'operation':'design','plan':plan,'sight':None})
empty=run({'operation':'design','plan':{**plan,'groups':[],'connections':[]},'sight':None})
assert designed['neurons']==built['neurons'] and designed['sites']==built['sites']
assert designed['visionDepth']>0 and designed['bodyRadius']>0 and 'sight' not in designed
# The fish's colour as the engine paints it: pigment can only darken its skin, the more the more
# it is spread; the spines shield it all round, raised at least as well as at rest.
colour=designed['colour']
steps=colour['range']
assert all(0<=q<=r<=s for s,r,q in zip(colour['skin'],steps[0],steps[-1]))
assert all(all(b<=a+1e-9 for a,b in zip(x,y)) for x,y in zip(steps,steps[1:]))
assert set(colour)=={'skin','range'}
assert len(designed['spinesRest'])==len(designed['spinesRaised'])==len(designed['spineGroups'])
assert all(0<=r<=q<=1 for r,q in zip(designed['spinesRest'],designed['spinesRaised']))
assert len(designed['zones'])==4 and abs(sum(e for f,e in designed['zones'])-2)<1e-6
# Sense probes: a scent, a touch, a bite or a current give each group an answer from 0 to 1, or none
# where no cell of the group senses it.
for kind in ('smell','touch','wound','flow','gut'):
    probed=run({'operation':'design','plan':plan,'sight':None,
                'sense':{'kind':kind,'bearing':-60,'distance':3,'strength':.5,'scent':0,'nutrient':.2}})
    answers=probed['senseProbe']
    assert len(answers)==len(plan['groups'])
    assert all(a is None or 0<=a<=1 for a in answers)
# Each group says what its pressure cells measure (-1 without any).
assert len(designed['pressure'])==len(plan['groups']) and all(p>=-1 for p in designed['pressure'])
# Fields agree with the developed fish up to the compiled CPPN's rounding.
flat=lambda groups:[v for g in groups for interval in g for v in interval]
assert len(flat(designed['eyeGroups']))==len(flat(built['eyeGroups']))
assert all(abs(a-b)<1e-4 for a,b in zip(flat(designed['eyeGroups']),flat(built['eyeGroups'])))
assert empty['neurons']==0
# Light groups carry the engine's excitation and inhibition for every hue, and the contrast
# against the surround at which they answer half, between the keenest cell's and full contrast.
lights=[l for l in designed['light'] if l]
assert lights and all(len(l['excitation'])==len(l['inhibition'])>0 for l in lights)
assert all(designed['contrastLeast']-1e-12<=l['half']<=1+1e-12 for l in lights)
inspected=run({'operation':'inspect','genome':built['genome']})
assert inspected['neurons']==built['neurons']
# Editing a compiled genome retains its design contract.
edited=run({'operation':'edit','genome':built['genome'],'plan':plan,'edit':'add-node','type':0,'parameter':1})
assert 'compiler' in edited and edited['compiler']['ok']==built['compiler']['ok']
checked=run({'operation':'check','genome':built['genome'],'plan':plan})
assert len(checked['development'])==4 and 1<=len(checked['mutations'])<=8
assert all(isinstance(trial['ok'],bool) for trial in checked['development']+checked['mutations'])
for bad in ({**plan,'groups':plan['groups']+[plan['groups'][0]]},
            {**plan,'connections':[{'from':999,'to':0,'spread':0,'bundle':0}]},
            {**plan,'compiler':{**plan['compiler'],'reserve':-1}}):
    try: run({'operation':'build','plan':bad})
    except ValueError: pass
    else: raise AssertionError('Malformed plan accepted')
# What the eyes see of a test light: in the field or behind the fish, red or blue.
scene={'side':payload['side'],'bearing':payload['angle'],'distance':32,'radius':6,'hue':0}
target=run({'operation':'design','plan':plan,'sight':scene})
outside=run({'operation':'design','plan':plan,'sight':{**scene,'bearing':180}})
blue=run({'operation':'design','plan':plan,'sight':{**scene,'hue':240}})
audited=[run({'operation':'design','plan':p}) for p in payload['audits']]
example=run({'operation':'build','plan':payload['example']})
assert example['compiler']['ok'],example['compiler']
print(json.dumps({'built':built,'designed':designed,'target':target,'outside':outside,'blue':blue,'duration':duration,'audited':audited,'example':{'viable':example['viable'],'checks':example['checks'],'contacts':example['contacts'],'eggMinimum':example['eggMinimum']}}))`;
  const stimulusStudio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
  Object.assign(stimulusStudio.state, {document : doc, sites, capabilities : sitesResult});
  let electricalPulses = 0, designRequests = 0;
  stimulusStudio.stimulate = () => ++electricalPulses;
  stimulusStudio.requestDesign = () => ++designRequests;
  stimulusStudio.placeStimulus('light');
  assert.equal(electricalPulses, 0, 'A physical design probe must not inject an electrical pulse');
  assert.ok(designRequests > 0);
  const currentEye = model.findOrgan(doc, id);
  const rayPlan = retina.retinalRays(currentEye, sites);
  const exampleStudio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
  Object.assign(exampleStudio.state, {sites, capabilities : sitesResult});
  const regionModel = await import('../ui/studio/model/regions.js');
  exampleStudio.changeDocument =
      next => { exampleStudio.state.document = regionModel.settleRegions(next, sites); };
  exampleStudio.example();
  const exampleCircuit = exampleStudio.state.document.organs.find(o => o.type === 'olfaction');
  const learning = exampleStudio.state.document.organs.filter(o => o.region)
                       .flatMap(o => o.centers)
                       .filter(model.isLearner);
  assert.ok(learning.length && learning.every(c => c.receptors[HORMONE_EFFECT.learning].active));
  const localTeacher =
      model.addNeuron(exampleStudio.state.document, 'modulate', sites, {x : 330, y : 365});
  const taughtByRegion =
      model.addWire(localTeacher.document, localTeacher.centerId,
                    exampleCircuit.centers.find(c => c.node === 'concentration').id, 'both', sites);
  const localTaught = regionModel.settleRegions(taughtByRegion.document, sites);
  assert.ok(!regionModel.fedBy(localTaught, model.findOrgan(localTaught, exampleCircuit.id))
                 .some(o => o.id === model.organOf(localTaught, localTeacher.centerId).id),
            'Local teaching is modulation rather than another sensory input');
  assert.match(panels.inspector({
    ...state,
    document : exampleStudio.state.document,
    selected : {kind : 'organ', id : exampleCircuit.id}
  }),
               /data-region-handle="scent"/);
  const exampleTectum = exampleStudio.state.document.organs.find(o => o.type === 'tectum');
  const crowdedDoc = regionModel.updateRegion(exampleStudio.state.document, exampleTectum.id,
                                              {resolution : 6, colours : 1}, sites);
  assert.ok(model.findOrgan(crowdedDoc, exampleTectum.id).centers.some(c => c.port === 'both'),
            'A crowded region keeps a sending map');
  const crowdedIds = new Set(model.allCenters(crowdedDoc).map(c => c.id));
  assert.ok(regionModel.routedLinks(crowdedDoc, sites)
                .every(l => crowdedIds.has(l.to) || crowdedDoc.organs.some(o => o.id === l.to)));
  assert.doesNotThrow(
      () => panels.inspector(
          {...state, document : crowdedDoc, selected : {kind : 'organ', id : exampleTectum.id}}));
  for (const organ of exampleStudio.state.document.organs.filter(o => o.region))
    assert.equal(organ.centers.length,
                 regionModel.regionPlan(exampleStudio.state.document, organ).nodes.length,
                 organ.type + ' has room for its plan');
  assert.deepEqual(
      [
        ...new Set(exampleStudio.state.document.organs.filter(o => o.region).map(o => o.type))
      ].sort(),
      [ 'choice', 'motor', 'olfaction', 'spine', 'state', 'tectum', 'value' ]);
  const response = JSON.parse(execFileSync('python3', [ '-B', '-c', python ], {
    cwd : root,
    input : JSON.stringify({
      plan,
      audits : organAudits.map(item => model.compileDocument(item.document, sites)),
      doc,
      side : currentEye.side < 0 ? 0 : 1,
      angle : rayPlan[Math.floor(rayPlan.length / 2)].angle,
      example : model.compileDocument(exampleStudio.state.document, sites)
    }),
    encoding : 'utf8',
    timeout : 60000,
    maxBuffer : 32 * 1024 * 1024
  }));
  const {built, target : seen, outside, blue} = response;
  for (const [index, audit] of organAudits.entries()) {
    if (audit.type === 'balance')
      for (const center of model.allCenters(audit.document)) {
        const sensed = response.audited[index].senses[model.centerIndex(audit.document, center.id)];
        assert.equal(center.threshold, 0);
        assert.equal(sensed.intensity, false);
        assert.equal(sensed.adapt, null);
        assert.ok(sensed.response.every((value, step, samples) =>
                                            Math.abs(value - step / (samples.length - 1)) < 1e-6),
                  'The balance editor preserves tilt on a linear stimulus axis');
      }
    if (audit.pressure)
      assert.deepEqual(model.pressureMismatches(audit.document, response.audited[index].pressure),
                       [], 'The bladder measures depth beside its own muscle, not gut filling');
    if (audit.rakers !== undefined) {
      const anatomy = response.audited[index].anatomy;
      assert.ok(anatomy[ANATOMY.gills] > 0 && anatomy[ANATOMY.gill_strength] > 0,
                'The developed fish pumps with its gills');
      assert.ok(Math.abs(anatomy[ANATOMY.gill_rakers] - audit.rakers) < 1e-6,
                'The gill rakers stand as densely as planned');
    }
    if (audit.gutMuscle)
      assert.ok(response.audited[index].anatomy[ANATOMY.gut_muscle] > 0,
                'The developed fish has its gut muscle');
    if (audit.gutLength !== undefined)
      assert.ok(Math.abs(response.audited[index].anatomy[ANATOMY.gut_length] - audit.gutLength) <
                    1e-6,
                'The developed gut takes the length its cells carry');
    if (audit.crowded) {
      const layout = response.audited[index], doc = audit.document;
      const sensors = model.allCenters(doc).filter(c => PRESSURE_OF[c.organType]?.key === c.key);
      assert.deepEqual(sensors.map(c => model.pressureReading(doc, sites.find(s => s.id === c.site),
                                                              sites, layout)),
                       sensors.map(c => layout.pressure[model.centerIndex(doc, c.id)]),
                       'The Atelier predicts what every pressure cell reads, as the body does');
      const wrong = model.pressureMismatches(doc, layout.pressure);
      assert.ok(wrong.length, 'Crowded organs misplace pressure cells');
      for (const center of wrong) {
        const site = model.pressureSites(doc, center.id, sites, layout)[0];
        const moved = model.placeNode(doc, center.id, site.id, sites);
        const answer = JSON.parse(execFileSync(
            'python3',
            [
              '-B', '-c',
              "import json,sys; from atelier_service import run; print(json.dumps(run({'operation':'design','plan':json.load(sys.stdin)})['pressure']))"
            ],
            {
              cwd : root,
              input : JSON.stringify(model.compileDocument(moved, sites)),
              encoding : 'utf8',
              timeout : 30000
            }));
        assert.equal(answer[model.centerIndex(moved, center.id)],
                     PRESSURE_OF[center.organType].source,
                     'The first offered place lets the pressure cell read its own organ');
      }
    }
    const planned = {
      ...state,
      document : audit.document,
      anatomy : response.audited[index],
      report : null,
      genome : '',
      stale : true,
      sightProbe : null,
      senseProbe : null
    };
    const selections = [
      {kind : 'organ', id : audit.id},
      ...model.allCenters(audit.document).map(center => ({kind : 'center', id : center.id}))
    ];
    for (const selected of selections)
      for (const tool of ['select', 'wire', 'hormone', 'learn', 'stimulate', 'erase', 'pan']) {
        const html = panels.inspector({...planned, selected, tool});
        assert.doesNotMatch(html, /NaN|undefined|studio\.[a-zA-Z]/,
                            audit.type + ' ' + tool + ' inspector');
      }
    assert.doesNotMatch(views.fishScene({...planned, selected : selections[0]}),
                        /NaN|undefined|studio\.[a-zA-Z]/, audit.type + ' fish panel');
  }
  const traced = model.planTrace(doc, sites, [ relay.centerId ], sitesResult);
  assert.ok(traced.parts.some(part => part.id === relay.centerId && part.level === 0));
  assert.ok(traced.legs.length, 'The uncompiled plan exposes its outgoing routes');
  assert.ok(traced.parts.length <= 4 * model.allCenters(doc).length, 'Recurrent routes terminate');
  const pulseStudio = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
  Object.assign(pulseStudio.state, {document : doc, sites, capabilities : sitesResult});
  pulseStudio.api = () => { throw Error('A plan impulse must not request a neural simulation'); };
  pulseStudio.stimulate([ relay.centerId ]);
  assert.ok(pulseStudio.state.stimulus, 'A plan impulse works without a CPPN');
  {
    const target = {id : relay.centerId};
    const learner = new OrganStudio({querySelector : () => null, querySelectorAll : () => []});
    learner.state.document = model.bindReceptor(doc, target.id, HORMONE_EFFECT.teaching, 0);
    const leg = {from : 'sender', to : target.id, kind : 'electrical', sign : 1, level : 1};
    const learned = parts => {
      const stimulus = {fired : new Set(), sent : [ leg ], learned : [], taught : new Map()};
      for (const part of parts) {
        if (part.kind === 'electrical')
          stimulus.fired.add(part.id);
        learner.learnedPaths(part, stimulus);
      }
      return stimulus.learned.length;
    };
    const fires = {id : target.id, kind : 'electrical', sign : 1, level : 2};
    const held = {id : target.id, kind : 'hormone', sign : 0, level : 2, substance : 0};
    const node = {id : target.id, kind : 'teaching', sign : 0, level : 2};
    assert.equal(learned([ fires, {...held, substance : 1} ]), 0,
                 'Another substance does not teach');
    assert.equal(learned([ fires, held ]), 1, 'The substance its teaching receptor holds teaches');
    assert.equal(learned([ node, fires ]), 1, 'A teacher in the step of the firing teaches');
    assert.equal(learned([ {...node, level : 1}, fires ]), 0,
                 'A teacher before the firing does not');
  }
  const mixedRelayIndex = model.allCenters(doc).findIndex(center => center.id === relay.centerId);
  const mixed = model.cppnTrace({
    ...state,
    document : doc,
    sites,
    stale : false,
    report : {...built, contacts : [ [ mixedRelayIndex, mixedRelayIndex, 2, 0, 1, 1, .5, -.5 ] ]}
  },
                                [ relay.centerId ]);
  assert.ok(mixed.parts.some(part => part.id === relay.centerId && part.sign < 0),
            'Mixed CPPN groups expose inhibitory paths as well');

  const sampled = {
    ...state,
    report : built,
    genome : built.genome,
    stale : false,
    selected : {kind : 'center', id : relay.centerId}
  };
  for (const tool of ['select', 'stimulate', 'hormone', 'learn']) {
    const markup = panels.inspector({...sampled, tool});
    assert.doesNotMatch(markup, /NaN|undefined|studio\.[a-zA-Z]/,
                        tool + ' renders the same planned fish');
  }
  assert.equal(model.contactRows({...sampled, tool : 'select'}), built.contacts);
  const planned = {...sampled, genome : '', report : null, stale : true, tool : 'select'};
  const planningInspector = panels.inspector(planned);
  assert.match(planningInspector, /aid-contact-plan/);
  assert.match(planningInspector, /data-preview-handle="situation"/);
  assert.match(planningInspector, /data-phase=/);
  assert.doesNotMatch(planningInspector, /NaN|undefined|studio\.[a-zA-Z]/);

  assert.ok(response.example.viable, JSON.stringify(response.example.checks));
  const exampleDoc = exampleStudio.state.document, exampleCenters = model.allCenters(exampleDoc);
  const organOf = index => model.findCenter(exampleDoc, exampleCenters[index].id).organ;
  const optic = response.example.contacts.filter(([ from, to ]) => organOf(from).type === 'eye' &&
                                                                   organOf(to).type === 'tectum');
  // Developed sight crosses; only cells that see across the midline also reach their own side.
  const retinaModel = await import('../ui/studio/model/retina.js');
  assert.ok(optic.length &&
            optic.every(
                ([ from, to ]) =>
                    organOf(from).side * organOf(to).side < 0 ||
                    retinaModel.midlineCenters(organOf(from), sites).has(exampleCenters[from].id)));
  assert.ok(response.example.contacts.every(([ from, to ]) => organOf(from).type !== 'tectum' ||
                                                              organOf(to).type !== 'tectum' ||
                                                              organOf(from) === organOf(to)));
  for (const kind of [MOTOR_KIND.aggression, MOTOR_KIND.suction]) {
    const muscles =
        exampleDoc.organs.filter(o => o.type === 'muscle' && organFunction(o, sites) === kind);
    assert.ok(muscles.length);
    const feeders = exampleDoc.wires.filter(w => muscles.some(m => m.id === w.to))
                        .map(w => model.findOrgan(exampleDoc, w.from)?.type)
                        .sort();
    assert.deepEqual([...new Set(feeders) ], [ 'motor' ], 'Motorik drives the mouth muscles');
    assert.ok(response.example.contacts.some(([, to ]) => muscles.includes(organOf(to))),
              'The built fish reaches its mouth muscles of kind ' + kind);
  }
  assert.ok(geometry.FISH_BOX.width / geometry.CAMERA_ZOOM.min >=
            response.designed.visionDepth * geometry.BODY_RADIUS);
  console.log('Atelier compilation: ' + response.duration.toFixed(3) + ' s');
  const {RECEPTOR, VISUAL_SAMPLE} = await import('../ui/schema.js');
  const indices = new Set(model.allCenters(doc).flatMap((c, i) => c.organId === id ? [ i ] : []));
  const eyeCells = r =>
      r.sight.receptors.flatMap((row, i) => indices.has(r.sight.groups[i]) ? [ row ] : []);
  const answers = r =>
      new Map(r.sight.samples.map(v => [v[VISUAL_SAMPLE.neuron], v[VISUAL_SAMPLE.response]]));
  const maximum = r =>
      Math.max(0, ...eyeCells(r).map(row => answers(r).get(row[RECEPTOR.neuron]) ?? 0));
  assert.ok(maximum(seen) > maximum(outside) + .01,
            'A test light inside the field excites the eye');
  const targetAngle = rayPlan[Math.floor(rayPlan.length / 2)].angle;
  const responseAt = r => Math.max(
      ...eyeCells(r)
          .filter(row => Math.abs(row[RECEPTOR.angle] * 180 / Math.PI - targetAngle) < .001)
          .map(row => answers(r).get(row[RECEPTOR.neuron]) ?? 0));
  assert.ok(responseAt(seen) > responseAt(blue) + .01,
            'Red-selective cells distinguish red from blue at the target');
  const readout = await import('../ui/organ_readout.js');
  const typeRows =
      readout.eyeTypeAnswers(readout.eyeSight(seen.sight.bands, seen.sight.samples, eyeCells(seen),
                                              model.findOrgan(doc, id).side < 0 ? 0 : 1));
  assert.equal(typeRows.length,
               new Set(model.findOrgan(doc, id).field.profiles.map(p => p.id)).size);
  assert.ok(typeRows.every(row => row.values.some(v => v !== null) &&
                                  row.values.every(v => v === null || (v >= 0 && v <= 1))));
  for (const ray of rayPlan) {
    const index = model.allCenters(doc).findIndex(c => c.id === ray.center);
    const actual = seen.sight.receptors.find(
        (row, i) => seen.sight.groups[i] === index &&
                    Math.abs(row[RECEPTOR.angle] * 180 / Math.PI - ray.angle) < .001);
    assert.ok(actual, 'Displayed receptor has an engine counterpart');
    assert.ok(Math.abs(actual[RECEPTOR.view_left] * 180 / Math.PI - ray.left) < .001);
    assert.ok(Math.abs(actual[RECEPTOR.view_right] * 180 / Math.PI - ray.right) < .001);
  }
  const rendered = {
    ...state,
    camera : {...state.camera, zoom : 4.2},
    anatomy : seen,
    report : built,
    stale : false,
    selected : {kind : 'organ', id},
    sightProbe : {
      side : currentEye.side < 0 ? -1 : 1,
      bearing : targetAngle,
      distance : 32,
      radius : 6,
      hue : 0
    }
  };
  const svg = views.fishScene(rendered);
  assert.match(svg, /class="aid-fish-body"/);
  assert.match(svg, /data-vision-handle="density"/);
  assert.match(svg, /data-vision-handle="resolution"/);
  assert.match(svg, /data-vision-handle="probe"/);
  assert.match(svg, /class="aid-vision-seen"/);
  assert.match(svg, /class="aid-retina-node/, 'The chosen eye shows its cells as nodes');
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  for (const c of model.allCenters(doc)) {
    const p = views.nodeLocation(doc, sites, c, c.organType);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  }
  for (const type of ['eye', 'proximity', 'muscle', 'eggs', 'sperm', 'gland'])
    assert.ok(doc.organs.filter(o => o.type === type)
                  .some(o => svg.includes('data-organ="' + o.id + '"')),
              type + ' remains selectable');
  // The field opens at the eye as drawn.
  const fan = vision.visionGeometry(rendered, currentEye);
  assert.deepEqual(fan.eye, views.viewOrigin(doc, sites, currentEye.side < 0 ? -1 : 1));
  assert.deepEqual(fan.origin, fan.eye);
  const inside = {side : currentEye.side, bearing : 30, distance : 0, radius : .01, hue : 20};
  const cleared = vision.clearOfFish(rendered, currentEye, inside);
  const lit = fan.pointText(cleared.bearing, cleared.distance * fan.world);
  assert.ok(cleared.distance > 0 && Math.hypot(lit.x - fan.eye.x, lit.y - fan.eye.y) >= fan.cut);
  {
    const E = HORMONE_EFFECT, r = (baseline, sensitivity) => ({baseline, sensitivity});
    assert.equal(model.effectLevel(E.output, 0), .5);
    assert.equal(model.effectDirection(E.output, r(0, 1)), 1);
    assert.equal(model.effectDirection(E.output, r(1, -2)), -1);
    assert.equal(model.effectDirection(E.death, r(0, 1)), 1);
    assert.equal(model.effectDirection(E.death, r(.8, -1)), -1);
    assert.equal(model.effectDirection(E.learning, r(0, 0)), 0);
    assert.deepEqual(model.startEnds(E.output), {without : 1, with : -1});
    const effectsView = await import('../ui/studio/view/effects.js');
    assert.notEqual(effectsView.effectScene(E.output, '#fff', {without : 0, with : 1}),
                    effectsView.effectScene(E.output, '#fff', {without : 1, with : 0}),
                    'Each side plays as the receptor answers there');
    const substancesView = await import('../ui/studio/view/substances.js');
    assert.match(substancesView.boundEffect(E.output, 1), /aid-direction/);
  }
  const started = vision.beyondHandles(rendered, currentEye, cleared);
  const away = fan.pointText(started.bearing, started.distance * fan.world);
  assert.ok(Math.hypot(away.x - fan.eye.x, away.y - fan.eye.y) > fan.handle,
            'A new test light covers none of the handles');
  const onRing = fan.ring(currentEye.side * 45, fan.handle);
  assert.ok(Math.abs(Math.hypot(onRing.x - fan.eye.x, onRing.y - fan.eye.y) - fan.handle) < 1e-6);
  assert.throws(() => model.validateDocument({...doc, format : 'v019-organ-studio'}));
  const withoutOptions = structuredClone(doc);
  delete withoutOptions.compiler;
  assert.deepEqual(
      model.compileDocument(withoutOptions, sites), model.compileDocument(doc, sites),
      'Optional compiler settings have defaults; existing drafts keep every organ and wire');
  assert.equal(withoutOptions.compiler, undefined, 'Reading defaults does not mutate the document');
  const before = JSON.stringify(doc);
  const full = JSON.parse(JSON.stringify(doc));
  assert.deepEqual(model.compileDocument(full, sites), plan,
                   'Round-trip keeps the exact compiler plan');
  assert.equal(JSON.stringify(doc), before);
  // UI request races cannot install geometry or a genome from a previous document.
  const emptyRoot = {querySelector : () => null, querySelectorAll : () => []};
  const editor = new OrganStudio(emptyRoot);
  editor.state = {...editor.state, ...state};
  editor.refreshScene = editor.refreshInspector = editor.refreshHeader = () => {};
  let resolveBuild;
  editor.api = () => new Promise(resolve => { resolveBuild = resolve; });
  const pending = editor.develop();
  editor.state.document = model.updateField(doc, id, {density : 4}, sites);
  resolveBuild(built);
  await pending;
  assert.equal(editor.state.report, null);
  assert.equal(editor.state.genome, '');
  const {acceptedGenome, compilerPanel} = await import('../ui/studio/view/compiler.js');
  editor.state = {
    ...editor.state,
    document : doc,
    genome : 'test',
    stale : false,
    report : {compiler : {ok : true}}
  };
  assert.ok(acceptedGenome(editor.state));
  editor.state.report.compiler.ok = false;
  assert.ok(!acceptedGenome(editor.state));
  let requested = false;
  editor.api = async () => { requested = true; };
  await editor.checkCompiler();
  assert.ok(!requested, 'A failed build cannot start robustness tests');
  editor.state.report.compiler.ok = true;
  editor.api = () => new Promise(resolve => { resolveBuild = resolve; });
  const checkPending = editor.checkCompiler();
  editor.state.document = model.updateField(doc, id, {density : 5}, sites);
  resolveBuild({development : [ {ok : true} ], mutations : []});
  await checkPending;
  assert.ok(!editor.state.robustness, 'A late check cannot attach to an edited plan');
  assert.match(compilerPanel({...editor.state, stale : true}), /data-compiler-option="reserve"/);
  const svgElement = {
    getBoundingClientRect : () => ({left : 0, top : 0, width : 1000, height : 620}),
    setAttribute() {}
  };
  const pan = new OrganStudio(emptyRoot);
  pan.state.station = 'studio';
  pan.pointerDown({
    button : 0,
    clientX : 200,
    clientY : 200,
    target : {closest : sel => sel === views.BODY_MAP ? svgElement : null}
  });
  assert.ok(pan.pointer.pan, 'Dragging the empty canvas pans without switching tools');
  pan.pointerMove({clientX : 240, clientY : 220});
  assert.notEqual(pan.state.camera.x, 560);
  pan.pointerUp({preventDefault() {}});
  const chooser = new OrganStudio(emptyRoot);
  chooser.state = {...chooser.state, ...state, document : twoTypes, visionProfile : null};
  chooser.refreshScene = chooser.refreshInspector = () => {};
  chooser.api = () => new Promise(() => {});
  chooser.select('center', extraNode);
  assert.equal(chooser.state.visionProfile, 'extra');
  chooser.select('organ', id);
  assert.deepEqual(chooser.state.selected, {kind : 'organ', id});
  chooser.select(null, null);
  assert.equal(chooser.state.selected, null);
  assert.equal(chooser.state.visionProfile, 'extra');
  const wiresView = await import('../ui/studio/view/wires.js');
  const bentWire = doc.wires[0];
  const bendState = {...state, document : doc, tool : 'wire'};
  const bendPoint = {x : 400, y : 300};
  const bends = wiresView.bendsWith(bendState, [ bentWire.id ], bendPoint, false);
  assert.deepEqual(bends, [ bendPoint ]);
  const bentDoc = model.setBends(doc, [ bentWire.id ], bends);
  assert.deepEqual(bentDoc.wires.find(w => w.id === bentWire.id).bends, [ bendPoint ]);
  assert.match(views.fishScene({...bendState, document : bentDoc}), /data-bend-index="0"/);
  assert.equal(
      model.setBends(bentDoc, [ bentWire.id ], []).wires.find(w => w.id === bentWire.id).bends,
      undefined);
  assert.throws(() => model.validateDocument(
                    {...bentDoc, wires : [ {...bentWire, bends : [ {x : 'a', y : 1} ]} ]}));
  const toTeach = model.addNeuron(model.newDocument('Lehrer'), 'learn', sites, {x : 380, y : 325});
  const teacherStudio = new OrganStudio(emptyRoot);
  teacherStudio
      .state = {...teacherStudio.state, ...state, document : toTeach.document, tool : 'learn'};
  teacherStudio.refreshScene = teacherStudio.refreshInspector = teacherStudio.refreshHeader =
      () => {};
  teacherStudio.api = () => new Promise(() => {});
  assert.ok(teacherStudio.ontoNerve('neuron', 'modulate') &&
            !teacherStudio.ontoNerve('neuron', 'relay'));
  const learnerCell = model.findCenter(toTeach.document, toTeach.centerId).center;
  teacherStudio.dropOntoNerve(
      'modulate', {element : {dataset : {center : learnerCell.id}}, centers : [ learnerCell ]},
      {x : 380, y : 325});
  const teaching = teacherStudio.state.document.wires.filter(w => w.to === learnerCell.id);
  assert.equal(teaching.length, 1);
  assert.equal(model.findCenter(teacherStudio.state.document, teaching[0].from).center.key,
               'modulate');
  assert.deepEqual(teacherStudio.state.selected, {kind : 'center', id : learnerCell.id});
  assert.equal(teacherStudio.state.tool, 'learn');
  const relayNode =
      model.addNeuron(teacherStudio.state.document, 'relay', sites, {x : 420, y : 325});
  teacherStudio.state.document = relayNode.document;
  const relayCell = model.findCenter(relayNode.document, relayNode.centerId).center;
  assert.equal(nerveKind(relayCell), 'relay');
  teacherStudio.dropOntoNerve(
      'learn', {element : {dataset : {center : relayCell.id}}, centers : [ relayCell ]},
      {x : 420, y : 325});
  const learned = model.findCenter(teacherStudio.state.document, relayCell.id).center;
  assert.equal(nerveKind(learned), 'learn');
  assert.equal(learned.key, 'relay');
  assert.ok(learned.qwidth > 0);
  const movement = new OrganStudio({
    querySelector : () => ({
      getBoundingClientRect : () => ({left : 0, top : 0, right : 1000, bottom : 620}),
      hidden : false,
      classList : {toggle() {}, remove() {}},
      replaceChildren() {}
    })
  });
  movement.state.sites = sites;
  movement.clearPreview = () => {};
  movement.pointer = {kind : 'organ', id, moved : true, svg : svgElement};
  let deleted = false;
  movement.removeSelection = () => { deleted = true; };
  movement.pointerUp({clientX : 1500, clientY : 20, preventDefault() {}});
  assert.equal(deleted, false);
  movement.pointer = {kind : 'organ', id, moved : true, svg : svgElement};
  movement.notice = () => {};
  movement.pointerUp({clientX : 500, clientY : 300, preventDefault() {}});
  assert.equal(deleted, true);
  {
    const {MOTOR_KIND : MK, ATELIER_LIMITS} = await import('../ui/schema.js');
    const {finVolumeOf, tailFinSize} = await import('../ui/fish_organs.js');
    const tail = model.addOrgan(model.newDocument('Knoten'), 'muscle', sites, {x : 870, y : 340});
    assert.ok(tail);
    const grown = model.setOrganNodes(tail.document, tail.organId, 4, sites);
    const organ = model.findOrgan(grown, tail.organId), twin = model.findOrgan(grown, organ.pair);
    assert.equal(organ.centers.length, 4);
    assert.equal(twin.centers.length, 4, 'The linked twin recruits as many nodes');
    const siteOf = c => sites.find(s => s.id === c.site);
    for (const c of [...organ.centers, ...twin.centers])
      assert.equal(functionFor(c, siteOf(c)), MK.forward, 'Every node drives the tail');
    assert.equal(new Set(organ.centers.map(c => siteOf(c).side)).size, 1);
    assert.equal(new Set([...organ.centers, ...twin.centers ].map(c => c.site)).size, 8);
    assert.equal(
        model.findOrgan(model.setOrganNodes(grown, organ.id, 2, sites), organ.id).centers.length, 2,
        'The last nodes go first');
    assert.equal(model.setOrganNodes(grown, 'brain', 3, sites), null);
    const most = nodeLimit(organ, sites);
    assert.equal(most, musclePlaces(sites, MK.forward, organ.side).length);
    assert.equal(
        model.findOrgan(model.setOrganNodes(grown, organ.id, 999, sites), organ.id).centers.length,
        most);
    const again = model.addOrgan(grown, 'muscle', sites, {x : 870, y : 340});
    assert.equal(again.organId, organ.id);
    assert.equal(again.document.organs.length, grown.organs.length);
    assert.ok(tailFinSize(finVolumeOf(8, 1)).length > tailFinSize(finVolumeOf(2, 1)).length,
              'More cells make a longer tail fin');
    assert.equal(model.muscleTrait(grown, MK.forward, 'undulation', sites), .5);
    const waving = model.setMuscleTrait(grown, MK.forward, 'undulation', .9, sites);
    assert.ok(Math.abs(model.muscleTrait(waving, MK.forward, 'undulation', sites) - .9) < 1e-9);
    assert.equal(model.setMuscleTrait(grown, MK.aggression, 'jaw_length', .2, sites), null,
                 'Without biting muscles there is no jaw to set');
    assert.equal(organ.sprint, 0, 'A new muscle answers every command with all its nodes');
    const sprinting = model.setMuscleSprint(grown, organ.id, .5);
    assert.equal(model.findOrgan(sprinting, organ.pair).sprint, .5,
                 'The linked twin keeps as many nodes for a sprint');
    const sprintPlan = model.compileDocument(sprinting, sites),
          everyCenter = model.allCenters(sprinting);
    const thresholds =
        model.findOrgan(sprinting, organ.id)
            .centers.map(
                c => sprintPlan.groups[everyCenter.findIndex(e => e.id === c.id)].threshold);
    assert.deepEqual(thresholds.map(x => x === model.SPRINT_THRESHOLD),
                     [ false, false, true, true ], 'The last nodes join only a strong command');
    // A muscle's fibres ride on its cells' time constant, alike on the linked twin.
    assert.ok(model.muscleFibre(organ) > .5 && model.muscleFibre(organ) < 1,
              'A new swimming muscle mixes its fibres, leaning to fast ones for a quick beat');
    const whiteFibres = model.setMuscleFibre(grown, organ.id, 1);
    assert.ok([ organ.id, organ.pair ].every(
                  id => model.muscleFibre(model.findOrgan(whiteFibres, id)) === 1),
              'Both halves of the tail turn fast');
    const whitePlan = model.compileDocument(whiteFibres, sites);
    assert.ok(
        model.findOrgan(whiteFibres, organ.id)
            .centers.every(c => whitePlan.groups[model.centerIndex(whiteFibres, c.id)].tau === 0),
        'Fast fibres contract in short strokes');
    assert.equal(model.setMuscleFibre(grown, 'brain', 1), null, 'Only muscles have fibres');
    const {settleRegions, updateRegion} = await import('../ui/studio/model/regions.js');
    const {organSlots, slotCenters} = await import('../ui/studio/model/organs.js');
    const motorAdded =
        model.addOrgan(model.newDocument('Motorik'), 'motor', sites, {x : 470, y : 300});
    const motorDoc = settleRegions(motorAdded.document, sites);
    const motor = model.findOrgan(motorDoc, motorAdded.organId);
    assert.ok(motor.pair, 'Motor coordination has a half on each side');
    const reached = key => slotCenters(motor, key, 'in').map(c => c.node).sort();
    assert.deepEqual(reached('toward'), [ 'oppose', 'turn' ],
                     'A stimulus on one side turns towards it and holds back the other side');
    assert.deepEqual(reached('near'), [ 'brake', 'hold', 'mouth' ],
                     'Food at the mouth slows the fish, keeps it down and opens the mouth');
    assert.ok(organSlots(motor).every(s => slotCenters(motor, s.key, s.dir).length),
              'Every motor port reaches its own node');
    const quiet = settleRegions(updateRegion(motorDoc, motor.id, {compete : 0}, sites), sites);
    assert.ok(!model.findOrgan(quiet, motor.id).centers.some(c => c.node === 'oppose'),
              'Without competition no node inhibits the other side');
    assert.doesNotThrow(() => model.compileDocument(motorDoc, sites));
    // A fish that can retreat drives the antagonist fin muscles: a second pectoral muscle per
    // side whose forward stroke pushes it back.
    const retreating = settleRegions(updateRegion(motorDoc, motor.id, {retreat : 1}, sites), sites);
    assert.deepEqual(
        slotCenters(model.findOrgan(retreating, motor.id), 'back', 'in').map(c => c.node),
        [ 'retreat' ]);
    const {sitePoint} = await import('../ui/studio/model/layout.js');
    const {FIN_STROKE} = await import('../ui/schema.js');
    const finSite = musclePlaces(sites, MK.turn, -1)[0];
    const finned = model.addOrgan(retreating, 'muscle', sites, sitePoint(finSite, 'motor'));
    const back = model.findOrgan(finned.document, finned.organId);
    assert.ok(model.isFinMuscle(back, sites));
    const antagonist = model.addAntagonist(finned.document, back.id, sites);
    const both =
        [ antagonist.organId, model.findOrgan(antagonist.document, antagonist.organId).pair ].map(
            id => model.findOrgan(antagonist.document, id));
    assert.ok(both.every(o => o.centers.length === back.centers.length &&
                              o.centers.every(c => c.polarity === FIN_STROKE.front)),
              'Each fin gets an antagonist with as many nodes that strokes forward');
    assert.equal(model.addAntagonist(antagonist.document, back.id, sites), null,
                 'A fin holds one antagonist per side');
    const wired = model.addWire(antagonist.document, motor.id, both[0].id, 'both', sites,
                                {fromPort : 'reverse', toPort : null});
    assert.ok(wired, 'Motorik drives the forward strokes');
    const plan = model.compileDocument(wired.document, sites),
          every = model.allCenters(wired.document);
    const front = new Set(both.flatMap(o => o.centers.map(c => c.id)));
    assert.ok(
        every.every((c, i) => (plan.groups[i].polarity === FIN_STROKE.front) === front.has(c.id) ||
                              c.role !== 'motor'),
        'Only the antagonist cells stroke forward in the plan');
    // Behind the pectoral fin a pelvic fin takes the fin sites at the front of the tail zone; a
    // plain muscle there stays a tail muscle.
    const organKinds = await import('../ui/studio/model/organs.js');
    const {isPelvicSite, isPelvicMuscle} = organKinds;
    const pelvicSites = sites.filter(isPelvicSite);
    assert.ok(pelvicSites.length && pelvicSites.every(s => s.zone === 3 && s.u >= .7),
              'Pelvic fin sites lie at the front of the tail zone');
    assert.ok(
        pelvicSites.every(s => organKinds.functionFor({functionCode : 'site'}, s) === MK.forward),
        'A plain muscle at the front of the tail zone works the tail');
    const pelvicSite = musclePlaces(sites, MK.turn, -1, true)[0];
    assert.ok(isPelvicSite(pelvicSite));
    const pelvic = model.addOrgan(wired.document, 'muscle', sites, sitePoint(pelvicSite, 'muscle'),
                                  Infinity, true, MK.turn, true);
    const pelvicFin = model.findOrgan(pelvic.document, pelvic.organId);
    assert.ok(isPelvicMuscle(pelvicFin) && model.isFinMuscle(pelvicFin, sites) &&
                  pelvicFin.centers.every(c => isPelvicSite(sites.find(s => s.id === c.site))),
              'A pelvic fin muscle sits on pelvic fin sites only');
    assert.ok(model.findOrgan(pelvic.document, pelvicFin.pair),
              'A pelvic fin muscle has a twin on the other side');
    assert.notEqual(pelvicFin.id, back.id, 'The pelvic fin does not join the pectoral muscle');
    assert.equal(model.antagonistOf(pelvic.document, pelvicFin, sites), null,
                 'The pectoral antagonist is not the pelvic fin\'s antagonist');
    const pelvicPair = model.addAntagonist(pelvic.document, pelvicFin.id, sites);
    const pelvicFront = model.findOrgan(pelvicPair.document, pelvicPair.organId);
    assert.ok(isPelvicMuscle(pelvicFront) && model.finStroke(pelvicFront) === FIN_STROKE.front,
              'A pelvic fin gets its own antagonist on pelvic sites');
    const angled = model.setFinAngle(pelvicPair.document, pelvicFin.id, 1, sites);
    assert.equal(model.finAngle(model.findOrgan(angled, pelvicFin.id)), 1);
    assert.equal(model.finAngle(model.findOrgan(angled, pelvicFin.pair)), 1,
                 'The fin angle holds for both sides');
    assert.equal(model.finAngle(model.findOrgan(angled, pelvicFront.id)), .5,
                 'The antagonist keeps its own angle');
    const pelvicPlan = model.compileDocument(angled, sites), allPelvic = model.allCenters(angled);
    assert.ok(
        allPelvic.some(c => c.pelvic) &&
            allPelvic.every((c, i) => !c.pelvic || (pelvicPlan.groups[i].function === MK.turn &&
                                                    pelvicPlan.groups[i].zone === 3)),
        'Pelvic fin cells compile as fin cells in the tail zone');
    // Inner pacemakers: one pool beats for both sides, because mirrored pacemakers run in
    // antiphase and would keep the tail and mouth busy without a pause.
    const paced =
        settleRegions(updateRegion(motorDoc, motor.id, {beat : 2, pump : 1}, sites), sites);
    const halves = [ motor.id, motor.pair ].map(id => model.findOrgan(paced, id));
    const pool = node => halves.flatMap(h => h.centers.filter(c => c.node === node));
    for (const node of ['beat', 'pump']) {
      assert.equal(pool(node).length, 1, 'One ' + node + ' pacemaker for both halves');
      assert.equal(model.organOf(paced, pool(node)[0].id).side, -1);
    }
    const {routedLinks} = await import('../ui/studio/model/regions.js');
    const driven = node => routedLinks(paced, sites)
                               .filter(l => l.from === pool(node)[0].id)
                               .map(l => model.findCenter(paced, l.to).center.node)
                               .sort();
    assert.deepEqual(driven('beat'), [ 'swim', 'swim' ], 'The beat reaches the tail of both sides');
    assert.deepEqual(driven('pump'), [ 'bite', 'bite', 'mouth', 'mouth' ],
                     'The pump opens and closes the whole mouth');
    // The balance organ's hair direction is dragged in a picture: toward the head, the flank or
    // the tail; both sides take it, and the plan carries it to the engine as quality 1.
    const {hairPatch, hairVector} = await import('../ui/studio/view/balance.js');
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    assert.ok(near(hairPatch(0, .5).q1, -1) && near(hairPatch(104 / 300, 1).q1, 0) &&
                  near(hairPatch(1, .5).q1, 1),
              'The hair follows the pointer from the head over the flank to the tail');
    assert.ok(near(hairVector(0, 1).y, 1) && near(hairVector(0, -1).y, -1),
              'A flank hair points to its own side');
    const balanced =
        model.addOrgan(model.newDocument('Lage'), 'balance', sites, {x : 300, y : 300});
    const sides = [ balanced.organId, model.findOrgan(balanced.document, balanced.organId).pair ];
    const tilted = model.updateCenter(
        balanced.document, model.findOrgan(balanced.document, sides[0]).centers[0].id, {q1 : .4});
    const balancePlan = model.compileDocument(tilted, sites);
    assert.ok(
        sides.every(
            id => model.findOrgan(tilted, id)
                      .centers.every(
                          c => near(balancePlan.groups[model.centerIndex(tilted, c.id)].q1, .4))),
        'Both balance organs carry the same hair direction into the plan');
    const beat = pool('beat')[0];
    assert.ok(model.receptorResponse(sitesResult, beat.receptors[HORMONE_EFFECT.rhythm], [], 1) >
                  -1,
              'The pacemaker keeps beating in the adult');
    assert.match(views.organTitle(organ, sites), /Schwanz/);
    const pigment =
        model.addOrgan(model.newDocument('Farbe'), 'pigment', sites, {x : 600, y : 260});
    const deeper = model.setOrganNodes(pigment.document, pigment.organId, 12, sites);
    assert.equal(model.findOrgan(deeper, pigment.organId).centers.length, 12);
    const blood = model.addOrgan(model.newDocument('Blut'), 'blood', sites, {x : 610, y : 405});
    assert.equal(model.findOrgan(blood.document, blood.organId).pair, null);
    assert.equal(model.addOrgan(blood.document, 'blood', sites, {x : 610, y : 325}).organId,
                 blood.organId);
    const firstRead =
        model.substanceRead(sitesResult, model.findOrgan(blood.document, blood.organId).centers[0]);
    const twoTypes = model.addOrganType(
        blood.document, blood.organId, sites,
        model.nextTypeTuning(model.findOrgan(blood.document, blood.organId), sitesResult));
    const reads = model.organTypes(model.findOrgan(twoTypes.document, blood.organId))
                      .map(type => model.substanceRead(sitesResult, type.centers[0]));
    assert.equal(reads.length, 2);
    assert.ok(reads.includes(firstRead) && new Set(reads).size === 2);
    const ovary = model.addOrgan(model.newDocument('Eier'), 'eggs', sites, {x : 708, y : 380});
    const fertile = model.setOrganNodes(ovary.document, ovary.organId, 99, sites);
    const gonad = model.findOrgan(fertile, ovary.organId), keys = gonad.centers.map(c => c.key);
    assert.equal(keys.filter(k => k === 'growth').length, kindLimit(gonad, sites));
    assert.equal(keys.length, ORGAN_BY_KEY.eggs.nodes);
    assert.deepEqual(keys.filter(k => k !== 'growth'),
                     [ 'release', 'release', 'pressure', 'pressure' ]);
    assert.equal(model.compileDocument(fertile, sites).groups.length, keys.length);
    const sacs = await import('../ui/studio/view/sacs.js');
    const initial = model.findOrgan(ovary.document, ovary.organId);
    const initialStore =
        sacs.gonadStore({document : ovary.document, sites, capabilities : sitesResult}, initial);
    assert.equal(initialStore.room, sitesResult.gonads.eggs.most,
                 'Pressure cells do not subtract chambers from the ovary storage ceiling');
    assert.ok(initialStore.spawn > response.example.eggMinimum,
              'A newly placed ovary can fund the compiled example egg without adding cells');
    const fewer = model.setOrganNodes(fertile, gonad.id, 2, sites);
    assert.deepEqual(model.findOrgan(fewer, gonad.id).centers.map(c => c.key).sort(),
                     [ 'growth', 'growth', 'pressure', 'pressure', 'release', 'release' ]);
    const small = model.findOrgan(fewer, gonad.id);
    const sacState = {document : fewer, sites, capabilities : sitesResult};
    const store = sacs.gonadStore(sacState, small);
    assert.equal(store.room, sitesResult.gonads.eggs.perCell * 4);
    assert.ok(Number.isFinite(store.steps),
              'The plan shows filling for an assumed input before CPPN compilation');
    assert.equal(sacs.gonadStore({...sacState, previewInput : 0}, small).steps, Infinity);
    const sac = sacs.gonadGraphic(sacState, small);
    assert.equal(sac.match(/aid-sac-chamber growth"/g).length, 2);
    assert.ok(sac.includes('data-sac-handle="cells"'));
    assert.ok(sacs.sacPatch(sacState, small, .2).nodes > 2);
    assert.equal(sacs.sacPatch(sacState, small, .9).nodes, 2);
    const testis =
        model.addOrgan(model.newDocument('Spermien'), 'sperm', sites, {x : 708, y : 380});
    const testisState = {document : testis.document, sites, capabilities : sitesResult};
    const testisOrgan = model.findOrgan(testis.document, testis.organId);
    for (const key of ['growth', 'release', 'pressure'])
      assert.deepEqual(new Set(testisOrgan.centers.filter(c => c.key === key)
                                   .map(c => geometry.findSite(sites, c.site).side)),
                       new Set([ -1, 1 ]), 'Each gonad function starts on both anatomical sides');
    const driverSite = sites.find(s => s.zone === 2 && !s.outer && s.w > 0 && s.side < 0);
    const gonadDriver = model.addOrgan(testis.document, 'olfaction', sites,
                                       geometry.sitePoint(driverSite, 'nerve'));
    const gonadWire = model.addWire(gonadDriver.document, gonadDriver.organId, testis.organId,
                                    'same', sites, {fromPort : 'presence'});
    for (const [pairing, sign] of [[ 'same', 1 ], [ 'crossed', -1 ]]) {
      const wired = model.updateWire(gonadWire.document, gonadWire.wireId, {pairing});
      const plan = model.compileDocument(wired, sites), centers = model.allCenters(wired);
      const motorIds = new Set(testisOrgan.centers.filter(c => c.role === 'motor').map(c => c.id));
      const links = plan.connections.filter(c => motorIds.has(centers[c.to].id));
      assert.equal(links.length, 4);
      assert.ok(links.every(c => geometry.findSite(sites, centers[c.from].site).side *
                                     geometry.findSite(sites, centers[c.to].site).side ===
                                 sign),
                'Paired regions project separately to the two sides of one gonad');
      assert.deepEqual(
          model.wireContactPairs(wired, wired.wires.find(w => w.id === gonadWire.wireId), sites),
          new Set(links.map(c => c.from + ':' + c.to)));
    }
    assert.match(sacs.gonadGraphic(testisState, model.findOrgan(testis.document, testis.organId)),
                 /aid-gonad-graphic/);
    // What the store makes is told in the tooltip of its release cells.
    const facts = state => sacs.gonadGraphic(state, small);
    assert.equal(sacs.gonadStore(sacState, small).minimum, null);
    assert.ok(facts({
                ...sacState,
                stale : false,
                report : {eggMinimum : store.room * 2, eggIncubation : 111}
              })
                  .includes(t('studio.inspector.gonad.food',
                              {least : Math.round(store.room * 2), duration : 111})));
    const group = model.assemble(grown, [ organ.id, twin.id ], '');
    const renamed = model.renameAssembly(group, group.assemblies[0].id, 'Schwanz');
    assert.equal(renamed.assemblies[0].name, 'Schwanz');
    assert.equal(model.renameAssembly(group, group.assemblies[0].id, ''), null);
  }
  {
    const eggs = model.addOrgan(model.newDocument('Ei'), 'eggs', sites, {x : 850, y : 365});
    assert.ok(eggs);
    const gonadIn = sites.find(s => s.zone === 1 && !s.outer && s.v < .5 && s.w > 0);
    const relay = model.addNeuron(eggs.document, 'relay', sites,
                                  geometry.sitePoint(gonadIn, geometry.NERVE_ROLE));
    const out = model.addWire(relay.document, eggs.organId, relay.centerId);
    assert.ok(out, 'The fullness of a gonad can be wired on');
    const trigger = model.addWire(out.document, relay.centerId, eggs.organId, null, sites);
    assert.ok(trigger);
    const organ = model.findOrgan(trigger.document, eggs.organId);
    const release = organ.centers.find(c => c.key === 'release');
    const calm = model.updateCenter(trigger.document, release.id, {threshold : .9});
    const plan = model.compileDocument(calm, sites);
    const group = key => plan.groups.find(g => g.name === 'eggs:' + key);
    const targetGroups = plan.connections.map(e => plan.groups[e.to]);
    assert.ok(targetGroups.includes(group('release')), 'The trigger reaches the release');
    assert.ok(targetGroups.includes(group('growth')), 'Inner secretion also needs a neural input');
    assert.equal(group('release').threshold, .9, 'A gonad keeps the rest set for it');
    const nose = model.addOrgan(model.newDocument('Nase'), 'nose', sites, {x : 150, y : 340});
    assert.ok(nose);
    const moved = model.moveOrgan(nose.document, nose.organId, sites, {x : 880, y : 340});
    const zoneOf = doc =>
        sites.find(s => s.id === model.findOrgan(doc, nose.organId).centers[0].site).zone;
    assert.ok(!moved || zoneOf(moved) === 0, 'A nose cannot be moved out of the head');
  }
  {
    const drive = await import('../ui/studio/view/drive.js');
    const scale = sitesResult.biasScale;
    assert.ok(scale > 0);
    const nerve = {threshold : 0, q1 : 1, q2 : 0};
    assert.equal(drive.nerveResponse(nerve, .8, .8, {scale}), 0);
    nerve.q2 = .5;
    assert.ok(drive.nerveResponse(nerve, .8, .8, {scale}) > .6);
    assert.equal(drive.nerveResponse(nerve, 0, .8, {scale}), 0);
    nerve.q2 = 1;
    assert.ok(drive.nerveResponse(nerve, 0, .8, {scale}) > .6);
    assert.equal(drive.nerveResponse(nerve, -.8, -.8, {scale}), 0);
  }
  {
    const bladder =
        model.addOrgan(model.newDocument('Blase'), 'bladder', sites, {x : 600, y : 365});
    const organ = model.findOrgan(bladder.document, bladder.organId);
    const sensor = organ.centers.find(c => c.key === 'pressure'),
          motor = organ.centers.find(c => c.role === 'motor');
    const near = model.nodeSitesNear(bladder.document, sensor.id, motor.id, sites);
    assert.ok(near.length && near.every(s => s.id !== motor.site && s.id !== sensor.site));
    const moved = model.placeNode(bladder.document, sensor.id, near[0].id, sites);
    assert.equal(model.findCenter(moved, sensor.id).center.site, near[0].id);
    assert.equal(model.placeNode(bladder.document, sensor.id, motor.site, sites), null,
                 'A node takes a free place only');
  }
  {
    const units = await import('../ui/units.js');
    assert.equal(units.clamp(2), 1);
    assert.equal(units.clamp(-2, -1), -1);
    assert.equal(units.clamp(.3), .3);
    const tuningMath = await import('../ui/tuning.js');
    for (const tau of [0, .3, 1])
      assert.ok(Math.abs(tuningMath.timeConstantOf(tuningMath.timeConstantSteps(tau)) - tau) <
                1e-9);
    assert.equal(tuningMath.timeConstantSteps(1), tuningMath.LONGEST_TIME_CONSTANT);
    for (const field of [0, .4, 1])
      assert.ok(Math.abs(tuningMath.contactFieldOf(tuningMath.contactHalfAngle(field)) - field) <
                1e-9);
    for (const plan of [-1, -.2, 1])
      assert.ok(Math.abs(tuningMath.planOfUnit(tuningMath.unitOfPlan(plan)) - plan) < 1e-9);
    assert.equal(tuningMath.preferredScent({...tuningMath.scentTuning(2), qwidth : .3}), 2,
                 'A tuning aimed at a scent prefers it');
    const strings = await import('../ui/strings.js');
    assert.equal(strings.formatSigned(.25, 2, true), '+0,25');
    assert.equal(strings.formatSigned(-.25, 2, true), '-0,25');
    assert.equal(strings.joinParts([ 'a', '', null, 'b' ]), 'a · b');
    assert.equal(strings.linkText('a', 'b'), 'a → b');
    assert.equal(strings.namedText('a', 'b'), 'a: b');
    const markup = await import('../ui/studio/view/markup.js');
    assert.equal(markup.dataAttribute('probeBlock'), 'data-probe-block');
    const substancesView = await import('../ui/studio/view/substances.js');
    const wheelMarks = substancesView.wheelMarks({q1 : .4, q2 : -.3});
    const wheelMark = Object.values(wheelMarks)[0];
    const W = substancesView.WHEEL;
    const wheelBack = substancesView.wheelPatch(wheelMark.cx / W.size, wheelMark.cy / W.height);
    assert.ok(Math.abs(wheelBack.q1 - .4) < 1e-9 && Math.abs(wheelBack.q2 + .3) < 1e-9);
    const learningView = await import('../ui/studio/view/learning.js');
    const layersView = await import('../ui/studio/view/layers.js');
    const far = {tool : 'wire', camera : {zoom : .5}, layers : {}};
    assert.ok(!layersView.layerShown(far, 'nodes') && layersView.layerShown(far, 'wires'));
    assert.ok(layersView.layerShown({...far, tool : 'select'}, 'wires'));
    assert.ok(layersView.layerShown({...far, tool : 'hormone'}, 'hormones') &&
              !layersView.layerShown(far, 'hormones'));
    const on = {...far, layers : layersView.switchLayer(far, 'nodes')};
    assert.ok(layersView.layerShown(on, 'nodes') &&
              layersView.layerShown({...on, tool : 'learn'}, 'nodes'));
    const off = {...far, layers : layersView.switchLayer(on, 'nodes')};
    assert.ok(!layersView.layerShown({...off, camera : {zoom : 3}}, 'nodes'));
    assert.equal(
        layersView.layerMode({...far, layers : layersView.switchLayer(off, 'nodes')}, 'nodes'),
        layersView.AUTO);
    const learnNode =
        model.addNeuron(model.newDocument('Lernen'), 'learn', sites, {x : 380, y : 325});
    const learnPanel = learningView.learningInspector({
      document : learnNode.document,
      sites,
      capabilities : sitesResult,
      selected : {kind : 'center', id : learnNode.centerId},
      effect : HORMONE_EFFECT.learning
    });
    assert.ok(learnPanel.includes('data-learning-handle="rate"') &&
              learnPanel.includes('data-response-property="mode"') &&
              learnPanel.includes('data-learning-handle="trace"'));
    assert.match(learnPanel, /Schonfrist neuer Kontakte/);
    const automatic =
        model.addOrgan(model.newDocument('Region'), 'olfaction', sites, {x : 380, y : 325});
    const regionCenter = automatic.centerId;
    const {FISH_CLICKS} = await import('../ui/studio/events.js');
    const chooseSubstance =
        FISH_CLICKS.find(([ selector ]) => selector === '[data-learn-substance]')[1];
    const control = {
      state : {document : automatic.document},
      changeDocument(document) { this.state.document = document; }
    };
    const learningState = () => ({
      document : control.state.document,
      sites,
      capabilities : sitesResult,
      selected : {kind : 'center', id : regionCenter}
    });
    assert.doesNotMatch(learningView.learningInspector(learningState()), /data-learn-receptor=/,
                        'Constant local learning creates no substance binding');
    for (const effect of [HORMONE_EFFECT.learning, HORMONE_EFFECT.competition]) {
      const cell = () => model.findCenter(control.state.document, regionCenter).center;
      const select = value => chooseSubstance(control, {
        dataset : {centerId : regionCenter, learnEffect : String(effect), learnSubstance : value}
      });
      select('0');
      assert.equal(model.effectDirection(effect, cell().receptors[effect]), 1,
                   'Binding a substance to a new region changes the effective learning factor');
      control.state.document =
          model.updateReceptor(control.state.document, regionCenter, effect, {baseline : 1});
      assert.ok(!model.boundEffects(cell(), 0, sitesResult).includes(effect),
                'A saturated response creates no hormone connection');
      control.state.document =
          model.updateReceptor(control.state.document, regionCenter, effect, {baseline : .25});
      select('off');
      assert.equal(cell().receptors[effect].baseline, .25);
      assert.equal(
          model.receptorResponse(sitesResult, cell().receptors[effect], Array(6).fill(0), 0), .25,
          'Removing the substance preserves the constant local gain');
    }
    const traceHandle = /data-learning-handle="trace" cx="([^"]+)"/.exec(learnPanel);
    const learnCell = model.findCenter(learnNode.document, learnNode.centerId).center;
    assert.ok(Math.abs(learningView.learnTracePatch(traceHandle[1] / 300).learning_tau -
                       learnCell.learning_tau) < 1e-2);
    const taughtDoc =
        model.bindReceptor(learnNode.document, learnNode.centerId, HORMONE_EFFECT.teaching, 0);
    const excitationDoc = model.addSubstance(
        model.bindReceptor(learnNode.document, learnNode.centerId, HORMONE_EFFECT.excitation, 0),
        HORMONES.levels);
    assert.deepEqual(model.teachersOf(excitationDoc,
                                      model.findCenter(excitationDoc, learnNode.centerId).center,
                                      sitesResult),
                     []);
    const bothDoc =
        model.bindReceptor(excitationDoc, learnNode.centerId, HORMONE_EFFECT.teaching, 0);
    const bothCell = model.findCenter(bothDoc, learnNode.centerId).center;
    assert.equal(model.teachersOf(bothDoc, bothCell, sitesResult).length, 1);
    assert.ok(model.boundEffects(bothCell, 0, sitesResult).includes(HORMONE_EFFECT.excitation));
    assert.ok(model.boundEffects(bothCell, 0, sitesResult).includes(HORMONE_EFFECT.teaching));
    const taughtPanel = learningView.learningInspector({
      document : model.addSubstance(taughtDoc, HORMONES.levels),
      sites,
      capabilities : sitesResult,
      selected : {kind : 'center', id : learnNode.centerId}
    });
    assert.match(taughtPanel,
                 new RegExp('<button class="active" data-learn-substance="0" ' +
                            'data-center-id="' + learnNode.centerId + '" data-learn-effect="' +
                            HORMONE_EFFECT.teaching + '"'),
                 'The bound teaching substance is selected in the learning tool');
    assert.match(taughtPanel, /aid-episode-arrow teach"/);
    const skinView = await import('../ui/studio/view/skin.js');
    const touched = model.addOrgan(model.newDocument('Haut'), 'touch', sites, {x : 400, y : 265});
    const touchOrgan = model.findOrgan(touched.document, touched.organId),
          touchCell = touchOrgan.centers[0], skinState = {document : touched.document, sites};
    const skinMarkup = skinView.skinField(skinState, touchOrgan, touchCell);
    const skinAim = Number(/data-skin-aim="([^"]+)"/.exec(skinMarkup)[1]);
    const skinBack = name => {
      const [, cx, cy] =
          new RegExp('data-skin-handle="' + name + '" cx="([^"]+)" cy="([^"]+)"').exec(skinMarkup);
      const box = /viewBox="0 0 (\S+) (\S+)"/.exec(skinMarkup);
      return skinView.skinPatch(skinState, skinAim, name, cx / box[1], cy / box[2]);
    };
    const probesView = await import('../ui/studio/view/probes.js');
    const {probeFor} = await import('../ui/studio/model/probe.js');
    for (const [type, at] of [[ 'nose', {x : 200, y : 330} ], [ 'touch', {x : 400, y : 265} ]]) {
      const placed = model.addOrgan(model.newDocument('Reiz'), type, sites, at);
      const probed = model.findOrgan(placed.document, placed.organId),
            probe = probeFor(probed, null);
      const probeState = {
        document : placed.document,
        sites,
        selected : {kind : 'organ', id : probed.id},
        senseProbe : probe,
        anatomy : {lightDimmest : 1e-4}
      };
      const markup = probesView.senseProbeSvg(probeState);
      const [, hx, hy] =
          /data-sense-handle="[^"]+" data-steady transform="translate\(([^ ]+) ([^)]+)\)/.exec(
              markup);
      const back = probesView.probePatch(probe.kind, {x : Number(hx), y : Number(hy)}, 1e-4);
      assert.ok(Math.abs(back.bearing - probe.bearing) < 3, type + ' bearing reads back');
      const amount = probe.kind === 'smell' ? 'distance' : 'strength';
      assert.ok(Math.abs(back[amount] - probe[amount]) / probe[amount] < .1, type + ' reads back');
      assert.equal(probesView.senseProbeSvg({...probeState, selected : null}), '');
    }
    assert.ok(Math.abs(skinBack('field').field - touchCell.field) < .05);
    // The touch cells' sensitivity sits on their report curve below the skin and reads back.
    {
      const marks = await import('../ui/studio/view/sense_marks.js');
      const [, least, most, cx, cy] =
          /data-sense-mark="sensitivity" data-least="([^"]+)" data-most="([^"]+)" cx="([^"]+)" cy="([^"]+)"/
              .exec(skinMarkup);
      const read = marks.senseMarkPatch(skinState, {
        handle : 'sensitivity',
        marks : {least, most},
        start : marks.senseStart(skinState, touchCell)
      },
                                        {x : Number(cx), y : Number(cy)});
      assert.ok(Math.abs(read.threshold - touchCell.threshold) < .05,
                'touch sensitivity reads back');
    }
    const layout = await import('../ui/studio/model/layout.js');
    assert.deepEqual(layout.centroid([ {x : 0, y : 0}, {x : 4, y : 2} ]), {x : 2, y : 1});
    assert.ok(
        sites.filter(layout.nerveZone)
            .every(s => !s.outer && s.zone >= layout.ZONE.head && s.zone <= layout.ZONE.tail));
    assert.deepEqual(model.contactBundle([ 1, 2, 3, .5, 2, 1, .7, -.4 ]), {
      from : 1,
      to : 2,
      count : 3,
      weight : .5,
      positive : 2,
      negative : 1,
      positiveWeight : .7,
      negativeWeight : -.4
    });
    assert.deepEqual(graph.cppnNode([ 9, 3, .25, 0 ]),
                     {id : 9, type : 3, parameter : .25, role : 0});
    assert.deepEqual(graph.cppnLink([ 4, 1, 9, -.5, 1, 0 ]),
                     {id : 4, from : 1, to : 9, weight : -.5, enabled : 1, port : 0});
    const gutDoc = model.addOrgan(model.newDocument('Darm'), 'gut', sites, {x : 760, y : 360});
    {
      const bladder =
          model.addOrgan(model.newDocument('Auftrieb'), 'bladder', sites, {x : 650, y : 360});
      assert.ok(bladder);
      const organ = model.findOrgan(bladder.document, bladder.organId);
      const pressure = organ.centers.find(c => c.key === 'pressure').id;
      const {handleMethods} = await import('../ui/studio/handles.js');
      // The gland handle in the bladder picture, dragged to the second of three gland places.
      const span = {width : 30, height : 10};
      const editor = {
        state : {document : bladder.document, sites},
        handleDrag : {
          id : organ.centers.find(c => c.key === 'float').id,
          handle : 'nodes',
          marks : {places : '0,0 10,0 20,0'},
          size : span,
          rect : {left : 0, top : 0, ...span}
        },
        draftDesign(document) { this.state.document = document; }
      };
      handleMethods.sensePointer.call(editor, {clientX : 10, clientY : 0});
      const enlarged = model.findOrgan(editor.state.document, organ.id);
      assert.equal(enlarged.centers.filter(c => c.key === 'float').length, 2,
                   'The bladder resizes to two muscles despite its extra pressure sensor');
      assert.equal(enlarged.centers.filter(c => c.key === 'pressure').length, 1);
      assert.ok(enlarged.centers.some(c => c.id === pressure));
      assert.equal(model.compileDocument(editor.state.document, sites)
                       .groups.filter(g => g.role === 2 && g.function === MOTOR_KIND.bladder)
                       .length,
                   2, 'Both bladder muscles reach the native plan');
      assert.match(
          panels.organSettingsBlock(
              {...state, ...editor.state, selected : {kind : 'organ', id : organ.id}}, enlarged),
          /data-sense-mark="nodes"/);
      const smaller = model.setOrganNodes(editor.state.document, organ.id, 1, sites);
      assert.equal(model.findOrgan(smaller, organ.id).centers.length, 2);
      assert.ok(model.findOrgan(smaller, organ.id).centers.some(c => c.id === pressure));
    }
    const held = model.usedSites(gutDoc.document);
    assert.equal(held.size, model.allCenters(gutDoc.document).length);
    const muscle = ORGAN_BY_KEY.muscle.centers[0];
    const free =
        model.closestSiteDoing(muscle, MOTOR_KIND.forward, sites, held, {x : 850, y : 360});
    assert.ok(free && !held.has(free.id) && functionFor(muscle, free) === MOTOR_KIND.forward,
              'The nearest free place doing the work asked for');
    const regionTarget = views.placementTarget(model.newDocument(''), 'tectum', {x : 300, y : 330});
    assert.deepEqual(regionTarget.position, {x : 300, y : 330},
                     'A region goes to the free places in the brain nearest to where it is put');
    const brainPlaces = await import('../ui/studio/view/places.js');
    const cerebrum = brainPlaces.BRAIN.cerebrum;
    const onLobe = {x : (cerebrum.from + cerebrum.to) / 2, y : 365 - cerebrum.half / 2};
    const node = model.addNeuron(model.newDocument('Knoten'), 'relay', sites, onLobe, 60);
    const nodeAt = brainPlaces.centerLocation(model.findCenter(node.document, node.centerId).center,
                                              'brain', sites);
    assert.ok(Math.hypot(nodeAt.x - onLobe.x, nodeAt.y - onLobe.y) < 60,
              'A node stays in the brain');
    {
      const layout = await import('../ui/studio/model/layout.js');
      const middle = model.moveCenterToSide(node.document, node.centerId, 0, sites);
      const placed = model.findCenter(middle, node.centerId).center;
      const site = sites.find(s => s.id === placed.site);
      assert.ok(layout.onMidline(site));
      const at = brainPlaces.nodeLocation(middle, sites, placed, 'brain');
      assert.equal(at.y, layout.BODY_FRAME.middle, 'A midline node stands on the midline');
      const twin = model.mirroredSite(site, sites);
      const both = model.addNeuron(middle, 'relay', sites, layout.sitePoint(twin, 'nerve'), 1);
      const other = model.findCenter(both.document, both.centerId).center;
      assert.equal(other.site, twin.id);
      const a = brainPlaces.nodeLocation(both.document, sites, placed, 'brain'),
            b = brainPlaces.nodeLocation(both.document, sites, other, 'brain');
      assert.ok(Math.abs(a.y - b.y) > 0 &&
                Math.sign(a.y - b.y) === Math.sign(site.side - twin.side));
    }
    {
      const layout = await import('../ui/studio/model/layout.js');
      const REGION_HIDDEN = .25;
      const regions = ORGANS.filter(o => o.category === 'regions').map(o => o.key);
      let full = model.newDocument('Alle Regionen');
      for (const type of regions) {
        // Lazily: every attempt copies the whole document, and the first place is taken.
        const placed =
            sites.values()
                .filter(s => !s.outer)
                .map(s => model.addOrgan(full, type, sites, layout.sitePoint(s, 'nerve')))
                .find(Boolean);
        assert.ok(placed, type + ' still finds room in a brain with every other region');
        full = placed.document;
      }
      const rendered = views.fishScene({...state, document : full, sites});
      const boxes = full.organs.filter(o => o.region).map((organ, i) => {
        const box = brainPlaces.regionGeometry(full, sites, organ);
        return {
          type : organ.type,
          i,
          x : [ box.x - box.width / 2, box.x + box.width / 2 ],
          y : [ box.y - box.height / 2, box.y + box.height / 2 ]
        };
      });
      assert.equal((rendered.match(/class="aid-anatomical-region"/g) ?? []).length, boxes.length);
      const overlap = (a, b) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
      const area = box => (box.x[1] - box.x[0]) * (box.y[1] - box.y[0]);
      for (const a of boxes)
        for (const b of boxes)
          if (a.i < b.i)
            assert.ok(overlap(a.x, b.x) * overlap(a.y, b.y) <
                          REGION_HIDDEN * Math.min(area(a), area(b)),
                      a.type + ' and ' + b.type + ' do not hide each other');
    }
    const circuit =
        model.addOrgan(model.newDocument('Riechverarbeitung'), 'olfaction', sites, onLobe);
    const cluster = brainPlaces.organLocation(model.findOrgan(circuit.document, circuit.organId),
                                              sites, circuit.document);
    assert.ok(Math.hypot(cluster.x - onLobe.x, cluster.y - onLobe.y) < 60, 'A region stays there');
    const effectorsView = await import('../ui/studio/view/effectors.js');
    const lone = model.findOrgan(gutDoc.document, gutDoc.organId);
    assert.match(effectorsView.gutGraphic({document : gutDoc.document, sites}, lone),
                 /aid-graphic-handle[^>]*data-effector-handle="trait:q1"/,
                 'A gut without its throat still offers its length');
    const homeTarget = views.placementTarget(model.newDocument(''), 'gut', {x : 300, y : 330});
    assert.equal(homeTarget.snap, Infinity, 'An inner organ goes to its home from any distance');
    const freeTarget = views.placementTarget(model.newDocument(''), 'eye', {x : 300, y : 290});
    assert.deepEqual(freeTarget.position, {x : 300, y : 290},
                     'An eye keeps its continuous position inside its anatomical area');
    const innerTarget = views.placementTarget(model.newDocument(''), 'eye', {x : 300, y : 330});
    assert.equal(innerTarget.position.x, 300);
    assert.ok(innerTarget.position.y > freeTarget.position.y && innerTarget.position.y < 330,
              'An eye requested inside the head moves to the inner edge of its flank area');
    const grouped = model.assembleSelection(gutDoc.document, new Set([ gutDoc.organId ]));
    assert.equal(grouped.assemblies.length, 1);
    const ungrouped = model.ungroupAssembly(grouped, grouped.assemblies[0].id);
    assert.equal(ungrouped.assemblies.length, 0);
    assert.equal(ungrouped.organs.length, grouped.organs.length);
    const receptorCenter = model.allCenters(gutDoc.document)[0];
    const switched =
        model.switchReceptor(gutDoc.document, receptorCenter.id, HORMONE_EFFECT.excitation, true);
    assert.ok(model.findCenter(switched, receptorCenter.id)
                  .center.receptors[HORMONE_EFFECT.excitation]
                  .sensitivity > 0);
    const exampleModel = await import('../ui/studio/model/example.js');
    const exampleDoc = exampleModel.exampleDocument({fish : 'B', growth : 'W'}, sites, sitesResult);
    assert.doesNotThrow(() => model.validateDocument(exampleDoc));
    assert.equal(exampleDoc.substances.length, 1);
    const relay = exampleDoc.organs.find(o => o.type === 'value');
    const taught = (doc, organ) => model.findOrgan(doc, organ.id)
                                       .centers.filter(model.isLearner)
                                       .map(c => c.receptors[HORMONE_EFFECT.teaching]);
    const untaught = model.teachOrgan(exampleDoc, relay.id, null);
    assert.ok(taught(untaught, relay).every(r => !r.active));
    const regionModel = await import('../ui/studio/model/regions.js');
    const settled = regionModel.updateRegion(exampleDoc, relay.id, {}, sites);
    const learner = model.findOrgan(settled, relay.id).centers.find(model.isLearner);
    const restyled = regionModel.updateRegion(
        model.updateCenter(settled, learner.id, {qwidth : .7}), relay.id, {features : 3}, sites);
    const restyledLearner = model.findCenter(restyled, learner.id).center;
    assert.equal(restyledLearner.qwidth, .7, 'Adding a feature keeps a hand-tuned learning rate');
    assert.equal(restyledLearner.tau, learner.tau);
    const byGrowth = model.teachOrgan(untaught, relay.id, 0);
    assert.ok(taught(byGrowth, relay).length > 0 &&
              taught(byGrowth, relay).every(r => r.active && r.substance === 0));
    const organsModel = await import('../ui/studio/model/organs.js');
    const alarm = hormoneSystems.alarm;
    const strong = alarm.document.organs.find(o => o.type === 'muscle').centers[0];
    const chosen =
        {key : 'relay', role : 'nerve', sign : 1, mode : .9, qwidth : .35, receptors : []};
    assert.ok(model.isLearner(chosen) && organsModel.nerveKind(chosen) === 'relay',
              'An adaptive relay participates in learning');
    assert.ok(model.isLearner({...chosen, mode : 0}) && model.isLearner({...chosen, qwidth : 0}),
              'Every inner cell participates in development, including the smallest learning rate');
    const constant = model.updateReceptor(alarm.document, strong.id, HORMONE_EFFECT.output,
                                          {active : 1, baseline : 1, sensitivity : 0});
    assert.ok(!model.boundEffects(model.findCenter(constant, strong.id).center, 0, sitesResult)
                   .includes(HORMONE_EFFECT.output),
              'A constant gain creates no hormone connection');
    assert.ok(alarm.document.wires.some(
        w => w.to === alarm.organId ||
             w.to === model.findOrgan(alarm.document, alarm.organId).pair));
    assert.equal(layout.findSite(sites, sites[3].id), sites[3]);
    assert.equal(model.findAssembly(grouped, grouped.assemblies[0].id), grouped.assemblies[0]);
    assert.equal(model.findAssembly(grouped, 'none'), null);
    const gutOrgan = model.findOrgan(gutDoc.document, gutDoc.organId);
    assert.equal(model.chosenCenter(gutDoc.document, {kind : 'organ', id : gutOrgan.id}),
                 gutOrgan.centers[0]);
    assert.equal(model.chosenCenter(gutDoc.document, {kind : 'wire', id : gutOrgan.id}), null);
    assert.ok(
        organsModel.isModulator({role : 'nerve', sign : 1, mode : 1, pace : -1, modulator : 1}) &&
        !organsModel.isModulator({role : 'nerve', sign : 1, mode : 1, pace : -1, modulator : -1}));
    const glyphs = await import('../ui/glyph.js');
    const line = glyphs.glyph('M0 0h24', {size : 16, paint : glyphs.linePaint()});
    assert.match(line, /width="16" height="16" viewBox="0 0 24 24"/);
    assert.match(line, /fill="none" stroke="currentColor" stroke-width="1.6"/);
    assert.doesNotMatch(glyphs.glyph('M0 0h24'), /width=/, 'Without a size its style sizes it');
    const polygon = await import('../ui/polygon.js');
    const areaOf = ps => Math.abs(ps.reduce((v, p, i) => v + p[0] * ps[(i + 1) % ps.length][1] -
                                                         p[1] * ps[(i + 1) % ps.length][0],
                                            0)) /
                         2;
    const covered = (ps, holds) => {
      const {ears} = polygon.clipEars(ps, holds, 2);
      let sum = 0;
      for (let k = 0; k < ears.length; k += 3)
        sum += areaOf([ ps[ears[k]], ps[ears[k + 1]], ps[ears[k + 2]] ]);
      return sum;
    };
    const notched = [ [ 0, 0 ], [ 4, 0 ], [ 4, 4 ], [ 2, 2 ], [ 0, 4 ] ];
    assert.equal(covered(notched, polygon.holdsWithEdges), areaOf(notched));
    const flat = [ [ 0, 0 ], [ 2, 0 ], [ 4, 0 ], [ 2, 3 ] ];
    assert.equal(covered(flat, polygon.holdsInside), areaOf(flat));
    const frame = await import('../ui/studio/view/frame.js');
    assert.equal(frame.zoomOf({camera : {zoom : 2}}), 2);
    assert.equal(frame.zoomOf({}), 1);
    assert.match(frame.steadyAt({x : 10, y : 20}, 2),
                 /data-steady transform="translate\(10.00 20.00\) scale\(0.50\)"/);
    assert.equal(frame.viewBoxOf({zoom : 1, ...frame.CAMERA_HOME}).split(' ').length, 4);
  }
  {
    const {LiveStation} = await import('../ui/labor/live_station.js');
    const {lifeLines, eventLanes, tracks} = await import('../ui/labor/live_view.js');
    const station = new LiveStation({});
    station.draw = () => {};
    station.job = {id : 'one'};
    const pending = [];
    station.request = data => new Promise(resolve => pending.push({data, resolve}));
    const first = station.select(1), second = station.select(2);
    pending[1].resolve({points : [ {t : 10, x : 20} ], events : []});
    await second;
    pending[0].resolve({points : [ {t : 5, x : 10} ], events : []});
    await first;
    assert.equal(station.selected, 2);
    assert.equal(station.trace.points[0].x, 20, 'A late response cannot replace the selected fish');
    const away = station.select(3);
    await station.select(null);
    pending[2].resolve({points : [ {t : 15} ], events : []});
    await away;
    assert.equal(station.trace, null, 'Deselecting invalidates a pending life request');
    assert.equal(station.selected, null, 'The tank allows observation without selection');
    station.selected = 7;
    station.worlds =
        [ {state : {comparison : true, fish : [ {id : 7, energy : 20, capacity : 100} ]}} ];
    const controls = [];
    station.command = async (action, values) => controls.push({action, ...values});
    await station.control('energy', 1);
    await station.control('energy', 0);
    assert.deepEqual(
        controls.map(c => c.value), [ .2, -2 ],
        'Energy holding preserves the current reserve; switching it off releases the clamp');
    station.worlds[0].state.comparison = false;
    station.command = async (action, values) => {
      controls.push({action, ...values});
      if (action === 'compare')
        station.selected = 8;
    };
    await station.control('forward', 1);
    assert.equal(controls.at(-1).fish, 7, 'An async baseline copy cannot redirect an intervention');
    const life = lifeLines([ {
                             id : 1,
                             world : 'trial',
                             start : 0,
                             hatch : 0,
                             firstIntake : 0,
                             death : 8,
                             generation : 0
                           } ],
                           10, null, 10);
    assert.match(life, /fl-first-meal/);
    assert.doesNotMatch(life, /NaN|undefined/);
    assert.doesNotMatch(tracks(null, 0, 0), /NaN|undefined/);
    const events = Array.from({length : 100}, () => ({kind : 'intake', t : 5}));
    assert.equal((eventLanes(events, 100, 100).match(/<circle/g) ?? []).length, 1,
                 'Dense feeding events remain readable as one counted bin');
    {
      const {paintLabScene, LAB_SCENE} = await import('../ui/labor/scene.js');
      const {FISH} = await import('../ui/schema.js');
      const {sceneState} = await import('../ui/state.js');
      (await import('../ui/dom.js')).initialize([ 'rgb' ]);
      const egg = Array(FISH.count).fill(0);
      egg[FISH.id] = 1;
      egg[FISH.y] = 320;
      egg[FISH.radius] = 1;
      egg[FISH.health] = 1;
      let path = [], polygons = [];
      const context = {
        save() {},
        restore() {},
        fillRect() {},
        translate() {},
        rotate() {},
        arc() {},
        stroke() {},
        beginPath() { path = []; },
        closePath() {},
        moveTo(x, y) { path.push([ x, y ]); },
        lineTo(x, y) { path.push([ x, y ]); },
        fill() {
          if (this.fillStyle === LAB_SCENE.rock)
            polygons.push(path);
        }
      };
      const canvas = {
        width : LAB_SCENE.width,
        height : LAB_SCENE.height,
        getContext : () => context
      };
      const frame = {
        width : 960,
        height : 640,
        step : 0,
        fish : [ egg ],
        plants : [],
        shapes : [ [ [ 470, 300 ], [ 490, 300 ], [ 490, 340 ], [ 470, 340 ] ] ]
      };
      const previous = sceneState.frame;
      paintLabScene(canvas, frame, 1);
      assert.equal(polygons.length, 0, 'A rock opposite the view cannot fill the visible water');
      assert.equal(sceneState.frame, previous);
      frame.shapes = [ [ [ 950, 300 ], [ 970, 300 ], [ 970, 340 ], [ 950, 340 ] ] ];
      paintLabScene(canvas, frame, 1);
      assert.equal(polygons.length, 1);
      assert.deepEqual(polygons[0].map(p => p[0]), [ 345, 375, 375, 345 ],
                       'A rock across the seam retains its width and sits beside the fish');
      polygons = [];
      frame.shapes = [ [ [ 0, 300 ], [ 960, 300 ], [ 960, 340 ], [ 0, 340 ] ] ];
      paintLabScene(canvas, frame, 1);
      assert.equal(polygons.length, 2, 'Both visible copies of a wide floor are drawn');
      context.fill = () => { throw new Error('drawing failed'); };
      assert.throws(() => paintLabScene(canvas, frame, 1), /drawing failed/);
      assert.equal(sceneState.frame, previous, 'A failed paint restores the aquarium context');
    }
  }
  console.log(
      'Atelier: generated organs, sight, connections, hormones, persistence and gestures: OK');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
