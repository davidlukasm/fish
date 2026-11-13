'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = process.argv[2] || path.resolve(__dirname, '../inspektoren.html');
const html = fs.readFileSync(file, 'utf8');
// Run the inline SVG generator and event handlers without a browser. In particular, the
// percentage check reads the drawn paths rather than asking the model for the same range twice.
const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g), m => m[1]);
assert.ok(scripts.length, 'Der Darmentwurf braucht ein ausführbares Skript');

class Element {
  constructor(tag) {
    this.tag = tag;
    this.attributes = {};
    this.children = [];
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {add: name => this.classes.add(name)};
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children.length = 0; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  setPointerCapture() {}
  createSVGPoint() { return {matrixTransform() { return this; }}; }
  getScreenCTM() { return {inverse: () => ({})}; }
  dispatch(name, x, y) {
    this.listeners.get(name)?.({
      clientX: x, clientY: y, pointerId: 1, preventDefault() {}, stopPropagation() {}
    });
  }
  findAll(predicate) {
    return this.children.flatMap(child =>
      [...(predicate(child) ? [child] : []), ...child.findAll(predicate)]);
  }
}

const elements = new Map();
const document = {
  createElementNS: (_, tag) => new Element(tag),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  }
};

const context = vm.createContext({document, requestAnimationFrame() {}, performance});
for (const script of scripts) vm.runInContext(script, context, {filename: file});
const evaluate = expression => vm.runInContext(expression, context, {filename: file});
const get = id => document.getElementById(id);
const read = (el, key) => Number(el.getAttribute(key));
const texts = id => get(id).findAll(el => el.tag === 'text').map(el => el.textContent);
const names = ['Blatt', 'Alge', 'Flocken', 'Plankton', 'Fleisch'];
const issues = new Set();
const check = (condition, message) => { if (!condition) issues.add(message); };

function shape(el) {
  if (el.tag === 'rect')
    return {x: read(el, 'x'), y: read(el, 'y'), w: read(el, 'width'), h: read(el, 'height')};
  if (el.tag === 'circle') {
    const r = read(el, 'r');
    return {x: read(el, 'cx') - r, y: read(el, 'cy') - r, w: 2 * r, h: 2 * r};
  }
  return null;
}

const grips = root => root.findAll(el => el.classes.has('grip'));
function checkGeometry(root, id) {
  for (const node of root.findAll(() => true))
    for (const [name, value] of Object.entries(node.attributes))
      check(!/\b(NaN|Infinity|undefined)\b/.test(value), `${id}: ungültiges SVG-Attribut ${name}`);
  const targets = grips(root).filter(shape);
  for (const [i, a] of targets.entries()) {
    const box = shape(a);
    for (const b of targets.slice(i + 1)) {
      const other = shape(b);
      if (box.x + box.w / 2 === other.x + other.w / 2 &&
          box.y + box.h / 2 === other.y + other.h / 2)
        check(false, `${id}: Griffe ${a.getAttribute('data-name')} und ${b.getAttribute('data-name')} am selben Punkt`);
    }
  }
}

function checkYield() {
  const canvas = get('yield');
  const band = canvas.findAll(el => el.tag === 'rect')[0];
  assert.ok(band, 'Das Ertragsdiagramm braucht ein sichtbares Fenster');
  const left = read(band, 'x'), right = left + read(band, 'width');
  const {top, base} = evaluate('Y');
  const colours = evaluate('FOOD.map(food => food[2])');
  const ranges = texts('bars').filter(v => /^\d+\s*[–-]\s*\d+\s*%$/.test(v));
  check(ranges.length === names.length, 'Die fünf Ertragsbalken brauchen je zwei Prozentwerte');
  if (ranges.length !== names.length) return;
  for (const [i, colour] of colours.entries()) {
    const segments = canvas.findAll(el => el.tag === 'path' && el.getAttribute('stroke') === colour &&
        el.getAttribute('fill') === 'none');
    const curves = segments.map(segment => {
      const points = Array.from(segment.getAttribute('d').matchAll(
          /[ML]\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/g), m => [Number(m[1]), Number(m[2])]);
      return {points, hurts: Boolean(segment.getAttribute('stroke-dasharray'))};
    });
    const points = curves.flatMap(c => c.points);
    if (!points.length) {
      check(false, `${names[i]}: keine sichtbare Ertragskurve gefunden`);
      continue;
    }
    // Read the plotted path, interpolating where it crosses the visible window.
    const samples = [];
    for (const [index, [x, y]] of points.entries()) {
      if (x >= left && x <= right) samples.push((base - y) / (base - top) * 100);
      if (index === 0) continue;
      const [previous, before] = points[index - 1];
      for (const edge of [left, right])
        if (previous < edge && edge < x)
          samples.push((base - before - (y - before) * (edge - previous) / (x - previous)) /
              (base - top) * 100);
    }
    check(samples.length > 0, `${names[i]}: Kurve fehlt im ausgewiesenen Fenster`);
    if (!samples.length) continue;
    const actual = ranges[i].match(/\d+/g).map(Number);
    const expected = [Math.min(...samples), Math.max(...samples)].map(Math.round);
    check(actual.every((n, k) => Math.abs(n - expected[k]) <= 1),
          `${names[i]}: Balken ${actual.join('–')} %, sichtbare Kurve im Fenster ${expected.join('–')} %`);
    const hasHurt = curves.some(({hurts, points}) =>
      hurts && points.at(-1)?.[0] > left && points[0]?.[0] < right);
    const row = 6 + 21 * i;
    const hasFrame = get('bars').findAll(el => el.tag === 'rect' &&
        el.getAttribute('stroke-dasharray') && Math.abs(read(el, 'y') + 3 - row) < 1).length > 0;
    check(hasHurt === hasFrame, `${names[i]}: Strichelung und Bauchweh-Rahmen stimmen nicht überein`);
  }
}

function inspect() {
  checkYield();
  for (const [id, root] of elements) checkGeometry(root, id);
}

inspect();
const curveValues = evaluate('FOOD.map(([name, food]) => [name, gain(food, 50), best(food), gain(food, 800)])');
const target = {Blatt: [null, 92], Alge: [18, 78, 78], Plankton: [34, 72], Fleisch: [null, 82]};
const columns = ['am linken Rand', 'am Maximum', 'am rechten Rand'];
for (const [name, ...values] of curveValues)
  target[name]?.forEach((expected, i) => {
    if (expected != null)
      check(Math.round(values[i] * 100) === expected,
            `${name} ${columns[i]}: ${(100 * values[i]).toFixed(2)} %, Vorgabe ${expected} %`);
  });

const initial = evaluate('JSON.stringify(S)');
const snapshots = [...elements].map(([id, root]) =>
  [id, grips(root).map(grip => grip.getAttribute('data-name'))]);
let dragged = 0;
for (const [id, names] of snapshots) {
  for (const name of names) {
    evaluate(`Object.assign(S, JSON.parse(${JSON.stringify(initial)})); draw();`);
    const root = get(id);
    const grip = grips(root).find(el => el.getAttribute('data-name') === name);
    const box = shape(grip);
    if (!box) continue;
    const center = [box.x + box.w / 2, box.y + box.h / 2];
    const views = [...elements].map(([id, root]) => [id, root.getAttribute('viewBox')]);
    const [left, top, width, height] = root.getAttribute('viewBox').split(/\s+/).map(Number);
    const update = (x, y) => root.dispatch('pointermove', x, y);
    try {
      grip.dispatch('pointerdown', ...center);
      for (const [x, y] of [[center[0] - 20, center[1] - 15], [center[0] + 20, center[1] + 15],
                            [left, top], [left + width, top + height]]) {
        update(x, y);
        check(views.every(([id, before]) => get(id).getAttribute('viewBox') === before),
              `${id}/${name}: viewBox verändert sich beim Ziehen`);
        inspect();
      }
      root.dispatch('pointerup');
      dragged++;
    } catch (error) {
      check(false, `${id}/${name}: ${error.message}`);
    }
  }
}

console.log(`${dragged} Ziehpfade über SVG-Ereignishandler geprüft. Textlayout und Bildrate benötigen einen Browser.`);
for (const issue of issues) console.error(issue);
process.exitCode = issues.size > 0 ? 1 : 0;
