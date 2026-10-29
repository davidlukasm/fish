const {readUI} = require('./ui_source.js');
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const scene = vm.createContext({atob, btoa});
vm.runInContext(readUI('ui/transport.js'), scene);
for (const test of fixture.cases || []) {
  scene.test = test;
  const result = vm.runInContext('applyFramePatch(test.old,test.patch)', scene);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), test.new);
}
for (let i = 0; i < fixture.messages.length; ++i) {
  scene.message = fixture.messages[i];
  scene.key = String(i);
  const actual = vm.runInContext(
      `decodeScene(message.frame ? {frame:message.frame,scene_key:key} : {frame_patches:[message.patch],base_scene:sceneKey,scene_key:key})`,
      scene);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), fixture.frames[i]);
}
scene.previous = {
  a : [ 1, 2, 3 ],
  b : {keep : 1, drop : 2}
};
scene.patch = [
  2, {
    a : [ 1, 4, [ [ 0, [ 0, 9 ] ], [ 3, [ 0, 4 ] ] ] ],
    b : [ 2, {add : [ 0, 'ä"\\\n' ]}, [ 'drop' ] ]
  },
  []
];
const original = JSON.stringify(scene.previous);
const changed = vm.runInContext('applyFramePatch(previous,patch)', scene);
assert.strictEqual(JSON.stringify(scene.previous), original,
                   'Previous animation frame was modified');
assert.deepStrictEqual(JSON.parse(JSON.stringify(changed)),
                       {a : [ 9, 2, 3, 4 ], b : {keep : 1, add : 'ä"\\\n'}});
assert.throws(() => vm.runInContext("decodeScene({base_scene:'lost',frame_patches:[]})", scene));
vm.runInContext('resetScene()', scene);
assert.strictEqual(vm.runInContext('sceneKey', scene), '');
console.log('Browser scene patches: OK');
