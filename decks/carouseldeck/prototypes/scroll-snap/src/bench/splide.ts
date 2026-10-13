// THROWAWAY (#138). Splide 4.1.4, pinned per #137, at its defaults with
// `type: 'loop'`. A CSS transition on `transform` for Next/Prev
// (compositor); copies (`perPage * 2` each side by default) cloned and
// jumped before the move (research: `Move.move` shifts position by one
// slider length, instantly, before transitioning across the seam).

import Splide from '@splidejs/splide';
import '@splidejs/splide/dist/css/splide-core.min.css';
import { markInitEnd, markInitStart, attachHarness } from './harness';
import { renderChrome, startHud } from './chrome';
import { buildCard, slideCount, BENCH_INDEX_ATTR } from './content';

markInitStart();

const n = slideCount();
const { stage, prev, next, hud } = renderChrome('Splide 4.1.4');

stage.innerHTML = `
  <div id="viewport" class="splide">
    <div class="splide__track">
      <div class="splide__list"></div>
    </div>
  </div>
`;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const list = viewport.querySelector<HTMLElement>('.splide__list')!;

for (let i = 0; i < n; i++) {
  const el = document.createElement('div');
  el.className = 'bench-slide splide__slide';
  el.setAttribute(BENCH_INDEX_ATTR, String(i));
  el.append(buildCard(i, n));
  list.append(el);
}

const splide = new Splide(viewport, {
  type: 'loop',
  perPage: 1,
  autoWidth: true,
  arrows: false,
  pagination: false
}).mount();

prev.addEventListener('click', () => splide.go('<'));
next.addEventListener('click', () => splide.go('>'));

attachHarness({ viewport, n });
startHud(hud);
markInitEnd();
