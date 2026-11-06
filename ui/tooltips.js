import {KEY} from './keys.js';
import {animate} from './tank.js';
export const tooltipsState = {};

const TOOLTIP = Object.freeze({gap : 10, edge : 8, cursor_x : 12, cursor_y : 18, delay_ms : 350});
export function installTooltips(doc = document, host = window) {
  if (!doc.body || !host.MutationObserver)
    return;
  const bubble = doc.createElement('div'), titles = new WeakMap();
  bubble.id = 'live-tooltip';
  bubble.hidden = true;
  bubble.setAttribute('role', 'tooltip');
  bubble.setAttribute('popover', 'manual');
  doc.body.appendChild(bubble);
  let source = null, timer = 0, shown = false, x = null, y = null, focus = null, suspended = false;
  const titled = node => {
    for (let p = node; p && p !== doc; p = p.parentElement)
      if (p.getAttribute?.('title') || titles.get(p))
        return p;
    return null;
  };
  const restore = node => {
    if (!node)
      return;
    const title = titles.get(node);
    if (title && !node.hasAttribute('title'))
      node.setAttribute('title', title);
    titles.delete(node);
    const ids = (node.getAttribute('aria-describedby') || '')
                    .split(/\s+/)
                    .filter(id => id && id !== bubble.id);
    if (ids.length)
      node.setAttribute('aria-describedby', ids.join(' '));
    else
      node.removeAttribute('aria-describedby');
  };
  const place = () => {
    if (!source || !shown)
      return;
    const anchor = (source.closest?.('label') || source).getBoundingClientRect(),
          size = bubble.getBoundingClientRect(), width = host.innerWidth, height = host.innerHeight,
          left = focus ? anchor.left : x;
    const {gap, edge} = TOOLTIP, above = anchor.top - size.height - gap,
                below = anchor.bottom + gap;
    let top = above >= edge ? above
              : below + size.height <= height - edge
                  ? below
                  : Math.max(edge, Math.min(height - size.height - edge,
                                            (focus ? anchor.bottom : y) + TOOLTIP.cursor_y));
    bubble.style.left =
        Math.max(edge, Math.min(left + TOOLTIP.cursor_x, width - size.width - edge)) + 'px';
    bubble.style.top = top + 'px';
  };
  const hide = () => {
    if (timer)
      host.clearTimeout(timer);
    timer = 0;
    if (shown && bubble.hidePopover)
      bubble.hidePopover();
    shown = false;
    bubble.hidden = true;
    restore(source);
    source = null;
  };
  const content = node => {
    const latest = node.getAttribute('title');
    if (latest !== null) {
      titles.set(node, latest);
      node.removeAttribute('title');
    }
    return titles.get(node) || '';
  };
  const show = () => {
    timer = 0;
    if (!source)
      return;
    const message = content(source);
    if (!message) {
      hide();
      return;
    }
    if (bubble.textContent !== message)
      bubble.textContent = message;
    bubble.hidden = false;
    shown = true;
    if (bubble.showPopover && !bubble.matches(':popover-open'))
      bubble.showPopover();
    const ids = (source.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(bubble.id)) {
      ids.push(bubble.id);
      source.setAttribute('aria-describedby', ids.join(' '));
    }
    place();
  };
  const select = node => {
    const next = titled(node);
    if (next === source) {
      if (source) {
        const message = content(source);
        if (!message)
          hide();
        else if (shown) {
          if (bubble.textContent !== message)
            bubble.textContent = message;
          place();
        }
      }
      return;
    }
    const keepVisible = shown;
    hide();
    if (!next)
      return;
    source = next;
    if (!content(source)) {
      source = null;
      return;
    }
    if (keepVisible)
      show();
    else
      timer = host.setTimeout(show, TOOLTIP.delay_ms);
  };
  const underPointer = () => x === null ? null : doc.elementFromPoint(x, y);
  doc.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch' || event.buttons)
      return;
    suspended = false;
    focus = null;
    x = event.clientX;
    y = event.clientY;
    select(event.target);
  }, true);
  doc.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch')
      return;
    if (event.buttons) {
      suspended = true;
      hide();
      return;
    }
    suspended = false;
    focus = null;
    x = event.clientX;
    y = event.clientY;
    select(event.target);
  }, true);
  doc.addEventListener('pointerout', event => {
    if (!event.relatedTarget) {
      x = y = null;
      hide();
    }
  }, true);
  doc.addEventListener('focusin', event => {
    suspended = false;
    focus = event.target;
    select(focus);
  }, true);
  doc.addEventListener('focusout', () => {
    focus = null;
    hide();
  }, true);
  doc.addEventListener('pointerdown', () => {
    suspended = true;
    hide();
  }, true);
  doc.addEventListener('keydown', event => {
    if (event.key === KEY.escape) {
      suspended = true;
      hide();
    }
  }, true);
  doc.addEventListener('scroll', () => {
    if (shown)
      place();
  }, true);
  host.addEventListener('blur', () => {
    suspended = true;
    hide();
  });
  host.addEventListener('resize', place);
  new host
      .MutationObserver(records => {
        if (suspended || !source)
          return;
        if (records.every(record => record.target === bubble || bubble.contains(record.target)))
          return;
        select(focus?.isConnected ? focus : underPointer());
      })
      .observe(
          doc.body,
          {subtree : true, childList : true, attributes : true, attributeFilter : [ 'title' ]});
}

const initializers = {
  "installTooltips" : () => { installTooltips(); },
  "requestAnimationFrame" : () => { requestAnimationFrame(animate); }
};
export function initialize(steps) {
  for (const step of steps)
    initializers[step]();
}
