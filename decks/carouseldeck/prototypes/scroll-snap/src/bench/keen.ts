// THROWAWAY (#138). Keen Slider 6.8.6, pinned per #137, at its defaults
// (`mode: 'snap'`, `rubberband: true`) with `loop: true`. rAF animator,
// `translate3d(…)`, no copies (research: each slide's offset taken modulo
// the track length).

import KeenSlider from 'keen-slider';
import 'keen-slider/keen-slider.css';
import { markInitEnd, markInitStart, attachHarness } from './harness';
import { renderChrome, startHud } from './chrome';
import { buildCard, slideCount, BENCH_INDEX_ATTR } from './content';

markInitStart();

const n = slideCount();
const { stage, prev, next, hud } = renderChrome('Keen Slider 6.8.6');

stage.innerHTML = `<div id="viewport" class="keen-slider"></div>`;
const viewport = document.querySelector<HTMLElement>('#viewport')!;

for (let i = 0; i < n; i++) {
  const el = document.createElement('div');
  el.className = 'bench-slide keen-slider__slide';
  el.setAttribute(BENCH_INDEX_ATTR, String(i));
  el.append(buildCard(i, n));
  viewport.append(el);
}

const slider = new KeenSlider(viewport, {
  loop: true,
  slides: { perView: 'auto' }
});

prev.addEventListener('click', () => slider.prev());
next.addEventListener('click', () => slider.next());

attachHarness({ viewport, n });
startHud(hud);
markInitEnd();
