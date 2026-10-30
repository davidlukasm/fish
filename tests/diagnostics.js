const fs = require('fs'), vm = require('vm'), assert = require('assert'),
      {readUI} = require('./ui_source.js');
const sandbox = {
  performance,
  URL,
  Date,
  navigator : {userAgent : 'test'},
  window : {},
  location : {href : 'http://localhost:8765/'}
};
vm.createContext(sandbox);
vm.runInContext(readUI('ui/diagnostics.js'), sandbox);
const Recorder = vm.runInContext('BrowserDiagnostics', sandbox);
const r = new Recorder();
function frame(at, extra = {}) {
  r.frame({at, active : true, work_ms : 3, motion_gap_ms : 20, phases_ms : {fish : 3}, ...extra});
}
for (let at = 0; at < 1000; at += 20)
  frame(at);
r.event('packet', {channel : 'statistics', duration_ms : 800, apply_ms : 780}, 1000);
frame(1800, {motion_gap_ms : 820});
// Browser observers arrive after the stalled frame. They must still join its episode.
r.entries('long-animation-frame', [ {
            startTime : 1000,
            duration : 810,
            scripts : [ {
              sourceURL : 'http://localhost/ui/connection.js?token=SECRET',
              sourceFunctionName : 'receiveState',
              startTime : 1001,
              duration : 780
            } ]
          } ]);
frame(1820);
let report = r.snapshot();
assert.equal(report.worst_episodes[0].severity_ms, 820);
assert(report.worst_episodes[0].frames.some(f => f.at === 980), 'Pre-stall context is missing');
assert(report.worst_episodes[0].frames.some(f => f.at === 1820), 'Recovery context is missing');
assert(report.worst_episodes[0].events.some(e => e.kind === 'packet' && e.apply_ms === 780));
assert(report.worst_episodes[0].events.some(e => e.kind === 'long-animation-frame'));
assert(!JSON.stringify(report).includes('SECRET'), 'Source query leaked into the report');
// The rolling history wraps; an earlier severe incident remains available for export.
for (let at = 1840; at < 200000; at += 20)
  frame(at);
for (let i = 0; i < 4000; i++)
  r.event('packet', {channel : 'scene'}, 200000 + i);
report = r.snapshot();
assert.equal(report.frames.length, 3600);
assert.equal(report.events.length, 1024);
assert(report.frames[0].at > 1000);
assert.equal(report.worst_episodes[0].trigger.at, 1800);
assert(report.worst_episodes[0].events.some(e => e.apply_ms === 780));
for (let i = 0; i < 40; i++) {
  frame(210000 + i * 2000);
  frame(210200 + i * 2000, {work_ms : 110, motion_gap_ms : 200});
}
assert.equal(r.snapshot().worst_episodes.length, 16);
assert(r.spikes.every(s => s.frames.length <= 120 && s.events.length <= 96));
const paused = new Recorder();
paused.frame({at : 0, active : true, paused : true, work_ms : 2, motion_gap_ms : 0});
paused.frame({at : 5000, active : true, paused : true, work_ms : 2, motion_gap_ms : 0});
assert.equal(paused.spikes.length, 0, 'An intentional pause became a stall');
console.log(
    'Browserdiagnose: einzelne Aussetzer, Vorlauf/Nachlauf, verspätete Browserdaten, Speichergrenzen und Pause: OK');

const Faults = vm.runInContext('DisplayFaults', sandbox), faults = new Faults(r);
let tries = 0, good = 0;
const fail = () => {
  tries++;
  throw Error('broken geometry ' + tries)
};
for (let i = 0; i < 12; i++) {
  faults.run('Tank', fail);
  if (faults.issues.has('Tank'))
    faults.issues.get('Tank').retryAt = 0;
  faults.run('Preview', () => { good++; });
}
assert.equal(tries, 3, 'Repeated rendering errors retry without a bound');
assert.equal(good, 12, 'One failed stage stops another view');
faults.report('Command', Error('bad request'));
faults.clear('Command');
assert(faults.issues.has('Tank'), 'Unrelated successful command hides the rendering error');
faults.clear('Tank');
faults.run('Tank', () => {});
assert(!faults.issues.has('Tank'));
faults.run('Transient', () => {throw Error('one failure')});
faults.issues.get('Transient').retryAt = 0;
faults.run('Transient', () => {});
assert(!faults.issues.has('Transient'), 'A recovered stage retains its error');
assert(r.snapshot().events.some(e => e.kind === 'display-error' &&
                                     e.stack.includes('broken geometry')));
console.log(
    'Fehlerbehandlung: begrenzte Wiederholung, unabhängige Ansichten und Wiederherstellung: OK');
