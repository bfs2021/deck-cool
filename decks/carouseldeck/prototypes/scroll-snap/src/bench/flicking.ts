// THROWAWAY (#138). Flicking 4.17.1 + Axes 3.9.3, pinned per #137, at its
// defaults with `circular: true`. Axes' rAF loop; the only rival that
// projects a release by deceleration (research). Loop reposition: panels
// "toggle" to the other end as the camera passes, no clone.

import Flicking from '@egjs/flicking';
import '@egjs/flicking/dist/flicking.css';
import { markInitEnd, markInitStart, attachHarness } from './harness';
import { renderChrome, startHud } from './chrome';
import { buildCard, slideCount, BENCH_INDEX_ATTR } from './content';

markInitStart();

const n = slideCount();
const { stage, prev, next, hud } = renderChrome('Flicking 4.17.1');

stage.innerHTML = `<div id="viewport"></div>`;
const viewport = document.querySelector<HTMLElement>('#viewport')!;

for (let i = 0; i < n; i++) {
  const el = document.createElement('div');
  el.className = 'bench-slide';
  el.setAttribute(BENCH_INDEX_ATTR, String(i));
  el.append(buildCard(i, n));
  viewport.append(el);
}

const flicking = new Flicking(viewport, { circular: true });

prev.addEventListener('click', () => flicking.prev());
next.addEventListener('click', () => flicking.next());

attachHarness({ viewport, n });
startHud(hud);
markInitEnd();
