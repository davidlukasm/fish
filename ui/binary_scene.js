import {RENDER_KINDS, RENDER_RECORDS, SCENE_HEADER} from './render_schema.js';

function integer64(view, offset, signed = false) {
  const high = signed ? view.getInt32(offset + 4, true) : view.getUint32(offset + 4, true);
  const value = view.getUint32(offset, true) + high * 4294967296;
  if (!Number.isSafeInteger(value))
    throw Error('Bildzähler überschreitet den gültigen Bereich');
  return value;
}
const readers = {
  u8 : (v, p) => v.getUint8(p),
  i8 : (v, p) => v.getInt8(p),
  u16 : (v, p) => v.getUint16(p, true),
  i16 : (v, p) => v.getInt16(p, true),
  u32 : (v, p) => v.getUint32(p, true),
  i32 : (v, p) => v.getInt32(p, true),
  i64 : (v, p) => integer64(v, p, true),
  f32 : (v, p) => v.getFloat32(p, true)
};
class Cursor {
  constructor(view, offset) {
    this.view = view;
    this.offset = offset;
  }
  id() {
    const id = integer64(this.view, this.offset);
    this.offset += 8;
    return id;
  }
  field(field) {
    const value = readers[field.type](this.view, this.offset) / field.scale;
    this.offset += field.bytes;
    if (!Number.isFinite(value))
      throw Error('Ungültiger Bildwert');
    return value;
  }
}
function records(cursor, previous, fields, count, removed, delta) {
  if (delta && !count && !removed)
    return previous;
  const rows = delta ? new Map(previous) : new Map();
  if (count + removed > 1000000)
    throw Error('Zu viele Bildobjekte');
  for (let i = 0; i < count; ++i) {
    const id = cursor.id(), low = cursor.view.getUint32(cursor.offset, true),
          high = cursor.view.getUint32(cursor.offset + 4, true);
    cursor.offset += 8;
    if ((fields.length < 32 && (high || low >>> fields.length)) ||
        (fields.length >= 32 && fields.length < 64 && high >>> (fields.length - 32)))
      throw Error('Bildspalten passen nicht zum Schema');
    const old = rows.get(id), row = old ? {...old} : {};
    for (let j = 0; j < fields.length; ++j) {
      if ((j < 32 ? low : high) & (1 << (j % 32)))
        row[fields[j].name] = cursor.field(fields[j]);
      else if (!old)
        throw Error('Unvollständiges neues Bildobjekt');
    }
    rows.set(id, row);
  }
  for (let i = 0; i < removed; ++i)
    rows.delete(cursor.id());
  return rows;
}
function fieldTiles(cursor, previous, columns, rows, count, scalar, delta) {
  const size = columns * rows;
  if (size > 1000000 || count > size)
    throw Error('Ungültige Größe des Bildrasters');
  const keep = delta && previous?.columns === columns && previous.rows === rows;
  if (keep && !count)
    return previous;
  const values = keep ? previous.values.slice() : new Float32Array(size);
  for (let i = 0; i < count; ++i) {
    const index = cursor.view.getUint32(cursor.offset, true);
    cursor.offset += 4;
    if (index >= size)
      throw Error('Bildkachel außerhalb des Rasters');
    values[index] = cursor.field(scalar);
  }
  return {columns, rows, values};
}
export class BinaryScene {
  constructor() { this.reset(); }
  reset() {
    this.sequence = 0;
    this.epoch = '';
    this.records = Object.fromEntries(RENDER_KINDS.map(kind => [kind, new Map()]));
    this.light = this.sediment = this.plankton = null;
    this.header = null;
  }
  accept(buffer) {
    const view = buffer instanceof DataView ? buffer : new DataView(buffer);
    const at = SCENE_HEADER.offsets;
    if (view.byteLength < SCENE_HEADER.bytes || view.getUint32(0, false) !== 0x46534331 ||
        view.getUint16(at.version, true) !== SCENE_HEADER.version)
      throw Error('Unbekanntes Bildformat');
    const flags = view.getUint16(at.flags, true), delta = !!(flags & 1),
          sequence = view.getUint32(at.sequence, true), base = view.getUint32(at.base, true),
          epoch = view.getBigUint64(at.epoch, true).toString();
    if (delta && (base !== this.sequence || epoch !== this.epoch))
      throw Error('Ein vollständiges Bild wird benötigt');
    const cursor = new Cursor(view, SCENE_HEADER.bytes), next = {};
    for (let i = 0; i < RENDER_KINDS.length; ++i) {
      const kind = RENDER_KINDS[i], offset = at.records + i * 8;
      next[kind] = records(cursor, this.records[kind], RENDER_RECORDS[kind],
                           view.getUint32(offset, true), view.getUint32(offset + 4, true), delta);
    }
    const light = fieldTiles(cursor, this.light, view.getUint16(at.light_columns, true),
                             view.getUint16(at.light_rows, true),
                             view.getUint32(at.light_changes, true),
                             {type : 'u8', scale : 255, bytes : 1}, delta),
          sediment = fieldTiles(cursor, this.sediment, view.getUint16(at.sediment_columns, true),
                                view.getUint16(at.sediment_rows, true),
                                view.getUint32(at.sediment_changes, true),
                                {type : 'f32', scale : 1, bytes : 4}, delta),
          plankton = fieldTiles(cursor, this.plankton, view.getUint16(at.plankton_columns, true),
                                view.getUint16(at.plankton_rows, true),
                                view.getUint32(at.plankton_changes, true),
                                {type : 'f32', scale : 1, bytes : 4}, delta);
    if (cursor.offset !== view.byteLength)
      throw Error('Zusatzdaten im Bild');
    const header = {
      sequence,
      base,
      epoch,
      step : integer64(view, at.step),
      width : view.getFloat32(at.width, true),
      height : view.getFloat32(at.height, true),
      paused : !!(flags & 2),
      done : !!(flags & 4),
      delta
    };
    if (!(header.width > 0 && header.height > 0) || !Number.isFinite(header.width + header.height))
      throw Error('Ungültige Bildabmessungen');
    this.records = next;
    this.light = light;
    this.sediment = sediment;
    this.plankton = plankton;
    this.sequence = sequence;
    this.epoch = epoch;
    this.header = header;
    return header;
  }
}
