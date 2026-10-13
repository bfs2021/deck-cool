// THROWAWAY (#138). carouseldeck as shipped: the workspace's
// `@carouseldeck/core`, the framework-neutral engine (this app has no
// React, and the engine is built to be used directly), with `loop: true`.
// Native CSS scroll snap in a real scroll container; the engine reads where
// it rests and asks it to move (ADR-0001, ADR-0006, ADR-0009).

import { createDeck } from '@carouseldeck/core';
import { markInitEnd, markInitStart, attachHarness } from './harness';
import { renderChrome, startHud } from './chrome';
import { buildCard, slideCount, BENCH_INDEX_ATTR } from './content';

markInitStart();

const n = slideCount();
const { stage, prev, next, hud } = renderChrome('carouseldeck (shipped)');

stage.innerHTML = `
  <div id="viewport" class="native" tabindex="0" role="region"
       aria-roledescription="carousel" aria-label="Bench deck (carouseldeck)">
  </div>
`;
const viewport = document.querySelector<HTMLElement>('#viewport')!;

function slideEl(i: number, copy?: 'before' | 'after'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bench-slide';
  el.setAttribute(BENCH_INDEX_ATTR, String(i));
  el.append(buildCard(i, n));
  if (copy) {
    el.setAttribute('data-carouseldeck-copy', copy);
    el.setAttribute('aria-hidden', 'true');
    el.inert = true;
  } else {
    el.tabIndex = 0;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'slide');
    el.setAttribute('aria-label', `Slide ${i + 1} of ${n}`);
  }
  return el;
}

for (let i = 0; i < n; i++) viewport.append(slideEl(i, 'before'));
for (let i = 0; i < n; i++) viewport.append(slideEl(i));
for (let i = 0; i < n; i++) viewport.append(slideEl(i, 'after'));

const engine = createDeck(viewport, {
  index: 0,
  onChange: () => {
    /* HUD reads the probe's own position; nothing else needed here. */
  }
});

prev.addEventListener('click', () => engine.prev());
next.addEventListener('click', () => engine.next());

attachHarness({ viewport, n });
startHud(hud);
markInitEnd();
