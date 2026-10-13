#!/usr/bin/env node
// THROWAWAY (#138). Min+gzip per bench deck: the same method
// ../../../scripts/compare-libraries.mjs uses for the package README's
// comparison table (Vite build in memory, minified, gzipped, every JS
// chunk plus any stylesheet the entry imports), applied to each deck's own
// bench entry (src/bench/<lib>.ts), so the figure is what that deck's page
// actually ships: the library plus the few lines of glue every deck has
// (content.ts, harness.ts, chrome.ts). No React: this app has none, and
// every rival here is driven through its vanilla JS API, same as
// carouseldeck's own `@carouseldeck/core` used directly.
//
// Run after `pnpm build` (carouseldeck/core must have a dist/):
//   node bench/bundle-size.mjs

import { fileURLToPath, URL } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));

const entries = [
  { deck: 'carouseldeck', entry: 'src/bench/carouseldeck.ts' },
  { deck: 'embla', entry: 'src/bench/embla.ts' },
  { deck: 'keen', entry: 'src/bench/keen.ts' },
  { deck: 'swiper', entry: 'src/bench/swiper.ts' },
  { deck: 'splide', entry: 'src/bench/splide.ts' },
  { deck: 'flicking', entry: 'src/bench/flicking.ts' }
  // one-instance is excluded: it is this app's own prototype code
  // (src/pages/loop-one-instance.ts + src/deck.ts/drag.ts/settle.ts), not a
  // library with a standalone bundle size of its own to compare -- its
  // bytes are the same kind of "carouseldeck engine code" as the shipped
  // deck's, just not packaged as @carouseldeck/core.
];

/** @param {string} entry */
async function measure(entry) {
  const { build } = await import('vite');
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    build: {
      write: false,
      sourcemap: false,
      rollupOptions: { input: `${root}/${entry}` }
    }
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (bundle) => ('output' in bundle ? bundle.output : [])
  );
  return outputs.reduce((sum, item) => {
    if (item.type === 'chunk') return sum + gzipSync(item.code).length;
    if (item.fileName.endsWith('.css'))
      return sum + gzipSync(item.source).length;
    return sum;
  }, 0);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

const main = async () => {
  const rows = [];
  for (const { deck, entry } of entries) {
    const bytes = await measure(entry);
    rows.push({ deck, bytes });
    console.log(`${deck.padEnd(14)} ${kb(bytes)}`);
  }
  console.log('\nJSON:', JSON.stringify(rows));
};

await main();
