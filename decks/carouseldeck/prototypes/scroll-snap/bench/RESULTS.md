# Smoothness and cost bench: results (#138)

THROWAWAY. Answers #138, blocked by #137's research
(`prototypes/research/smoothness-metrics.md`, on `origin/research/smoothness-metrics`)
and feeding the map, #136. Compares carouseldeck -- as shipped
(`@carouseldeck/core`, the framework-neutral engine, used directly: this
app has no React, and the engine is built to be used this way) and as the
one-instance loop prototype (`bench-one-instance.html`, the existing
`loop-one-instance.html` from #3/#4, unmodified, with `?video=0&iframe=0`
for content parity) -- against Embla 8.6.0, Keen Slider 6.8.6, Swiper
14.3.0, Splide 4.1.4 and Flicking 4.17.1 (+ Axes 3.9.3), the exact versions
#137 pinned and read.

## What was built

Seven pages in `prototypes/scroll-snap/`, same content: 6 slides, coloured
cards with a number and a line of text, a 640px x 420px viewport, 544px
(85%) slides -- fixed pixels, identical on every deck, not each library's
own percentage math -- one per view with the neighbours peeking, looping
(`loop`/`circular`/`type: 'loop'` at each library's default otherwise),
Prev/Next buttons. `src/bench/content.ts` builds the shared markup;
`src/bench/harness.ts` is one engine-neutral probe attached the same way on
every deck (position from the DOM, not a library's internals: the
`.bench-slide[data-bench-index]` nearest the viewport's start edge, the same
rule `../deck.ts`/`../page.ts` already use for the clone-jump prototype's
own jump detector -- a library's loop clone, made with `cloneNode`, carries
the attribute with it). Next/Prev are real clicks on `#next`/`#prev`, wired
to each library's own method; mouse, wheel and touch are real input at
`#viewport`'s centre. carouseldeck and the five rivals are driven through
their plain JS APIs, the same way, so the bench never calls a library's API
from Playwright directly.

`bench/scenarios.ts` has the four input classes, each starting one Next
press before a full lap (`goToSeam`), so every scenario crosses the loop
seam: `next-seam` (6x Next, 40ms apart), `drag-throw` (a fast mouse flick),
`wheel` (10x wheel bursts), `touch-flick` (CDP `Input.dispatchTouchEvent`,
Chromium only -- Playwright has no trusted touch in Firefox or WebKit,
#137). Each ran at three load levels: none, and a 100ms/200ms busy loop on
a ~250ms timer, active only while window.__bench.jank(ms) is set -- from
just before the scenario starts to just after it settles ("on a timer
during the motion").

`bench/trace.ts` captures a Chromium CDP trace per run (`Tracing.start`
with `PipelineReporter`'s categories) and scores it: longest visual stall,
hitch time ratio, percent dropped frames, and input-to-first-moved-frame,
anchored by a `performance.mark('bench-input')` correlated into the same
trace clock (verified: its `args.data.startTime` matches the mark's
`performance.now()`, so no `EventLatency` dependency is needed).
`bench/bench.spec.ts` runs every deck x scenario x load x 5 reps in
Chromium (traced) and the rAF/position-only subset (no touch) in Firefox
and WebKit, 5 reps each. `bench/cost.spec.ts` and `bench/bundle-size.mjs`
measure cost. `bench-iphone.html` loads any deck by `?deck=` in a same-origin
iframe and shows the main-thread-visible metrics live, with instructions for
a 240fps video check (no iPhone was available to this run; the page is
built and works from a desktop browser pointed at it, untested on-device).

## Method notes (found while building and validating this bench)

- **A Chromium trace tick fires every ~16.7ms whether or not anything
  presented.** The longest stall and hitch ratio must be computed from
  gaps between frames that actually **presented**
  (`STATE_PRESENTED_ALL`/`PARTIAL`), not between every expected tick: a run
  of `STATE_DROPPED` ticks still ticks on schedule, which hid the real
  stall in an early version of this bench (every deck showed a flat
  ~16.7ms "longest stall" even under a 200ms busy loop). Fixed in
  `trace.ts`; the numbers below use the fix.
- **This page's own HUD polluted the trace.** `startHud`'s
  `setInterval(…, 200)` writes `textContent`, which is a DOM mutation a
  trace sees as a frame -- every deck showed a spurious ~200ms "stall" tied
  to the HUD's own interval, not the carousel. Fixed with
  `window.__bench.pauseHud()`, called around every traced capture.
- **This machine is 4 cores, running many unrelated services, and during
  part of this run another worktree's own test suite ran concurrently**
  (confirmed: `pgrep` found `worktrees/issue-119`'s vitest/Chromium
  processes active while this bench's WebKit and cost sweeps ran). The
  jank busy-loop pegs one core; under contention, **even carouseldeck's
  compositor-driven native scroll shows dropped-frame% rising with the
  load** (e.g. next-seam, load=200: carouseldeck 46.5% dropped), which
  #137's research says should not happen on an uncontended machine
  (compositor scrolling runs independent of a busy main thread). Read this
  as a property of this run's shared, 4-core machine, not proof that native
  scrolling fails to resist jank. The **within-run, same-load comparison
  across decks stays meaningful**, since every deck absorbed the same
  contention; absolute ms/%, less so. `uptime`'s 1-minute load was checked
  before every timing shard; any shard started above a load of 2 waited
  (reported per-shard below).
- **Blank/seam-frame counts are noisy for carouseldeck specifically.**
  `elementFromPoint` sampled 10px inside each viewport edge catches
  ordinary sub-pixel layout gaps during a fast *native* scroll (dozens of
  "blank" frames during `next-seam`/`drag-throw`, zero during `wheel`,
  which barely moves it) -- a reasonable guess is page sub-pixel rounding
  at the scroll edges during motion, not a real flash: watched by eye
  during the smoke tests, no visible flicker. Read as a rough, comparative
  signal, not a verified flash count.
- **Splide's blank-frame numbers are a confirmed measurement artifact, not
  real flashes.** Diagnosed directly: at rest, `elementFromPoint` at all
  three sample points (including the viewport's centre) returns the
  `.splide` root element itself, not a slide -- even though the carousel
  visibly, correctly shows a slide there (confirmed in the smoke test: Next,
  Prev and the loop all work correctly on Splide). This is a hit-testing
  quirk of how this bench's `.splide` root paints relative to its children
  here (not chased further -- out of this ticket's scope), not a defect in
  Splide. **Splide's blank-frame row is not measured**; excluded from the
  seam-artifact ranking below.
- **`input-to-first-moved-frame` is JS-handler-run time to first frame, not
  raw-input-timestamp to first frame.** The `performance.mark` fires inside
  the real event listener; under a busy-loop load, the delay *before* that
  listener gets to run (queued behind the busy loop) is invisible to this
  metric. It understates true input latency under load -- read the load=0
  column as the real figure, and load=100/200 columns as "the engine's own
  response once the main thread is free," not full apparent latency.
- **`performance.memory.usedJSHeapSize` is coarsened by Chromium** for
  privacy and returned an identical flat 10,000,000 for every deck and
  every slide count during an early run -- useless. Heap numbers below are
  from CDP's `Performance.getMetrics` (`JSHeapUsedSize`), which varies
  realistically.
- **one-instance's init-time is not comparable to the other six.** The
  bench's probe is glued on *after* `loop-one-instance.ts`'s own module has
  already finished its real setup (layout, the deferred initial scroll);
  `bench-init-start`/`-end` in the glue script only wrap the glue's own
  negligible extra work. Its "init" row is not a measurement of
  one-instance's real init cost -- marked not measured.
- **LoAF during the scenario is dominated by the injected load, not by a
  library's own cost.** The busy-loop ticks identically on every deck, so
  the LoAF-blocking-time column mostly reports the load itself, not a
  difference between libraries. The separate idle-vs-moving probe
  (`cost.spec.ts`, no injected load, a 1s plain Next-click loop) is the
  real per-library figure, and it is 0 for every deck: none of these six
  libraries' own Next handling blocks the main thread past LoAF's 50ms
  threshold during ordinary use.
- **Firefox and WebKit figures are the main-thread view only** (#137): no
  trace, no CDP, no LoAF, no trusted touch. A native scroll's real
  smoothness there is invisible to this bench; only its settle time and
  position-sampled shape are. **WebKit here is Playwright's WPE build on
  Linux**, not Safari, desktop or iOS -- it says nothing about either.
- **Headless Chromium paces frames with a timer**
  (`DelayBasedBeginFrameSource`), not a real display's vsync. Absolute ms
  figures are comparative within this run, not a device's real frame
  budget (#137).

## Results

5 reps per cell in Chromium; 5 in Firefox/WebKit for the three
rAF-measurable scenarios (touch-flick needs trusted touch, Chromium-only).
Cells are `load=0/100/200`, median of 5. Raw data:
`bench/results/*.jsonl` (gitignored; regenerate with the commands below).

### Chromium, traced

#### Longest visual stall (ms)

| Deck | Next x6 | Drag+throw | Wheel | Touch flick |
| --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 50.0/83.3/200.0 | 50.0/116.7/216.7 | 33.3/83.3/200.0 | 16.7/116.7/200.0 |
| carouseldeck (one-instance) | 266.7/250.0/200.0 | 33.3/116.7/200.0 | 200.0/116.7/183.3 | 16.7/83.3/183.3 |
| Embla 8.6.0 | 16.7/83.3/183.3 | 16.7/83.3/183.3 | 66.7/133.3/200.0 | 33.3/100.0/200.0 |
| Keen 6.8.6 | 16.7/150.0/200.0 | 33.3/116.7/216.7 | 16.7/16.7/16.7 | 50.0/166.7/266.7 |
| Swiper 14.3.0 | 83.3/83.3/133.3 | 16.7/33.3/133.3 | 0/0/0 | 50.0/116.7/216.7 |
| Splide 4.1.4 | 16.7/50.0/50.0 | 16.7/16.7/16.7 | 0/0/0 | 0/0/0 |
| Flicking 4.17.1 | 83.3/166.7/266.7 | 16.7/16.7/16.7 | 0/0/0 | 0/0/0 |

Wheel/touch at 0 for Splide and Flicking (wheel) is "nothing moved" (see
"not a fair comparison" below), not "perfectly smooth".

#### Hitch time ratio (ms/s)

| Deck | Next x6 | Drag+throw | Wheel | Touch flick |
| --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 0.1/0.2/0.5 | 0.0/0.2/0.4 | 0.0/0.2/0.5 | 0/0.2/0.5 |
| carouseldeck (one-instance) | 0.2/0.3/0.5 | 0.1/0.3/0.4 | 0.4/0.3/0.4 | 0/0.1/0.2 |
| Embla 8.6.0 | 0/0.3/0.6 | 0/0.2/0.6 | 0.3/0.4/0.3 | 0.0/0.3/0.6 |
| Keen 6.8.6 | 0/0.2/0.5 | 0.0/0.2/0.5 | 0/0/0 | 0.2/0.4/0.7 |
| Swiper 14.3.0 | 0.1/0.1/0.1 | 0/0.0/0.1 | 0/0/0 | 0.2/0.3/0.5 |
| Splide 4.1.4 | 0/0.0/0.0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Flicking 4.17.1 | 0.3/0.3/0.5 | 0/0/0 | 0/0/0 | 0/0/0 |

By Apple's "hitch ms/s" rule of thumb (<5 good), every deck is "good" on
this machine's absolute scale -- it's a timer-paced headless number
(#137); read relative, not absolute.

#### Dropped frames (%)

| Deck | Next x6 | Drag+throw | Wheel | Touch flick |
| --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 0/20.9/46.5 | 0/15.6/44.7 | 0/17.6/61.2 | 2.2/31.4/63.0 |
| carouseldeck (one-instance) | 0/17.9/36.5 | 0/22.6/42 | 0/20.9/50 | 0/18.6/48.4 |
| Embla 8.6.0 | 0/15.8/50.4 | 0/17.6/51.1 | 0/25/61.1 | 0.5/17.8/53.7 |
| Keen 6.8.6 | 0/15.9/50 | 0/16.1/46.7 | 0/0/0 | 0/20.9/45.7 |
| Swiper 14.3.0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/15.8/25 |
| Splide 4.1.4 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Flicking 4.17.1 | 14.3/14.3/14.3 | 0/0/0 | 50/50/50 | 0/0/100 |

#### Input to first moved frame (ms)

| Deck | Next x6 | Drag+throw | Wheel | Touch flick |
| --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 12.1/12.6/12.2 | 12.8/12.3/12.7 | 15.5/15.5/15.6 | 13.0/13.5/13.8 |
| carouseldeck (one-instance) | 10.0/12.4/11.1 | 12.8/12.5/12.8 | 15.2/15.0/15.3 | 12.9/13.7/13.8 |
| Embla 8.6.0 | 10.8/11.0/11.5 | 12.3/13.3/12.3 | 16.1/16.1/16.1 | 12.9/12.4/12.5 |
| Keen 6.8.6 | 12.1/10.9/8.7 | 11.1/12.7/12.7 | 15.9/9.7/15.5 | 13.9/14.3/14.2 |
| Swiper 14.3.0 | 11.8/10.9/12.0 | 12.2/12.7/12.2 | 16.0/16/16.0 | 13.3/13.4/13.4 |
| Splide 4.1.4 | 10.7/11.2/12.4 | 13.2/13.4/13.1 | 16.1/16.0/16.1 | 30.7/30.7/30.7 |
| Flicking 4.17.1 | 12.3/12.8/12.8 | 13.1/13.5/13.5 | 16.0/16.0/16.0 | 31.3/30.7/31.2 |

All within noise of each other (~9-16ms) except Splide/Flicking's touch
figure (~31ms) -- both bind touch through their own slower listener setup;
not chased further here.

#### Settle time, wall clock (ms)

| Deck | Next x6 | Drag+throw | Wheel | Touch flick |
| --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 2057/2054/2277 | 1265/1129/1489 | 1160/1502/2365 | 1549/1428/1996 |
| carouseldeck (one-instance) | 1626/1879/2195 | 1144/1241/1383 | 1195/1342/1672 | 1522/1631/1727 |
| Embla 8.6.0 | 2421/2743/3455 | 1252/1727/2400 | 605/791/1430 | 2188/2750/3598 |
| Keen 6.8.6 | 1644/1983/2797 | 1137/1340/1652 | 542/731/1604 | 1417/1629/2720 |
| Swiper 14.3.0 | 1670/1432/2066 | 998/1141/1241 | 533/706/1193 | 1280/1435/2270 |
| Splide 4.1.4 | 1465/1713/2585 | 288/378/602 | 542/776/1397 | 398/505/1382 |
| Flicking 4.17.1 | 675/905/1269 | 301/390/486 | 527/632/1005 | 394/476/726 |

#### Blank/seam frames (count; carouseldeck and Splide rows are noise -- see method notes)

| Deck | Next x6 | Drag+throw | Wheel | Touch flick |
| --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 43/40/21 | 23/6/6 | 0/0/0 | 7/1/0 |
| carouseldeck (one-instance) | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Embla 8.6.0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Keen 6.8.6 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Swiper 14.3.0 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Splide 4.1.4 | 89/76/57 | 18/19/18 | 33/35/32 | 24/22/29 |
| Flicking 4.17.1 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |

#### Reversals (re-snap / overshoot, count)

| Deck | Next x6 | Drag+throw | Wheel | Touch flick |
| --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 0/0/0 | 0/0/0 | 12/12/17 | 0/0/0 |
| carouseldeck (one-instance) | 0/0/0 | 0/0/0 | 11/12/15 | 0/0/0 |
| Embla 8.6.0 | 0/0/0 | 24/2/1 | 0/0/0 | 0/4/0 |
| Keen 6.8.6 | 0/0/0 | 0/0/1 | 0/0/0 | 0/0/1 |
| Swiper 14.3.0 | 0/0/0 | 0/0/0 | 0/0/0 | 1/1/1 |
| Splide 4.1.4 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |
| Flicking 4.17.1 | 0/0/0 | 0/0/0 | 0/0/0 | 0/0/0 |

carouseldeck's wheel reversals (11-17) are the engine-neutral probe
re-measuring the logical position every frame of a genuinely multi-step
native wheel scroll (10 wheel events); not necessarily a visible re-snap --
not chased further.

### Firefox (rAF/position only, main-thread view; no touch)

#### Settle time, wall clock (ms)

| Deck | Next x6 | Drag+throw | Wheel |
| --- | --- | --- | --- |
| carouseldeck (shipped) | 1500/1801/2411 | 1185/1298/1368 | 754/1009/1392 |
| carouseldeck (one-instance) | 1469/1971/3158 | 1175/1324/1441 | 768/842/1187 |
| Embla 8.6.0 | 1879/2276/3172 | 933/1306/1380 | 454/623/1117 |
| Keen 6.8.6 | 1369/1740/2581 | 905/1015/1105 | 454/624/1098 |
| Swiper 14.3.0 | 1151/1253/2841 | 837/1002/1088 | 444/661/1274 |
| Splide 4.1.4 | 1335/1587/2425 | 220/307/412 | 443/549/904 |
| Flicking 4.17.1 | 698/1051/1993 | 235/414/760 | 458/659/1507 |

### WebKit (Playwright WPE on Linux, main-thread view; no touch; not Safari)

#### Settle time, wall clock (ms)

| Deck | Next x6 | Drag+throw | Wheel |
| --- | --- | --- | --- |
| carouseldeck (shipped) | 1083/1252/1876 | 729/756/839 | 1266/1524/2119 |
| carouseldeck (one-instance) | 1117/1468/2096 | 730/754/857 | 940/1250/1632 |
| Embla 8.6.0 | 1783/2281/2926 | 1045/1297/1363 | 439/547/1097 |
| Keen 6.8.6 | 1260/1593/1961 | 872/1036/1139 | 431/540/941 |
| Swiper 14.3.0 | 1111/1276/1912 | 782/821/898 | 430/538/906 |
| Splide 4.1.4 | 1235/1635/2495 | 183/290/346 | 431/668/1268 |
| Flicking 4.17.1 | 586/774/1377 | 203/275/375 | 433/537/1122 |

(Firefox's and WebKit's "max per-frame step" and "blank frames" tables are
in `bench/results/summary.json` and reproduce the same pattern as Chromium's:
carouseldeck's and Splide's blank-frame rows are the same artifacts
described above, present in every engine because the detector runs the
same way on every browser.)

### Cost

#### Min+gzip per deck (the library plus the few lines of glue every deck has; `bundle-size.mjs`)

| Deck | Min+gzip |
| --- | --- |
| carouseldeck (shipped) | 8.64 KB |
| Keen 6.8.6 | 8.40 KB |
| Embla 8.6.0 | 9.63 KB |
| Splide 4.1.4 | 15.96 KB |
| Swiper 14.3.0 | 23.10 KB |
| Flicking 4.17.1 | 35.30 KB |

one-instance is this app's own prototype code (`src/pages/loop-one-instance.ts`
+ `src/deck.ts`/`drag.ts`/`settle.ts`), not a packaged library -- no
standalone size measured. Not directly comparable to
`packages/react/README.md`'s table: that one measures the *React* package
with React external; this measures the *vanilla* core/library used
directly, which every deck here does, carouseldeck included.

#### Init time (ms) and heap (CDP `JSHeapUsedSize`, KB) at 6/10/50 slides

| Deck | init @6 | init @10 | init @50 | heap @6 | heap @10 | heap @50 |
| --- | --- | --- | --- | --- | --- | --- |
| carouseldeck (shipped) | 13.9 | 13.7 | 22.7 | 1952 | 2076 | 2035 |
| carouseldeck (one-instance)* | 0.9 | 1.1 | 1.9 | 1958 | 2001 | 2210 |
| Embla 8.6.0 | 9.2 | 10.8 | 12.4 | 1856 | 1878 | 2031 |
| Keen 6.8.6 | 8.2 | 8.0 | 11.5 | 1777 | 1794 | 1918 |
| Swiper 14.3.0 | 11.8 | 11.8 | 22.0 | 1993 | 1979 | 2196 |
| Splide 4.1.4 | 16.1 | 16.0 | 36.1 | 2168 | 2295 | 2373 |
| Flicking 4.17.1 | 12.3 | 13.8 | 15.0 | 2135 | 2139 | 2238 |

\* not measured -- see method notes (the probe attaches after
one-instance's real init already ran).

#### Script time per frame: idle vs. a 1s plain Next-click loop, no injected load (LoAF count / blocking ms)

Every deck: idle 0/0, moving 0/0. None of these six libraries' own Next
handling crosses LoAF's 50ms threshold in ordinary use -- see method
notes for why the in-scenario LoAF column above is not this metric.

## Rankings

Per metric, best to worst, at load=200 (the condition that separates
engines), `next-seam` unless noted (median across the three scenarios
where `next-seam` ties):

- **Dropped frames, Next/Prev, under load:** Swiper and Splide (0%, both
  compositor CSS transitions) > Flicking (14.3%) > one-instance (36.5%) >
  carouseldeck shipped (46.5%) > Keen (50%) ≈ Embla (50.4%). Matches #137's
  prediction almost exactly: "Swiper and Splide also run on the
  compositor, so carouseldeck's edge under load is only over Embla, Keen
  and Flicking" -- confirmed here, except this run's contention (see method
  notes) means carouseldeck does not clearly beat Embla/Keen either.
- **Settle time, Next x6, no load:** Flicking (675ms) > Splide (1465ms) >
  one-instance (1626ms) > Keen (1644ms) > Swiper (1670ms) > shipped
  (2057ms) > Embla (2421ms).
- **Settle time, drag-throw, no load:** Splide (288ms) >> Flicking
  (301ms) >> Swiper (998ms) > Keen (1137ms) > one-instance (1144ms) >
  shipped (1265ms) > Embla (1252ms). Splide and Flicking settle a flick in
  roughly a quarter of carouseldeck's time.
- **Longest stall under heavy load (200ms busy), Next x6:** Splide (50ms)
  > Embla (183.3ms) ≈ one-instance (200.0ms) ≈ shipped (200.0ms) ≈ Keen
  (200.0ms) > Swiper (133.3ms, better than shown by rounding) > Flicking
  (266.7ms).
- **Bundle size:** Keen (8.40KB) < shipped (8.64KB) < Embla (9.63KB) <
  Splide (15.96KB) < Swiper (23.10KB) < Flicking (35.30KB). carouseldeck is
  competitive here once React is out of the comparison for everyone.
- **Init time at 50 slides:** Flicking (15.0ms) < Keen (11.5ms, actually
  best) < Embla (12.4ms) < shipped (22.7ms) ≈ Swiper (22.0ms) < Splide
  (36.1ms, worst, and the steepest growth from 6 to 50 slides).
- **Seam artifacts:** not rankable this run (carouseldeck's and Splide's
  rows are both measurement noise, by two different causes; the other four
  show zero, which on its own does not mean clean -- it means this
  detector found nothing on them).

## Where carouseldeck is behind, and by how much

- **Mouse-drag release (metric 5 in #137): the predicted gap, confirmed,
  and larger than expected.** Splide settles a flick-release in 288ms,
  Flicking in 301ms; carouseldeck (shipped) takes 1265ms -- **about 4.4x
  longer**. one-instance is no better (1144ms, 4.0x). This is exactly the
  gap #137 named as the place native smooth scroll (which starts slow:
  27px in the first ~59ms for an 800px move, per #137's Probe 2) likely
  loses to a rival's spring or deceleration curve that keeps the drag's
  velocity.
- **Next/Prev settle time: a smaller, consistent gap.** Flicking settles
  in 675ms vs. carouseldeck's 2057ms (**~3x**) at no load; against Splide
  (1465ms) and Keen (1644ms) the gap is smaller (~1.25-1.4x) but still
  there every time, at every load level. Matches #137's prediction that
  the native scroll-to curve is "slower to start and longer" than
  Swiper's, Splide's or Keen's.
- **Dropped frames under a main-thread long task: not a clear win here.**
  #137 predicted carouseldeck should resist a long task far better than
  every rAF-driven rival (Embla, Keen, Flicking) on Next/Prev and touch.
  In this run carouseldeck's dropped% (46.5% at load=200) is close to
  Embla's (50.4%) and Keen's (50%), not clearly ahead -- almost certainly
  this run's 4-core, contended machine (method notes), not evidence the
  architecture doesn't help. **This needs re-running on an uncontended
  machine before trusting the gap either way.**
- **Bundle size and init time: no real gap.** carouseldeck is the
  second-smallest bundle here and mid-pack on init time; the size gap the
  map's "Not yet specified" section worried about (8.87KB vs. Embla's
  7.61KB and Keen's 6.61KB, from `packages/react/README.md`'s table) does
  not reproduce in this vanilla-API comparison -- that older table compares
  the *React* package with React external, a different measurement.

## Where carouseldeck wins

- **Wheel: the one input the rivals mostly don't bind.** Without a module
  (Swiper's Mousewheel) or an option Splide/Flicking don't default to,
  wheel over the rivals' viewport does nothing in this bench -- 0 dropped
  frames and 0 stall because nothing moved. carouseldeck's native scroll
  container takes wheel for free, with momentum, settling in 1160-2365ms
  across load levels (not instant, but real motion every rival here lacks
  by default). Not "carouseldeck is smoother at wheel" -- it's the only
  one of the seven that answers a wheel event at all without extra
  configuration. **Not a fair smoothness comparison for the rivals, so not
  scored as a win on the tables above** -- flagged here instead, per the
  ticket's rule against bending a scenario to force a comparison.
- **Touch, by design, though this run's numbers do not show it cleanly**
  (previous section). #137's prediction stands on code-reading grounds
  (native is compositor-driven and every rival drives touch from JS), but
  this run's own data does not confirm a resistance-to-load advantage for
  carouseldeck here -- re-run needed.

## Numbers that cannot be trusted, and why

- **Everything timed on this run's shared machine, under a 4-core,
  multi-tenant load**, confirmed concurrent with another worktree's own
  test suite for part of the WebKit and cost sweeps. Absolute ms figures
  are this run's; the within-row (same deck, same load) comparison across
  decks is more trustworthy than any single number.
- **Headless Chromium's frame pacing is a timer**, not a display's vsync
  (#137) -- ms figures are comparative within this run only.
- **carouseldeck's and Splide's blank/seam-frame counts are measurement
  artifacts** (method notes): carouseldeck's from sub-pixel edge sampling
  during fast native motion, Splide's from a confirmed `elementFromPoint`
  hit-test quirk against its own root element. Neither number is a
  verified flash count.
- **`input-to-first-moved-frame` under load is a floor, not the real
  figure**: it cannot see the delay before its own mark's listener got to
  run.
- **one-instance's init time is not measured** (the probe attaches after
  its real init already ran).
- **Firefox and WebKit numbers are main-thread-view only**: a real native
  scroll's smoothness there is invisible to this bench (#137). WebKit here
  is Playwright's WPE build on Linux, not Safari.
- **No iPhone was available for this run.** `bench-iphone.html` is built
  and works from a desktop browser pointed at it (verified: it loads any
  deck by `?deck=` and the HUD below the iframe updates), but the 240fps
  video check and the on-device numbers it's for are untested.
- **Script-time-per-frame (LoAF) in the main sweep is dominated by the
  injected load**, not by a library's own cost -- see the separate
  idle/moving probe in the Cost section for the real (zero, for all six)
  figure.

## Exact commands to re-run

```sh
# From decks/carouseldeck/prototypes/scroll-snap/ (repo root: decks/carouseldeck/packages/core needs its dist/ first)
pnpm --filter @carouseldeck/core build
pnpm --filter @carouseldeck/proto-scroll-snap build
pnpm exec playwright install chromium firefox webkit   # once

# Check the load before any timing run:
uptime   # if the 1-minute load is over 2, wait and recheck before proceeding

# Smoothness: Chromium, traced, every deck/scenario/load, 5 reps each
# (sharded per deck to keep each run under ten minutes; swap --project)
pnpm exec playwright test -c bench/playwright.config.ts --project=chromium \
  -g '\[carouseldeck\]' bench/bench.spec.ts
pnpm exec playwright test -c bench/playwright.config.ts --project=chromium \
  -g '\[one-instance\]' bench/bench.spec.ts
# ...and -g '\[embla\]', '\[keen\]', '\[swiper\]', '\[splide\]', '\[flicking\]'

# Smoothness: the rAF-only subset in Firefox and WebKit (touch-flick is
# skipped automatically: it needs Chromium's CDP)
pnpm exec playwright test -c bench/playwright.config.ts --project=firefox \
  -g '\[carouseldeck\]|\[one-instance\]' bench/bench.spec.ts
pnpm exec playwright test -c bench/playwright.config.ts --project=webkit \
  -g '\[carouseldeck\]|\[one-instance\]' bench/bench.spec.ts
# ...repeat per deck/browser as above

# Cost: bundle size (a Vite build, no browser) and load/heap/script-time
# (Chromium only)
node bench/bundle-size.mjs
pnpm exec playwright test -c bench/playwright.config.ts --project=chromium \
  bench/cost.spec.ts

# Turn results/*.jsonl into this file's tables
python3 bench/analyze.py bench/results
python3 bench/render_tables.py

# A phone, on the same Wi-Fi as this machine (see the root README's "serve")
pnpm --filter @carouseldeck/proto-scroll-snap serve
# then open http://<LAN IP>:4317/bench-iphone.html?deck=carouseldeck
```

`bench/smoke.spec.ts` is a faster sanity check (every deck loads, Next/Prev
moves it, the loop comes back to where it started) -- not part of the
recorded results.
