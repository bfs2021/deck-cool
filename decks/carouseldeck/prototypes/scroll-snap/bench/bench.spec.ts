// THROWAWAY (#138). The smoothness bench's own run: every deck, every
// scenario, every load level, >=5 reps. Chromium gets a CDP trace
// (trace.ts); Firefox and WebKit get the rAF-based subset only (no trace,
// no CDP, no trusted touch -- research #137). One JSON line per run,
// appended to results/<browser>.jsonl; RESULTS.md is written from those.
//
// Filter a run with Playwright's own `--grep`, e.g.
// `--grep '\[embla\]'` for one deck, so a sweep can be sharded into
// foreground runs under ten minutes each.

import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { test } from '@playwright/test';
import { DECKS, urlFor } from './decks';
import {
  LOADS,
  REPS,
  geometry,
  goToSeam,
  scenarios,
  settle
} from './scenarios';
import { analyzeMotion, captureTrace } from './trace';
import type {} from '../src/bench/harness';

const OUT = fileURLToPath(new URL('./results/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const SLIDES = 6;

function record(browserName: string, row: Record<string, unknown>) {
  appendFileSync(`${OUT}${browserName}.jsonl`, `${JSON.stringify(row)}\n`);
}

for (const deck of DECKS) {
  for (const scenario of scenarios) {
    for (const load of LOADS) {
      for (let rep = 0; rep < REPS; rep++) {
        test(`[${deck.key}] ${scenario.name} load=${load} rep=${rep}`, async ({
          page,
          browserName
        }, testInfo) => {
          if (scenario.chromiumOnly && browserName !== 'chromium') {
            testInfo.skip(true, 'trusted touch is Chromium-only (CDP)');
            return;
          }

          await page.goto(urlFor(deck, SLIDES));
          await page.waitForFunction(() => window.__bench !== undefined, null, {
            timeout: 15_000
          });
          const initDurationMs = await page.evaluate(() =>
            window.__bench.initDuration()
          );

          await goToSeam(page, SLIDES);
          const g = await geometry(page);
          await page.evaluate(() => window.__bench.armInputMark());
          await page.evaluate((ms) => window.__bench.jank(ms), load);
          // The HUD's own `setInterval` DOM write would show up in a
          // Chromium trace as a spurious ~200ms stall (found while
          // validating this bench): mute it for the capture window.
          await page.evaluate(() => window.__bench.pauseHud(true));

          const began = Date.now();
          let trace: ReturnType<typeof analyzeMotion> | null = null;
          if (browserName === 'chromium') {
            const cdp = await page.context().newCDPSession(page);
            const events = await captureTrace(cdp, async () => {
              await scenario.run(page, g);
              await settle(page);
            });
            trace = analyzeMotion(events);
          } else {
            await scenario.run(page, g);
            await settle(page);
          }
          const settleMs = Date.now() - began;
          await page.evaluate(() => window.__bench.jank(0));
          await page.evaluate(() => window.__bench.pauseHud(false));

          const raf = await page.evaluate(() => ({ ...window.__bench.m }));
          const loaf = await page.evaluate(() => window.__bench.loaf());

          record(browserName, {
            deck: deck.key,
            scenario: scenario.name,
            load,
            rep,
            initDurationMs,
            settleMs,
            raf,
            loaf,
            trace
          });
        });
      }
    }
  }
}
