const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
(async () => {
  const context = vm.createContext({TextDecoder}), cache = new Map();
  function module(name) {
    name = path.basename(name);
    if (!cache.has(name))
      cache.set(name, new vm.SourceTextModule(fs.readFileSync('ui/' + name, 'utf8'),
                                              {context, identifier : name}));
    return cache.get(name);
  }
  const entry = module('scene_frame.js');
  await entry.link(name => module(name));
  await entry.evaluate();
  const scene = new entry.namespace.DisplayScene(),
        fixture = JSON.parse(fs.readFileSync(process.argv[2]));
  const background = new entry.namespace.SceneDecoder(),
        assembled = new entry.namespace.DisplayScene();
  assembled.decoder.accept =
      () => { throw Error('Background decoding fell back onto the drawing thread'); };
  let last, previousPrepared;
  for (const [index, packet] of fixture.packets.entries()) {
    const bytes = Buffer.from(packet, 'base64'),
          buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
          frame = scene.accept(buffer, fixture.metadata);
    const message = structuredClone(background.accept(buffer));
    const prepared = assembled.acceptPrepared(message, fixture.metadata);
    assert.equal(JSON.stringify(prepared), JSON.stringify(frame),
                 'Worker and direct decoding disagree');
    if (index === 1) {
      assert.equal(Object.keys(message.records).length, 0, 'Unchanged objects are cloned again');
      assert.equal(message.light, undefined, 'Unchanged lighting is cloned again');
      assert.equal(prepared.fish[0][75], previousPrepared.fish[0][75],
                   'Unchanged shape identity is lost');
    }
    assert(frame.fish.length > 0);
    assert(frame.fish.every(p => p.length === module('schema.js').namespace.FISH.count));
    for (const p of frame.fish.filter(p => frame.visibleFish.has(p[4]))) {
      assert.equal(p[32].length, 47);
      assert.equal(p[59].length, 43);
      assert(p[66].length > 0);
      assert(p[51] > 0);
    }
    assert(frame.food.every(p => p[2] > 0 && p[6] > 0));
    assert.equal(frame.light.values.length, frame.light.columns * frame.light.rows);
    assert.equal(frame.sediment.amounts.length, frame.sediment.columns * frame.sediment.rows);
    if (index < 4) {
      for (const key of ['gut_fill', 'gut_energy', 'gut_digestible', 'gut_capacity', 'maintenance',
                         'movement_cost'])
        assert(Number.isFinite(frame.brain?.[key]), 'Ordinary selection lacks ' + key);
      for (const key of ['layout', 'neuron_state', 'learning', 'sensory_components'])
        assert(!(key in frame.brain), 'Ordinary selection sends detailed ' + key);
      assert(JSON.stringify(frame.brain).length < 4096, 'Ordinary inspection is too large');
    }
    if (index === 1)
      assert(scene.binary.header.delta, 'An unchanged paused scene should use a delta');
    if (index === 2)
      assert(!scene.binary.header.delta, 'A new tab needs a complete scene');
    if (index === 3)
      assert(!scene.binary.header.delta, 'A skipped base needs a complete scene');
    if (index === 4) {
      assert(scene.binary.header.delta);
      assert.equal(frame.brain.layout_id, fixture.layout);
      assert(frame.brain.layout || frame.brain.neurons);
      assert(frame.brain.inspection);
    }
    last = frame;
    previousPrepared = prepared;
  }
  assert(last.brain.neuron_state.length > 0);
  const first = Buffer.from(fixture.packets[0], 'base64'),
        firstBuffer = first.buffer.slice(first.byteOffset, first.byteOffset + first.length);
  assert.equal(scene.accept(firstBuffer, {...fixture.metadata, render_epoch : 'another-session'}),
               null, 'Image from a new session mixes with old statistics');
  assert.equal(scene.accept(firstBuffer, {...fixture.metadata, view_context : 99}), null,
               'Historical image mixes with the live world');
  assert(scene.accept(firstBuffer, fixture.metadata)?.visibleFish.size,
         'Waiting for matching metadata breaks the next image');

  // A rejected binary frame must not consume the accompanying inspection metadata.
  const retry = new entry.namespace.SceneDecoder(), invalid = firstBuffer.slice(0);
  new DataView(invalid).setUint32(16, 0, true);
  assert.throws(() => retry.accept(invalid));
  assert.equal(retry.inspection, null, 'Rejected packet committed inspection metadata');
  assert(retry.accept(firstBuffer).inspection, 'Retry loses the inspection for the valid packet');

  const culled = Buffer.from(fixture.culled, 'base64'),
        offscreen =
            scene.accept(culled.buffer.slice(culled.byteOffset, culled.byteOffset + culled.length),
                         fixture.metadata);
  assert.equal(offscreen.visibleFish.size, 0, 'Tiny viewport should contain no fish');
  assert(offscreen.fish.length > 0);
  for (const p of offscreen.fish) {
    assert.equal(p[32].length, 47, 'Culling loses organ anatomy');
    assert.equal(p[75].torsoPlan.length, 5, 'Culling loses the canonical body shape');
  }

  console.log(
      'Direct scene: assets, visible bodies, paused deltas, tabs, recovery and inspection: OK');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
