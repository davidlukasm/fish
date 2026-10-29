const {readUI} = require('./ui_source.js');
// Tooltips survive live text updates and replacement of the hovered DOM node.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const handlers = {}, timers = new Map();
let callback, hovered = null, nextTimer = 0;
class Element {
  constructor() {
    this.attributes = {};
    this.children = [];
    this.style = {};
    this.hidden = false;
    this.isConnected = true;
    this.textContent = '';
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(node) {
    this.children.push(node);
    node.parentElement = this;
    return node;
  }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return {left : 100, bottom : 120, width : 200, height : 60}; }
}
const doc = {
  body : new Element(),
  createElement : () => new Element(),
  elementFromPoint : () => hovered,
  addEventListener : (kind, fn) => handlers[kind] = fn
};
const host = {
  innerWidth : 1000,
  innerHeight : 800,
  setTimeout(fn) {
    timers.set(++nextTimer, fn);
    return nextTimer;
  },
  clearTimeout(id) { timers.delete(id); },
  addEventListener() {},
  MutationObserver : class {
    constructor(fn) { callback = fn; }
    observe() {}
  }
};
const source = readUI('ui/tooltips.js');
vm.runInNewContext(
    source.slice(source.indexOf('function installTooltips('),
                 source.lastIndexOf('installTooltips();') + 'installTooltips();'.length),
    {document : doc, window : host});
const tooltip = doc.body.children[0], node = doc.body.appendChild(new Element());
node.setAttribute('title', 'Noch 200 Schritte');
const point = target => {
  hovered = target;
  handlers.pointerover({target, clientX : 150, clientY : 100, pointerType : 'mouse'});
};
const elapsed = () => {
  for (const [id, fn] of [...timers]) {
    timers.delete(id);
    fn();
  }
};
point(node);
assert(tooltip.hidden && timers.size === 1);
assert(!node.hasAttribute('title'), 'Browser tooltip still enabled');
elapsed();
assert(!tooltip.hidden && tooltip.textContent === 'Noch 200 Schritte');
for (let remaining = 199; remaining >= 190; --remaining) {
  node.setAttribute('title', 'Noch ' + remaining + ' Schritte');
  callback([ {target : node, type : 'attributes'} ]);
  assert(!tooltip.hidden && tooltip.textContent === 'Noch ' + remaining + ' Schritte');
  assert.equal(timers.size, 0, 'Live update restarted hover delay');
  assert(!node.hasAttribute('title'));
}
const replacement = doc.body.appendChild(new Element());
replacement.setAttribute('title', 'Neuer Messwert');
node.isConnected = false;
hovered = replacement;
callback([ {target : doc.body, type : 'childList'} ]);
assert(!tooltip.hidden && tooltip.textContent === 'Neuer Messwert' && timers.size === 0,
       'DOM replacement closed the tooltip');
assert.equal(node.getAttribute('title'), 'Noch 190 Schritte');
handlers.pointerdown();
assert(tooltip.hidden);
assert.equal(replacement.getAttribute('title'), 'Neuer Messwert');
callback([ {target : replacement, type : 'attributes'} ]);
assert(tooltip.hidden, 'Click reopened the tooltip');
handlers.focusin({target : replacement});
elapsed();
assert(!tooltip.hidden && tooltip.textContent === 'Neuer Messwert');
assert(replacement.getAttribute('aria-describedby').includes(tooltip.id));
handlers.keydown({key : 'Escape'});
assert(tooltip.hidden && !replacement.getAttribute('aria-describedby'));
point(replacement);
elapsed();
replacement.setAttribute('title', '');
callback([ {target : replacement, type : 'attributes'} ]);
assert(tooltip.hidden, 'Removed explanation stays visible');
node.isConnected = true;
node.setAttribute('title', 'Wieder da');
point(node);
elapsed();
handlers.pointerout({relatedTarget : null});
assert(tooltip.hidden && node.getAttribute('title') === 'Wieder da');
node.closest = () => ({
  getBoundingClientRect : () => ({left : 80, top : 650, bottom : 720, width : 500, height : 70})
});
point(node);
elapsed();
assert(Number.parseFloat(tooltip.style.top) + 60 < 650,
       'Tooltip covers the slider label or current value');
handlers.pointerdown();
handlers.pointermove(
    {target : node, clientX : 155, clientY : 690, pointerType : 'mouse', buttons : 1});
elapsed();
assert(tooltip.hidden, 'Tooltip reopened during slider dragging');
console.log('Tooltips: laufende Werte, DOM-Austausch, Tastatur und Ausblenden: OK');
