// THROWAWAY (#138). Non-invasive glue for the existing one-instance
// prototype (`../pages/loop-one-instance.ts`, #3/#4): waits for it to mount,
// tags its slides (`.slide[data-index]`) with the bench's own
// `.bench-slide[data-bench-index]` so `harness.ts`'s engine-neutral probe
// finds them, and appends a second HUD with the bench's metrics. Nothing in
// the original page is changed.

import { attachHarness, markInitEnd, markInitStart } from './harness';
import { startHud } from './chrome';
import './style.css';

markInitStart();

function whenReady(fn: () => void) {
  const check = () => {
    if (window.__loopOne) fn();
    else requestAnimationFrame(check);
  };
  check();
}

whenReady(() => {
  const n = window.__loopOne.mounted().length;
  for (const el of document.querySelectorAll<HTMLElement>(
    '.slide[data-index]'
  )) {
    el.classList.add('bench-slide');
    el.setAttribute('data-bench-index', el.dataset.index!);
  }
  const viewport = document.querySelector<HTMLElement>('#viewport')!;
  attachHarness({ viewport, n });

  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.id = 'bench-hud';
  document.body.append(hud);
  startHud(hud);
  markInitEnd();
});
