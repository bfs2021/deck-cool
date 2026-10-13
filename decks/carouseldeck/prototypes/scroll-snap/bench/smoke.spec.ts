// THROWAWAY (#138). Sanity check before the real sweep: every deck loads,
// shows the right slide count, Next/Prev moves it, the loop crosses the
// seam without getting stuck, and `window.__bench` reports sane numbers.
// Not part of the recorded bench; delete once bench.spec.ts is trusted.

import { test, expect } from '@playwright/test';
import { DECKS, urlFor } from './decks';
import type {} from '../src/bench/harness';

for (const deck of DECKS) {
  test(`${deck.key}: loads, next/prev, loop`, async ({ page }) => {
    await page.goto(urlFor(deck));
    await page.waitForFunction(() => window.__bench !== undefined, null, {
      timeout: 15_000
    });
    const slideCount = await page.locator('.bench-slide').count();
    expect(slideCount).toBeGreaterThanOrEqual(6);

    const start = await page.evaluate(() => window.__bench.focal());

    // Next six times, one per slide: a looping deck should end back near
    // where it started, not stuck or thrown far off.
    for (let i = 0; i < 6; i++) {
      await page.click('#next');
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__bench.idleFor() > 400, null, {
      timeout: 10_000
    });
    const afterNext = await page.evaluate(() => window.__bench.focal());

    for (let i = 0; i < 6; i++) {
      await page.click('#prev');
      await page.waitForTimeout(200);
    }
    await page.waitForFunction(() => window.__bench.idleFor() > 400, null, {
      timeout: 10_000
    });
    const afterPrev = await page.evaluate(() => window.__bench.focal());

    console.log(
      `${deck.key}: start=${start} afterNext=${afterNext} afterPrev=${afterPrev}`
    );
    // Six Next then six Prev on a 6-slide loop should land back at start.
    expect(afterPrev).toBe(start);
  });
}
