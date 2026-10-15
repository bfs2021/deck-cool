import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addStyle,
  pagesOf,
  parkMouse,
  sleep,
  withoutScrollEnd
} from './fixtures';
import {
  DELAYS,
  SWEEP_MS,
  Uncontrolled,
  busy,
  pressTwiceAtEveryDelay
} from './arrival-helpers';

// Moves as the deck arrives, before its scroll ends (#41): see
// arrival-helpers.tsx for the sweep of delays these tests share.

beforeEach(parkMouse);

describe('a press as the deck arrives, before its scroll ends', () => {
  test(
    'Next twice from the first slide rests on the third',
    async (ctx) => {
      await pressTwiceAtEveryDelay(
        ctx,
        () => <Uncontrolled />,
        '1 of 5',
        'Next',
        '2'
      );
    },
    SWEEP_MS
  );

  test(
    'right-to-left, Prev twice from the third slide rests on the first',
    async (ctx) => {
      await pressTwiceAtEveryDelay(
        ctx,
        () => <Uncontrolled rtl defaultIndex={2} />,
        '3 of 5',
        'Previous',
        '0'
      );
    },
    SWEEP_MS
  );

  test(
    'looping, Next twice from the last slide rests on the second',
    async (ctx) => {
      await pressTwiceAtEveryDelay(
        ctx,
        () => <Uncontrolled loop defaultIndex={4} />,
        '5 of 5',
        'Next',
        '1'
      );
    },
    SWEEP_MS
  );

  test(
    'looping, Prev twice from the first slide rests on the fourth',
    async (ctx) => {
      await pressTwiceAtEveryDelay(
        ctx,
        () => <Uncontrolled loop />,
        '1 of 5',
        'Previous',
        '3'
      );
    },
    SWEEP_MS
  );

  test(
    'right-to-left, looping, Prev twice from the second slide rests on the last',
    async (ctx) => {
      await pressTwiceAtEveryDelay(
        ctx,
        () => <Uncontrolled rtl loop defaultIndex={1} />,
        '2 of 5',
        'Previous',
        '4'
      );
    },
    SWEEP_MS
  );

  test(
    'pages of 3 over 10, looping, Prev twice from the second page rests on the last',
    async (ctx) => {
      addStyle(`${pagesOf(3)} .pages > * { width: calc(100% / 3); }`);
      await pressTwiceAtEveryDelay(
        ctx,
        () => (
          <Uncontrolled
            loop
            slides={10}
            viewportClassName="pages"
            defaultIndex={1}
          />
        ),
        '4 of 10',
        'Previous',
        '3',
        { pageSize: 3 }
      );
    },
    SWEEP_MS
  );
});

// Local CPU load never starved this suite's own runner (#124): proved
// instead, by starving it on purpose. `sleep` stands in for three delays,
// holding the main thread 300ms past each, well past the sweep's own
// PRECONDITION_OVERRUN_MS -- the same shape of overrun a starved CI runner
// hit (519s for this file, `expected 300 to be less than 1`).
describe('a delay whose own sleep overran, as a starved runner steals it (#124)', () => {
  test(
    'is skipped, not failed, and the sweep goes on to the rest',
    async (ctx) => {
      const late = new Set([DELAYS[0], DELAYS[10], DELAYS[20]]);
      const annotate = vi.spyOn(ctx, 'annotate');

      await pressTwiceAtEveryDelay(
        ctx,
        () => <Uncontrolled />,
        '1 of 5',
        'Next',
        '2',
        {
          sleep: async (ms) => {
            await sleep(ms);
            if (late.has(ms)) busy(300);
          }
        }
      );

      const skippedDelays = new Set(
        annotate.mock.calls
          .map(([message]) => String(message))
          .filter((message) => message.endsWith('skipped'))
          .map((message) => Number(message.match(/^delay (\d+)ms:/)?.[1]))
      );
      expect(skippedDelays).toEqual(late);
    },
    SWEEP_MS
  );
});

describe('a press as the deck arrives, in an engine without scrollend', () => {
  withoutScrollEnd();

  test(
    'looping, Next twice from the last slide rests on the second',
    async (ctx) => {
      expect('onscrollend' in window).toBe(false);
      await pressTwiceAtEveryDelay(
        ctx,
        () => <Uncontrolled loop defaultIndex={4} />,
        '5 of 5',
        'Next',
        '1'
      );
    },
    SWEEP_MS
  );
});
