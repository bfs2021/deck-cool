import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { expect, vi } from 'vitest';
import type { TestContext } from 'vitest';
import {
  expectRestOnASlide,
  sleep,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';

// Shared by the arrival-*.test.tsx files, one file until it was split for
// CI to shard vitest (#134).
//
// A scroll's `scrollend` comes a few milliseconds after the viewport arrives
// where the scroll was going (#41). Whatever the deck is asked to do in that
// moment, a press, a new controlled index or the user's own scroll, it must
// still come to rest on a slide, report the slide it shows, and have
// snapping on. The moment is a few milliseconds wide, so each test does its
// second move at each of these delays after the first, across the time a
// step takes, and checks some came after the viewport arrived. None listens
// for a scroll event or reads layout before the second move: in Chromium
// either changes which scrolls the browser ends, and hides the race.
export const DELAYS = Array.from({ length: 21 }, (_, i) => 260 + i * 4);
export const SWEEP_MS = 120_000;

/** Where the slide labelled `label` rests, as a scroll position along the
 * deck, worked out from where it is now. */
export function restOf(viewport: HTMLElement, label: string) {
  const slide = screen.getByRole('group', { name: label });
  const box = slide.getBoundingClientRect();
  const view = viewport.getBoundingClientRect();
  const rtl = getComputedStyle(viewport).direction === 'rtl';
  return (
    viewport.scrollLeft + (rtl ? box.right - view.right : box.left - view.left)
  );
}

export const OnIndexChange = createContext<(index: number) => void>(() => {});

/** A test deck, inside a `dir` wrapper, reporting to `OnIndexChange`. */
export function Uncontrolled({
  rtl = false,
  ...props
}: Parameters<typeof TestDeck>[0] & { rtl?: boolean }) {
  const onIndexChange = useContext(OnIndexChange);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'}>
      <TestDeck onIndexChange={onIndexChange} {...props} />
    </div>
  );
}

/** Holds the main thread for `ms`, as a long task on the page does. */
export function busy(ms: number) {
  const until = performance.now() + ms;
  while (performance.now() < until);
}

// A starved runner delays `sleep`'s own timer along with everything else
// (#124): the second press then lands well after `delay` really measures,
// and past the first's own settle, however short `delay` reads. Whether it
// held is read back from the clock, not guessed from the deck: `sleep(260)`
// taking 260ms, give or take a frame, is the precondition every delay in the
// sweep relies on. A delay whose sleep overran by more than this retries, up
// to this many tries, and is skipped, on its own, rather than failed, once
// every try still has.
const PRECONDITION_OVERRUN_MS = 60;
const PRECONDITION_TRIES = 3;

/**
 * One attempt at `delay`: renders `deck`, presses `button`, waits `delay`
 * (through `wait`, `sleep`'s own stand-in), presses `button` again, then
 * holds the main thread `busyMs`. Reports whether `wait(delay)` held: the
 * precondition the caller retries or skips on.
 */
async function pressTwiceOnce(
  deck: () => ReactNode,
  button: 'Next' | 'Previous',
  delay: number,
  busyMs: number,
  wait: (ms: number) => Promise<unknown>
) {
  const onIndexChange = vi.fn();
  const { unmount } = render(
    <OnIndexChange.Provider value={onIndexChange}>
      {deck()}
    </OnIndexChange.Provider>
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  const press = screen.getByRole('button', { name: button });

  const before = performance.now();
  press.click();
  await wait(delay);
  // The precondition: `wait(delay)` took about `delay`, so the second press
  // still lands where this delay means it to, before the first's scroll has
  // had the run of a starved runner's extra time to settle.
  const overran = performance.now() - before - delay;
  press.click();
  // Read after the press: the new scroll has yet to move.
  const pressedAt = viewport.scrollLeft;
  busy(busyMs);

  return { root, viewport, onIndexChange, unmount, pressedAt, overran };
}

/**
 * Renders `deck`, starting on the slide labelled `start`, and at every delay
 * presses `button` twice that far apart, one deck each: the deck must rest on
 * the page `expected`, of `pageSize` slides, every time `delay` holds. With
 * `busyMs`, a long task holds the main thread that long right after the
 * second press. With `sleep`, used in place of the module's own to wait out
 * each delay: a test gives one that runs long for the delays it chooses, to
 * start the starvation this sweep otherwise waits on a loaded runner for
 * (#124).
 *
 * A delay whose `sleep` overran on every try (see `PRECONDITION_TRIES`)
 * never reached the case it means to test, so it is skipped, on its own,
 * rather than failed: the sweep goes on to the next delay instead of
 * aborting. Only once every delay has been skipped this way does the whole
 * case skip, with a message listing them.
 */
export async function pressTwiceAtEveryDelay(
  ctx: TestContext,
  deck: () => ReactNode,
  start: string,
  button: 'Next' | 'Previous',
  expected: string,
  { pageSize = 1, delays = DELAYS, busyMs = 0, sleep: wait = sleep } = {}
) {
  let arrived = 0;
  const skipped: number[] = [];

  for (const delay of delays) {
    let attempt = await pressTwiceOnce(deck, button, delay, busyMs, wait);
    for (
      let tries = 1;
      attempt.overran > PRECONDITION_OVERRUN_MS && tries < PRECONDITION_TRIES;
      tries++
    ) {
      attempt.unmount();
      attempt = await pressTwiceOnce(deck, button, delay, busyMs, wait);
    }

    if (attempt.overran > PRECONDITION_OVERRUN_MS) {
      await ctx.annotate(
        `delay ${delay}ms: sleep(${delay}) overran by ${Math.round(attempt.overran)}ms on every try (a starved runner), so the press landed later than this delay means to; skipped`
      );
      skipped.push(delay);
      attempt.unmount();
      continue;
    }

    const { root, viewport, onIndexChange, unmount, pressedAt } = attempt;
    await expectRestOnASlide(viewport, root, onIndexChange, pageSize);
    expect({ delay, index: root.dataset.index }).toEqual({
      delay,
      index: expected
    });
    if (Math.abs(pressedAt - restOf(viewport, start)) >= WIDTH - 0.5) {
      arrived++;
    }
    unmount();
  }

  if (skipped.length === delays.length) {
    ctx.skip(
      `every delay's sleep overran by more than ${PRECONDITION_OVERRUN_MS}ms on every try (a starved runner): ${skipped.join('ms, ')}ms`
    );
  }

  // Counts only the delays that ran: one skipped for its precondition never
  // holding adds neither a hit nor a miss, so skipping delays alone never
  // fails this. It still fails if every delay that did run missed the race
  // the sweep exists to catch.
  expect(arrived).toBeGreaterThan(0);
}
