import {SceneDecoder} from './scene_frame.js';
import {loadTexts} from './strings.js';

let decoder, generation;
const texts = loadTexts();
self.onmessage = async ({data}) => {
  await texts;
  if (data.cancel)
    return;
  try {
    const start = performance.now();
    if (generation !== data.generation) {
      decoder = new SceneDecoder();
      generation = data.generation;
    }
    const result = decoder.accept(data.buffer);
    self.postMessage({ticket : data.ticket, result, decode_ms : performance.now() - start});
  } catch (error) {
    self.postMessage({ticket : data.ticket, error : error.message, name : error.name});
  }
};
