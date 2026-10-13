// THROWAWAY (#138). The smoothness bench's own Playwright config, separate
// from ../playwright.config.ts (the clone-jump/reposition/fade prototypes'
// suite, #3). Build first: `pnpm build`, then this serves `../dist/`.

import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 900, height: 760 };

export default defineConfig({
  testDir: '.',
  outputDir: './results/artifacts',
  // Timing matters (drag velocity, frame sampling, trace capture): one
  // browser, one worker, in the foreground.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4181/' },
  webServer: {
    command: 'pnpm exec vite preview --port 4181 --strictPort --host 127.0.0.1',
    cwd: '..',
    url: 'http://127.0.0.1:4181/bench.html',
    reuseExistingServer: true
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport } }
  ]
});
