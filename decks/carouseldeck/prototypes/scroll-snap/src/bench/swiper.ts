// THROWAWAY (#138). Swiper 14.3.0, pinned per #137, core only (no modules),
// at its defaults with `loop: true`. A CSS transition on the wrapper's
// `transform` for Next/Prev (compositor); `loopFix` reposition for the
// seam (DOM `prepend`/`append` plus an instant `slideTo`).

import Swiper from 'swiper';
import 'swiper/css';
import { markInitEnd, markInitStart, attachHarness } from './harness';
import { renderChrome, startHud } from './chrome';
import { buildCard, slideCount, BENCH_INDEX_ATTR } from './content';

markInitStart();

const n = slideCount();
const { stage, prev, next, hud } = renderChrome('Swiper 14.3.0');

stage.innerHTML = `
  <div id="viewport" class="swiper">
    <div class="swiper-wrapper"></div>
  </div>
`;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const wrapper = viewport.querySelector<HTMLElement>('.swiper-wrapper')!;

for (let i = 0; i < n; i++) {
  const el = document.createElement('div');
  el.className = 'bench-slide swiper-slide';
  el.setAttribute(BENCH_INDEX_ATTR, String(i));
  el.append(buildCard(i, n));
  wrapper.append(el);
}

const swiper = new Swiper(viewport, {
  loop: true,
  slidesPerView: 'auto',
  spaceBetween: 0
});

prev.addEventListener('click', () => swiper.slidePrev());
next.addEventListener('click', () => swiper.slideNext());

attachHarness({ viewport, n });
startHud(hud);
markInitEnd();
