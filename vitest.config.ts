import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["sites/*/src/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.{ts,tsx}"],
    // Each site's build and browser tests read the one build of it.
    globalSetup: [
      "sites/deck-cool/src/build.global-setup.ts",
      "sites/pagedeck/src/build.global-setup.ts",
      "sites/playdeck/src/build.global-setup.ts",
      "sites/slidedeck/src/build.global-setup.ts",
    ],
  },
});
