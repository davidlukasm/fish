const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const bytes = fs.readFileSync(process.argv[2]);
(async () => {
  const context = vm.createContext({}), cache = new Map();
  function module(name) {
    name = path.basename(name);
    if (!cache.has(name))
      cache.set(name, new vm.SourceTextModule(fs.readFileSync('ui/' + name, 'utf8'),
                                              {context, identifier : name}));
    return cache.get(name);
  }
  const entry = module('binary_scene.js');
  await entry.link(name => module(name));
  await entry.evaluate();
  const {BinaryScene} = entry.namespace, scene = new BinaryScene();
  let at = 0, count = 0, first;
  while (at < bytes.length) {
    const jsonBytes = bytes.readUInt32LE(at), wireBytes = bytes.readUInt32LE(at + 4);
    at += 8;
    const expected = JSON.parse(bytes.subarray(at, at + jsonBytes));
    at += jsonBytes;
    const packet = bytes.subarray(at, at + wireBytes),
          buffer = packet.buffer.slice(packet.byteOffset, packet.byteOffset + packet.length);
    at += wireBytes;
    const header = scene.accept(buffer);
    assert.equal(header.step, expected.step);
    assert.equal(header.width, expected.width);
    assert.equal(header.height, expected.height);
    assert.deepEqual([...scene.records.fish.keys() ], expected.fish.map(p => p[4]));
    assert.deepEqual([...scene.records.food.keys() ], expected.food.map(p => p[3]));
    assert.deepEqual([...scene.records.invertebrate.keys() ],
                     expected.invertebrates.map(p => p[0]));
    for (const p of expected.invertebrates) {
      const a = scene.records.invertebrate.get(p[0]);
      assert.equal(a.kind, 9);
      assert(Math.abs(a.x - p[1]) <= .063);
      assert.equal(a.energy, p[3]);
      assert(Math.abs(a.morph - p[4]) < 1e-6, 'Stable shell morphology survives binary transport');
    }
    assert(scene.plankton.values.length > 0, 'Plankton grid is decoded');
    assert.equal(scene.plankton.values.some(x => x > 0), count < 2,
                 'Plankton changes and clearing reach the browser');
    for (const p of expected.fish) {
      const record = scene.records.fish.get(p[4]);
      assert(Math.abs(record.x - p[0]) <= .063);
      assert(Math.abs(record.y - p[1]) <= .063);
      assert(Math.abs(record.radius - p[51]) < 1e-5);
      assert(Math.abs(record.relative_speed - p[45]) <= .063);
      assert(Math.abs(record.energy * record.reserve_capacity - p[5]) <=
             record.reserve_capacity / 65535);
      assert.equal(record.fin_age_left, 10);
      assert.equal(record.fin_age_right, 11);
    }
    for (const p of expected.food) {
      const record = scene.records.food.get(p[3]);
      assert(Math.abs(record.energy - p[2]) <= 200 / 255);
    }
    if (count === 0)
      first = buffer;
    if (count === 1) {
      const stale = new BinaryScene();
      assert.throws(() => stale.accept(buffer), /vollständiges Bild/);
      const restored = new BinaryScene();
      restored.accept(first);
      restored.accept(buffer);
      assert.equal(restored.header.sequence, 2);
    }
    const sequence = scene.sequence, record = scene.records.fish.get(7);
    assert.throws(() => scene.accept(buffer.slice(0, buffer.byteLength - 1)));
    assert.equal(scene.sequence, sequence, 'Truncated scene changes sequence');
    assert.equal(scene.records.fish.get(7), record, 'Truncated scene changes objects');
    ++count;
  }
  assert.equal(count, 5);
  assert.equal(scene.records.fish.size, 0);
  console.log(
      'C++ / browser binary scenes: columns, clocks, precision, deletion, recovery and atomic decoding: OK');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
