// DOM and drawing surface used by controller and native-module integration tests.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
function createFixture(fixture) {
  const page = fs.readFileSync('viewer.html', 'utf8'), requests = [];
  let draws = 0;
  const context = () => new Proxy(
      {
        stats : {draws : 0, vertices : 0},
        createLinearGradient : () => ({addColorStop() {}}),
        stackDepth : 0,
        clipBounds : [ 0, 0, 1400, 900 ],
        lost : false,
        frameReady : () => true,
        save() {
          this.stackDepth++;
          draws++
        },
        restore() {
          assert(this.stackDepth > 0, 'Canvas restore without save');
          this.stackDepth--;
          draws++
        }
      },
      {
        get(t, k) {
          if (k === 'layerAlpha')
            return t.layerAlpha ?? 1;
          if (!(k in t))
            t[k] = (...args) => {
              assert(args.every(x => typeof x !== 'number' || Number.isFinite(x)), `${k}: ${args}`);
              draws++
            };
          return t[k]
        }
      });
  function element(tag = 'div') {
    return {
      tag,
      dataset : {},
      attrs : {},
      setAttribute(k, v) { this.attrs[k] = v },
      style : {},
      textContent : '',
      disabled : false,
      hidden : false,
      checked : false,
      value : '',
      width : 600,
      height : 350,
      children : [],
      get lastChild() { return this.children.at(-1); },
      classList : {
        values : new Set(),
        add(name) { this.values.add(name); },
        remove(name) { this.values.delete(name); },
        toggle(name, force) {
          const on = force === undefined ? !this.values.has(name) : !!force;
          if (on)
            this.values.add(name);
          else
            this.values.delete(name);
          return on
        },
        contains(name) { return this.values.has(name) }
      },
      scrollTop : 0,
      scrollHeight : 100,
      clientHeight : 100,
      close() {},
      showModal() {},
      get childNodes() { return this.children },
      replaceChildren(...v) { this.children = v },
      append(...nodes) {
        for (const node of nodes)
          this.appendChild(node);
      },
      querySelectorAll() { return []; },
      checkValidity() { return true; },
      reportValidity() { return true; },
      appendChild(c) {
        this.children.push(c);
        const register = n => {
          if (n.id)
            elements[n.id] = n;
          n.children?.forEach(register);
        };
        register(c);
        c.parentElement = this
      },
      removeChild(c) {
        const i = this.children.indexOf(c);
        assert(i >= 0);
        this.children.splice(i, 1);
        c.parentElement = null;
        return c
      },
      insertBefore(c, b) {
        if (c.parentElement?.children.includes(c))
          c.parentElement.removeChild(c);
        const i = b === null ? this.children.length : this.children.indexOf(b);
        assert(i >= 0);
        this.children.splice(i, 0, c);
        c.parentElement = this;
        return c
      },
      getContext() { return this.context ??= context() },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 1400, height: 900 }
      }
    };
  }
  const canvasStyles = fs.readFileSync('ui/style.css', 'utf8');
  function assertCanvasRatio(selector, canvas) {
    let ratio = 'auto';
    for (const rule of canvasStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      if (rule[1].split(',').map(s => s.trim()).includes(selector)) {
        const value = rule[2].match(/(?:^|;)\s*aspect-ratio\s*:\s*([^;]+)/);
        if (value)
          ratio = value[1].trim();
      }
    if (ratio === 'auto')
      return;
    const [w, h = 1] = ratio.split('/').map(Number);
    assert(Math.abs(w / h - canvas.width / canvas.height) < 1e-8,
           selector + ' distorts graphic labels');
  }
  const ids = [...page.matchAll(/id="([^"]+)"/g) ].map(m => m[1]),
        elements = Object.fromEntries(ids.map(id => [id, {...element(), id}]));
  for (const e of Object.values(elements))
    e.parentElement = element('label');
  for (const match of page.matchAll(
           /<canvas[^>]*id="([^"]+)"[^>]*width="([0-9]+)"[^>]*height="([0-9]+)"/g)) {
    elements[match[1]].width = Number(match[2]);
    elements[match[1]].height = Number(match[3]);
  }
  for (const match of page.matchAll(/<canvas[^>]*id="([^"]+)"/g))
    assertCanvasRatio('#' + match[1], elements[match[1]]);
  const toolButtons =
      [...page.matchAll(/<button\b([^>]*\bdata-tool="([^"]+)"[^>]*)>([^<]*)<\/button>/g) ].map(
          match => {
            const button = element('button');
            button.dataset.tool = match[2];
            button.textContent = match[3];
            return button;
          });
  assert(toolButtons.some(button => button.dataset.tool === 'inspect'),
         'World tools missing from HTML fixture');
  const sandbox = {
    structuredClone,
    URLSearchParams,
    performance,
    createTankRenderer : () => context(),
    TankPath : class {constructor() { return context() }},
    TankLayer : class {
      constructor() {
        this.width = this.height = 1;
        this.context = context();
        this.context.reset = () => {};
      } getContext() { return this.context; } replace(layer) {
        this.width = layer.width;
        this.height = layer.height;
        this.context = layer.context;
      }
    },
    TankPixelImage : class {constructor() { return element('canvas') }},
    TankDisplayList : class {
      constructor() {
        const c = context();
        c.replay = () => {};
        return c;
      }
    },
    touchTankImage : () => {},
    TextDecoder,
    AbortController,
    clearTimeout,
    window : {FISH_TOKEN : 'test', addEventListener() {}},
    document : {
      activeElement : null,
      querySelectorAll : selector => selector === '[data-tool]' ? toolButtons : [],
      getElementById : id => {
        assert(elements[id], 'Missing element ' + id);
        return elements[id]
      },
      createElement : element,
      addEventListener() {}
    },
    requestAnimationFrame : fn => {
      if (fn.name === 'animate')
        assert(
            vm.runInContext(
                "typeof brainRender==='function'&&typeof animateSpecies==='function'&&typeof animateSelectedFish==='function'",
                sandbox),
            'Animation starts before the UI is loaded');
    },
    setTimeout : () => {},
    fetch : async (url, opt) => {
      if (opt?.body) {
        requests.push(JSON.parse(opt.body));
        return { ok: true, json: async () => ({ok : true}) }
      }
      if (url.startsWith('/scene') && fixture.binary_packet) {
        const bytes = Buffer.from(fixture.binary_packet, 'base64');
        return {
          ok : true,
          headers : {get : () => String(bytes.length)},
          arrayBuffer : async () =>
              bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)
        };
      }
      return {
        ok: true, headers: {get: () => '0'},
            json: async () => structuredClone(
                url.startsWith('/history') ? fixture.history
                : url.startsWith('/journal')
                    ? (fixture.journal ||
                       {events : [], archive : [], traces : {}, records : {}, autosaves : []})
                    : fixture.state)
      }
    }
  };

  return {sandbox, elements, requests, page, getDraws : () => draws, assertCanvasRatio};
}
module.exports = {createFixture};
