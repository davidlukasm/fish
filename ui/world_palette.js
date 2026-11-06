import {familyCount, MUSSEL_FAMILY, WORM_FAMILY} from './fauna.js';
import {INVERTEBRATE_KIND, PLANT_TYPE} from './schema.js';
import {formatNumber, t, tList} from './strings.js';
import {updateWorldState} from './world.js';
import {el, text} from './dom.js';
import {toolNames, worldState} from './world.js';
import {currentValues} from './world_sources.js';
export const world_paletteState = {};

const MUSSEL_ICON = Object.freeze({
  colors : [ '#80734c', '#344b58', '#b29b70', '#777660', '#8a7a4c', '#a05a40', '#b8a77a' ],
  tilts : [ .24, .32, .40, .48, .10, .30, .30 ],
  widths : [ 5, 3.5, 8, 6, 2.6, 0, 6.5 ],
  heights : [ 19, 23, 15, 18, 25, 0, 13 ]
});
const WORM_ICON = Object.freeze({
  colors : [ '#b87868', '#b19b73', '#866b71', '#bc929e' ],
  widths : [ 4, 2.5, 6, 3 ],
  heights : [ 27, 39, 31, 34 ]
});
const CRAB_ICON = Object.freeze({
  colors : [ '#c87942', '#b04b38', '#91713d', '#c69958' ],
  widths : [ 12, 9, 13, 10 ],
  heights : [ 6, 10, 7, 9 ]
});
const MUSSEL_SHAPE = Object.freeze({
  foot_y : 8,
  foot_rx : 3,
  foot_ry : 9,
  fan_x : 11,
  fan_y : 24,
  fan_rim_x : 5,
  fan_rim_y : 31,
  fan_back_x : 3,
  fan_back_y : 27,
  valve_x : 3,
  razor_y : 15,
  valve_y : 13,
  razor_bands : 6,
  band_half : 4,
  band_y : 4,
  band_step : 5,
  band_slope : 5,
  fan_ribs_before : 2,
  fan_ribs_after : 3,
  rib_x : 4,
  rib_step : 2.4,
  rib_y : 30,
  stripe_width : 1.6,
  stripes : 5,
  zig_outer : 7,
  zig_inner : 2,
  zig_low : 7,
  zig_high : 3,
  zig_end : 6,
  spots : 4,
  spot_shift : 3,
  spot_y : 9,
  spot_step : 4,
  spot_rx : 2,
  spot_ry : 2.8,
  spot_tilt : .3,
  rim : '#d1c5a0',
  foot : '#a3937b',
  grain : '#281c128c',
  zebra : '#3d2a18',
  spots : '#475542'
});
function drawMusselIcon(g, family) {
  g.strokeStyle = MUSSEL_SHAPE.rim;
  g.fillStyle = MUSSEL_SHAPE.foot;
  g.beginPath();
  g.ellipse(0, -MUSSEL_SHAPE.foot_y, MUSSEL_SHAPE.foot_rx, MUSSEL_SHAPE.foot_ry, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = MUSSEL_ICON.colors[family];
  for (const side of [-1, 1]) {
    g.save();
    g.rotate(side * MUSSEL_ICON.tilts[family]);
    g.beginPath();
    if (family === MUSSEL_FAMILY.pen) {
      g.moveTo(side * 1, 0);
      g.lineTo(side * MUSSEL_SHAPE.fan_x, -MUSSEL_SHAPE.fan_y);
      g.quadraticCurveTo(side * MUSSEL_SHAPE.fan_rim_x, -MUSSEL_SHAPE.fan_rim_y,
                         side * -MUSSEL_SHAPE.fan_back_x, -MUSSEL_SHAPE.fan_back_y);
      g.closePath();
    } else
      g.ellipse(side * MUSSEL_SHAPE.valve_x,
                family === MUSSEL_FAMILY.razor ? -MUSSEL_SHAPE.razor_y : -MUSSEL_SHAPE.valve_y,
                MUSSEL_ICON.widths[family], MUSSEL_ICON.heights[family], 0, 0, 2 * Math.PI);
    g.fill();
    g.stroke();
    g.clip();
    g.strokeStyle = MUSSEL_SHAPE.grain;
    if (family === MUSSEL_FAMILY.razor)
      for (let k = 0; k < MUSSEL_SHAPE.razor_bands; k++) {
        g.beginPath();
        g.moveTo(side * MUSSEL_SHAPE.valve_x - MUSSEL_SHAPE.band_half,
                 -MUSSEL_SHAPE.band_y - k * MUSSEL_SHAPE.band_step);
        g.lineTo(side * MUSSEL_SHAPE.valve_x + MUSSEL_SHAPE.band_half,
                 -MUSSEL_SHAPE.band_slope - k * MUSSEL_SHAPE.band_step);
        g.stroke();
      }
    else if (family === MUSSEL_FAMILY.pen)
      for (let k = -MUSSEL_SHAPE.fan_ribs_before; k <= MUSSEL_SHAPE.fan_ribs_after; k++) {
        g.beginPath();
        g.moveTo(side * 1, 0);
        g.lineTo(side * (MUSSEL_SHAPE.rib_x + k * MUSSEL_SHAPE.rib_step), -MUSSEL_SHAPE.rib_y);
        g.stroke();
      }
    else if (family === MUSSEL_FAMILY.zebra) {
      g.strokeStyle = MUSSEL_SHAPE.zebra;
      g.lineWidth = MUSSEL_SHAPE.stripe_width;
      for (let k = 0; k < MUSSEL_SHAPE.stripes; k++) {
        g.beginPath();
        g.moveTo(side * MUSSEL_SHAPE.valve_x - MUSSEL_SHAPE.zig_outer,
                 -MUSSEL_SHAPE.band_y - k * MUSSEL_SHAPE.band_step);
        g.lineTo(side * MUSSEL_SHAPE.valve_x - MUSSEL_SHAPE.zig_inner,
                 -MUSSEL_SHAPE.zig_low - k * MUSSEL_SHAPE.band_step);
        g.lineTo(side * MUSSEL_SHAPE.valve_x + MUSSEL_SHAPE.zig_inner,
                 -MUSSEL_SHAPE.zig_high - k * MUSSEL_SHAPE.band_step);
        g.lineTo(side * MUSSEL_SHAPE.valve_x + MUSSEL_SHAPE.zig_outer,
                 -MUSSEL_SHAPE.zig_end - k * MUSSEL_SHAPE.band_step);
        g.stroke();
      }
    } else {
      g.fillStyle = MUSSEL_SHAPE.spots;
      for (let k = 0; k < MUSSEL_SHAPE.spots; k++) {
        g.beginPath();
        g.ellipse(side * MUSSEL_SHAPE.valve_x + (k % 2 - 0.5) * MUSSEL_SHAPE.spot_shift,
                  -MUSSEL_SHAPE.spot_y - k * MUSSEL_SHAPE.spot_step,
                  MUSSEL_SHAPE.spot_rx + (family % 2), MUSSEL_SHAPE.spot_ry, MUSSEL_SHAPE.spot_tilt,
                  0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }
}

const WORM_SHAPE = Object.freeze({
  bend_x : 5,
  bend_at : .3,
  bend2_x : 6,
  bend2_at : .65,
  head_x : 2,
  tentacle_width : 1.8,
  tentacles : 3,
  tentacle_root : 4,
  tentacle_spread : 2,
  tentacle_bend : 3,
  tentacle_tip_spread : 3,
  tentacle_tip : 7,
  bristle_width : 1.4,
  bristles : 7,
  bristle_half : 4,
  bristle_y : 3,
  bristle_step : 4,
  bristle_slope : 5,
  head_rx : 5,
  head_ry : 3,
  head : '#866b71'
});
function drawWormIcon(g, family) {
  g.strokeStyle = WORM_ICON.colors[family];
  g.lineWidth = WORM_ICON.widths[family];
  g.beginPath();
  g.moveTo(0, 0);
  const height = WORM_ICON.heights[family];
  g.bezierCurveTo(-WORM_SHAPE.bend_x, -height * WORM_SHAPE.bend_at, WORM_SHAPE.bend2_x,
                  -height * WORM_SHAPE.bend2_at, -WORM_SHAPE.head_x, -height);
  g.stroke();
  if (family === WORM_FAMILY.slender) {
    g.lineWidth = WORM_SHAPE.tentacle_width;
    for (let k = -WORM_SHAPE.tentacles; k <= WORM_SHAPE.tentacles; k++) {
      g.beginPath();
      g.moveTo(-WORM_SHAPE.head_x, -height + WORM_SHAPE.tentacle_root);
      g.quadraticCurveTo(k * WORM_SHAPE.tentacle_spread, -height - WORM_SHAPE.tentacle_bend,
                         k * WORM_SHAPE.tentacle_tip_spread,
                         -height - WORM_SHAPE.tentacle_tip + Math.abs(k));
      g.stroke();
    }
  }
  if (family === WORM_FAMILY.bristled) {
    g.lineWidth = WORM_SHAPE.bristle_width;
    for (let k = 0; k < WORM_SHAPE.bristles; k++) {
      g.beginPath();
      g.moveTo(-WORM_SHAPE.bristle_half, -WORM_SHAPE.bristle_y - k * WORM_SHAPE.bristle_step);
      g.lineTo(WORM_SHAPE.bristle_half, -WORM_SHAPE.bristle_slope - k * WORM_SHAPE.bristle_step);
      g.stroke();
    }
  }
  if (family === WORM_FAMILY.broad) {
    g.beginPath();
    g.ellipse(-WORM_SHAPE.head_x, -height, WORM_SHAPE.head_rx, WORM_SHAPE.head_ry, 0, 0,
              Math.PI * 2);
    g.fillStyle = WORM_SHAPE.head;
    g.fill();
  }
}

const CRAB_SHAPE = Object.freeze({
  legs : 4,
  leg_root : 7,
  leg_step : 3,
  leg_top : 8,
  leg_reach : 14,
  leg_stagger : 3,
  leg_spread : 5,
  leg_tip : 12,
  body_y : 3,
  bumps : 5,
  bump_spacing : 3,
  bump_y : 5,
  bump_stagger : 3,
  bump_radius : 1.4,
  arm_root : 7,
  arm_y : 5,
  arm_x : 13,
  arm_top : 17,
  claw_x : 14,
  claw_y : 20,
  claw_rx : 4,
  claw_ry : 5,
  claw_tilt : .5,
  claw_arc : 1.65,
  bumps : '#e5c18a'
});
function drawCrabIcon(g, family) {
  g.strokeStyle = CRAB_ICON.colors[family];
  g.fillStyle = g.strokeStyle;
  for (const side of [-1, 1])
    for (let k = 0; k < CRAB_SHAPE.legs; k++) {
      g.beginPath();
      g.moveTo(side * CRAB_SHAPE.leg_root, k * CRAB_SHAPE.leg_step - CRAB_SHAPE.leg_top);
      g.lineTo(side * (CRAB_SHAPE.leg_reach + k % 2 * CRAB_SHAPE.leg_stagger),
               k * CRAB_SHAPE.leg_spread - CRAB_SHAPE.leg_tip);
      g.stroke();
    }
  g.beginPath();
  g.ellipse(0, -CRAB_SHAPE.body_y, CRAB_ICON.widths[family], CRAB_ICON.heights[family], 0, 0,
            2 * Math.PI);
  g.fill();
  g.fillStyle = CRAB_SHAPE.bumps;
  for (let k = 0; k < CRAB_SHAPE.bumps; k++) {
    g.beginPath();
    g.arc((k - 2) * CRAB_SHAPE.bump_spacing, -CRAB_SHAPE.bump_y + (k % 2) * CRAB_SHAPE.bump_stagger,
          CRAB_SHAPE.bump_radius, 0, Math.PI * 2);
    g.fill();
  }
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(side * CRAB_SHAPE.arm_root, -CRAB_SHAPE.arm_y);
    g.lineTo(side * CRAB_SHAPE.arm_x, -CRAB_SHAPE.arm_top);
    g.stroke();
    g.beginPath();
    g.ellipse(side * CRAB_SHAPE.claw_x, -CRAB_SHAPE.claw_y, CRAB_SHAPE.claw_rx + family % 2,
              CRAB_SHAPE.claw_ry, side * CRAB_SHAPE.claw_tilt, 0, Math.PI * CRAB_SHAPE.claw_arc);
    g.stroke();
  }
}

export const ANIMAL_TOOLS = Object.freeze({
  mussels : {
    kind : INVERTEBRATE_KIND.mussel,
    draw : drawMusselIcon,
    names : 'world_palette.musselFamilies'
  },
  worms :
      {kind : INVERTEBRATE_KIND.worm, draw : drawWormIcon, names : 'world_palette.wormFamilies'},
  crabs : {kind : INVERTEBRATE_KIND.crab, draw : drawCrabIcon, names : 'world_palette.crabFamilies'}
});
const ANIMAL_ICON = Object.freeze({line_width : 1.5});
export function drawAnimalChoice(g, tool, family, x, y, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.lineCap = 'round';
  g.lineWidth = ANIMAL_ICON.line_width;
  const animal = ANIMAL_TOOLS[tool];
  animal.draw(g, Math.min(family, familyCount(animal.kind) - 1));
  g.restore();
}
const ANIMAL_BUTTON = Object.freeze({width : 70, height : 58, x : 35, y : 47});
export function drawAnimalChoices() {
  const box = el('animal-palette'), selectedTool = worldState.tool;
  if (!ANIMAL_TOOLS[selectedTool])
    return;
  if (box.dataset.selectedTool !== selectedTool) {
    box.replaceChildren();
    box.dataset.selectedTool = selectedTool;
    for (let family = 0; family < familyCount(ANIMAL_TOOLS[selectedTool].kind); family++) {
      const b = document.createElement('button'), canvas = document.createElement('canvas');
      canvas.width = ANIMAL_BUTTON.width;
      canvas.height = ANIMAL_BUTTON.height;
      drawAnimalChoice(canvas.getContext('2d'), selectedTool, family, ANIMAL_BUTTON.x,
                       ANIMAL_BUTTON.y, 1);
      b.append(canvas);
      b.title = tList(ANIMAL_TOOLS[selectedTool].names)[family];
      b.setAttribute('aria-label', b.title);
      b.onclick = () => {
        updateWorldState({animalFamily : family});
        drawAnimalChoices();
        drawToolPalettePreview();
      };
      box.append(b);
    }
  }
  const chosen = Math.min(worldState.animalFamily ?? 0, box.children.length - 1);
  [...box.children].forEach((b, i) => {
    b.classList.toggle('active', i === chosen);
    b.setAttribute('aria-pressed', String(i === chosen));
  });
}

export const MIXED_PLANTS = -1;
const MIX_TYPES =
    Object.freeze([ PLANT_TYPE.fine_grass, PLANT_TYPE.lance_rosette, PLANT_TYPE.paired_stem ]);
const PLANT_ICON_COLORS =
    Object.freeze([ '#a9cf71', '#4caa9e', '#b0c98e', '#b99483', '#8fbbad', '#72a4ac' ]);
const PLANT_ICON = Object.freeze({
  line_width : 1.7,
  mix_spacing : 17,
  mix_scale : .65,
  ribbon_blades : 5,
  fine_blades : 9,
  grass_width : 1.1,
  ribbon_spacing : 6,
  fine_spacing : 4,
  ribbon_height : 46,
  ribbon_step : 7,
  fine_height : 24,
  fine_step : 4,
  fine_cycle : 3,
  root_spread : .4,
  root_cycle : 3,
  ribbon_base : .3,
  ribbon_rise : .3,
  ribbon_bulge : 12,
  ribbon_peak : .76,
  ribbon_tip_bulge : 19,
  ribbon_tip_at : .65,
  ribbon_back : .3,
  ribbon_back_bulge : 6,
  ribbon_back_at : .2,
  fine_base : .2,
  fine_rise : .3,
  fine_lean : .75,
  fine_peak : .7,
  leaves : 5,
  leaf_fan : .61,
  lance_width : 6,
  round_width : 11,
  lance_height : 42,
  round_height : 31,
  middle_leaf : .58,
  leaf_low : .35,
  leaf_high : .9,
  leaf_alpha : .42,
  vein : .9,
  stem_bend : 3,
  stem_low : 18,
  stem_bend2 : 4,
  stem_high : 35,
  stem_height : 49,
  stem_leaves : 6,
  paired_start : 12,
  paired_step : 13,
  alternate_start : 10,
  alternate_step : 6,
  leaf_reach : 17,
  leaf_tip_x : 24,
  leaf_rise : 14,
  leaf_end_x : 18,
  leaf_end_rise : 17,
  leaf_back_x : 7,
  leaf_back_rise : 18,
  leaf_root_x : 4,
  leaf_root_rise : 6,
  stem_leaf_alpha : .55
});
export function drawPlantChoice(g, type, x, y, scale = 1) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const c = PLANT_ICON_COLORS[Math.max(0, type)];
  g.strokeStyle = c;
  g.fillStyle = c;
  g.lineWidth = PLANT_ICON.line_width;
  if (type === MIXED_PLANTS) {
    MIX_TYPES.forEach((shown, k) => drawPlantChoice(g, shown, (k - 1) * PLANT_ICON.mix_spacing, 0,
                                                    PLANT_ICON.mix_scale));
  } else if (type <= PLANT_TYPE.ribbon_grass) {
    const ribbon = type === PLANT_TYPE.ribbon_grass,
          count = ribbon ? PLANT_ICON.ribbon_blades : PLANT_ICON.fine_blades;
    g.lineWidth = PLANT_ICON.grass_width;
    for (let k = 0; k < count; k++) {
      const dx = (k - (count - 1) / 2) *
                 (ribbon ? PLANT_ICON.ribbon_spacing : PLANT_ICON.fine_spacing),
            h = ribbon
                    ? PLANT_ICON.ribbon_height + PLANT_ICON.ribbon_step * (k % 2)
                    : PLANT_ICON.fine_height + PLANT_ICON.fine_step * (k % PLANT_ICON.fine_cycle),
            side = k < count / 2 ? -1 : 1;
      g.beginPath();
      g.moveTo(dx * PLANT_ICON.root_spread, (k % PLANT_ICON.root_cycle) - 1);
      if (ribbon) {
        g.bezierCurveTo(dx * PLANT_ICON.ribbon_base, -h * PLANT_ICON.ribbon_rise,
                        dx + side * PLANT_ICON.ribbon_bulge, -h * PLANT_ICON.ribbon_peak, dx, -h);
        g.bezierCurveTo(dx + side * PLANT_ICON.ribbon_tip_bulge, -h * PLANT_ICON.ribbon_tip_at,
                        dx * PLANT_ICON.ribbon_back + side * PLANT_ICON.ribbon_back_bulge,
                        -h * PLANT_ICON.ribbon_back_at, dx * PLANT_ICON.root_spread,
                        (k % PLANT_ICON.root_cycle) - 1);
        g.fill();
      } else {
        g.bezierCurveTo(dx * PLANT_ICON.fine_base, -h * PLANT_ICON.fine_rise,
                        dx * PLANT_ICON.fine_lean, -h * PLANT_ICON.fine_peak, dx, -h);
        g.stroke();
      }
    }
  } else if (type <= PLANT_TYPE.round_rosette) {
    for (let k = 0; k < PLANT_ICON.leaves; k++) {
      g.save();
      g.rotate((k - 2) * PLANT_ICON.leaf_fan);
      g.beginPath();
      g.moveTo(0, 0);
      const lance = type === PLANT_TYPE.lance_rosette,
            width = lance ? PLANT_ICON.lance_width : PLANT_ICON.round_width,
            height = (lance ? PLANT_ICON.lance_height : PLANT_ICON.round_height) *
                     (k === 2 ? PLANT_ICON.middle_leaf : 1);
      g.bezierCurveTo(-width, -height * PLANT_ICON.leaf_low, -width, -height * PLANT_ICON.leaf_high,
                      0, -height);
      g.bezierCurveTo(width, -height * PLANT_ICON.leaf_high, width, -height * PLANT_ICON.leaf_low,
                      0, 0);
      g.globalAlpha = PLANT_ICON.leaf_alpha;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -height * PLANT_ICON.vein);
      g.stroke();
      g.restore();
    }
  } else {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-PLANT_ICON.stem_bend, -PLANT_ICON.stem_low, PLANT_ICON.stem_bend2,
                    -PLANT_ICON.stem_high, 0, -PLANT_ICON.stem_height);
    g.stroke();
    for (let k = 0; k < PLANT_ICON.stem_leaves; k++) {
      const side = k % 2 ? 1 : -1,
            y = type === PLANT_TYPE.paired_stem
                    ? -PLANT_ICON.paired_start - PLANT_ICON.paired_step * Math.floor(k / 2)
                    : -PLANT_ICON.alternate_start - PLANT_ICON.alternate_step * k;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(side * PLANT_ICON.leaf_reach, y + 1, side * PLANT_ICON.leaf_tip_x,
                      y - PLANT_ICON.leaf_rise, side * PLANT_ICON.leaf_end_x,
                      y - PLANT_ICON.leaf_end_rise);
      g.bezierCurveTo(side * PLANT_ICON.leaf_back_x, y - PLANT_ICON.leaf_back_rise,
                      side * PLANT_ICON.leaf_root_x, y - PLANT_ICON.leaf_root_rise, 0, y);
      g.globalAlpha = PLANT_ICON.stem_leaf_alpha;
      g.fill();
      g.globalAlpha = 1;
      g.stroke();
    }
  }
  g.restore();
}

export let plantNames;

const TOOL_PREVIEW = Object.freeze({
  font : '11px system-ui',
  width : 300,
  height : 120,
  floor_width : 2,
  left : 15,
  floor_y : 96,
  right : 285,
  brush : 28,
  wall_width : 10,
  wall_left : 45,
  wall_top : 49,
  wall_bottom : 90,
  wall_right : 255,
  soil_x : 51,
  soil_y : 69,
  soil_width : 198,
  soil_height : 16,
  ribbon_x : 120,
  plant_y : 72,
  ribbon_scale : .7,
  rosette_x : 195,
  rosette_scale : .55,
  bed_y : 87,
  bed_width : 270,
  bed_height : 8,
  plants : 5,
  first_x : 45,
  plant_spacing : 51,
  grass_y : 90,
  grass_scale : .7,
  grass_scale_step : .1,
  grass_scale_cycle : 3,
  center_x : 150,
  plant_name_y : 17,
  sediment : 8,
  heap_x : 70,
  heap_scale : 3,
  heap_x2 : 200,
  amount_y : 26,
  rock_width : 1.5,
  rock_scale : 58,
  rock_y : 65,
  algae_width : 4,
  algae_left : 25,
  algae_y : 93,
  algae_x : 90,
  algae_y2 : 89,
  algae_x2 : 210,
  algae_y3 : 96,
  algae_right : 275,
  algae_y4 : 91,
  note_y : 30,
  current_y : 61,
  current_width : 2,
  current_half : 65,
  head_x : 48,
  head_side : 12,
  animal_y : 94,
  animal_scale : 1.7,
  name_y : 20,
  brush_width : 1.5,
  brush_y : 57,
  max_brush : 37,
  brush_min : 12,
  brush_per_radius : .2,
  max_feed : 20,
  feed_x : 126,
  feed_columns : 5,
  feed_step : 12,
  feed_y : 47,
  feed_row : 10,
  feed_radius : 1.7,
  back : '#152e39',
  floor : '#677f82',
  label : '#a8c3c9',
  wall : '#aab6a7',
  soil : '#aa926e',
  bed : '#8b7960',
  plant_name : '#b4cccd',
  sediment : '#aa926e',
  amount : '#bdc9c7',
  rock : '#435965',
  rock_edge : '#91a8b1',
  algae : '#71a979',
  current : '#79c1d1',
  brush : '#b1d3c8'
});
export function drawToolPalettePreview() {
  const g = el('tool-preview').getContext('2d', {willReadFrequently : true});
  g.clearRect(0, 0, TOOL_PREVIEW.width, TOOL_PREVIEW.height);
  g.fillStyle = TOOL_PREVIEW.back;
  g.fillRect(0, 0, TOOL_PREVIEW.width, TOOL_PREVIEW.height);
  g.strokeStyle = TOOL_PREVIEW.floor;
  g.lineWidth = TOOL_PREVIEW.floor_width;
  g.beginPath();
  g.moveTo(TOOL_PREVIEW.left, TOOL_PREVIEW.floor_y);
  g.lineTo(TOOL_PREVIEW.right, TOOL_PREVIEW.floor_y);
  g.stroke();
  const radius = Number(el('brush').value) || TOOL_PREVIEW.brush;
  g.font = TOOL_PREVIEW.font;
  g.fillStyle = TOOL_PREVIEW.label;
  g.textAlign = 'center';
  if (worldState.tool === 'planter') {
    g.strokeStyle = TOOL_PREVIEW.wall;
    g.lineWidth = TOOL_PREVIEW.wall_width;
    g.beginPath();
    g.moveTo(TOOL_PREVIEW.wall_left, TOOL_PREVIEW.wall_top);
    g.lineTo(TOOL_PREVIEW.wall_left, TOOL_PREVIEW.wall_bottom);
    g.lineTo(TOOL_PREVIEW.wall_right, TOOL_PREVIEW.wall_bottom);
    g.lineTo(TOOL_PREVIEW.wall_right, TOOL_PREVIEW.wall_top);
    g.stroke();
    g.fillStyle = TOOL_PREVIEW.soil;
    g.fillRect(TOOL_PREVIEW.soil_x, TOOL_PREVIEW.soil_y, TOOL_PREVIEW.soil_width,
               TOOL_PREVIEW.soil_height);
    drawPlantChoice(g, PLANT_TYPE.ribbon_grass, TOOL_PREVIEW.ribbon_x, TOOL_PREVIEW.plant_y,
                    TOOL_PREVIEW.ribbon_scale);
    drawPlantChoice(g, PLANT_TYPE.lance_rosette, TOOL_PREVIEW.rosette_x, TOOL_PREVIEW.plant_y,
                    TOOL_PREVIEW.rosette_scale);
  } else if (worldState.tool === 'grass') {
    g.fillStyle = TOOL_PREVIEW.bed;
    g.fillRect(TOOL_PREVIEW.left, TOOL_PREVIEW.bed_y, TOOL_PREVIEW.bed_width,
               TOOL_PREVIEW.bed_height);
    for (let k = 0; k < TOOL_PREVIEW.plants; k++)
      drawPlantChoice(g,
                      worldState.editorPlant === MIXED_PLANTS ? k % Object.keys(PLANT_TYPE).length
                                                              : worldState.editorPlant,
                      TOOL_PREVIEW.first_x + k * TOOL_PREVIEW.plant_spacing, TOOL_PREVIEW.grass_y,
                      TOOL_PREVIEW.grass_scale +
                          TOOL_PREVIEW.grass_scale_step * (k % TOOL_PREVIEW.grass_scale_cycle));
    g.fillStyle = TOOL_PREVIEW.plant_name;
    g.fillText(plantNames[worldState.editorPlant + 1], TOOL_PREVIEW.center_x,
               TOOL_PREVIEW.plant_name_y);
  } else if (worldState.tool === 'sediment' || worldState.tool === 'remove-sediment') {
    const height = Number(el('sediment-amount').value) || TOOL_PREVIEW.sediment;
    g.fillStyle = TOOL_PREVIEW.sediment;
    g.beginPath();
    g.moveTo(TOOL_PREVIEW.left, TOOL_PREVIEW.floor_y);
    g.bezierCurveTo(TOOL_PREVIEW.heap_x, TOOL_PREVIEW.floor_y - height * TOOL_PREVIEW.heap_scale,
                    TOOL_PREVIEW.heap_x2, TOOL_PREVIEW.floor_y - height * TOOL_PREVIEW.heap_scale,
                    TOOL_PREVIEW.right, TOOL_PREVIEW.floor_y);
    g.fill();
    g.fillStyle = TOOL_PREVIEW.amount;
    g.fillText((worldState.tool === 'sediment' ? '+ ' : '− ') +
                   t('units.px', {n : height.toLocaleString(t('units.locale'))}),
               TOOL_PREVIEW.center_x, TOOL_PREVIEW.amount_y);
  } else if (worldState.tool === 'rock') {
    g.fillStyle = TOOL_PREVIEW.rock;
    g.strokeStyle = TOOL_PREVIEW.rock_edge;
    g.lineWidth = TOOL_PREVIEW.rock_width;
    g.beginPath();
    (worldState.rockShape || [])
        .forEach((p, i) => i ? g.lineTo(TOOL_PREVIEW.center_x + p.x * TOOL_PREVIEW.rock_scale,
                                        TOOL_PREVIEW.rock_y + p.y * TOOL_PREVIEW.rock_scale)
                             : g.moveTo(TOOL_PREVIEW.center_x + p.x * TOOL_PREVIEW.rock_scale,
                                        TOOL_PREVIEW.rock_y + p.y * TOOL_PREVIEW.rock_scale));
    g.closePath();
    g.fill();
    g.stroke();
  } else if (worldState.tool === 'algae') {
    g.strokeStyle = TOOL_PREVIEW.algae;
    g.lineWidth = TOOL_PREVIEW.algae_width;
    g.beginPath();
    g.moveTo(TOOL_PREVIEW.algae_left, TOOL_PREVIEW.algae_y);
    g.bezierCurveTo(TOOL_PREVIEW.algae_x, TOOL_PREVIEW.algae_y2, TOOL_PREVIEW.algae_x2,
                    TOOL_PREVIEW.algae_y3, TOOL_PREVIEW.algae_right, TOOL_PREVIEW.algae_y4);
    g.stroke();
    g.fillText(t('world_palette.lichtFreieOberflaeche'), TOOL_PREVIEW.center_x,
               TOOL_PREVIEW.note_y);
  } else if (worldState.tool === 'current') {
    const q = currentValues();
    g.save();
    g.translate(TOOL_PREVIEW.center_x, TOOL_PREVIEW.current_y);
    g.rotate(q.angle);
    g.strokeStyle = TOOL_PREVIEW.current;
    g.lineWidth = TOOL_PREVIEW.current_width + q.strength;
    g.beginPath();
    g.moveTo(-TOOL_PREVIEW.current_half, 0);
    g.lineTo(TOOL_PREVIEW.current_half, 0);
    g.lineTo(TOOL_PREVIEW.head_x, -TOOL_PREVIEW.head_side);
    g.moveTo(TOOL_PREVIEW.current_half, 0);
    g.lineTo(TOOL_PREVIEW.head_x, TOOL_PREVIEW.head_side);
    g.stroke();
    g.restore();
  } else if (ANIMAL_TOOLS[worldState.tool]) {
    drawAnimalChoice(g, worldState.tool, worldState.animalFamily ?? 0, TOOL_PREVIEW.center_x,
                     TOOL_PREVIEW.animal_y, TOOL_PREVIEW.animal_scale);
    g.fillText(toolNames[worldState.tool], TOOL_PREVIEW.center_x, TOOL_PREVIEW.name_y);
  } else {
    g.strokeStyle = TOOL_PREVIEW.brush;
    g.lineWidth = TOOL_PREVIEW.brush_width;
    g.beginPath();
    g.arc(TOOL_PREVIEW.center_x, TOOL_PREVIEW.brush_y,
          Math.min(TOOL_PREVIEW.max_brush,
                   TOOL_PREVIEW.brush_min + radius * TOOL_PREVIEW.brush_per_radius),
          0, Math.PI * 2);
    g.stroke();
    g.fillText(toolNames[worldState.tool] || t('world_palette.werkzeug'), TOOL_PREVIEW.center_x,
               TOOL_PREVIEW.name_y);
    if (worldState.tool === 'feed')
      for (let k = 0; k < Math.min(TOOL_PREVIEW.max_feed, Number(el('tool-count').value)); k++) {
        g.beginPath();
        g.arc(TOOL_PREVIEW.feed_x + (k % TOOL_PREVIEW.feed_columns) * TOOL_PREVIEW.feed_step,
              TOOL_PREVIEW.feed_y +
                  Math.floor(k / TOOL_PREVIEW.feed_columns) * TOOL_PREVIEW.feed_row,
              TOOL_PREVIEW.feed_radius, 0, Math.PI * 2);
        g.fill();
      }
  }
}

const PLANT_BUTTON = Object.freeze({width : 80, height : 64, x : 40, y : 59, scale : .95});
const initializers = {
  "plantNames" : () => {
    plantNames = [
      t('world_palette.mischung'), t('world_palette.feingras'), t('world_palette.bandgras'),
      t('world_palette.lanzettrosette'), t('world_palette.rundblattrosette'),
      t('world_palette.paarigerStaengel'), t('world_palette.wechselblaettrigerStaengel')
    ];
  },
  "createElement_button" : () => {
    for (let type = MIXED_PLANTS; type < Object.keys(PLANT_TYPE).length; type++) {
      const button = document.createElement('button'), mini = document.createElement('canvas');
      mini.width = PLANT_BUTTON.width;
      mini.height = PLANT_BUTTON.height;
      button.title = plantNames[type + 1];
      button.setAttribute('aria-label', plantNames[type + 1]);
      button.setAttribute('aria-pressed', String(type === worldState.editorPlant));
      button.className = type === worldState.editorPlant ? 'active' : '';
      drawPlantChoice(mini.getContext('2d', {willReadFrequently : true}), type, PLANT_BUTTON.x,
                      PLANT_BUTTON.y, PLANT_BUTTON.scale);
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
    for (const [id, output, unit] of [[ 'brush', 'brush-value', 'units.px' ],
                                      [ 'tool-count', 'tool-count-value', 'units.plain' ],
                                      [ 'sediment-amount', 'sediment-amount-value', 'units.px' ]])
      el(id).oninput = () => {
        text(output, t(unit, {n : formatNumber(Number(el(id).value))}));
        drawToolPalettePreview();
      };
  }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
