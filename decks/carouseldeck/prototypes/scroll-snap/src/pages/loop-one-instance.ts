// THROWAWAY. Loop with one real instance per slide.
//
// Three sets of empty, inert, aria-hidden shells (before / mid / after) are
// the only scroll-snap targets. The real slides -- mounted once, never
// moved in the DOM -- have `scroll-snap-align: none` and sit over whichever
// shell is nearest the viewport, placed with `translate`:
//
// - `place=css`: a named scroll-timeline on the viewport drives each
//   slide's translate with step keyframes, computed on the compositor.
//   Falls back to `js` where `animation-timeline: scroll()` is unsupported.
// - `place=js`: a scroll listener recomputes every slide's translate.
//
// At rest (scrollend, or the debounce fallback in ../settle), the scroll
// position jumps back by one set length into the middle set, same as
// loop-clone-jump.ts's normalize -- but nothing is cloned, so every slide
// (its video, its iframe) mounts exactly once.

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

const SETS = ['before', 'mid', 'after'] as const;
for (const set of SETS) {
  for (let i = 0; i < N; i++) {
    const shell = document.createElement('div');
    shell.className = 'shell';
    shell.dataset.set = set;
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
  track.style.width = `${3 * L}px`;
  track.querySelectorAll<HTMLElement>('.shell').forEach((shell) => {
    shell.style.flex = `0 0 ${W}px`;
    shell.style.width = `${W}px`;
  });
  slides.forEach((s, i) => {
    s.el.style.width = `${W}px`;
    s.el.style.left = `${L + i * W}px`;
  });
}

// `place=css`: a step function of scroll position, computed on the
// compositor via a named scroll-timeline on the viewport. One keyframe
// percent pair per slide: translate -L before its "before" window, 0 over
// its middle window, +L after it.
let timelineStyle: HTMLStyleElement | null = null;
function buildCssTimeline() {
  viewport.style.scrollTimeline = '--one-instance-scroll x';
  const max = Math.max(1, 3 * L - viewport.clientWidth);
  const half = viewport.clientWidth / 2;
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  let css = '';
  slides.forEach((s, i) => {
    const centre = L + i * W + W / 2;
    const a = clamp(((centre - L / 2 - half) / max) * 100);
    const b = clamp(((centre + L / 2 - half) / max) * 100);
    const aEnd = Math.min(100, a + 0.0005);
    const bEnd = Math.min(100, b + 0.0005);
    const name = `one-instance-k${i}`;
    css +=
      `@keyframes ${name}{` +
      `0%{translate:${-L}px 0}${a}%{translate:${-L}px 0}` +
      `${aEnd}%{translate:0 0}${b}%{translate:0 0}` +
      `${bEnd}%{translate:${L}px 0}100%{translate:${L}px 0}}`;
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
    const home = L + i * W + W / 2;
    let k = 0;
    if (home < centre - L / 2) k = 1;
    else if (home >= centre + L / 2) k = -1;
    s.el.style.translate = k ? `${k * L}px 0` : '0px 0';
  });
}

function applyMode() {
  if (mode === 'css') buildCssTimeline();
  else place();
}

function currentIndex(): number {
  const wrapped = (((viewport.scrollLeft - L) % L) + L) % L;
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
settleInitialScroll(L);

window.addEventListener('resize', () => {
  const idx = currentIndex();
  layout();
  settleInitialScroll(L + idx * W);
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

// Jump back by one set length into the middle set when the viewport has
// drifted into a "before" or "after" shell set, then re-place in the same
// task (for `place=js`; the CSS timeline recomputes on its own, from the
// same scrollLeft, with no extra call needed).
let jumpCount = 0;
function jumpIfNeeded() {
  const pos = viewport.scrollLeft;
  if (pos < L - 1) {
    viewport.scrollLeft = pos + L;
    jumpCount++;
  } else if (pos >= 2 * L - 1) {
    viewport.scrollLeft = pos - L;
    jumpCount++;
  }
}

// Used at rest (scrollend/debounce), and -- when a mouse drag owns the
// position -- on every drag move and at its release, so a long drag can
// never carry the scroller out of the three sets, and the jump never
// cuts a drag's momentum.
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

document.querySelector('#prev')!.addEventListener('click', () => {
  viewport.scrollTo({ left: viewport.scrollLeft - W, behavior: 'smooth' });
});
document.querySelector('#next')!.addEventListener('click', () => {
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
