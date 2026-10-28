// THROWAWAY (#233). "drawerdeck" for this bench: variant B's mechanics,
// ported from the throwaway prototype (branch `prototype/sheetdeck`,
// `decks/sheetdeck-prototype/index.html`, read-only, not modified) --
// nested list, locked until the sheet reaches its full snap point --
// with the HUD, jank switch and variant switcher stripped (#233's brief:
// port only the mechanics the bench needs, no chrome).
//
// Ported unchanged in substance: `showModal`/the scroller's
// `scroll-snap-type: y mandatory` with `.snap` marker elements at the
// half/full offsets, the phase state machine
// (closed/opening/open/closing), the scrollend-or-120ms-debounce
// dismissal check, resize handling, and the mouse-only drag (filtered on
// `pointerType`) with a 240ms ease-out cubic and a velocity-projected
// release onto the nearest of [0, half, full]. Touch is untouched native
// scrolling, same as the prototype.
//
// Dropped (not exercised by any of this bench's scenarios): the dim
// overlay, `animation-timeline` feature detection, tap-outside-to-close,
// Escape handling, and `prefers-reduced-motion`.

import { buildRows, FULL_FRACTION, HALF_FRACTION, ROWS } from './content';
import { attachHarness, markInitEnd, markInitStart } from './harness';

markInitStart();

document.body.innerHTML = `
  <button id="trigger" type="button">Open</button>
  <dialog class="sheet">
    <div class="scroller" id="scroller" tabindex="-1"></div>
  </dialog>
`;

const style = document.createElement('style');
style.textContent = `
  dialog.sheet {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: hidden;
  }
  dialog.sheet::backdrop { background: transparent; }
  dialog.sheet:focus { outline: none; }
  .scroller {
    position: relative;
    height: 100dvh;
    overflow-y: auto;
    scroll-snap-type: y mandatory;
    overscroll-behavior: contain;
  }
  .gap { height: 100dvh; }
  .snap {
    position: absolute;
    left: 0;
    width: 100%;
    height: 0;
    scroll-snap-align: start;
    pointer-events: none;
  }
  .panel.nested {
    height: 92dvh;
    display: flex;
    flex-direction: column;
  }
  .panel.locked .inner-list { overflow-y: hidden; }
  .panel.locked.at-full .inner-list { overflow-y: auto; }
`;
document.head.append(style);

const dialog = document.querySelector<HTMLDialogElement>('dialog.sheet')!;
const scroller = document.getElementById('scroller')!;
const trigger = document.getElementById('trigger')!;

const panelHtml =
  '<div class="panel nested locked" id="panel">' +
  '<div class="handle"></div>' +
  '<div class="inner-list" id="inner-list">' +
  buildRows(ROWS) +
  '</div>' +
  '</div>';

const markers =
  '<div class="snap" data-snap="closed" style="top:0"></div>' +
  `<div class="snap" data-snap="half" style="top:${HALF_FRACTION * 100}dvh"></div>` +
  `<div class="snap" data-snap="full" style="top:${FULL_FRACTION * 100}dvh"></div>`;

scroller.innerHTML = '<div class="gap"></div>' + markers + panelHtml;

const panel = document.getElementById('panel')!;

let halfPx = 0;
let fullPx = 0;
function recomputeMetrics(): void {
  halfPx = scroller.clientHeight * HALF_FRACTION;
  fullPx = scroller.clientHeight * FULL_FRACTION;
}
recomputeMetrics();

type Phase = 'closed' | 'opening' | 'open' | 'closing';
let phase: Phase = 'closed';
let openSafetyTimer: number | undefined;

function openSheet(): void {
  dialog.showModal();
  scroller.focus({ preventScroll: true });
  recomputeMetrics(); // the scroller has no layout until the dialog is shown
  phase = 'opening';
  scroller.scrollTop = 0;
  requestAnimationFrame(() => {
    scroller.scrollTo({ top: halfPx, behavior: 'smooth' });
  });
  clearTimeout(openSafetyTimer);
  openSafetyTimer = window.setTimeout(() => {
    if (phase === 'opening') {
      recomputeMetrics();
      scroller.scrollTop = halfPx;
      phase = 'open';
    }
  }, 1000);
}

function closeSheet(): void {
  if (!dialog.open) return;
  clearTimeout(openSafetyTimer);
  dialog.close();
  phase = 'closed';
}

function updateLock(): void {
  const atFull = scroller.scrollTop >= fullPx - 2;
  panel.classList.toggle('at-full', atFull);
}

function onScrollEnd(): void {
  if (phase === 'opening') {
    if (scroller.scrollTop >= halfPx - 4) {
      clearTimeout(openSafetyTimer);
      recomputeMetrics();
      if (Math.abs(scroller.scrollTop - halfPx) > 4)
        scroller.scrollTop = halfPx;
      phase = 'open';
    } else {
      scroller.scrollTo({ top: halfPx, behavior: 'smooth' });
    }
    return;
  }
  if (scroller.scrollTop <= 2 && (phase === 'open' || phase === 'closing')) {
    closeSheet();
  }
  updateLock();
}

if ('onscrollend' in window) {
  scroller.addEventListener('scrollend', onScrollEnd);
} else {
  let debounce: number;
  scroller.addEventListener('scroll', () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(onScrollEnd, 120);
  });
}
scroller.addEventListener('scroll', updateLock);

// ---------- mouse drag ----------
// A mouse can't drag a scroll container, so give mouse pointers their own
// drag + projected-throw. Touch stays fully native (the scroller's own
// scroll-snap already handles it) by filtering on pointerType.
const DRAG_HISTORY_MS = 100;
const THROW_DURATION_MS = 240;
const THROW_VELOCITY_SCALE = 200;
let dragging = false;
let dragStartY = 0;
let dragStartScrollTop = 0;
let dragMaxScrollTop = 0;
let dragHistory: { t: number; st: number }[] = [];
let throwRafId = 0;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function onPointerDown(e: PointerEvent): void {
  if (e.pointerType !== 'mouse' || e.button !== 0 || phase !== 'open') return;
  if ((e.target as HTMLElement).closest('input, button, a')) return;
  dragging = true;
  dragStartY = e.clientY;
  dragStartScrollTop = scroller.scrollTop;
  dragMaxScrollTop = scroller.scrollHeight - scroller.clientHeight;
  dragHistory = [{ t: e.timeStamp, st: dragStartScrollTop }];
  cancelAnimationFrame(throwRafId);
  panel.setPointerCapture(e.pointerId);
  scroller.style.scrollSnapType = 'none';
}

function onPointerMove(e: PointerEvent): void {
  if (!dragging || e.pointerType !== 'mouse') return;
  const dy = e.clientY - dragStartY;
  scroller.scrollTop = clamp(dragStartScrollTop - dy, 0, dragMaxScrollTop);
  dragHistory.push({ t: e.timeStamp, st: scroller.scrollTop });
  while (
    dragHistory.length > 1 &&
    dragHistory[dragHistory.length - 1]!.t - dragHistory[0]!.t > DRAG_HISTORY_MS
  ) {
    dragHistory.shift();
  }
}

function throwTo(target: number, onDone: () => void): void {
  cancelAnimationFrame(throwRafId);
  const startTop = scroller.scrollTop;
  const delta = target - startTop;
  if (delta === 0) {
    scroller.scrollTop = target;
    onDone();
    return;
  }
  const startTime = performance.now();
  function tick(now: number): void {
    const t = Math.min(1, (now - startTime) / THROW_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    scroller.scrollTop = startTop + delta * eased;
    if (t < 1) {
      throwRafId = requestAnimationFrame(tick);
    } else {
      scroller.scrollTop = target;
      onDone();
    }
  }
  throwRafId = requestAnimationFrame(tick);
}

function onPointerUp(e: PointerEvent): void {
  if (!dragging || e.pointerType !== 'mouse') return;
  dragging = false;
  try {
    panel.releasePointerCapture(e.pointerId);
  } catch {
    // already released
  }

  const first = dragHistory[0]!;
  const last = dragHistory[dragHistory.length - 1]!;
  const dt = last.t - first.t;
  const velocity = dt > 0 ? (last.st - first.st) / dt : 0;
  const projected = scroller.scrollTop + velocity * THROW_VELOCITY_SCALE;

  const candidates = [0, halfPx, fullPx];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const d = Math.abs(projected - candidates[i]!);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const target = candidates[bestIdx]!;
  const closing = target <= 2;
  if (closing) phase = 'closing';

  throwTo(target, () => {
    scroller.style.scrollSnapType = '';
    if (closing) {
      closeSheet();
    } else {
      phase = 'open';
      updateLock();
    }
  });
}

panel.addEventListener('pointerdown', onPointerDown);
panel.addEventListener('pointermove', onPointerMove);
panel.addEventListener('pointerup', onPointerUp);
panel.addEventListener('pointercancel', onPointerUp);

window.addEventListener('resize', () => {
  if (phase === 'opening') return; // never act mid-open
  const oldHalf = halfPx;
  const oldFull = fullPx;
  const st = scroller.scrollTop;
  recomputeMetrics();
  if (!dialog.open) return;
  let nearest: 'closed' | 'half' | 'full' = 'closed';
  let best = Math.abs(st - 0);
  if (Math.abs(st - oldHalf) < best) {
    nearest = 'half';
    best = Math.abs(st - oldHalf);
  }
  if (Math.abs(st - oldFull) < best) {
    nearest = 'full';
    best = Math.abs(st - oldFull);
  }
  if (nearest === 'half')
    scroller.scrollTo({ top: halfPx, behavior: 'instant' });
  else if (nearest === 'full')
    scroller.scrollTo({ top: fullPx, behavior: 'instant' });
});

trigger.addEventListener('mousedown', (e) => e.preventDefault());
trigger.addEventListener('click', openSheet);

attachHarness({ panelSelector: '#panel' });
markInitEnd();
