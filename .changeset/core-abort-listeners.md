---
"@carouseldeck/core": patch
"@carouseldeck/react": patch
"@carouseldeck/react-18": patch
---

The deck removes the listeners it adds for its whole life with one `AbortController` when it is destroyed, in place of a `removeEventListener` call for each. The bundle is smaller, and a listener can no longer outlive the deck because its removal did not match how it was added.
