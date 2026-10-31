// Life protection and revival of single fish: a fish can be kept from dying, and a named fish
// the engine remembered can be brought back after its death. Desktop and phone use the same
// rules and commands from here.
import {fishTitle} from './fish_names.js';
import {FISH} from './schema.js';
import {command} from './session.js';
import {t} from './strings.js';

// Dead fish the engine kept whole, because they had a name.
function revivableFish(f) { return f?.historical ? [] : f?.revivable || []; }
function canRevive(f, id) { return revivableFish(f).includes(id); }
// A hatched, living fish of the running world can be shielded or released again.
function canShield(f, p) { return !!p?.[FISH.hatched] && !f?.historical; }
function shielded(p) { return !!p?.[FISH.immortal]; }

function setShield(id, on) { return command('immortal', {id, value : on ? 1 : 0}); }
function revive(id) { return command('revive', {id}); }

// A press acts on this button alone, not on the panel or card around it.
function onPress(button, action) {
  button.onclick = e => {
    e.stopPropagation();
    action();
  };
}

// A shield switch: pressed while the fish cannot die.
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

// A revival button for a dead fish, shown only while the engine can still bring it back.
export function showRevival(button, f, id) {
  button.hidden = !canRevive(f, id);
  if (button.hidden)
    return;
  button.title = t('fish_life.reviveTitle', {fish : fishTitle(id)});
  onPress(button, () => revive(id));
}

// The named dead the engine remembers, each with its revival button.
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
          button = document.createElement('button');
    row.className = 'revivable-fish';
    name.textContent = fishTitle(id);
    button.type = 'button';
    button.textContent = t('fish_life.revive');
    showRevival(button, f, id);
    row.append(name, button);
    return row;
  }));
}
