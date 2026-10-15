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
// to this many tries, and skips rather than fails once every try still has.
const PRECONDITION_OVERRUN_MS = 60;
const PRECONDITION_TRIES = 3;

/**
 * Renders `deck`, starting on the slide labelled `start`, and at every delay
 * presses `button` twice that far apart, one deck each: the deck must rest on
 * the page `expected`, of `pageSize` slides, every time `delay` holds. With
 * `busyMs`, a long task holds the main thread that long right after the
 * second press.
 */
export async function pressTwiceAtEveryDelay(
  ctx: TestContext,
  deck: () => ReactNode,
  start: string,
  button: 'Next' | 'Previous',
  expected: string,
  { pageSize = 1, delays = DELAYS, busyMs = 0 } = {}
) {
  let arrived = 0;
  for (const delay of delays) {
    let onIndexChange = vi.fn();
    let root!: HTMLElement;
    let viewport!: HTMLElement;
    let unmount = () => {};
    let pressedAt = 0;
    let overran = Infinity;

    for (let tries = 1; tries <= PRECONDITION_TRIES; tries++) {
      onIndexChange = vi.fn();
      ({ unmount } = render(
        <OnIndexChange.Provider value={onIndexChange}>
          {deck()}
        </OnIndexChange.Provider>
      ));
      root = screen.getByRole('region', { name: 'Test deck' });
      viewport = viewportOf(root);
      const press = screen.getByRole('button', { name: button });

      const before = performance.now();
      press.click();
      await sleep(delay);
      // The precondition: `sleep(delay)` took about `delay`, so the second
      // press still lands where this delay means it to, before the first's
      // scroll has had the run of a starved runner's extra time to settle.
      overran = performance.now() - before - delay;
      press.click();
      // Read after the press: the new scroll has yet to move.
      pressedAt = viewport.scrollLeft;
      busy(busyMs);

      if (overran <= PRECONDITION_OVERRUN_MS || tries === PRECONDITION_TRIES) {
        break;
      }
      unmount();
    }

    if (overran > PRECONDITION_OVERRUN_MS) {
      ctx.skip(
        `delay ${delay}ms: sleep(${delay}) overran by ${Math.round(overran)}ms on every try (a starved runner), so the press landed later than this delay means to`
      );
    }

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
  expect(arrived).toBeGreaterThan(0);
}
