// THROWAWAY (#138). Embla 8.6.0, pinned per the research ticket (#137),
// at its defaults with `loop: true`. `transform: translate3d(…)`, its own
// spring physics, no copies (research: `ScrollLooper`/`SlideLooper` wrap
// the location and shift the seam's slides, not clone them).

import EmblaCarousel from 'embla-carousel';
import { markInitEnd, markInitStart, attachHarness } from './harness';
import { renderChrome, startHud } from './chrome';
import { buildCard, slideCount, BENCH_INDEX_ATTR } from './content';

markInitStart();

const n = slideCount();
const { stage, prev, next, hud } = renderChrome('Embla 8.6.0');

stage.innerHTML = `
  <div id="viewport" class="embla-root">
    <div class="embla__container"></div>
  </div>
`;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const container = viewport.querySelector<HTMLElement>('.embla__container')!;

for (let i = 0; i < n; i++) {
  const el = document.createElement('div');
  el.className = 'bench-slide';
  el.setAttribute(BENCH_INDEX_ATTR, String(i));
  el.append(buildCard(i, n));
  container.append(el);
}

const api = EmblaCarousel(viewport, { loop: true });

prev.addEventListener('click', () => api.scrollPrev());
next.addEventListener('click', () => api.scrollNext());

attachHarness({ viewport, n });
startHud(hud);
markInitEnd();
