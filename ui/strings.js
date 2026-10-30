// User-facing text lives in resource files under ui/text/<locale>/, never in code. This module
// loads them, fills placeholders and evaluates the small condition expressions used by
// data-driven rules (numbers, fact names, arithmetic, comparisons, && || !, min/max/abs/clamp).
export const stringsState = {};
const loaded = new Map(), compiled = new Map();

export function loadStrings(path) {
  if (!loaded.has(path))
    loaded.set(path, fetch('/ui/text/' + path + '.json').then(r => {
      if (!r.ok)
        throw Error('Missing text resource: ' + path);
      return r.json();
    }));
  return loaded.get(path);
}

// Every resource named in ui/text/index.json is loaded once before the interface starts, so
// t() answers synchronously everywhere.
const areas = {}, missing = new Set();
let fallback = 'de';

export async function loadTexts() {
  const index = await loadStrings('index');
  fallback = index.default;
  await Promise.all(
      Object.entries(index.locales).flatMap(([ locale, names ]) => names.map(async name => {
        (areas[locale] ??= {})[name] = await loadStrings(locale + '/' + name);
      })));
  applyTexts(globalThis.document);
}

export function textArea(name, locale = fallback) { return areas[locale]?.[name] || {}; }

export function t(key, vars, locale = fallback) {
  let node = areas[locale];
  for (const part of key.split('.'))
    node = node?.[part];
  if (typeof node !== 'string') {
    if (!missing.has(key)) {
      missing.add(key);
      console.warn('Missing text: ' + key);
    }
    return key;
  }
  return vars ? format(node, vars) : node;
}

// Markup names its wording instead of containing it: data-t sets the text; data-t-title,
// data-t-aria-label and data-t-placeholder set those attributes.
export function applyTexts(root) {
  if (!root?.querySelectorAll)
    return;
  for (const e of root.querySelectorAll('[data-t]'))
    e.textContent = t(e.getAttribute('data-t'));
  for (const name of ['title', 'aria-label', 'placeholder'])
    for (const e of root.querySelectorAll('[data-t-' + name + ']'))
      e.setAttribute(name, t(e.getAttribute('data-t-' + name)));
}

const capital = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// "{name}" takes the value, "{Name}" the same value with a capital first letter.
export function format(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (all, key) => {
    if (vars[key] !== undefined)
      return String(vars[key]);
    const lower = key[0].toLowerCase() + key.slice(1);
    return vars[lower] !== undefined ? capital(String(vars[lower])) : all;
  });
}

const FUNCTIONS = {
  min : Math.min,
  max : Math.max,
  abs : Math.abs,
  clamp : (x, a = 0, b = 1) => Math.max(a, Math.min(b, x))
};

function tokens(text) {
  const out = [], pattern = /\s*(\d+\.?\d*|\.\d+|[A-Za-z_]\w*|&&|\|\||[<>=!]=|[-+*/()<>!,])/y;
  let match;
  pattern.lastIndex = 0;
  while (pattern.lastIndex < text.length && (match = pattern.exec(text)))
    out.push(match[1]);
  if (pattern.lastIndex < text.trimEnd().length)
    throw Error('Invalid expression: ' + text);
  return out;
}

// Precedence climbing into closures; facts missing from the input count as 0.
function parse(text) {
  const list = tokens(text);
  let at = 0;
  const peek = () => list[at], take = () => list[at++];
  const BINARY =
      [ [ '||' ], [ '&&' ], [ '==', '!=' ], [ '<', '<=', '>', '>=' ], [ '+', '-' ], [ '*', '/' ] ];
  const apply = {
    '||' : (a, b) => f => a(f) || b(f),
    '&&' : (a, b) => f => a(f) && b(f),
    '==' : (a, b) => f => a(f) === b(f),
    '!=' : (a, b) => f => a(f) !== b(f),
    '<' : (a, b) => f => a(f) < b(f),
    '<=' : (a, b) => f => a(f) <= b(f),
    '>' : (a, b) => f => a(f) > b(f),
    '>=' : (a, b) => f => a(f) >= b(f),
    '+' : (a, b) => f => a(f) + b(f),
    '-' : (a, b) => f => a(f) - b(f),
    '*' : (a, b) => f => a(f) * b(f),
    '/' : (a, b) => f => a(f) / b(f)
  };
  function level(n) {
    if (n === BINARY.length)
      return unary();
    let left = level(n + 1);
    while (BINARY[n].includes(peek()))
      left = apply[take()](left, level(n + 1));
    return left;
  }
  function unary() {
    if (peek() === '!') {
      take();
      const inner = unary();
      return f => !inner(f);
    }
    if (peek() === '-') {
      take();
      const inner = unary();
      return f => -inner(f);
    }
    return primary();
  }
  function primary() {
    const t = take();
    if (t === '(') {
      const inner = level(0);
      take();
      return inner;
    }
    if (/^[\d.]/.test(t)) {
      const v = Number(t);
      return () => v;
    }
    if (FUNCTIONS[t] && peek() === '(') {
      take();
      const args = [];
      while (peek() !== ')') {
        args.push(level(0));
        if (peek() === ',')
          take();
      }
      take();
      return f => FUNCTIONS[t](...args.map(a => a(f)));
    }
    if (t === 'true' || t === 'false') {
      const v = t === 'true';
      return () => v;
    }
    return f => f[t] ?? 0;
  }
  const fn = level(0);
  if (at !== list.length)
    throw Error('Invalid expression: ' + text);
  return fn;
}

export function evaluate(expression, facts) {
  if (typeof expression === 'number')
    return expression;
  if (!compiled.has(expression))
    compiled.set(expression, parse(expression));
  return compiled.get(expression)(facts);
}
