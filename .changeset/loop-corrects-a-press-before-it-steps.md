---
"@carouseldeck/core": patch
---

A looping deck's Next and Prev no longer stall once rapid presses outrun the deck's own settle: before, a press could ask to step past the shells the scroll range reaches, where the browser clamps the write and fires no event to jump off at, pinning the deck there for every press after. A press now corrects the position into the middle set first, synchronously, so it always has a full set of room ahead of it.
