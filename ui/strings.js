import {RATE_WINDOW, ROUTE} from './schema.js';
import {PERCENT} from './units.js';
// User-facing text lives in resource files under ui/text/<locale>/, never in code.
export const stringsState = {};
const loaded = new Map(), compiled = new Map();

function loadStrings(path) {
  if (!loaded.has(path))
    loaded.set(path, fetch(ROUTE.texts + path + '.json').then(r => {
      if (!r.ok)
        throw Error('Missing text resource: ' + path);
      return r.json();
    }));
  return loaded.get(path);
}

const areas = {}, missing = new Set();
let fallback, voice;

export async function loadTexts(names = null) {
  const index = await loadStrings('index'), resources = {};
  await Promise.all(
      Object.entries(index.locales)
          .flatMap(([ locale, available ]) =>
                       available.filter(name => !names || names.includes(name)).map(async name => {
                         (resources[locale] ??= {})[name] = await loadStrings(locale + '/' + name);
                       })));
  useTexts(index, resources);
  applyTexts(globalThis.document);
}

export function useTexts(index, resources) {
  fallback = index.default;
  voice = index.voice;
  for (const [locale, named] of Object.entries(resources))
    Object.assign(areas[locale] ??= {}, named);
}

export function textArea(name, locale = fallback) { return areas[locale]?.[name] || {}; }
export function voiceArea(name) { return textArea(name, voice); }

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
  return vars || text.includes('{') ? format(text, vars) : text;
}

export function tList(key, locale = fallback) {
  const list = node(key, locale);
  if (!Array.isArray(list)) {
    warnMissing(key);
    return [];
  }
  return list;
}

const TEXT_ATTRIBUTES = Object.freeze({
  title : 'title',
  'aria-label' : 'aria-label',
  placeholder : 'placeholder',
  empty : 'data-empty'
});
function applyTexts(root) {
  if (!root?.querySelectorAll)
    return;
  for (const e of root.querySelectorAll('[data-t]'))
    e.textContent = t(e.getAttribute('data-t'));
  for (const [name, attribute] of Object.entries(TEXT_ATTRIBUTES))
    for (const e of root.querySelectorAll('[data-t-' + name + ']'))
      e.setAttribute(attribute, t(e.getAttribute('data-t-' + name)));
}

export function cssPercent(share) { return PERCENT * share + '%'; }
export function percent(share, digits = 0) {
  return t('units.percent', {n : formatNumber(PERCENT * share, digits)});
}
const numberFormats = new Map();
function numberFormat(value, digits, fixed, signDisplay) {
  if (!Number.isFinite(value))
    return '–';
  const key = digits + (fixed ? 'f' : '') + signDisplay;
  if (!numberFormats.has(key))
    numberFormats.set(key, new Intl.NumberFormat(t('units.locale'), {
      maximumFractionDigits : digits,
      minimumFractionDigits : fixed ? digits : 0,
      signDisplay
    }));
  return numberFormats.get(key).format(value);
}
export function formatNumber(value, digits = 0, fixed = false) {
  return numberFormat(value, digits, fixed, 'auto');
}
export function formatSigned(value, digits = 0, fixed = false) {
  return numberFormat(value, digits, fixed, 'exceptZero');
}
export function joinParts(parts) {
  return parts.filter(part => part !== null && part !== undefined && part !== '')
      .join(t('units.separator'));
}
export const joinList = items => items.join(t('units.listSeparator'));
export const linkText = (from, to) => t('units.link', {from, to});
export const namedText = (name, value) => t('units.named', {name, value});
export const labelledText = (name, value) => t('units.labelled', {name, value});

const COMPACT = Object.freeze({million : 1e6, thousand : 1e3, thousands_from : 1e4, digits : 1});
export function compactNumber(v) {
  return v >= COMPACT.million
             ? t('units.millions', {n : formatNumber(v / COMPACT.million, COMPACT.digits)})
         : v >= COMPACT.thousands_from
             ? t('units.thousands', {n : formatNumber(v / COMPACT.thousand, COMPACT.digits)})
             : formatNumber(v, COMPACT.digits);
}

const capital = s => s ? s[0].toUpperCase() + s.slice(1) : s;

let pluralRules = null;
function countForm(value, forms) {
  pluralRules ??= new Intl.PluralRules(t('units.locale'));
  const count = typeof value === 'number' ? value : Number(String(value).replace(/\D/g, '')),
        order = pluralRules.resolvedOptions().pluralCategories, choices = forms.split('|');
  return choices[order.indexOf(pluralRules.select(count))] ?? choices.at(-1);
}

const SHARED = Object.freeze({rateSteps : RATE_WINDOW.display_steps});
export function format(template, vars = {}) {
  const value = key => vars[key] ?? SHARED[key];
  return String(template).replace(/\{(\w+)(?::([^{}]*))?\}/g, (all, key, forms) => {
    if (forms !== undefined)
      return value(key) !== undefined ? countForm(value(key), forms) : all;
    if (value(key) !== undefined)
      return String(value(key));
    const lower = key[0].toLowerCase() + key.slice(1);
    return value(lower) !== undefined ? capital(String(value(lower))) : all;
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
