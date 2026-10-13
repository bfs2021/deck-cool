// THROWAWAY (#138). Load, memory and per-frame script cost, in Chromium
// (LoAF and `performance.memory` are Chromium-only; see RESULTS.md).
// Bundle size is separate (bundle-size.mjs: a build-time measurement, not
// a browser one).
//
// Heap is read from CDP's `Performance.getMetrics` (`JSHeapUsedSize`), not
// `performance.memory.usedJSHeapSize`: Chromium now coarsens that API's
// value for privacy (confirmed here -- it returned a flat, identical
// number for every deck and slide count during validation), so only the
// CDP figure is real.
//
// "Parse+execute" is not split from "init": `bench-init`'s duration
// (`markInitStart`/`markInitEnd` around each deck script's own setup) is
// the main-thread time from the module's first line to the library being
// ready for input, module evaluation and the library's own constructor
// included. Splitting parse from execute needs the `Profiler` CDP domain's
// per-function timing, which this bench does not attempt (noted as a
// simplification in RESULTS.md).

import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { test } from '@playwright/test';
import { DECKS, urlFor } from './decks';
import type {} from '../src/bench/harness';

const OUT = fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });

function record(row: Record<string, unknown>) {
  appendFileSync(`${OUT}cost.jsonl`, `${JSON.stringify(row)}\n`);
}

for (const deck of DECKS) {
  for (const slides of [6, 10, 50]) {
    test(`[${deck.key}] load+heap slides=${slides}`, async ({
      page,
      browserName
    }) => {
      if (browserName !== 'chromium') return;
      await page.goto(urlFor(deck, slides));
      await page.waitForFunction(() => window.__bench !== undefined, null, {
        timeout: 15_000
      });
      await page.waitForTimeout(300); // let the page settle after init
      const initDurationMs = await page.evaluate(() =>
        window.__bench.initDuration()
      );
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const { metrics } = await cdp.send('Performance.getMetrics');
      const heapBytes =
        metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? null;
      record({ deck: deck.key, slides, initDurationMs, heapBytes });
    });
  }

  test(`[${deck.key}] script time idle vs moving`, async ({
    page,
    browserName
  }) => {
    if (browserName !== 'chromium') return;
    await page.goto(urlFor(deck, 6));
    await page.waitForFunction(() => window.__bench !== undefined, null, {
      timeout: 15_000
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => window.__bench.reset());
    await page.waitForTimeout(1000); // idle window
    const idle = await page.evaluate(() => window.__bench.loaf());

    await page.evaluate(() => window.__bench.reset());
    const began = Date.now();
    while (Date.now() - began < 1000) {
      await page.click('#next');
      await page.waitForTimeout(80);
    }
    const moving = await page.evaluate(() => window.__bench.loaf());

    record({ deck: deck.key, kind: 'script-time', idle, moving });
  });
}
