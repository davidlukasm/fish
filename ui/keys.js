export const KEY = Object.freeze({
  left : 'ArrowLeft',
  right : 'ArrowRight',
  up : 'ArrowUp',
  down : 'ArrowDown',
  home : 'Home',
  end : 'End',
  enter : 'Enter',
  escape : 'Escape',
  space : ' '
});
export function isActivation(e) { return e.key === KEY.enter || e.key === KEY.space; }
