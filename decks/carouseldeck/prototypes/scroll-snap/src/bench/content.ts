// THROWAWAY (#138). Content every bench deck shares, so a difference in the
// numbers is the engine, not the markup: the same slide count, the same
// pixel widths (not a percentage of each library's own container math), the
// same cards. `VIEWPORT_WIDTH`/`SLIDE_WIDTH` give one-per-view with the
// neighbours peeking (85%) at an identical pixel size in every deck, and
// every page sets them with plain CSS so each library's own "respect the
// slide's own size" mode (Embla and Flicking always; Keen's
// `slides.perView: 'auto'`; Splide's `autoWidth: true`; Swiper's
// `slidesPerView: 'auto'`; carouseldeck always) renders the same geometry.

export const VIEWPORT_WIDTH = 640;
export const VIEWPORT_HEIGHT = 420;
export const SLIDE_WIDTH = 544; // 85% of VIEWPORT_WIDTH
export const DEFAULT_SLIDES = 6;

export function slideCount(): number {
  const n = Number(new URLSearchParams(location.search).get('slides'));
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SLIDES;
}

/**
 * One slide's inner markup: a coloured card with its number and a line of
 * text, the same for every deck. `benchIndexAttr` names the attribute a
 * library's own loop clone (via `cloneNode`) carries along automatically,
 * so the harness's engine-neutral position probe (`harness.ts`) can find a
 * slide, real or cloned, by that attribute alone.
 */
export function buildCard(i: number, n: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'bench-card';
  card.style.setProperty('--hue', String((i * 360) / n));
  card.innerHTML = `
    <span class="bench-num">${i + 1}</span>
    <p class="bench-text">Slide ${i + 1} of ${n}</p>
  `;
  return card;
}

export const BENCH_INDEX_ATTR = 'data-bench-index';
