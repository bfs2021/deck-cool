// THROWAWAY (#138). The chrome every bench page shares: banner, title, a
// stage for the deck's own markup, Prev/Next/Reset and a HUD. Deliberately
// no toggles: the bench's whole point is one fixed, identical configuration
// per deck (content.ts), read by `?slides=`, `?jank=` is driven by
// Playwright through `window.__bench.jank()`, not a URL param.

import './style.css';

export function renderChrome(title: string): {
  stage: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  hud: HTMLElement;
} {
  document.title = `${title} | smoothness bench (THROWAWAY, #138)`;
  document.body.innerHTML = `
    <div class="bench-banner">THROWAWAY bench for #138. Not package code.</div>
    <nav class="bench-nav">
      <a href="./bench.html">Bench index</a>
    </nav>
    <h1 class="bench-title">${title}</h1>
    <div id="stage"></div>
    <div class="buttons">
      <button type="button" id="prev">Prev</button>
      <button type="button" id="next">Next</button>
      <button type="button" id="reset">Reset metrics</button>
    </div>
    <div class="hud" id="hud" aria-live="off"></div>
  `;
  const stage = document.querySelector<HTMLElement>('#stage')!;
  const prev = document.querySelector<HTMLButtonElement>('#prev')!;
  const next = document.querySelector<HTMLButtonElement>('#next')!;
  const hud = document.querySelector<HTMLElement>('#hud')!;
  document.querySelector('#reset')!.addEventListener('click', () => {
    window.__bench?.reset();
  });
  return { stage, prev, next, hud };
}

/** Polls `window.__bench` and renders a one-line-per-metric HUD, the same
 * shape on every deck, for the manual phone page and for a human watching a
 * desktop run. */
export function startHud(hud: HTMLElement, extra: () => string = () => '') {
  setInterval(() => {
    const p = window.__bench;
    if (!p || p.isHudPaused()) return;
    const loaf = p.loaf();
    const heap = p.heap();
    hud.textContent = [
      `slide ${p.focal() + 1} · logical ${p.logical().toFixed(2)}`,
      `frames ${p.m.frames} · max step ${p.m.maxStep.toFixed(2)} · reversals ${p.m.reversals} · blank frames ${p.m.blankFrames}`,
      `idle for ${p.idleFor().toFixed(0)} ms`,
      loaf
        ? `LoAF count ${loaf.count} · blocking ${loaf.totalBlocking.toFixed(0)} ms`
        : 'LoAF: not supported here',
      heap !== null
        ? `heap ${(heap / 1048576).toFixed(1)} MB`
        : 'heap: not supported here',
      extra()
    ]
      .filter(Boolean)
      .join('\n');
  }, 200);
}
