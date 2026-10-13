// THROWAWAY (#138). The four input classes, driven the same way on every
// deck: real input at `#viewport`'s centre, or a real click on `#next`.
// Modelled on ../measure/scroll-snap.spec.ts's `wheelFlick`/`mouseDrag`/
// touch-flick conventions (#3).

import type { Page } from '@playwright/test';

export interface Geometry {
  cx: number;
  cy: number;
}

export async function geometry(page: Page): Promise<Geometry> {
  const box = await page.locator('#viewport').boundingBox();
  if (!box) throw new Error('#viewport has no box');
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}

/** Advance (n - 1) slides with Next, landing one step before a full lap:
 * whatever a deck's own index labelling is, this is "just before the
 * seam" the same way on every engine. */
export async function goToSeam(page: Page, n: number): Promise<void> {
  for (let i = 0; i < n - 1; i++) {
    await page.click('#next');
    await page.waitForTimeout(60);
  }
  await page.waitForFunction(() => window.__bench.idleFor() > 300, null, {
    timeout: 15_000
  });
  await page.evaluate(() => window.__bench.reset());
}

export async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(100);
  await page.waitForFunction(() => window.__bench.idleFor() > 400, null, {
    timeout: 15_000
  });
}

export interface Scenario {
  name: string;
  /** Whether a trusted touch flick is available (Chromium CDP only). */
  chromiumOnly?: boolean;
  run(page: Page, g: Geometry): Promise<void>;
}

export const scenarios: Scenario[] = [
  {
    name: 'next-seam',
    async run(page) {
      for (let i = 0; i < 6; i++) {
        await page.click('#next');
        await page.waitForTimeout(40);
      }
    }
  },
  {
    name: 'drag-throw',
    async run(page, g) {
      // A fast flick: 260px over six 8ms steps, matching the existing
      // suite's `drag-flick-back` (#3's measure/scroll-snap.spec.ts).
      const distance = 260;
      const steps = 6;
      const x0 = g.cx + distance / 2;
      const y0 = g.cy;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(x0 - (distance * i) / steps, y0);
        await page.waitForTimeout(8);
      }
      await page.mouse.up();
    }
  },
  {
    name: 'wheel',
    async run(page, g) {
      await page.mouse.move(g.cx, g.cy);
      for (let i = 0; i < 10; i++) {
        await page.mouse.wheel(120, 0);
        await page.waitForTimeout(16);
      }
    }
  },
  {
    name: 'touch-flick',
    chromiumOnly: true,
    async run(page, g) {
      const cdp = await page.context().newCDPSession(page);
      const span = 150;
      const at = (t: number) => [{ x: g.cx - span * t, y: g.cy, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: at(-1)
      });
      for (let i = 1; i <= 10; i++) {
        await page.waitForTimeout(4);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: at(-1 + i / 5)
        });
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
    }
  }
];

export const LOADS = [0, 100, 200] as const;
export const REPS = 5;
