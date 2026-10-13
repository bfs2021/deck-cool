# Smoothness metrics, and how the rivals move (#137)

Research for the map #136, "Make carouseldeck the smoothest carousel". It
answers #137: which metrics capture a carousel's smoothness for each input,
with which tool in each engine, and how Embla, Keen, Swiper, Splide and
Flicking produce their motion. The bench (#138) is built on it.

Sources are named per claim. Rival source was read from pinned npm installs
(`npm i --save-exact`, scripts off) in a scratch directory, never from the
rivals' sites or repos:

| Package          | Version | File read                                                                                            |
| ---------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `embla-carousel` | 8.6.0   | `esm/embla-carousel.esm.js` (1670 lines, unminified)                                                 |
| `keen-slider`    | 6.8.6   | `keen-slider.es.js`, one minified line (sha256 `ed52dfa6…5642`), formatted with Prettier 3.9.9 (`--no-config --parser babel`) to 1008 lines. Keen line numbers below are of that formatted copy. |
| `swiper`         | 14.3.0  | `shared/swiper-core.mjs`, `modules/free-mode.mjs`, `swiper.css`                                      |
| `@splidejs/splide` | 4.1.4 | `dist/js/splide.esm.js`                                                                              |
| `@egjs/flicking` | 4.17.1  | `dist/flicking.esm.js`, and its physics dependency `@egjs/axes` 3.9.3 `dist/axes.esm.js`             |

The engine facts were measured by a small local probe (below, "Probe"):
Playwright 1.63, Chromium 153.0.8010.12 (headless shell), Firefox 155.0 and
WebKit 26.6 (WPE), on the Linux machine the prototype used.

## The short answer

- **Native scrolling is invisible to main-thread timing, by design.** In all
  three engines a smooth native scroll kept moving through a 400 ms
  main-thread long task (Probe 1), and so did each rival's CSS-transition
  Next. A metric built on `requestAnimationFrame` (rAF) intervals reports
  that time as ~24 dropped frames and a 2600 px jump, while the screen
  showed motion. rAF metrics are valid only for motion the main thread
  makes: a mouse drag's follow phase, the loop's jump, and the rivals'
  rAF engines.
- **Only Chromium's trace sees compositor frames from a script.**
  `browser.startTracing` records a `PipelineReporter` event per frame, with
  its state (`STATE_PRESENTED_ALL`, `STATE_PRESENTED_PARTIAL`,
  `STATE_DROPPED`, `STATE_NO_UPDATE_DESIRED`) and whether a compositor or
  main-thread animation was running. In Probe 1 it logged 18 presented
  frames with a compositor animation inside the 411 ms that rAF never ran.
  So the bench's frame metrics are scored in Chromium. Firefox and WebKit
  get rAF and position metrics, labelled as main-thread only.
- **On a real iPhone without a Mac, only a camera sees the compositor.**
  The page can log its own rAF and scroll samples to the LAN server, but
  iOS scrolls in the UI process and caps rAF near 60 Hz by default. A
  240 fps slow-motion video of the screen is the Mac-free ground truth.
- **The rivals' motion is fixed-curve or spring, and none projects a touch
  flick as far as native momentum.** Four of the five move at most one
  slide (or one page) per drag release by default. Flicking alone projects
  the release with a deceleration. Every rival drives touch from
  JavaScript, so their touch swipe freezes in a long task; carouseldeck's
  does not.
- **For carouseldeck:** keep native for touch, wheel, keys and Next/Prev,
  which the rivals cannot match under load. The one place native may lose is
  the **mouse-drag release**: Chromium's native smooth scroll starts slow
  (27 px in the first 59 ms of an 800 px move), so a fast throw slows almost
  to a stop, then speeds up again. The bench should measure that with a
  velocity-continuity metric before anything replaces it.

## 1. What each metric can and cannot see

### Why the thread matters

- Chromium: a declarative or compositor-driven animation can "continue to
  produce visual updates efficiently and in parallel" while the main thread
  is busy, and "rAF polling suggested a frame drop to 0, but visually, a user
  wouldn't be able to notice a difference" ([web.dev, Towards an animation
  smoothness metric](https://web.dev/articles/smoothness)).
- Firefox: APZ scrolls on the compositor thread and keeps two scroll
  positions, one there and one on the main thread. They "diverge while the
  APZ code is performing an async pan or zoom action" and are "reconciled
  periodically" ([Firefox source docs, Asynchronous Panning and
  Zooming](https://firefox-source-docs.mozilla.org/gfx/AsyncPanZoom.html)).
  APZ also handles smooth scrolling and scroll snap.
- WebKit: the scrolling thread "moves layers around in response to wheel
  events and asynchronously posts data about scrolled layers back to the main
  thread", with "an almost guaranteed lack of synchronization between the
  displayed layer positions and the web-exposed values for scroll position"
  ([WebKit wiki, What's changing with scrolling on
  macOS](https://trac.webkit.org/wiki/WhatsChangingwithscrollingonmacOS)). On
  iOS, overflow scrolling is a `UIScrollView` in the UI process.

**Probe 1** (`scratchpad/probe/probe.cjs` and `probe2.cjs`, not
committed). A scroll-snap viewport of eight 800 px slides calls
`scrollTo({ left: 3200, behavior: 'smooth' })`, waits 30 ms, then blocks the
main thread for 400 ms. A rAF loop reads `scrollLeft`.

| Engine         | Longest rAF gap | `scrollLeft` change across that gap | Arrived (first rAF at 3200) |
| -------------- | --------------- | ----------------------------------- | --------------------------- |
| Chromium 153   | 400 ms          | 2638 px                             | 920 ms                      |
| Firefox 155    | 400 ms          | 3087 px                             | 650 ms                      |
| WebKit 26.6    | 408 ms          | 2831 px                             | ≤ 430 ms (arrived inside the gap) |

The scroll ran on in every engine. In the Chromium trace of the same run,
inside the 411 ms rAF gap: 43 `ScrollTree::OnScrollOffsetAnimated` events
(largest gap between them 17.5 ms), 19 `DrawFrame`, and 25
`PipelineReporter` frames, 18 of them `STATE_PRESENTED_ALL` with
`has_compositor_animation: true`. A long-animation-frame entry of 411 ms
was recorded. So LoAF and rAF see the block, and the trace sees the frames
the user saw.

**Probe 2** (`probe3.cjs`): the same `scrollTo` of one 800 px slide with no
load, `scrollLeft` read in rAF (so main-thread view, sampled every 3rd
frame):

| Engine   | Position at ~55 ms | ~105 ms | ~155 ms | 99% (≥ 792 px) |
| -------- | ------------------ | ------- | ------- | -------------- |
| Chromium | 27                 | 199     | 496     | ~410 ms        |
| Firefox  | 111                | 324     | 547     | ~460 ms        |
| WebKit   | 363                | 651     | 769     | ~200 ms        |

The browser owns this curve (CSSOM View leaves smooth scrolling to the user
agent). Chromium's starts slowly, then speeds up, then slows down. Firefox's
starts faster, and WebKit's (WPE) is much shorter. These are headless Linux
figures. They say nothing of Safari's curve.

### The candidate metrics

"Main" means the metric sees only frames in which the main thread ran.
"Compositor" means it also sees frames that the compositor produced alone.

| Metric | How it is taken | Sees | Cannot see, or misreports |
| ------ | --------------- | ---- | ------------------------- |
| **Dropped and late frames from rAF intervals** | rAF loop; a gap over 1.5 vsync intervals counts as dropped | Main | Compositor scrolls and CSS transitions. Under a long task it counts frames as dropped that were presented (Probe 1). Also on iOS rAF runs near 60 Hz while scrolling runs at 120 Hz (see iPhone). Valid for rAF engines (Embla, Keen, Flicking, Splide's free scroll) and for carouseldeck's drag follow phase. |
| **Visual position per frame** (a probe slide's `getBoundingClientRect()` read in rAF) | Engine-neutral: works for scroll and for transforms | Main | Same blind spot as above. For native scroll it reads the main thread's copy of the scroll position, which lags the screen (Firefox, WebKit quotes above). In Probe 1 it showed a 2638 px "jump" no user saw. |
| **`long-animation-frame` (LoAF)** | `PerformanceObserver`, type `long-animation-frame`; frames over 50 ms, with `blockingDuration`, `renderStart`, `styleAndLayoutStart`, `firstUIEventTimestamp` and `scripts` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming)) | Main | Not a smoothness metric: it says the main thread was blocked, not whether the screen stopped. Chromium only: Chrome 123+; no Firefox, Safari or iOS Safari ([caniuse](https://caniuse.com/wf-long-animation-frames); confirmed `false` in Firefox 155 and WebKit 26.6 by Probe 1). Feature-detect it with `PerformanceObserver.supportedEntryTypes`. |
| **Chromium smoothness: percent dropped frames** | Trace `PipelineReporter` per frame (categories `cc`, `benchmark`, `viz`, `gpu`, `input`), score = time waiting for an expected update / animation time. Chrome reports the average, the worst 1 s window and the 95th percentile ([web.dev](https://web.dev/articles/smoothness)) | **Compositor and main** | Chromium only. Headless shell paces frames with `DelayBasedBeginFrameSource` (seen in Probe 1's trace), not a display's vsync, so absolute rates are not a device's. Use it for comparisons in one run setup. The `affects_smoothness` flag Chrome uses to filter frames was `false` for a programmatic smooth scroll in Probe 1, so the bench must decide "frames expected" itself (motion window from input to rest). |
| **Hitch time ratio** | Sum of (frame interval − 1 vsync) over the motion, in ms per s. Apple's unit: under 5 ms/s is "good", 5–10 noticeable, over 10 bad ([Apple, Explore UI animation hitches](https://developer.apple.com/videos/play/tech-talks/10855/)) | Whatever frame source feeds it | It is a scoring formula, not a tool. Fed by the trace it sees compositor frames; fed by rAF it is main-only. Useful because it weights a 400 ms stall far above one late frame, as a user does. |
| **Scripting time per frame** | LoAF `scripts[].duration`, or the trace's `FunctionCall` and `EvaluateScript` events, during motion | Main | Chromium only for an attributable breakdown. Elsewhere, a `performance.now()` wrap of the library's handlers, which a rival's bundle does not expose. Explains a drop; it is not a drop. |
| **Input to first moved frame** | Event `timeStamp` to the first frame whose position differs. In Chromium, `EventLatency` trace events give input-to-presentation, including scroll updates (`GESTURE_SCROLL_UPDATE`) ([Chromium, debug janks](https://chromium.googlesource.com/chromium/src/+/main/docs/speed/debug-janks.md)) | Trace: compositor. rAF: main | rAF approximates it well without load, because a native scroll started in a click handler first draws at the next commit. Under load rAF over-reports it. |
| **Settle time** | Input end (release, click) to the last frame that moved more than 0.5 px, and the `scrollend` or the library's settle event | Position: main; trace: compositor | Native scroll: the last movement can be seen late by the main thread. The `scrollend` timestamp is the browser's own and is reliable in all three engines (FINDINGS). |
| **Velocity continuity at release** | Release velocity (pointer, last 80 ms) against the deck's velocity in the first 50 ms after release | Main (drag and release in carouseldeck write or start from the main thread) | A drop to near 0 and a re-acceleration is the felt "catch" at release. Native release motion runs on the compositor, so in Chromium read it from `ScrollTree::OnScrollOffsetAnimated` timing or a screencast. |
| **Direction reversals and overshoot** | Count of sign changes in per-frame movement, and the largest travel past the rest point | As above | Distinguishes a re-snap (back motion) from a clean arrival, which a frame count cannot. |
| **Seam artifacts** | Loop correction error (content moved across a jump, already in `src/page.ts` of the prototype), edge hits, and blank frames | Correction and edge: main (the jump is a main-thread write). Blank frames: screenshots only | A blank or checkerboarded frame never shows in rAF. Chromium: trace screenshots (`startTracing({ screenshots: true })`), `checkerboarded_needs_raster` / `has_missing_content` on `PipelineReporter` frames (both fields present in Probe 1's trace), or CDP `Page.startScreencast`. Firefox and WebKit: none scripted at frame rate; Playwright's video is too coarse to count frames. |

## 2. Per input: which metrics, with which tool

The load for "under main-thread long tasks" is one engine-neutral page
script: a busy loop of a set length (for example 120 ms every 250 ms, and a
single 400 ms block placed mid-motion), started from the input. Chromium can
also slow everything with CDP `Emulation.setCPUThrottlingRate`, which
Firefox and WebKit lack.

| Input | Primary metrics | Chromium (Playwright) | Firefox (Playwright) | WebKit (Playwright) | Real iPhone |
| ----- | --------------- | --------------------- | -------------------- | ------------------- | ----------- |
| **Touch swipe and flick** | Hitch ratio and dropped frames during the finger and the fling; settle time; travel per flick; input latency | CDP `Input.synthesizeScrollGesture` with `gestureSourceType: 'touch'`, `preventFling: false`, a `speed` in px/s (defaults: `preventFling` true, speed 800) (Playwright 1.63 `types/protocol.d.ts`, `synthesizeScrollGestureParameters`). Or raw `Input.dispatchTouchEvent`, as `measure/scroll-snap.spec.ts:207-232` does. Score from the trace. | **Not measurable.** Playwright has no trusted touch-move input outside CDP; `locator.dispatchEvent` touch events are untrusted ([Playwright, touch events](https://playwright.dev/docs/touch-events)) and drive the rivals' JS but not native scrolling. FINDINGS already marks Firefox and WebKit flicks untested. | **Not measurable**, as Firefox | Camera (240 fps) for frames; in-page logger for rAF, travel, settle, `scrollend` |
| **Next / Prev** | Dropped frames; input to first moved frame; settle time; the curve (position over time); direction reversals. Plus repeated presses (5 × at 40 ms, as FINDINGS) | `page.click`; trace for frames (both native scroll and the rivals' CSS transitions are compositor); rAF for the rivals' rAF engines | rAF and position (main-only). Smooth scroll is APZ, so rAF under-reports smoothness | rAF and position (main-only) | Logger plus camera |
| **Mouse drag and release** | Follow phase: per-frame lag between pointer and deck (px), dropped rAF frames (valid: main-thread motion in every library). Release: velocity continuity, reversals, settle time, slides travelled per throw speed | `page.mouse` moves with `steps` (trusted); trace for the release phase | Same, rAF only; release phase main-only | Same, rAF only | n/a (no mouse); a pointer on iPadOS is out of scope |
| **Loop seam crossing** | Correction error, edge hits, blank frames, reversals, and the frame metrics of the input that crossed it | All of the above inputs started next to the seam, plus trace screenshots for blank frames | Correction error and edge hits; no blank-frame check | Same as Firefox | Logger box (already in the prototype pages) plus camera for flashes |
| **Each under long tasks** | The same metrics with the load script running. The headline is the longest visual stall (ms) and the hitch ratio | Trace is the only scripted method that is not fooled (Probe 1) | rAF says the deck stopped even where APZ kept it going: report main-only figures as such, never as smoothness | Same | Camera is the only truth: rAF on iOS sees nothing while blocked |

### Real iPhone, from Linux

- **Without a Mac:** an in-page logger that posts its rAF, scroll,
  `scrollend` and position samples to the LAN server (the prototype's
  `serve` already reaches the phone). It is main-only, and iOS Safari keeps
  page rendering updates near 60 fps unless the Feature Flag "Prefer Page
  Rendering Updates near 60fps" is off, while scrolling and CSS animations
  run at 120 Hz on ProMotion (Settings > Apps > Safari > Advanced > Feature
  Flags; the flag name is from Safari's own settings, and the 60/120 split is
  reported in [whatwg/html#5025](https://github.com/whatwg/html/issues/5025),
  not in an Apple document). Record the flag's state with every run.
- **Ground truth without a Mac:** a 240 fps slow-motion video of the screen,
  with a high-contrast stripe or frame counter on each slide. Count the
  distinct frames shown per vsync and any repeated or blank frame. It is the
  only Mac-free method that sees what the user sees. Analyse it offline
  (ffmpeg frame diff), so it costs nothing to repeat.
- **Inspector from Linux:** `ios_webkit_debug_proxy` connects to Mobile
  Safari over usbmuxd on Linux, with Web Inspector turned on in the phone's
  Safari settings. Its README warns of "major discrepancies between Chrome
  Remote Debugging Protocol and Webkit Inspector Protocol"
  ([google/ios-webkit-debug-proxy](https://github.com/google/ios-webkit-debug-proxy)).
  It is fine for the console. Whether its front ends can record a Timeline
  is unverified; do not plan on it.
- **With a Mac:** Safari Web Inspector's Timelines tab has a Frames view of
  "rendering frames", with 30 and 60 fps guide lines, and recordings can be
  exported and imported
  ([WebKit, Timelines tab](https://webkit.org/web-inspector/timelines-tab/)).
  These are WebContent rendering updates, so a UI-process scroll would not
  show as frames there (an inference from the iOS scrolling model; not
  checked). Xcode Instruments' Animation Hitches template measures commit and
  render hitches on the device, in hitch ms per second (Apple talk above),
  and is the right tool if a Mac becomes available.

## 3. Recommended metric set for the bench (#138)

Run every rival and carouseldeck on the same markup (the `compare` entries'
basic deck, with loop on and off), same slide size, same viewport, and the
same inputs and load script.

| # | Metric | Inputs | Chromium | Firefox | WebKit (Playwright) | iPhone |
| - | ------ | ------ | -------- | ------- | ------------------- | ------ |
| 1 | **Longest visual stall** (ms between frames that moved the deck, during motion) | All, with and without load | Trace (`PipelineReporter` + `ScrollTree::OnScrollOffsetAnimated` / `DrawFrame`) | rAF (main-only) | rAF (main-only) | Camera |
| 2 | **Hitch time ratio** (ms/s) and **percent dropped frames** over the motion window | All | Trace | rAF, labelled main-only | rAF, labelled main-only | Camera; logger as main-only |
| 3 | **Input to first moved frame** (ms) | Next/Prev, drag start, touch | `EventLatency` from the trace | Event `timeStamp` to first moved rAF | Same | Logger |
| 4 | **Settle time** (ms, input end to rest) and **travel** (slides per throw) | All | rAF position + `scrollend` / library settle event | Same | Same | Logger |
| 5 | **Velocity continuity at release** (post/pre ratio) and **reversals** | Mouse drag release; touch release in Chromium | Trace timing of offset updates; rAF for rivals | rAF | rAF | Camera for touch |
| 6 | **Drag follow lag** (px between pointer and deck per frame) | Mouse drag | rAF | rAF | rAF | n/a |
| 7 | **Seam: correction error, edge hits, blank frames** | Every input across the seam | All three, blank frames from trace screenshots | Correction and edge hits | Correction and edge hits | Logger + camera |
| 8 | **Main-thread cost**: LoAF count and `blockingDuration`, scripting ms per frame | All | LoAF + trace | n/a | n/a | n/a |

Rules the bench should keep:

- Report every Firefox and WebKit frame figure as "main-thread view". Never
  rank a native scroller on rAF figures against a transform engine: rAF
  favours the transform engine, because it makes every frame on the main
  thread where rAF can see it.
- Score Chromium headed with a GPU for absolute rates. Headless frame pacing
  is a timer, so headless figures are only comparative.
- Each claim in FINDINGS or an ADR needs its test (GLOSSARY). Frame timing
  in CI is noisy (map #136, "Not yet specified"). Gate on ratios against a
  rival run in the same job, or on counts that are not timing (reversals,
  correction error, edge hits, travel), not on absolute ms.

### Not measurable, per engine

- **Chromium:** fine-grained timing is not a phone's; Android Chrome's real
  fling curve and vsync differ from desktop headless. Everything above is
  measurable.
- **Firefox (Playwright):** no trace, no CDP (CDP sessions are Chromium only,
  [Playwright, Browser](https://playwright.dev/docs/api/class-browser)), no
  LoAF, no trusted touch. APZ scrolling and smooth scroll are invisible
  except as the lagging main-thread position. The Firefox Profiler can
  record the Compositor and Renderer threads from launch with
  `MOZ_PROFILER_STARTUP=1`, `MOZ_PROFILER_STARTUP_FILTERS` and
  `MOZ_PROFILER_SHUTDOWN=<file>` ([Firefox source docs, HTTP
  logging](https://firefox-source-docs.mozilla.org/networking/http/logging.html)
  shows the variables). Whether Playwright's patched Firefox honours them is
  untested; if it does, that is Firefox's compositor view, analysed by hand.
- **WebKit (Playwright):** it is not Safari: Playwright patches WebKit
  built from the main branch, and the closest Safari experience is WebKit
  on a Mac ([Playwright, browsers](https://playwright.dev/docs/browsers)).
  On Linux it is the WPE port, with its own scrolling and smooth-scroll
  curve (Probe 2) and its own off-snap wheel rests (FINDINGS). No trace,
  no LoAF, no trusted touch. Its numbers say nothing of iOS.
- **iPhone:** no scripted input at all; every run is by hand. Without a Mac,
  no compositor timing but the camera.

## 4. How the rivals move

All figures are each library's defaults unless named. "Main" means the
motion is computed on the main thread and stops in a long task. "Compositor"
means a CSS transition, which runs on through one once started.

### Embla 8.6.0 (`esm/embla-carousel.esm.js`)

- **Clock.** One rAF loop with a fixed 60 Hz step and an accumulator: it runs
  `update()` once per 16.67 ms of elapsed time and renders an interpolation
  (`Animations`, 116-160; `fixedTimeStep` 118; catch-up loop 141-146). After
  a long task it runs all the missed steps at once, so the deck jumps to
  where the physics would be. Main.
- **Next/Prev.** No easing function and no duration: a damped spring.
  Each step `velocity += displacement / duration; velocity *= friction;`
  (`ScrollBody.seek`, 536-560), with `duration: 25` (default, 1440) and
  `friction = 0.68` (1335). `scrollTo` resets both to these (1586-1589).
  Simulated for 800 px: first step 1.31 px/ms, peak 3.07 px/ms at the 5th
  step, 90% at ~383 ms, 99% at ~700 ms, `settle` when within 0.001 px at
  ~1.87 s, no overshoot. The time does not grow with distance.
- **Drag.** Touch and mouse listeners; `touchmove` is non-passive and
  prevented (310, 318, 369), so a touch swipe is JS-driven. While dragging the
  spring follows the pointer with friction 0.3 and duration 0.75 (366).
- **Release.** Velocity is distance over time since a start event that
  resets every 170 ms (`DragTracker`, `logInterval` 406; 422-437); under
  0.1 px/ms it is no flick. It is multiplied by a boost of 300 (mouse) or
  400 (touch) (288-291). If that projected force is under the
  `goToNextThreshold` (20% of the view, clamped to 50–225 px, 287), the
  deck goes to the nearest snap; otherwise to the **next slide only**,
  unless `skipSnaps` (default false, 1439) (`allowedForce`, 329-335). The
  release spring uses `duration = 25 − 10 × forceFactor` and
  `friction = 0.68 + forceFactor / 50` (371-386). The spring keeps the
  drag's velocity, so release is continuous.
- **Loop.** No copies. At the content's ends the location vectors wrap by
  the content size (`ScrollLooper`, 689-711, `jointSafety` 0.1), and the
  slides that must show across the seam each get their own `translate3d`
  shift of ± content size (`SlideLooper`, 988-1061; `Translate`, 954-963),
  both in the render step (1325-1327).

### Keen Slider 6.8.6 (`keen-slider.es.js`, formatted)

- **Clock.** rAF animator over wall-clock time (`h()`, 132-191): position
  is `distance × easing(elapsed / duration)`, elapsed capped to the
  duration (137). A long task skips ahead. Main.
- **Next/Prev.** `next()` / `prev()` call `moveToIdx(abs ± 1)` (931-936);
  `moveToIdx` animates **500 ms** with **easeOutQuint**
  `1 + (t − 1)^5` (956-968). Default `mode: "snap"`, `rubberband: true`,
  `renderMode: "precision"` (989-995). For 800 px: 125 px in the first
  16.7 ms (an initial 8 px/ms), 99% at ~301 ms.
- **Release (snap mode).** Velocity is the mean over the last 6 moves within
  200 ms (track `_`, 280; `velocity`, 425-445). The target is the slide the
  drag started on, plus one in the velocity's sign: **one slide at most**,
  then 500 ms easeOutQuint (`dragEnded`, 529-551). Free modes project with
  `dist = v² / (147e-9 + v / 1000)` and twice that duration, easeOutCubic
  (`m()` 508-512; `h()` 463-503).
- **Loop.** No copies. Each slide's offset is taken modulo the track length
  and wrapped to the side it should show on (track details, 305), and the
  renderer sets each slide's own `translate3d` (778-780).

### Swiper 14.3.0 (`shared/swiper-core.mjs`, `swiper.css`)

- **Next/Prev.** A **CSS transition** on the wrapper's `transform`:
  `transitionDuration = speed` (`setTransition`, 2485-2488), `speed: 300`
  (355); the timing function is
  `var(--swiper-wrapper-transition-timing-function, initial)` (`swiper.css`
  47-48, variable `initial` at 17), so CSS's initial **`ease`**. Compositor.
  For 800 px: 31 px in the first 16.7 ms, 99% at ~261 ms.
- **`cssMode`** (off by default, 356) is native scroll snap: `slideTo` calls
  `wrapperEl.scrollTo({ behavior: 'smooth' })` (2256-2286), and touch end
  returns early to let the browser snap (799-801).
- **Drag.** `onTouchMove` sets the translate on each pointer event (1236),
  `touchRatio: 1`, `threshold: 5`, `resistanceRatio: 0.85` at the ends
  (404-422). Main.
- **Release.** No velocity projection outside free mode. If the drag took
  under `longSwipesMs: 300` (timeDiff 763), it goes **one slide (or group)**
  the way it was swiped; otherwise it advances if it passed
  `longSwipesRatio: 0.5` of the slide (840-880). Then the 300 ms `ease`
  transition. Free mode (off, `free-mode.mjs` 6) projects
  `velocity × 1000 ms` with `momentumRatio: 1` (66-90).
- **Loop.** Reposition: `loopFix` moves slide elements with
  `slidesEl.prepend` / `append` (1766, 1774) and compensates with an
  instant `slideTo(…, 0)` (1801). It runs before Next/Prev (2074) and during
  a drag (1073). `loopPreventsSliding: true` (435) **drops a Next pressed
  while a transition runs** (2072).

### Splide 4.1.4 (`dist/js/splide.esm.js`)

- **Next/Prev.** A **CSS transition**:
  `transform <speed>ms <easing>` (`Slide.start`, 2942-2958), with
  `speed: 400` and `easing: "cubic-bezier(0.25, 1, 0.5, 1)"` (2875, 2885).
  Compositor. For 800 px: 126 px in the first 16.7 ms, 99% at ~284 ms.
  Reduced motion sets `speed: 0` (2893-2896). With `useScroll` it animates
  in rAF instead, easeOutQuart `1 − (1 − t)^4` (2110-2111).
- **Drag.** `Move.translate` per pointer move (2203); at a non-loop end the
  drag is divided by `FRICTION = 5` (746, 2312-2313). Main.
- **Release.** Velocity over the time since a base event saved every
  `LOG_INTERVAL = 200` ms (747, 2204-2209, 2280-2290). Destination =
  position + sign × min(|v| × `flickPower` 600, list size ×
  `flickMaxPages` 1) (2292-2293), so **one page at most**; then `go` to the
  nearest index with the 400 ms transition (2249-2265).
- **Loop.** Copies: `perPage × MULTIPLIER` (2) each side by default
  (1306, 1374-1386). Clone and jump, before the move: when a move would
  cross the copies, `Move.move` first shifts the position by one slider
  length, instantly, then transitions (1427-1431); a drag's translate wraps
  the same way (1446-1464).

### Flicking 4.17.1 (`dist/flicking.esm.js`) with Axes 3.9.3

- **Clock.** Axes' rAF loop (`_animateLoop`, axes 1753-1786). Main.
- **Next/Prev.** `next(duration = this._duration)` (5521-5524), defaults
  `duration = 500` and `easing = x => 1 − (1 − x)^3` (easeOutCubic)
  (4636-4637), passed to Axes (2018-2021). For 800 px: 78 px in the first
  16.7 ms, 99% at ~393 ms.
- **Release.** The only rival that **projects a throw by deceleration**.
  Axes measures velocity over intervals of at least 16 ms (axes 107,
  951-955), then displacement `v / 2 × |v| / deceleration` (axes 1584-1592)
  and duration `sqrt(2d / deceleration)` (axes 763-764), with Flicking's
  `deceleration = 75e-4` px/ms² (4635). The release animation lasts
  `max(axes duration, 500)` (1714). `SnapControl.moveToPosition` snaps to
  the anchor nearest the projected position when the throw passes the
  panel's size (`count = Infinity`, 2643), to the adjacent panel when it
  passes `threshold = 40` px, else back (2657-2690, 2767-2776).
- **Drag.** Default `inputType: ["mouse", "touch"]`, `bounce: "20%"` at the
  ends (4638-4643).
- **Loop (`circular`, off by default, 4625).** Reposition: each panel
  "toggles" to the other end as the camera passes its toggle point (1143,
  1509-1513, 4328-4343), and the renderer reorders the elements with
  `insertBefore`, or CSS `order` with `useCSSOrder` (3838-3849, 3884-3898).
  The camera itself is one `translate` (1375).

### Summary

| Library | Next/Prev | Runs in | Release | Max travel per release (default) | Loop |
| ------- | --------- | ------- | ------- | -------------------------------- | ---- |
| Embla 8.6.0 | Damped spring, `duration` 25, friction 0.68, 60 Hz fixed step; 90% at ~383 ms | Main (rAF) | Force = v × 300/400, spring keeps drag velocity | 1 slide (`skipSnaps` false) | Per-slide translate shift + location wrap, no copies |
| Keen 6.8.6 | 500 ms easeOutQuint | Main (rAF) | Sign of mean velocity, 500 ms easeOutQuint | 1 slide | Per-slide modulo translate, no copies |
| Swiper 14.3.0 | 300 ms CSS `ease` transition | Compositor | Time (< 300 ms) or ratio (0.5); no projection | 1 slide or group | Reposition DOM nodes + instant offset; Next dropped mid-transition |
| Splide 4.1.4 | 400 ms CSS `cubic-bezier(0.25, 1, 0.5, 1)` | Compositor | v × 600, capped at 1 page, nearest index | 1 page | Clone and jump (2 × perPage copies), jump before the move |
| Flicking 4.17.1 | 500 ms easeOutCubic | Main (rAF) | Deceleration 0.0075 px/ms², duration ≥ 500 ms | Unlimited (`count` Infinity) | Reposition (toggle panels, reorder DOM) |
| carouseldeck | Native smooth `scrollTo`, browser's curve (Chromium ~410 ms to 99% for 800 px) | Compositor | v × 220 ms to the nearest snap, at least one snap if over 0.4 px/ms (`packages/core/src/index.ts` 1132-1144, 1354-1362), then native smooth scroll | Unlimited | Clone and jump at rest (ADR 0006, 0009) |

Every rival drives touch from JavaScript (their touch listeners, above), so
a touch swipe on them is main-thread motion with their release rules, not
the platform's momentum.

## 5. What this means for carouseldeck

The map's rule: native scroll snap as far as it can go; something else only
per input, and only where the bench shows native cannot reach a target.

- **Touch swipe and flick: stay native.** It is the one input where every
  rival is main-thread and capped at one slide (Flicking aside), and
  carouseldeck is on the compositor with the platform's momentum. Under a
  long task the rivals stop and carouseldeck does not (Probe 1, applied to a
  user scroll; measure it with metric 1 in Chromium and with the camera on
  the iPhone). Expect to win here.
- **Next/Prev: native is likely enough, but the curve is the browser's.**
  Swiper and Splide also run on the compositor, so carouseldeck's edge under
  load is only over Embla, Keen and Flicking. Without load, Chromium's
  native curve is slower to start and longer (~410 ms to 99%) than Swiper's,
  Splide's or Keen's (~260–300 ms). If the bench's "input to first moved
  frame" or "settle" target fails on that, the per-input fallback is an
  eased animation for Next/Prev only. Under the map's rule, it should still
  scroll the native viewport (an rAF loop writing `scrollLeft` with
  snapping off, as the drag already does), so loop, focus and
  scroll-driven effects keep working. That loses the compositor in a long
  task, which is the trade the bench must price.
- **Mouse drag release: the likely gap.** The drag follow phase is
  main-thread in every library, carouseldeck included, so it competes on
  equal terms (metric 6). At release, carouseldeck hands a moving deck to a
  native smooth scroll that starts from rest in Chromium (27 px in the first
  ~59 ms, Probe 2). Embla's spring keeps the drag's velocity, and Keen and
  Splide start at ~8 px/ms. Measure velocity continuity (metric 5) first. If
  it fails, the fallback for this input only is a release animation that
  starts at the release velocity (a decaying curve, as Flicking's, or a
  spring, as Embla's), written to `scrollLeft` with snapping off, ending at
  the snap point it projects now. Its projection (220 ms × v) already moves
  more than one slide, as only Flicking's does.
- **Loop seam: carouseldeck's design is already the safest.** Swiper and
  Flicking reposition DOM nodes, which ADR 0006 rejected for the focus trap
  and the runway. Splide clones and jumps like carouseldeck, but jumps before
  a move, so a fast press sequence can run out of copies. Embla and Keen
  translate single slides, which a scroll container cannot do. Bench metric 7
  is a check, not a likely target to miss. The open risk stays iOS (camera
  for flashes at the jump).
- **Effects** (fade, stack, curve) read scroll progress from the main thread
  (ADR 0007), so they are main-only motion even over a compositor scroll. In
  a long task the slides scroll but the effect freezes. Measure them with the
  Chromium trace's `has_main_animation` frames, and treat this as part of the
  map's open question on effects with the one-instance loop.

## Open points for the bench

- Whether Playwright's Firefox honours the `MOZ_PROFILER_*` variables. If it
  does, Firefox gains a compositor view.
- A scripted, trusted touch flick in Firefox and WebKit does not exist in
  Playwright 1.63. Touch outside Chromium is iPhone-only.
- iOS Safari's smooth-scroll curve, momentum constants and 120 Hz behaviour
  are unmeasured. Desktop Safari remains untested (ADR 0006, "Open checks").
