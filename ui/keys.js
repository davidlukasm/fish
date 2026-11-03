// Key names of keyboard events, for keyboard navigation.
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
// Enter and space activate a focused control.
export function isActivation(e) { return e.key === KEY.enter || e.key === KEY.space; }
