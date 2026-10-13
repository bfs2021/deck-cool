// THROWAWAY (#138). One probe, attached the same way on every bench deck,
// whatever moves the slides (native scroll, a transform, a translate):
//
// - Position is read from the DOM, not from a library's internals: the
//   `.bench-slide[data-bench-index]` nearest the viewport's start edge,
//   the same "nearest start edge" rule `../deck.ts` and `../page.ts` use for
//   the clone-and-jump prototype's jump detector (research #137, metric 2:
//   "visual position per frame... engine-neutral: works for scroll and for
//   transforms"). A library's own loop clone, made with `cloneNode`, carries
//   the attribute with it, so a clone is just another slide to this probe.
// - Next and Prev are real clicks on `#next`/`#prev`, wired by each deck's
//   own script to that library's own method: the bench never calls a
//   library's API directly, so Playwright drives every deck the same way.
// - Mouse, wheel and touch are real input dispatched at `#viewport`, so
//   whatever a library's own listeners do with them, they do for real, same
//   as a user.
//
// What this probe cannot see: a compositor-driven frame between two rAF
// ticks (research #137, "why the thread matters"). Chromium metrics come
// from a trace (`bench/trace.ts`), not from here; this is the main-thread
// view, used as-is in Chromium for the rivals' and carouseldeck's own
// rAF-driven motion, and labelled "main-thread only" in Firefox and WebKit
// for every reading (`bench/RESULTS.md`).

import { BENCH_INDEX_ATTR } from './content';

export interface BenchMetrics {
  frames: number;
  /** Largest per-frame movement, in slide units. */
  maxStep: number;
  /** Signed distance travelled, in slide units. */
  travel: number;
  /** Sign changes of the per-frame movement: a re-snap or overshoot. */
  reversals: number;
  /** Frames where none of the three sample points hit a `.bench-slide`. */
  blankFrames: number;
}

export interface BenchProbe {
  m: BenchMetrics;
  reset(): void;
  logical(): number;
  focal(): number;
  idleFor(): number;
  /** Turns the busy-loop jank timer on (ms per ~250ms tick) or off (0). */
  jank(ms: number): void;
  /** Arms one-shot listeners on the viewport that mark `bench-input` (for
   * the Chromium trace's input-to-first-moved-frame) on the next pointer,
   * wheel or touch event. */
  armInputMark(): void;
  /** Chromium only: `long-animation-frame` entries since the last reset. */
  loaf(): { count: number; totalBlocking: number } | null;
  /** Chromium only: `performance.memory.usedJSHeapSize`. */
  heap(): number | null;
  /** `bench-init`'s duration, once `markInitEnd` has run. */
  initDuration(): number | null;
  /** Mutes the HUD's own DOM writes: a trace capture sees any paint as a
   * frame, and the HUD's own `setInterval` would otherwise show up as a
   * spurious ~200ms stall in every deck's trace (found while validating
   * this bench; see RESULTS.md's method notes). */
  pauseHud(paused: boolean): void;
  isHudPaused(): boolean;
}

declare global {
  interface Window {
    __bench: BenchProbe;
  }
  interface Performance {
    // Chromium only; absent elsewhere.
    memory?: { usedJSHeapSize: number };
  }
}

export function markInitStart(): void {
  performance.mark('bench-init-start');
}

export function markInitEnd(): void {
  performance.mark('bench-init-end');
  try {
    performance.measure('bench-init', 'bench-init-start', 'bench-init-end');
  } catch {
    // The start mark is missing: leave initDuration() reporting null.
  }
}

const wrap = (d: number, n: number) => ((((d + n / 2) % n) + n) % n) - n / 2;

export function attachHarness(opts: { viewport: HTMLElement; n: number }) {
  const { viewport, n } = opts;
  const m: BenchMetrics = {
    frames: 0,
    maxStep: 0,
    travel: 0,
    reversals: 0,
    blankFrames: 0
  };

  function logical(): number {
    const vb = viewport.getBoundingClientRect();
    const els = viewport.querySelectorAll<HTMLElement>(
      `.bench-slide[${BENCH_INDEX_ATTR}]`
    );
    let bestStart = Infinity;
    let bestIndex = NaN;
    let bestSize = 1;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // detached or hidden
      const start = r.left - vb.left;
      if (Math.abs(start) < Math.abs(bestStart)) {
        bestStart = start;
        bestIndex = Number(el.getAttribute(BENCH_INDEX_ATTR));
        bestSize = r.width || 1;
      }
    }
    if (Number.isNaN(bestIndex)) return NaN;
    const value = bestIndex - bestStart / bestSize;
    return ((value % n) + n) % n;
  }

  function samplePoints(): { x: number; y: number }[] {
    const r = viewport.getBoundingClientRect();
    const y = r.top + r.height / 2;
    return [
      { x: r.left + 10, y },
      { x: r.left + r.width / 2, y },
      { x: r.right - 10, y }
    ];
  }

  let last = logical();
  let lastStep = 0;
  let lastChangeAt = performance.now();
  let raf = 0;

  function tick() {
    const now = logical();
    if (!Number.isNaN(now)) {
      const step = wrap(now - last, n);
      if (Math.abs(step) > 0.0005) lastChangeAt = performance.now();
      m.frames++;
      m.travel += step;
      m.maxStep = Math.max(m.maxStep, Math.abs(step));
      if (
        Math.sign(step) !== 0 &&
        Math.sign(lastStep) !== 0 &&
        Math.sign(step) !== Math.sign(lastStep)
      ) {
        m.reversals++;
      }
      if (Math.abs(step) > 0.0005) lastStep = step;
      last = now;
    }
    let hit = false;
    for (const p of samplePoints()) {
      const el = document.elementFromPoint(p.x, p.y);
      if (el && el.closest('.bench-slide')) hit = true;
    }
    if (!hit) m.blankFrames++;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  // Jank: a main-thread busy loop, at most once per ~250ms, while armed.
  // Timer-based (not tied to a scroll event), so it runs "on a timer during
  // the motion" the same way for every deck, native-scroll or
  // transform-driven alike (#138's brief).
  let jankMs = 0;
  setInterval(() => {
    if (jankMs <= 0) return;
    const end = performance.now() + jankMs;
    while (performance.now() < end) {
      // busy
    }
  }, 250);

  // Chromium only: collect long-animation-frame entries for the main-thread
  // cost metric (research #137, item 8). Feature-detected; absent in
  // Firefox and WebKit.
  let loafCount = 0;
  let loafBlocking = 0;
  if (
    'PerformanceObserver' in window &&
    PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
  ) {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[] &
        {
          blockingDuration?: number;
        }[]) {
        loafCount++;
        loafBlocking +=
          (entry as { blockingDuration?: number }).blockingDuration ?? 0;
      }
    });
    obs.observe({ type: 'long-animation-frame', buffered: true });
  }

  let hudPaused = false;

  let inputMarkArmed = false;
  function armInputMark() {
    if (inputMarkArmed) return;
    inputMarkArmed = true;
    const next = document.querySelector('#next');
    const prev = document.querySelector('#prev');
    const mark = () => {
      performance.mark('bench-input');
      viewport.removeEventListener('pointerdown', mark);
      viewport.removeEventListener('wheel', mark);
      viewport.removeEventListener('touchstart', mark);
      next?.removeEventListener('click', mark);
      prev?.removeEventListener('click', mark);
      inputMarkArmed = false;
    };
    viewport.addEventListener('pointerdown', mark, { passive: true });
    viewport.addEventListener('wheel', mark, { passive: true });
    viewport.addEventListener('touchstart', mark, { passive: true });
    // Next/Prev: the click happens on the button, not the viewport.
    next?.addEventListener('click', mark, { capture: true });
    prev?.addEventListener('click', mark, { capture: true });
  }

  window.__bench = {
    m,
    reset() {
      m.frames = 0;
      m.maxStep = 0;
      m.travel = 0;
      m.reversals = 0;
      m.blankFrames = 0;
      lastStep = 0;
      loafCount = 0;
      loafBlocking = 0;
    },
    logical,
    focal: () => Math.round(logical()) % n,
    idleFor: () => performance.now() - lastChangeAt,
    jank: (ms) => {
      jankMs = ms;
    },
    armInputMark,
    loaf: () =>
      'PerformanceObserver' in window &&
      PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
        ? { count: loafCount, totalBlocking: loafBlocking }
        : null,
    heap: () => performance.memory?.usedJSHeapSize ?? null,
    initDuration: () => {
      const [entry] = performance.getEntriesByName('bench-init', 'measure');
      return entry ? entry.duration : null;
    },
    pauseHud: (paused) => {
      hudPaused = paused;
    },
    isHudPaused: () => hudPaused
  };

  // Not used by this module, but keeps `raf`'s only write from being
  // reported dead by a linter that does not see `attachHarness` never
  // cancels it: the page never tears the deck down.
  void raf;
}
