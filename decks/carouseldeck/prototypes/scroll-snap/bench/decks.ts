// THROWAWAY (#138). The seven decks the bench drives, and how to reach each
// at a given slide count. Every deck shares `#viewport`, `#prev`, `#next`,
// `#reset` and `window.__bench` (src/bench/harness.ts).

export interface DeckDef {
  key: string;
  label: string;
  url: string;
}

export const DECKS: DeckDef[] = [
  {
    key: 'carouseldeck',
    label: 'carouseldeck (shipped)',
    url: 'bench-carouseldeck.html'
  },
  {
    key: 'one-instance',
    label: 'carouseldeck (one-instance)',
    url: 'bench-one-instance.html?video=0&iframe=0'
  },
  { key: 'embla', label: 'Embla 8.6.0', url: 'bench-embla.html' },
  { key: 'keen', label: 'Keen Slider 6.8.6', url: 'bench-keen.html' },
  { key: 'swiper', label: 'Swiper 14.3.0', url: 'bench-swiper.html' },
  { key: 'splide', label: 'Splide 4.1.4', url: 'bench-splide.html' },
  { key: 'flicking', label: 'Flicking 4.17.1', url: 'bench-flicking.html' }
];

export function urlFor(deck: DeckDef, slides?: number): string {
  const [path, query] = deck.url.split('?');
  const qs = new URLSearchParams(query ?? '');
  if (slides) qs.set('slides', String(slides));
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}
