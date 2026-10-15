---
"@carouseldeck/core": patch
---

A looping deck's JavaScript placement path no longer leaves a real slide's translate on the wrong axis after `setOrientation`: the deck forgets each slide's own placement on an axis change, instead of reading its old-axis offset back out along the new axis, so a slide whose slot does not change writes no translate at all.
