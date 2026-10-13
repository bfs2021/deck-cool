// THROWAWAY. Loop with one real instance per slide.
//
// `BUFFER_SETS` sets of empty, inert, aria-hidden shells sit on each side
// of one middle set (2*BUFFER_SETS+1 sets total) and are the only
// scroll-snap targets. The real slides -- mounted once, never moved in the
// DOM -- have `scroll-snap-align: none` and sit over whichever shell is
// nearest the viewport, placed with `translate`:
//
// - `place=css`: a named scroll-timeline on the viewport drives each
//   slide's translate with step keyframes, computed on the compositor.
//   Falls back to `js` where `animation-timeline: scroll()` is unsupported.
// - `place=js`: a scroll listener recomputes every slide's translate.
//
// At rest (scrollend, or the debounce fallback in ../settle), the scroll
// position jumps back into the middle set by as many set lengths as it has
// drifted, same idea as loop-clone-jump.ts's normalize -- but nothing is
// cloned, so every slide (its video, its iframe) mounts exactly once.
//
// BUFFER_SETS is 2, not 1: a single flick's native momentum, or several
// flicks chained before any of them settles (iOS keeps momentum going
// across a chained flick, so scrollend may not fire between them -- see
// AGENTS.md/this file's commit), can travel more than one set length
// before the scroller ever rests. A mid-scroll correction was tried and
// measured to cut a smooth scroll's (and, going by the same browser
// behaviour, a native momentum scroll's) motion dead at the write in both
// Chromium and WebKit, which is worse than the problem it would fix -- see
// that commit for the numbers. More buffer sets are the gentler fix: still
// just empty, inert, aria-hidden boxes, so the extra DOM cost is small.

import '../style.css';
import { onSettle, settleSource } from '../settle';
import { Axis, type Deck } from '../deck';
import { installDrag, type Drag } from '../drag';

const params = new URLSearchParams(location.search);

type Place = 'css' | 'js';

interface Control {
  key: string;
  label: string;
  values: readonly string[];
}

const controlDefs: Control[] = [
  { key: 'place', label: 'Placement', values: ['css', 'js'] },
  { key: 'slides', label: 'Slides', values: ['6', '3', '10'] },
  { key: 'per-view', label: 'Per view', values: ['1', '2'] },
  { key: 'jank', label: 'Jank (ms busy / 300ms)', values: ['0', '150'] },
  { key: 'drag', label: 'Mouse drag', values: ['1', '0'] }
];

function pick<T extends string>(key: string, values: readonly T[]): T {
  const raw = params.get(key);
  return (values as readonly string[]).includes(raw ?? '')
    ? (raw as T)
    : values[0];
}

const N = Number(pick('slides', ['6', '3', '10'] as const));
const perView = Number(pick('per-view', ['1', '2'] as const));
const jank = Number(pick('jank', ['0', '150'] as const));
const placeRequested = pick('place', ['css', 'js'] as const);
const dragEnabled = pick('drag', ['1', '0'] as const) === '1';

const cssSupported = CSS.supports('animation-timeline: scroll()');
const mode: Place =
  placeRequested === 'css' && !cssSupported ? 'js' : placeRequested;

document.title = 'Loop: one instance | scroll-snap prototype (THROWAWAY)';
document.body.innerHTML = `
  <div class="banner">THROWAWAY prototype. One real instance per slide; shells carry the scroll snap points. Not package code.</div>
  <nav>
    <a href="./index.html">Index</a>
    <a id="compare-link" href="./loop-clone-jump.html">Loop: clone and jump (baseline)</a>
  </nav>
  <h1>Loop: one instance</h1>
  <p class="note">Shells (empty, inert) carry the scroll snap points. Each slide mounts once and is placed, with <code>translate</code>, over whichever shell is nearest the viewport -- by a scroll-driven CSS animation, or by a scroll listener. Toggles are URL params, so a configuration is a link.</p>
  <form class="controls" id="controls"></form>
  <div id="stage"></div>
  <div class="buttons">
    <button type="button" id="prev">Prev</button>
    <button type="button" id="next">Next</button>
    <button type="button" id="reset">Reset counters</button>
  </div>
  <div class="hud" id="hud" aria-live="off"></div>
`;

// Controls: every control writes its current value explicitly on change, so
// the link in the address bar always reproduces the exact configuration.
const form = document.querySelector<HTMLFormElement>('#controls')!;
for (const c of controlDefs) {
  const current = pick(c.key, c.values);
  const label = document.createElement('label');
  label.innerHTML = `${c.label} <select name="${c.key}">${c.values
    .map((v) => `<option${v === current ? ' selected' : ''}>${v}</option>`)
    .join('')}</select>`;
  form.append(label);
}
form.addEventListener('change', () => {
  const next = new URLSearchParams();
  for (const c of controlDefs) {
    const field = form.elements.namedItem(c.key) as HTMLSelectElement;
    next.set(c.key, field.value);
  }
  location.search = next.toString();
});

document.querySelector<HTMLAnchorElement>('#compare-link')!.href =
  `./loop-clone-jump.html?slides=${N}&per-view=${perView}`;

// --- The deck -------------------------------------------------------------

const stage = document.querySelector<HTMLElement>('#stage')!;
stage.innerHTML = `
  <div class="viewport loop-one" id="viewport" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Prototype deck (one instance per slide)">
    <div class="track" id="track"></div>
  </div>
`;
const viewport = document.querySelector<HTMLElement>('#viewport')!;
const track = document.querySelector<HTMLElement>('#track')!;

const BUFFER_SETS = 2;
const TOTAL_SETS = 2 * BUFFER_SETS + 1;
for (let set = -BUFFER_SETS; set <= BUFFER_SETS; set++) {
  for (let i = 0; i < N; i++) {
    const shell = document.createElement('div');
    shell.className = 'shell';
    shell.dataset.set =
      set === 0 ? 'mid' : set < 0 ? `before${-set}` : `after${set}`;
    shell.dataset.index = String(i);
    shell.setAttribute('aria-hidden', 'true');
    shell.inert = true;
    track.append(shell);
  }
}

interface SlideState {
  el: HTMLElement;
  taps: number;
  tapCountEl: HTMLElement;
  mounted: number;
}

function buildCard(i: number): HTMLElement {
  const card = document.createElement('div');
  card.className = 'loop-one-card';
  card.style.setProperty('--hue', String((i * 360) / N));
  card.innerHTML = `
    <div class="card-top">
      <span class="num">${i + 1}</span>
      <span class="mounted-readout">mounted 1×</span>
    </div>
    <div class="card-body"></div>
    <button type="button" class="tap-btn">Tap (<span class="tap-count">0</span>)</button>
  `;
  const body = card.querySelector<HTMLElement>('.card-body')!;
  if (i === 0) {
    const video = document.createElement('video');
    video.className = 'demo-video';
    video.src = '/clock.mp4';
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    body.append(video);
  } else if (i === 1) {
    const iframe = document.createElement('iframe');
    iframe.className = 'demo-iframe';
    iframe.title = 'Counter since load';
    iframe.srcdoc =
      '<!doctype html><body style="margin:0;font:16px ui-monospace,monospace;' +
      'display:flex;align-items:center;justify-content:center;height:100%;' +
      'background:#111;color:#eee"><div id="counter">0</div>' +
      '<script>let n=0;setInterval(()=>{n+=1;' +
      "document.getElementById('counter').textContent=String(n);},100);" +
      '</script>';
    body.append(iframe);
  } else {
    body.innerHTML = `<p class="plain-body">Slide ${i + 1}</p>`;
  }
  return card;
}

const slides: SlideState[] = [];
for (let i = 0; i < N; i++) {
  const el = document.createElement('div');
  el.className = 'slide';
  el.dataset.index = String(i);
  el.tabIndex = 0;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-roledescription', 'slide');
  el.setAttribute('aria-label', `Slide ${i + 1} of ${N}`);
  el.append(buildCard(i));
  track.append(el);
  const state: SlideState = {
    el,
    taps: 0,
    tapCountEl: el.querySelector('.tap-count')!,
    mounted: 1
  };
  slides.push(state);
  el.querySelector<HTMLButtonElement>('.tap-btn')!.addEventListener(
    'click',
    () => {
      state.taps++;
      state.tapCountEl.textContent = String(state.taps);
    }
  );
}

let W = 0;
let L = 0;

function layout() {
  const ratio = perView === 2 ? 0.5 : 0.85;
  W = Math.max(40, Math.round(viewport.clientWidth * ratio));
  L = N * W;
  track.style.width = `${TOTAL_SETS * L}px`;
  track.querySelectorAll<HTMLElement>('.shell').forEach((shell) => {
    shell.style.flex = `0 0 ${W}px`;
    shell.style.width = `${W}px`;
  });
  slides.forEach((s, i) => {
    s.el.style.width = `${W}px`;
    s.el.style.left = `${BUFFER_SETS * L + i * W}px`;
  });
}

/** k, clamped to the buffer sets available: the nearest of the
 * `TOTAL_SETS` periodic copies of `home` to `centre`, i.e. which shell
 * slot a slide should be translated to sit over. */
function nearestK(home: number, centre: number): number {
  const k = Math.round((centre - home) / L);
  return Math.max(-BUFFER_SETS, Math.min(BUFFER_SETS, k));
}

function translateFor(k: number): string {
  return k ? `${k * L}px 0` : '0px 0';
}

// `place=css`: a step function of scroll position, computed on the
// compositor via a named scroll-timeline on the viewport. One keyframe
// percent pair per slide per buffer set: translate -BUFFER_SETS*L at the
// far "before" end, stepping up by one set length at each boundary, to
// +BUFFER_SETS*L at the far "after" end.
let timelineStyle: HTMLStyleElement | null = null;
function buildCssTimeline() {
  viewport.style.scrollTimeline = '--one-instance-scroll x';
  const max = Math.max(1, TOTAL_SETS * L - viewport.clientWidth);
  const half = viewport.clientWidth / 2;
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  let css = '';
  slides.forEach((s, i) => {
    const home = BUFFER_SETS * L + i * W + W / 2;
    const name = `one-instance-k${i}`;
    let kf = `0%{translate:${translateFor(-BUFFER_SETS)}}`;
    for (let k = -BUFFER_SETS; k < BUFFER_SETS; k++) {
      // The boundary where k stops being nearest and k+1 takes over.
      const boundary = clamp(((home + (k + 0.5) * L - half) / max) * 100);
      kf += `${boundary}%{translate:${translateFor(k)}}`;
      kf += `${Math.min(100, boundary + 0.0005)}%{translate:${translateFor(k + 1)}}`;
    }
    kf += `100%{translate:${translateFor(BUFFER_SETS)}}`;
    css += `@keyframes ${name}{${kf}}`;
    s.el.style.animation = `${name} linear both`;
    s.el.style.animationTimeline = '--one-instance-scroll';
  });
  if (!timelineStyle) {
    timelineStyle = document.createElement('style');
    document.head.append(timelineStyle);
  }
  timelineStyle.textContent = css;
}

// `place=js`: the same step function, applied by hand on every scroll event.
function place() {
  const centre = viewport.scrollLeft + viewport.clientWidth / 2;
  slides.forEach((s, i) => {
    const home = BUFFER_SETS * L + i * W + W / 2;
    s.el.style.translate = translateFor(nearestK(home, centre));
  });
}

function applyMode() {
  if (mode === 'css') buildCssTimeline();
  else place();
}

function currentIndex(): number {
  const wrapped = (((viewport.scrollLeft - BUFFER_SETS * L) % L) + L) % L;
  return Math.round(wrapped / W) % N;
}

// A `scrollLeft` write made synchronously while the module's top-level code
// runs is silently dropped in WebKit (confirmed: track/shell/viewport
// layout is already correct at that point -- scrollWidth is right -- but
// the write itself does not take; the same write from a later task
// succeeds). WebKit evidently needs its first layout+paint to have
// committed before it will honour a scroll write. Deferring the write (and
// the placement that depends on it) by one frame fixes it in both
// browsers; without this, the viewport rests at scrollLeft 0 -- in the
// empty "before" shell set rather than the middle one -- until the first
// settle "corrects" it with a spurious jump.
function settleInitialScroll(left: number) {
  requestAnimationFrame(() => {
    viewport.scrollLeft = left;
    applyMode();
  });
}

layout();
settleInitialScroll(BUFFER_SETS * L);

window.addEventListener('resize', () => {
  const idx = currentIndex();
  layout();
  settleInitialScroll(BUFFER_SETS * L + idx * W);
});

// Jank: a busy main-thread loop, at most once per 300ms, to simulate a long
// task during a flick. CSS placement is compositor-driven and should not
// care; JS placement reads the scroll position from the same thread this
// blocks, and should lag or show a blank frame.
let lastJank = -Infinity;
function maybeJank() {
  if (jank <= 0) return;
  const now = performance.now();
  if (now - lastJank < 300) return;
  lastJank = now;
  const end = now + jank;
  while (performance.now() < end) {
    // busy
  }
}

// Jump back into the middle set by as many set lengths as the viewport has
// drifted into a "before" or "after" shell set, then re-place in the same
// task (for `place=js`; the CSS timeline recomputes on its own, from the
// same scrollLeft, with no extra call needed). A loop, not a single ±L
// step: with BUFFER_SETS > 1 a rest position can in principle be more than
// one set length from the middle set (the physical scroll range is
// TOTAL_SETS long), though in practice a single step has covered every
// case measured so far.
let jumpCount = 0;
function jumpIfNeeded() {
  const pos = viewport.scrollLeft;
  const midStart = BUFFER_SETS * L;
  let next = pos;
  while (next < midStart - 1) {
    next += L;
    jumpCount++;
  }
  while (next >= midStart + L - 1) {
    next -= L;
    jumpCount++;
  }
  if (next !== pos) viewport.scrollLeft = next;
}

// Used at rest (scrollend/debounce), on every Next/Prev press (see
// below), and -- when a mouse drag owns the position -- on every drag
// move and at its release, so a long drag can never carry the scroller
// past the buffer sets, and the jump never cuts a drag's momentum.
function handleSettle() {
  jumpIfNeeded();
  if (mode === 'js') place();
}

viewport.addEventListener(
  'scroll',
  () => {
    maybeJank();
    if (mode === 'js') place();
  },
  { passive: true }
);

// Mouse drag reuses the same Axis/snapPoints machinery as the other
// prototype pages (../drag.ts, ../deck.ts): the shells carry
// `scroll-snap-align`, so `snapPoints()` finds them the same way it finds
// slides or clones on those pages.
const axis = new Axis(viewport, false, false);
const deckForDrag: Deck = { vp: viewport, track, axis, n: N, pageSize: 1 };
let drag: Drag | undefined;
if (dragEnabled) {
  drag = installDrag(deckForDrag, 'scripted', {
    onMove: handleSettle,
    onEnd: handleSettle
  });
}

onSettle(viewport, () => {
  if (drag?.handleSettle()) return;
  handleSettle();
});

// No waiting at the end: Next/Prev must keep advancing across the seam
// without waiting for the rest jump. Measured: once scrollLeft is clamped
// to the track's physical end, a `scrollTo` call asking to go further is a
// no-op the browser does not even fire a `scroll` or `scrollend` event
// for, in Chromium or WebKit -- so `onSettle`'s jump never runs again, and
// rapid presses in one direction (faster than the browser's own smooth-
// scroll settles between them) can pin the deck there for good, with no
// event left to recover on. A big enough BUFFER_SETS makes this rare, but
// cannot make it impossible: correct first, synchronously, so every press
// always has its own full set of room to advance into, whether or not a
// settle ever got the chance to.
document.querySelector('#prev')!.addEventListener('click', () => {
  handleSettle();
  viewport.scrollTo({ left: viewport.scrollLeft - W, behavior: 'smooth' });
});
document.querySelector('#next')!.addEventListener('click', () => {
  handleSettle();
  viewport.scrollTo({ left: viewport.scrollLeft + W, behavior: 'smooth' });
});

// Blank-frame detector: every rAF, sample the viewport's left edge, centre
// and right edge (a peeking neighbour must be a real slide, not a shell)
// and check whether a shell -- not a real slide -- is what paints there.
let blankFrames = 0;
let flashTimer = 0;
const hud = document.querySelector<HTMLElement>('#hud')!;

function samplePoints(): { x: number; y: number }[] {
  const rect = viewport.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  return [
    { x: rect.left + 10, y },
    { x: rect.left + rect.width / 2, y },
    { x: rect.right - 10, y }
  ];
}

// "Off-scroll" detector: a visible slide's on-screen left must only change
// by the scroll delta, plus whatever its own `translate` deliberately
// changed by (the jump flips every slide's translate by one set length in
// the same task it moves scrollLeft by one set length, and the two are
// designed to cancel out exactly -- see FINDINGS.md and the jump-origin
// bug this page's history fixed). Anything else -- translate and
// scrollLeft disagreeing about where a visible slide should sit -- is
// exactly the glitch the maintainer saw on the phone, so flag and flash on
// it the same as a blank frame. (A simpler check that ignores translate
// entirely would flag every normal jump that happens to catch a peeking
// neighbour on screen, since a jump intentionally changes both scrollLeft
// and translate together; that would make this detector useless on a real
// device, so it accounts for the intentional change.)
//
// The baseline (previous scrollLeft, rects, translates) is captured lazily,
// on tick's first call, not eagerly here at module load: this module runs
// before the stylesheet is guaranteed to be applied, so an eager capture
// read every slide's pre-CSS layout (all stacked at the same `left`,
// `translate: none`) as the baseline, and the first real tick -- once
// layout and `settleInitialScroll` have both run -- compared real,
// correctly placed slides against that bogus baseline, flagging every
// single page load as a false glitch, on every slide onscreen at the time.
let offScrollFrames = 0;
let havePrevFrame = false;
let prevScrollLeft = 0;
let prevSlideLefts = slides.map(() => 0);
let prevSlideTranslates = slides.map(() => 0);

function flashHud() {
  hud.classList.add('warn');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => hud.classList.remove('warn'), 250);
}

function tick() {
  // Read rects and the computed `translate` for every slide before the
  // `elementFromPoint` calls below, since each one forces a layout.
  const rect = viewport.getBoundingClientRect();
  const scrollLeft = viewport.scrollLeft;
  const scrollDelta = scrollLeft - prevScrollLeft;
  let offScroll = false;
  slides.forEach((s, i) => {
    const r = s.el.getBoundingClientRect();
    const translate = parseFloat(getComputedStyle(s.el).translate) || 0;
    const visible = r.right > rect.left && r.left < rect.right;
    if (havePrevFrame) {
      const moveDelta = r.left - prevSlideLefts[i];
      const translateDelta = translate - prevSlideTranslates[i];
      const expected = -scrollDelta + translateDelta;
      if (visible && Math.abs(moveDelta - expected) > 2) {
        offScroll = true;
      }
    }
    prevSlideLefts[i] = r.left;
    prevSlideTranslates[i] = translate;
  });
  prevScrollLeft = scrollLeft;
  havePrevFrame = true;

  let hitShell = false;
  for (const p of samplePoints()) {
    const el = document.elementFromPoint(p.x, p.y);
    if (!el || el.closest('.slide')) continue;
    if (el.closest('.shell')) hitShell = true;
  }

  if (hitShell) blankFrames++;
  if (offScroll) offScrollFrames++;
  if (hitShell || offScroll) flashHud();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

document.querySelector('#reset')!.addEventListener('click', () => {
  jumpCount = 0;
  blankFrames = 0;
  offScrollFrames = 0;
});

const tooFew = L < viewport.clientWidth + W;
hud.classList.toggle('too-few', tooFew);

const scrollendSupported = settleSource === 'scrollend';
setInterval(() => {
  hud.textContent = [
    `mode ${mode}` +
      (placeRequested === 'css' && mode === 'js'
        ? ' (css requested, animation-timeline unsupported -> fell back to js)'
        : ''),
    `animation-timeline: scroll() ${cssSupported ? 'yes' : 'no'} · scrollend ${scrollendSupported ? 'yes' : 'no'} (settle via ${settleSource}) · drag ${dragEnabled ? 'on' : 'off'}`,
    `scrollLeft ${Math.round(viewport.scrollLeft)} · set length ${L} · slide width ${W}`,
    `index ${currentIndex() + 1} / ${N} · jumps ${jumpCount} · blank frames ${blankFrames} · off-scroll frames ${offScrollFrames}`,
    tooFew
      ? 'WARNING: too few slides for one-instance loop at this viewport/per-view (one set is narrower than viewport + one slide)'
      : ''
  ]
    .filter(Boolean)
    .join('\n');
}, 200);

declare global {
  interface Window {
    __loopOne: {
      mounted(): number[];
      index(): number;
      jumpCount(): number;
      blankFrames(): number;
      offScrollFrames(): number;
      reset(): void;
    };
  }
}

window.__loopOne = {
  mounted: () => slides.map((s) => s.mounted),
  index: currentIndex,
  jumpCount: () => jumpCount,
  blankFrames: () => blankFrames,
  offScrollFrames: () => offScrollFrames,
  reset: () => {
    jumpCount = 0;
    blankFrames = 0;
    offScrollFrames = 0;
  }
};
