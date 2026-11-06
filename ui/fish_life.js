import {fishTitle} from './fish_names.js';
import {FISH} from './schema.js';
import {command} from './session.js';
import {t} from './strings.js';
import {beginEggPlacement} from './world.js';

function revivableFish(f) { return f?.historical ? [] : f?.revivable || []; }
function canRevive(f, id) { return revivableFish(f).includes(id); }
function canShield(f, p) { return !!p?.[FISH.hatched] && !f?.historical; }
function shielded(p) { return !!p?.[FISH.immortal]; }

function setShield(id, on) { return command('immortal', {id, value : on ? 1 : 0}); }
function revive(id) { return command('revive', {id}); }

function onPress(button, action) {
  button.onclick = e => {
    e.stopPropagation();
    action();
  };
}

export function showShield(button, f, p) {
  button.hidden = !canShield(f, p);
  if (button.hidden)
    return;
  const on = shielded(p), id = p[FISH.id];
  button.setAttribute('aria-pressed', String(on));
  button.title = t(on ? 'fish_life.release' : 'fish_life.shield', {fish : fishTitle(id)});
  button.setAttribute('aria-label', button.title);
  onPress(button, () => setShield(id, !on));
}

export function showRevival(button, f, id) {
  button.hidden = !canRevive(f, id);
  if (button.hidden)
    return;
  button.title = t('fish_life.reviveTitle', {fish : fishTitle(id)});
  onPress(button, () => revive(id));
}

export function renderRevivable(box, f) {
  const ids = revivableFish(f), shown = ids.map(id => id + '=' + fishTitle(id)).join();
  box.hidden = !ids.length;
  if (box.dataset.shown === shown)
    return;
  box.dataset.shown = shown;
  const title = document.createElement('h2');
  title.className = 'list-title';
  title.textContent = t('fish_life.remembered');
  box.replaceChildren(title, ...ids.map(id => {
    const row = document.createElement('div'), name = document.createElement('span'),
          clone = document.createElement('button'), button = document.createElement('button');
    row.className = 'revivable-fish';
    name.textContent = fishTitle(id);
    clone.type = button.type = 'button';
    clone.textContent = t('fish_life.clone');
    clone.title = t('fish_life.cloneTitle', {fish : fishTitle(id)});
    onPress(clone, () => beginEggPlacement({clone : id}));
    button.textContent = t('fish_life.revive');
    showRevival(button, f, id);
    row.append(name, clone, button);
    return row;
  }));
}
