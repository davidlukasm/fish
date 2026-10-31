import {t} from './strings.js';
import {traitEvidence, traitGroup, traitName, traitNote} from './trait_model.js';
import {displayFaults} from './diagnostics.js';
import {createTankRenderer} from './renderer.js';
export const domState = {};
export let el;

export let text;

export let canvas;

export let ctx;

export let rgb;

const chartSizes = new WeakMap();
export function chartContext(canvas, redraw) {
  let size = chartSizes.get(canvas);
  if (!size) {
    size = {width : canvas.width, height : canvas.height};
    chartSizes.set(canvas, size);
    // Layout must not grow with the pixel buffer on high-DPI displays or browser zoom.
    canvas.classList.add('chart-canvas');
    canvas.style.aspectRatio = size.width + ' / ' + size.height;
    if (canvas.id && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        const w = canvas.getBoundingClientRect().width;
        if (w > 0 && Math.round(w * (window.devicePixelRatio || 1)) !== canvas.width)
          size.redraw?.();
      });
      size.observer = observer;
      observer.observe(canvas);
    }
  }
  size.redraw = redraw;
  const width = canvas.getBoundingClientRect?.().width || size.width,
        ratio = window.devicePixelRatio || 1, w = Math.max(1, Math.round(width * ratio)),
        h = Math.max(1, Math.round(w * size.height / size.width));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext('2d');
  g.setTransform(w / size.width, 0, 0, h / size.height, 0, 0);
  return g;
}
export function redrawCharts() {
  for (const canvas of document.querySelectorAll('canvas')) {
    const size = chartSizes.get(canvas);
    if (size?.redraw && canvas.getBoundingClientRect().width > 0)
      size.redraw();
  }
}
export function chartSize(canvas) { return chartSizes.get(canvas) || canvas; }

export function syncChildren(parent, nodes) {
  for (let i = 0; i < nodes.length; ++i)
    if (parent.children[i] !== nodes[i])
      parent.insertBefore(nodes[i], parent.children[i] || null);
  while (parent.children.length > nodes.length)
    parent.removeChild(parent.children[parent.children.length - 1]);
}

export let uiIconPaths;

export function uiIcon(name) {
  const key = name === 'remove-plants' ? 'grass' : name === 'remove-sediment' ? 'sediment' : name;
  return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' +
         (uiIconPaths[key] || uiIconPaths.trait) + '"/>' +
         (name.startsWith('remove-') ? '<path d="M3 21 21 3" stroke="#d99887" stroke-width="2.3"/>'
                                     : '') +
         '</svg>';
}

export function traitIcon(group) {
  return ({
           Sehen : 'eye',
           Riechen : 'nose',
           Strömung : 'current',
           Berührung : 'touch',
           Verletzung : 'heart',
           Energie : 'energy',
           Nahrungsfluss : 'feed',
           Dehnung : 'eggs',
           Schmerz : 'warning',
           Orientierung : 'move',
           Farbe : 'species',
           Nahrung : 'feed',
           Bewegung : 'move',
           Fortpflanzung : 'eggs',
           Lebensraum : 'grass',
           Nervensystem : 'brain',
           Nervensystem : 'brain',
           Körper : 'species',
           Kampf : 'warning',
           Kombination : 'trait'
         })[group] ||
         'chart';
}

// One list of trait words: the species' words first, then those only this fish shows (outlined).
export function renderMergedTraitChips(box, species, own) {
  const speciesWords = species?.summary_labels || species?.profile_labels || [],
        ownWords = own?.profile_labels || [],
        signature = JSON.stringify([ species?.id, speciesWords, own?.id, ownWords ]);
  if (box.traitSignature === signature)
    return;
  box.traitSignature = signature;
  box.replaceChildren();
  const shown = new Set();
  for (const word of speciesWords) {
    shown.add(word);
    box.appendChild(traitChip(word, species, true));
  }
  for (const word of ownWords)
    if (!shown.has(word)) {
      shown.add(word);
      const chip = traitChip(word, own, true);
      chip.classList.add('own-trait');
      chip.title = chip.title ? t('dom.ownTraitOf', {title : chip.title}) : t('dom.ownTrait');
      box.appendChild(chip);
    }
}

export function traitChip(word, profile, icon = false) {
  const detail = profile?.trait_details?.[word] || {}, tag = document.createElement('span');
  tag.className = detail.group === 'Kombination' ? 'combined-trait' : '';
  tag.dataset.basis = detail.basis || 'anatomy';
  tag.tabIndex = 0;
  if (icon) {
    const symbol = document.createElement('i'), label = document.createElement('span');
    symbol.innerHTML = uiIcon(traitIcon(detail.group));
    label.textContent = traitName(word);
    tag.appendChild(symbol);
    tag.appendChild(label);
  } else
    tag.textContent = traitName(word);
  const basis = {
    anatomy : t('dom.koerperbau'),
    behavior : t('dom.beobachtung'),
    mixed : t('dom.koerperbauUndBeobachtung')
  };
  tag.title =
      [ basis[detail.basis], traitNote(word, detail), traitEvidence(detail) ].filter(Boolean).join(
          ' · ');
  return tag;
}

export function renderTraitGroups(box, profile) {
  box.replaceChildren();
  const groups = new Map();
  for (const word of profile?.labels || []) {
    const group = profile.trait_details?.[word]?.group || t('dom.merkmale');
    if (!groups.has(group))
      groups.set(group, []);
    groups.get(group).push(word);
  }
  for (const [group, words] of [...groups].sort(([ a ], [ b ]) => Number(b === 'Kombination') -
                                                                  Number(a === 'Kombination'))) {
    const section = document.createElement('div'), title = document.createElement('h3'),
          list = document.createElement('div');
    title.textContent = traitGroup(group);
    title.title = t('dom.traitCount', {n : words.length});
    list.className = 'trait-tags';
    section.appendChild(title);
    for (const word of words)
      list.appendChild(traitChip(word, profile));
    section.appendChild(list);
    box.appendChild(section);
  }
}

const initializers = {
  "el" : () => { el = id => document.getElementById(id); },
  "text" : () => {
    text = (id, value) => {
      if (id === 'error') {
        if (value)
          displayFaults.report(t('dom.bedienung'), value);
        else
          displayFaults.clear(t('dom.bedienung'));
        return;
      }
      const node = el(id);
      if (String(node.textContent) !== String(value))
        node.textContent = value;
    };
  },
  "canvas" : () => { canvas = el('tank'); },
  "ctx" : () => { ctx = createTankRenderer(canvas); },
  "rgb" : () => {
    rgb = v => 'rgb(' +
               v.map(x => Math.round(Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)) * 255))
                   .join(',') +
               ')';
  },
  "uiIconPaths" : () => {
    // Fixed SVG vocabulary shared by tools, traits and event cards.
    uiIconPaths = {
      inspect : 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14M15 15l6 6',
      planter : 'M3 5h3v10h12V5h3v14H3zM7 12h10',
      wall : 'M3 17V7h18v10zM8 7v10m8-10v10M3 12h18',
      rock : 'm3 17 3-11 9-3 6 10-5 7-9 1z',
      polygon : 'm4 16 3-12 13 5-4 12zM7 4l9 17',
      feeder : 'M5 3h14l-5 7v4h-4v-4zM7 19h.1m5-2h.1m5 4h.1',
      current : 'M3 7h14l-3-3m3 3-3 3M3 15h18l-3-3m3 3-3 3M3 21h9',
      feed : 'M6 5h.1m10-1h.1m-4 8h.1m8 4h.1M5 19h.1',
      clean : 'm4 18 12-12 5 5L9 23H4zM13 9l5 5',
      mussels : 'M12 21C-5 2 5-3 12 14C19-3 29 2 12 21M12 21V14',
      worms : 'M6 22c-7-8 11-8 5-14S10 0 15 3',
      crabs :
          'M6 9h12l3 6-5 4H8l-5-4zM5 10 1 5m4 9H0m6 3-5 5M19 10l4-5m-4 9h5m-6 3 5 5M7 9 5 3l4-2m8 8 2-6-4-2',
      eggs : 'M12 3c-5 0-8 9-8 13s4 6 8 6 8-2 8-6S17 3 12 3z',
      move : 'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',
      erase : 'm4 4 16 16M20 4 4 20',
      undo : 'M8 4 2 10l6 6M2 10h12c9 0 9 11 0 11',
      grass : 'M12 22C10 10 3 2 3 2c9 2 11 10 9 20M12 22C12 5 20 2 20 2c-1 12-5 17-8 20M3 22h18',
      algae : 'M3 19c4-5 5 3 9-1s5 2 9-1M5 15c3-4 4 2 7-1s4 2 7-1M3 22h18',
      sediment : 'M3 21h18M4 15h.1m4 3h.1m4-4h.1m5 4h.1m3-6h.1M6 6h.1m6-3h.1m6 4h.1',
      eye : 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m10-4a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
      nose : 'M7 4c10 0 0 12 0 14s3 3 5 1m4-9c6 2 6 6 0 8',
      touch : 'M12 3v7M4 7l5 5M20 7l-5 5M5 19c0-8 14-8 14 0v3H5z',
      energy : 'm13 2-9 12h7l-1 8 10-13h-8z',
      brain : 'M12 4c-6-6-13 5-7 8-6 5 3 13 7 7 4 6 13-2 7-7 6-3-1-14-7-8M12 4v15',
      heart : 'M12 21 3 12C-2 4 8 0 12 7c4-7 14-3 9 5z',
      depth : 'M12 2v20M7 7l5-5 5 5M7 17l5 5 5-5M3 3h3m12 18h3',
      chart : 'M3 3v18h19M7 16l4-6 4 3 6-8',
      trait : 'm12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z',
      record : 'M7 3h10v8c0 7-10 7-10 0zM7 5H3c0 7 4 8 5 8M17 5h4c0 7-4 8-5 8M12 17v5M7 22h10',
      species : 'M12 3v7M4 21v-7h16v7M12 10v11M7 3h10',
      warning : 'm12 3 10 18H2zM12 9v6m0 3h.1'
    };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
