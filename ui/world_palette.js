import {paintEcologyIcon} from './feeding_view.js';
import {updateWorldState} from './world.js';
import {el, text} from './dom.js';
import {toolNames, worldState} from './world.js';
import {currentValues} from './world_sources.js';
export const world_paletteState = {};

export function drawAnimalChoice(g, tool, family, x, y, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.lineCap = 'round';
  g.lineWidth = 1.5;
  if (tool === 'mussels') {
    const colors = [ '#80734c', '#344b58', '#b29b70', '#777660' ];
    g.fillStyle = colors[family];
    g.strokeStyle = '#d1c5a0';
    g.fillStyle = '#a3937b';
    g.beginPath();
    g.ellipse(0, -8, 3, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = colors[family];
    for (const side of [-1, 1]) {
      g.save();
      g.rotate(side * (.24 + .08 * family));
      g.beginPath();
      g.ellipse(side * 3, -13, [ 5, 3.5, 8, 6 ][family], [ 19, 23, 15, 18 ][family], 0, 0,
                2 * Math.PI);
      g.fill();
      g.stroke();
      g.clip();
      g.fillStyle = '#475542';
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.ellipse(side * 3 + (k % 2 - 0.5) * 3, -9 - k * 4, 2 + (family % 2), 2.8, .3, 0,
                  Math.PI * 2);
        g.fill();
      }
      g.fillStyle = colors[family];
      g.restore();
    }
  } else if (tool === 'worms') {
    g.strokeStyle = [ '#b87868', '#b19b73', '#866b71', '#bc929e' ][family];
    g.lineWidth = [ 4, 2.5, 6, 3 ][family];
    g.beginPath();
    g.moveTo(0, 0);
    const height = [ 27, 39, 31, 34 ][family];
    g.bezierCurveTo(-5, -height * .3, 6, -height * .65, -2, -height);
    g.stroke();
    if (family === 1) {
      g.lineWidth = 1.8;
      for (let k = -3; k <= 3; k++) {
        g.beginPath();
        g.moveTo(-2, -height + 4);
        g.quadraticCurveTo(k * 2, -height - 3, k * 3, -height - 7 + Math.abs(k));
        g.stroke();
      }
    }
    if (family === 3) {
      g.lineWidth = 1.4;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.moveTo(-4, -3 - k * 4);
        g.lineTo(4, -5 - k * 4);
        g.stroke();
      }
    }
    if (family === 2) {
      g.beginPath();
      g.ellipse(-2, -height, 5, 3, 0, 0, Math.PI * 2);
      g.fillStyle = '#866b71';
      g.fill();
    }
  } else {
    g.strokeStyle = [ '#c87942', '#b04b38', '#91713d', '#c69958' ][family];
    g.fillStyle = g.strokeStyle;
    for (const side of [-1, 1])
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(side * 7, k * 3 - 8);
        g.lineTo(side * (14 + k % 2 * 3), k * 5 - 12);
        g.stroke();
      }
    g.beginPath();
    g.ellipse(0, -3, [ 12, 9, 13, 10 ][family], [ 6, 10, 7, 9 ][family], 0, 0, 2 * Math.PI);
    g.fill();
    g.fillStyle = '#e5c18a';
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc((k - 2) * 3, -5 + (k % 2) * 3, 1.4, 0, Math.PI * 2);
      g.fill();
    }
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(side * 7, -5);
      g.lineTo(side * 13, -17);
      g.stroke();
      g.beginPath();
      g.ellipse(side * 14, -20, 4 + family % 2, 5, side * .5, 0, Math.PI * 1.65);
      g.stroke();
    }
  }
  g.restore();
}
export function drawAnimalChoices() {
  const box = el('animal-palette'), selectedTool = worldState.tool;
  if (!['mussels', 'worms', 'crabs'].includes(selectedTool))
    return;
  if (box.dataset.selectedTool !== selectedTool) {
    box.replaceChildren();
    box.dataset.selectedTool = selectedTool;
    for (let family = 0; family < 4; family++) {
      const b = document.createElement('button'), canvas = document.createElement('canvas');
      canvas.width = 70;
      canvas.height = 58;
      drawAnimalChoice(canvas.getContext('2d'), selectedTool, family, 35, 47, 1);
      b.append(canvas);
      b.title = (selectedTool === 'worms'   ? [ 'Kurz', 'Schlank', 'Breit', 'Borsten' ]
                 : selectedTool === 'crabs' ? [ 'Rund', 'Hoch', 'Kantig', 'Breit' ]
                                            : [ 'Schmal', 'Lang', 'Breit', 'Gerippt' ])[family];
      b.setAttribute('aria-label', b.title);
      b.onclick = () => {
        updateWorldState({animalFamily : family});
        drawAnimalChoices();
        drawToolPalettePreview();
      };
      box.append(b);
    }
  }
  [...box.children].forEach((b, i) => {
    b.classList.toggle('active', i === (worldState.animalFamily ?? 0));
    b.setAttribute('aria-pressed', String(i === (worldState.animalFamily ?? 0)));
  });
}

export function drawPlantChoice(g, type, x, y, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const c = [ '#a9cf71', '#4caa9e', '#b0c98e', '#b99483', '#8fbbad', '#72a4ac' ][Math.max(0, type)];
  g.strokeStyle = c;
  g.fillStyle = c;
  g.lineWidth = 1.7;
  if (type < 0) {
    for (let k = 0; k < 3; k++)
      drawPlantChoice(g, k * 2, (k - 1) * 17, 0, .65);
  } else if (type < 2) {
    const count = type ? 5 : 9;
    g.lineWidth = 1.1;
    for (let k = 0; k < count; k++) {
      const dx = (k - (count - 1) / 2) * (type ? 6 : 4),
            h = type ? 46 + 7 * (k % 2) : 24 + 4 * (k % 3), side = k < count / 2 ? -1 : 1;
      g.beginPath();
      g.moveTo(dx * .4, (k % 3) - 1);
      if (type) {
        g.bezierCurveTo(dx * .3, -h * .3, dx + side * 12, -h * .76, dx, -h);
        g.bezierCurveTo(dx + side * 19, -h * .65, dx * .3 + side * 6, -h * .2, dx * .4,
                        (k % 3) - 1);
        g.fill();
      } else {
        g.bezierCurveTo(dx * .2, -h * .3, dx * .75, -h * .7, dx, -h);
        g.stroke();
      }
    }
  } else if (type < 4) {
    for (let k = 0; k < 5; k++) {
      g.save();
      g.rotate((k - 2) * .61);
      g.beginPath();
      g.moveTo(0, 0);
      const width = type === 2 ? 6 : 11, height = (type === 2 ? 42 : 31) * (k === 2 ? .58 : 1);
      g.bezierCurveTo(-width, -height * .35, -width, -height * .9, 0, -height);
      g.bezierCurveTo(width, -height * .9, width, -height * .35, 0, 0);
      g.globalAlpha = .42;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -height * .9);
      g.stroke();
      g.restore();
    }
  } else {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-3, -18, 4, -35, 0, -49);
    g.stroke();
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1, y = type === 4 ? -12 - 13 * Math.floor(k / 2) : -10 - 6 * k;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(side * 17, y + 1, side * 24, y - 14, side * 18, y - 17);
      g.bezierCurveTo(side * 7, y - 18, side * 4, y - 6, 0, y);
      g.globalAlpha = .55;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
    }
  }
  g.restore();
}

export let plantNames;

export function drawToolPalettePreview() {
  const g = el('tool-preview').getContext('2d', {willReadFrequently : true});
  g.clearRect(0, 0, 300, 120);
  g.fillStyle = '#152e39';
  g.fillRect(0, 0, 300, 120);
  g.strokeStyle = '#677f82';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(15, 96);
  g.lineTo(285, 96);
  g.stroke();
  const radius = Number(el('brush').value) || 28;
  g.font = '11px system-ui';
  g.fillStyle = '#a8c3c9';
  g.textAlign = 'center';
  if (worldState.tool === 'planter') {
    g.strokeStyle = '#aab6a7';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(45, 49);
    g.lineTo(45, 90);
    g.lineTo(255, 90);
    g.lineTo(255, 49);
    g.stroke();
    g.fillStyle = '#aa926e';
    g.fillRect(51, 69, 198, 16);
    drawPlantChoice(g, 1, 120, 72, .7);
    drawPlantChoice(g, 2, 195, 72, .55);
  } else if (worldState.tool === 'grass') {
    g.fillStyle = '#8b7960';
    g.fillRect(15, 87, 270, 8);
    for (let k = 0; k < 5; k++)
      drawPlantChoice(g, worldState.editorPlant < 0 ? k % 6 : worldState.editorPlant, 45 + k * 51,
                      90, .7 + .1 * (k % 3));
    g.fillStyle = '#b4cccd';
    g.fillText(plantNames[worldState.editorPlant + 1], 150, 17);
  } else if (worldState.tool === 'sediment' || worldState.tool === 'remove-sediment') {
    const height = Number(el('sediment-amount').value) || 8;
    g.fillStyle = '#aa926e';
    g.beginPath();
    g.moveTo(15, 96);
    g.bezierCurveTo(70, 96 - height * 3, 200, 96 - height * 3, 285, 96);
    g.fill();
    g.fillStyle = '#bdc9c7';
    g.fillText((worldState.tool === 'sediment' ? '+ ' : '− ') + height.toLocaleString('de') + ' px',
               150, 26);
  } else if (worldState.tool === 'rock') {
    g.fillStyle = '#435965';
    g.strokeStyle = '#91a8b1';
    g.lineWidth = 1.5;
    g.beginPath();
    (worldState.rockShape || [])
        .forEach((p, i) => i ? g.lineTo(150 + p.x * 58, 65 + p.y * 58)
                             : g.moveTo(150 + p.x * 58, 65 + p.y * 58));
    g.closePath();
    g.fill();
    g.stroke();
  } else if (worldState.tool === 'algae') {
    g.strokeStyle = '#71a979';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(25, 93);
    g.bezierCurveTo(90, 89, 210, 96, 275, 91);
    g.stroke();
    g.fillText('Licht · freie Oberfläche', 150, 30);
  } else if (worldState.tool === 'current') {
    const q = currentValues();
    g.save();
    g.translate(150, 61);
    g.rotate(q.angle);
    g.strokeStyle = '#79c1d1';
    g.lineWidth = 2 + q.strength;
    g.beginPath();
    g.moveTo(-65, 0);
    g.lineTo(65, 0);
    g.lineTo(48, -12);
    g.moveTo(65, 0);
    g.lineTo(48, 12);
    g.stroke();
    g.restore();
  } else if ([ 'mussels', 'worms', 'crabs' ].includes(worldState.tool)) {
    drawAnimalChoice(g, worldState.tool, worldState.animalFamily ?? 0, 150, 94, 1.7);
    g.fillText(toolNames[worldState.tool], 150, 20);
  } else {
    g.strokeStyle = '#b1d3c8';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(150, 57, Math.min(37, 12 + radius * .2), 0, Math.PI * 2);
    g.stroke();
    g.fillText(toolNames[worldState.tool] || 'Werkzeug', 150, 20);
    if (worldState.tool === 'feed')
      for (let k = 0; k < Math.min(20, Number(el('tool-count').value)); k++) {
        g.beginPath();
        g.arc(126 + (k % 5) * 12, 47 + Math.floor(k / 5) * 10, 1.7, 0, Math.PI * 2);
        g.fill();
      }
  }
}

const initializers = {
  "plantNames" : () => {
    plantNames = [
      'Mischung', 'Feingras', 'Bandgras', 'Lanzettrosette', 'Rundblattrosette', 'Paariger Stängel',
      'Wechselblättriger Stängel'
    ];
  },
  "createElement_button" : () => {
    for (let type = -1; type < 6; type++) {
      const button = document.createElement('button'), mini = document.createElement('canvas');
      mini.width = 80;
      mini.height = 64;
      button.title = plantNames[type + 1];
      button.setAttribute('aria-label', plantNames[type + 1]);
      button.setAttribute('aria-pressed', String(type === worldState.editorPlant));
      button.className = type === worldState.editorPlant ? 'active' : '';
      drawPlantChoice(mini.getContext('2d', {willReadFrequently : true}), type, 40, 59, .95);
      button.appendChild(mini);
      button.onclick = () => {
        updateWorldState({editorPlant : type});
        for (const [i, b] of [...el('plant-palette').children].entries()) {
          b.classList.toggle('active', i === type + 1);
          b.setAttribute('aria-pressed', String(i === type + 1));
        }
        drawToolPalettePreview();
      };
      el('plant-palette').appendChild(button);
    }
  },
  "el" : () => {
    for (const [id, output, unit] of [[ 'brush', 'brush-value', ' px' ],
                                      [ 'tool-count', 'tool-count-value', '' ],
                                      [ 'sediment-amount', 'sediment-amount-value', ' px' ]])
      el(id).oninput = () => {
        text(output, Number(el(id).value).toLocaleString('de') + unit);
        drawToolPalettePreview();
      };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
