'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const [, , ...args] = process.argv;
const file = args.find(arg => arg !== '--layout') || path.resolve(__dirname, '../inspektoren.html');
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
    this.classList = {add: name => this.classes.add(name), remove: name => this.classes.delete(name)};
  }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children.length = 0; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name) { this.listeners.delete(name); }
  querySelectorAll(selector) {
    assert.ok(/^\.[\w-]+$/.test(selector), `Unbekannter SVG-Selektor ${selector}`);
    return this.findAll(child => child.classes.has(selector.slice(1)));
  }
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
  if (el.tag === 'g') {
    const target = el.children.find(child => child.tag === 'rect');
    if (target) return shape(target);
  }
  return null;
}

const grips = root => root.findAll(el => el.getAttribute('data-name') &&
    (el.classes.has('grip') || el.classes.has('knob')));
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

const xml = input => String(input).replaceAll('&', '&amp;').replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// Inkscape supplies glyph bounds at the 298 px inner width of the 320 px panel.
function checkTextLayout() {
  const spacing = 3;
  const edgeTolerance = 1;
  for (const [id, root] of elements) {
    const view = root.getAttribute('viewBox');
    if (!view) continue;
    const [x, y, w, h] = view.split(/\s+/).map(Number);
    const css = 'text {font-family:sans-serif;font-size:11px} text.value {font-variant-numeric:tabular-nums}';
    const labels = root.findAll(el => el.tag === 'text' && el.textContent);
    const ink = labels.map((el, i) => {
      const attrs = Object.entries(el.attributes)
          .map(([k, v]) => `${k}="${xml(v)}"`).join(' ');
      return `<text id="t${i}" ${attrs}>${xml(el.textContent)}</text>`;
    }).join('');
    const width = 298, height = h * width / w;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"` +
        ` viewBox="${x} ${y} ${w} ${h}"><style>${css}</style>${ink}</svg>`;
    const result = spawnSync('inkscape', ['--pipe', '--query-all'], {input: svg, encoding: 'utf8'});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    const boxes = result.stdout.trim().split('\n').filter(line => /^t\d+,/.test(line)).map(line => {
      const [name, ...values] = line.split(',');
      const [x, y, w, h] = values.map(Number);
      return {text: labels[Number(name.slice(1))].textContent, x, y, w, h};
    });
    assert.equal(boxes.length, labels.length, `${id}: Textmessung unvollständig`);
    for (const [i, a] of boxes.entries()) {
      check(a.x >= -edgeTolerance && a.x + a.w <= width + edgeTolerance &&
            a.y >= -edgeTolerance && a.y + a.h <= height + edgeTolerance,
            `${id}: „${a.text}“ ragt aus dem SVG`);
      for (const b of boxes.slice(i + 1)) {
        const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const close = width > -spacing && height > 0;
        check(!close, `${id}: „${a.text}“ und „${b.text}“ haben keinen sichtbaren Abstand`);
      }
      for (const grip of grips(root)) {
        const b = shape(grip);
        if (!b) continue;
        const scale = width / w;
        const bx = (b.x - x) * scale, by = (b.y - y) * scale;
        const overlap = a.x < bx + b.w * scale && a.x + a.w > bx &&
                        a.y < by + b.h * scale && a.y + a.h > by;
        check(!overlap, `${id}: „${a.text}“ überdeckt Griff ${grip.getAttribute('data-name')}`);
      }
    }
  }
}

inspect();
if (args.includes('--layout')) checkTextLayout();
const curveValues = evaluate('CURVES.map(c => [c.name, c.gains[0], c.best, c.gains.at(-1)])');
const target = {Blatt: [null, 92], Alge: [18, 78, 78], Plankton: [34, 72], Fleisch: [null, 82]};
const columns = ['am linken Rand', 'am Maximum', 'am rechten Rand'];
for (const [name, ...values] of curveValues)
  target[name]?.forEach((expected, i) => {
    if (expected != null)
      check(Math.round(values[i] * 100) === expected,
            `${name} ${columns[i]}: ${(100 * values[i]).toFixed(2)} %, Vorgabe ${expected} %`);
  });

const initial = evaluate('JSON.stringify(S)');
const initialAge = evaluate('typeof shown === "undefined" ? null : shown.age');
const snapshots = [...elements].map(([id, root]) =>
  [id, grips(root).map(grip => grip.getAttribute('data-name'))]);
let dragged = 0;
for (const [id, names] of snapshots) {
  for (const name of names) {
    evaluate(`Object.assign(S, JSON.parse(${JSON.stringify(initial)}));`);
    if (initialAge !== null) evaluate(`shown.age = ${initialAge}`);
    evaluate('draw(); repaint();');
    const root = get(id);
    const grip = grips(root).find(el => el.getAttribute('data-name') === name);
    const box = shape(grip);
    if (!box) continue;
    const center = [box.x + box.w / 2, box.y + box.h / 2];
    const views = [...elements].map(([id, root]) => [id, root.getAttribute('viewBox')]);
    const [left, top, width, height] = root.getAttribute('viewBox').split(/\s+/).map(Number);
    const update = (x, y) => {
      root.dispatch('pointermove', x, y);
      evaluate('repaint()');
    };
    try {
      grip.dispatch('pointerdown', ...center);
      const state = evaluate('JSON.stringify(S)');
      update(...center);
      const before = JSON.parse(state), after = JSON.parse(evaluate('JSON.stringify(S)'));
      if (name === 'wall' || name === 'fastest')
        check(Math.abs(before.muscle - after.muscle) < .02,
              `${id}/${name}: Antrieb springt am Griffmittelpunkt von ${before.muscle.toFixed(2)} auf ${after.muscle.toFixed(2)}`);
      if (name.endsWith('spread')) {
        const sense = before[id], spread = sense.keys[sense.chosen].spread;
        const result = after[id].keys[sense.chosen].spread;
        check(Math.abs(spread - result) < .002,
              `${id}/${name}: Streuung ändert sich am Griffmittelpunkt von ${spread.toFixed(3)} auf ${result.toFixed(3)}`);
      }
      for (const [x, y] of [[center[0] - 20, center[1] - 15], [center[0] + 20, center[1] + 15],
                            [left, top], [left + width, top + height]]) {
        update(x, y);
        check(views.every(([id, before]) => get(id).getAttribute('viewBox') === before),
              `${id}/${name}: viewBox verändert sich beim Ziehen`);
        inspect();
      }
      root.dispatch('pointerup');
      evaluate('repaint()');
      dragged++;
    } catch (error) {
      check(false, `${id}/${name}: ${error.message}`);
    }
  }
}

console.log(`${dragged} Ziehpfade über SVG-Ereignishandler geprüft.`);
if (args.includes('--layout')) console.log('SVG-Textabstände bei 320 px mit Inkscape geprüft.');
console.log('Trefferflächen und Bildrate im Browser bleiben separat zu prüfen.');
for (const issue of issues) console.error(issue);
process.exitCode = issues.size > 0 ? 1 : 0;
