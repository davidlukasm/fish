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
