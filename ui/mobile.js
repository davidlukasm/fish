// Portrait phone layout. The tank fills the top of the screen, every panel lives in a bottom
// sheet that snaps to three heights, and the main actions float over the water. It only
// rearranges: each control is the desktop control, so no logic exists twice.
import {resizeAquarium} from './camera.js';
import {el} from './dom.js';
import {sceneState} from './state.js';
import {t} from './strings.js';
export const mobileState = {
  sheet : 'peek'
};

const QUERY = '(max-width: 760px) and (orientation: portrait)';
const SNAP_ORDER = [ 'peek', 'half', 'full' ];
const DRAG_THRESHOLD = 6;
const TOP = 56, SHEET_OVERLAP = 22, MIN_PEEK = 168;
// The tank keeps the world's proportions across the full width; whatever height is left below
// belongs to the panels. Half and nearly all of the screen are the larger heights.
function tankHeight() {
  const f = sceneState.frame, aspect = f?.width > 0 ? f.height / f.width : .6;
  return Math.round(Math.min(window.innerHeight * .62, window.innerWidth * aspect));
}
const snapHeight = name => ({
  peek : Math.max(MIN_PEEK, window.innerHeight - TOP - tankHeight() + SHEET_OVERLAP),
  half : Math.round(window.innerHeight * .56),
  full : Math.round(window.innerHeight - 64)
})[name];
// Floating actions: symbol, wording and the desktop control they press.
const ACTIONS = [
  {icon : '✦', label : 'mobile.feed', target : 'quick-feed'},
  {icon : '◎', label : 'mobile.follow', target : 'follow', when : () => !el('follow')?.disabled},
  {icon : '✕', label : 'mobile.deselect', target : 'deselect', when : () => !el('deselect')?.hidden}
];

function setSheet(name, height = snapHeight(name)) {
  mobileState.sheet = name;
  mobileState.tankHeight = tankHeight();
  document.body.style.setProperty('--tank-height', mobileState.tankHeight + 'px');
  document.body.style.setProperty('--sheet', height + 'px');
  document.body.dataset.sheet = name;
  el('mobile-handle')?.setAttribute('aria-valuenow', String(SNAP_ORDER.indexOf(name)));
}

function nearestSnap(height) {
  return SNAP_ORDER.reduce(
      (best, name) =>
          Math.abs(snapHeight(name) - height) < Math.abs(snapHeight(best) - height) ? name : best);
}

// Dragging the handle or the tab strip moves the sheet; a short tap on a tab stays a tap.
function bindDrag(area) {
  let start = null;
  area.addEventListener('pointerdown', e => {
    start =
        {y : e.clientY, height : snapHeight(mobileState.sheet), moved : false, id : e.pointerId};
  });
  area.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id)
      return;
    const dy = start.y - e.clientY;
    if (!start.moved && Math.abs(dy) < DRAG_THRESHOLD)
      return;
    if (!start.moved) {
      start.moved = true;
      area.setPointerCapture?.(e.pointerId);
      document.body.classList.add('sheet-dragging');
    }
    const height =
        Math.max(snapHeight('peek') - 40, Math.min(snapHeight('full'), start.height + dy));
    document.body.style.setProperty('--sheet', height + 'px');
  });
  const end = e => {
    if (!start)
      return;
    if (start.moved) {
      const height = start.height + start.y - e.clientY, velocity = start.y - e.clientY;
      document.body.classList.remove('sheet-dragging');
      const current = SNAP_ORDER.indexOf(nearestSnap(height)),
            flick = Math.abs(velocity) > 80 ? Math.sign(velocity) : 0;
      setSheet(SNAP_ORDER[Math.max(
          0, Math.min(2, current + (nearestSnap(height) === mobileState.sheet ? flick : 0)))]);
      navigator.vibrate?.(8);
      e.preventDefault();
      area.addEventListener('click', stop => stop.stopPropagation(), {capture : true, once : true});
    }
    start = null;
  };
  area.addEventListener('pointerup', end);
  area.addEventListener('pointercancel', end);
}

function buildChrome() {
  const handle = document.createElement('div');
  handle.id = 'mobile-handle';
  handle.className = 'mobile-handle';
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', t('mobile.sheet'));
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '2');
  handle.tabIndex = 0;
  handle.onclick = () => setSheet(SNAP_ORDER[(SNAP_ORDER.indexOf(mobileState.sheet) + 1) % 3]);
  handle.onkeydown = e => {
    const step = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
    if (step)
      setSheet(SNAP_ORDER[Math.max(0, Math.min(2, SNAP_ORDER.indexOf(mobileState.sheet) + step))]);
  };
  el('cockpit').prepend(handle);
  bindDrag(handle);
  bindDrag(el('observations'));

  const menu = document.createElement('button');
  menu.id = 'mobile-menu';
  menu.className = 'mobile-menu';
  menu.type = 'button';
  menu.textContent = '⋯';
  menu.setAttribute('aria-label', t('mobile.menu'));
  menu.setAttribute('aria-expanded', 'false');
  menu.onclick = () => {
    const open = !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', String(open));
  };
  document.querySelector('header').append(menu);
  el('controls').addEventListener('click', e => {
    if (e.target.closest('button') && !e.target.closest('summary'))
      document.body.classList.remove('menu-open');
  });

  const fabs = document.createElement('div');
  fabs.className = 'mobile-fabs';
  for (const action of ACTIONS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.icon;
    button.dataset.target = action.target;
    button.setAttribute('aria-label', t(action.label));
    button.title = t(action.label);
    button.onclick = () => {
      el(action.target)?.click();
      navigator.vibrate?.(10);
    };
    fabs.append(button);
  }
  document.querySelector('.aquarium').append(fabs);
  mobileState.fabs = fabs;
}

// Actions that do not apply right now fade out instead of moving the others around.
function refreshActions() {
  if (document.body.classList.contains('mobile') && mobileState.tankHeight !== tankHeight()) {
    setSheet(mobileState.sheet);
    resizeAquarium();
  }
  if (document.body.classList.contains('mobile'))
    for (const button of mobileState.fabs.children) {
      const action = ACTIONS.find(a => a.target === button.dataset.target);
      button.disabled = action.when ? !action.when() : false;
    }
  requestAnimationFrame(refreshActions);
}

function apply(on) {
  document.body.classList.toggle('mobile', on);
  if (!on)
    document.body.classList.remove('menu-open');
  setSheet(mobileState.sheet);
  requestAnimationFrame(() => {
    resizeAquarium();
    window.dispatchEvent(new Event('resize'));
  });
}

export function initMobile() {
  // ?mobile=1 or ?mobile=0 overrides the screen query; without a browser window nothing happens.
  const forced = new URLSearchParams(globalThis.location?.search || '').get('mobile'),
        media = globalThis.matchMedia?.(QUERY);
  if (!media)
    return;
  buildChrome();
  // Choosing a fish or another tab lifts a lowered sheet so the answer is visible.
  el('observations').addEventListener('click', () => {
    if (mobileState.sheet === 'peek')
      setSheet('half');
  });
  new MutationObserver(() => {
    if (document.body.classList.contains('mobile') && mobileState.sheet === 'peek' &&
        el('tab-fish').classList.contains('active'))
      setSheet('half');
  }).observe(el('tab-fish'), {attributes : true, attributeFilter : [ 'class' ]});
  window.addEventListener('resize', () => setSheet(mobileState.sheet));
  const decide = () => apply(forced === '1' || (forced !== '0' && media.matches));
  media.addEventListener?.('change', decide);
  decide();
  refreshActions();
}
