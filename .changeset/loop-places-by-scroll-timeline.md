---
"@carouseldeck/core": patch
---

A looping slide now places itself with a scroll-driven animation where the browser supports one (Chromium 115+, Safari 26+), rather than a scroll listener on every scroll event; Firefox, and Safari before 26, still get the scroll listener.

A consumer may notice: a looping slide now always contains its `position: fixed` descendants and starts a stacking context, for as long as it loops, not only while it is translated to a different slot; and each looping slide carries one placement animation of its own, which `slide.getAnimations()` and `document.getAnimations()` list alongside a consumer's own.
