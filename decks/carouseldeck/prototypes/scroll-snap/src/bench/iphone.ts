// THROWAWAY (#138). Loads any of the seven bench decks, by `?deck=`, in an
// iframe (same origin, so `contentWindow.__bench` is reachable directly),
// and shows the main-thread-visible metrics live, in large text, below it.
// Swipe and drag inside the iframe as on any deck; the live numbers are the
// ones every browser can see without a trace -- Chromium's compositor
// frames need the camera check below, same as Firefox and WebKit desktop.

import './style.css';

const DECKS: Record<string, string> = {
  carouseldeck: 'bench-carouseldeck.html',
  'one-instance': 'bench-one-instance.html?video=0&iframe=0',
  embla: 'bench-embla.html',
  keen: 'bench-keen.html',
  swiper: 'bench-swiper.html',
  splide: 'bench-splide.html',
  flicking: 'bench-flicking.html'
};

const params = new URLSearchParams(location.search);
const deck =
  params.has('deck') && params.get('deck')! in DECKS
    ? params.get('deck')!
    : 'carouseldeck';
const slides = params.get('slides');

function urlFor(name: string): string {
  const base = DECKS[name];
  const [path, query] = base.split('?');
  const qs = new URLSearchParams(query ?? '');
  if (slides) qs.set('slides', slides);
  const q = qs.toString();
  return q ? `${path}?${q}` : path;
}

document.title = 'iPhone bench page (THROWAWAY, #138)';
document.body.innerHTML = `
  <div class="bench-banner">THROWAWAY bench for #138. Not package code.</div>
  <h1 class="bench-title">iPhone bench: ${deck}</h1>
  <form id="picker" style="margin:8px 0">
    <label>Deck
      <select id="deck-select">
        ${Object.keys(DECKS)
          .map((k) => `<option${k === deck ? ' selected' : ''}>${k}</option>`)
          .join('')}
      </select>
    </label>
  </form>
  <iframe id="deck-frame" style="width:100%;height:480px;border:1px solid #888"
    src="${urlFor(deck)}"></iframe>
  <div id="phone-hud" style="font:18px/1.5 ui-monospace,monospace;padding:8px;
    border:1px solid #888;border-radius:6px;white-space:pre-wrap;margin-top:12px"></div>
  <ol style="font-size:0.95rem">
    <li>Record a 240fps slow-motion video of the screen while you swipe and flick.</li>
    <li>Count distinct frames per vsync in the recording; a repeated or blank frame is a stall or a seam flash.</li>
    <li>Compare what you saw to "idle for" and "blank frames" below: a long "idle for" during a flick that the video shows still moving means this page's rAF-based numbers under-report smoothness here (research #137: native scrolling is invisible to main-thread timing). A camera is the ground truth; this HUD is the main-thread view.</li>
    <li>Record whether Settings > Apps > Safari > Advanced > Feature Flags has "Prefer Page Rendering Updates near 60fps" on or off: it changes whether this HUD's own sampling rate matches the screen's.</li>
  </ol>
`;

const select = document.querySelector<HTMLSelectElement>('#deck-select')!;
select.addEventListener('change', () => {
  const next = new URLSearchParams(location.search);
  next.set('deck', select.value);
  location.search = next.toString();
});

const frame = document.querySelector<HTMLIFrameElement>('#deck-frame')!;
const hud = document.querySelector<HTMLElement>('#phone-hud')!;

setInterval(() => {
  const probe = frame.contentWindow?.__bench;
  if (!probe) {
    hud.textContent = 'Loading…';
    return;
  }
  const loaf = probe.loaf();
  const heap = probe.heap();
  hud.textContent = [
    `slide ${probe.focal() + 1} · logical ${probe.logical().toFixed(2)}`,
    `frames ${probe.m.frames} · max step ${probe.m.maxStep.toFixed(2)}`,
    `reversals ${probe.m.reversals} · blank frames ${probe.m.blankFrames}`,
    `idle for ${probe.idleFor().toFixed(0)} ms`,
    loaf
      ? `LoAF ${loaf.count} (${loaf.totalBlocking.toFixed(0)} ms)`
      : 'LoAF: n/a',
    heap !== null ? `heap ${(heap / 1048576).toFixed(1)} MB` : 'heap: n/a'
  ].join('\n');
}, 200);
