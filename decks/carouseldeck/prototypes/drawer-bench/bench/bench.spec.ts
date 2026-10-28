// THROWAWAY (#233). The drawer bench's own run: every deck, every
// scenario, every load level, >=5 reps. Chromium CDP traces every run
// (../../scroll-snap/bench/trace.ts, reused unchanged: the method #137
// validated and #138 used, not a new one); this bench is Chromium-only
// (#233's brief is a Chromium trace bench, same as #138's; there is no
// Firefox/WebKit subset here -- a drawer's touch scenarios need CDP's
// trusted touch either way, same reasoning as carouseldeck's
// `chromiumOnly` scenarios). One JSON line per run, appended to
// results/chromium.jsonl.
//
// Filter a run with Playwright's own `--grep`, e.g. `--grep '\[vaul\]'`
// for one deck, or `--grep 'touch-drag'` for one scenario, so a sweep can
// be sharded into runs under ten minutes each.

import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { test } from '@playwright/test';
import { analyzeMotion, captureTrace } from '../../scroll-snap/bench/trace';
import { DECKS } from './decks';
import { LOADS, REPS, geometry, scenarios, settle } from './scenarios';
import type {} from '../src/harness';

const OUT = fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });

function record(row: Record<string, unknown>): void {
  appendFileSync(`${OUT}chromium.jsonl`, `${JSON.stringify(row)}\n`);
}

for (const deck of DECKS) {
  for (const scenario of scenarios) {
    for (const load of LOADS) {
      for (let rep = 0; rep < REPS; rep++) {
        test(`[${deck.key}] ${scenario.name} load=${load} rep=${rep}`, async ({
          page
        }) => {
          await page.goto(deck.url);
          await page.waitForFunction(() => window.__bench !== undefined, null, {
            timeout: 15_000
          });
          const initDurationMs = await page.evaluate(() =>
            window.__bench.initDuration()
          );

          await scenario.setup(page);
          const g =
            scenario.needsGeometry === false ? null : await geometry(page);
          await page.evaluate(() => window.__bench.reset());
          await page.evaluate((ms) => window.__bench.jank(ms), load);

          const began = Date.now();
          const traceCdp = await page.context().newCDPSession(page);
          const events = await captureTrace(traceCdp, async () => {
            await scenario.run(page, g);
            await settle(page);
          });
          await traceCdp.detach();
          const trace = analyzeMotion(events);
          const settleMs = Date.now() - began;
          await page.evaluate(() => window.__bench.jank(0));

          const raf = await page.evaluate(() => ({ ...window.__bench.m }));
          const loaf = await page.evaluate(() => window.__bench.loaf());
          const opennessAfter = await page.evaluate(() =>
            window.__bench.openness()
          );

          record({
            deck: deck.key,
            scenario: scenario.name,
            load,
            rep,
            initDurationMs,
            settleMs,
            opennessAfter,
            raf: { ...raf, blankFrames: 0 },
            loaf,
            trace
          });
        });
      }
    }
  }
}
