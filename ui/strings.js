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
  const index = await loadStrings('index'), resources = {};
  await Promise.all(
      Object.entries(index.locales).flatMap(([ locale, names ]) => names.map(async name => {
        (resources[locale] ??= {})[name] = await loadStrings(locale + '/' + name);
      })));
  useTexts(index, resources);
  applyTexts(globalThis.document);
}

// Resources handed over directly, {locale: {area: data}}: where nothing is fetched (tests).
export function useTexts(index, resources) {
  fallback = index.default;
  for (const [locale, named] of Object.entries(resources))
    Object.assign(areas[locale] ??= {}, named);
}

export function textArea(name, locale = fallback) { return areas[locale]?.[name] || {}; }

function node(key, locale) {
  let found = areas[locale];
  for (const part of key.split('.'))
    found = found?.[part];
  return found;
}

function warnMissing(key) {
  if (!missing.has(key)) {
    missing.add(key);
    console.warn('Missing text: ' + key);
  }
}

export function t(key, vars, locale = fallback) {
  const text = node(key, locale);
  if (typeof text !== 'string') {
    warnMissing(key);
    return key;
  }
  return vars ? format(text, vars) : text;
}

// A list of wordings, e.g. names indexed by kind.
export function tList(key, locale = fallback) {
  const list = node(key, locale);
  if (!Array.isArray(list)) {
    warnMissing(key);
    return [];
  }
  return list;
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

// Numbers in the interface language: at most `digits` decimals, exactly that many if `fixed`.
const numberFormats = new Map();
export function formatNumber(value, digits = 0, fixed = false) {
  if (!Number.isFinite(value))
    return '–';
  const key = digits + (fixed ? 'f' : '');
  if (!numberFormats.has(key))
    numberFormats.set(
        key, new Intl.NumberFormat(
                 t('units.locale'),
                 {maximumFractionDigits : digits, minimumFractionDigits : fixed ? digits : 0}));
  return numberFormats.get(key).format(value);
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
