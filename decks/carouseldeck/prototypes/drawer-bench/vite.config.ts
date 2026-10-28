// THROWAWAY (#233). Drawer bench prototype app: drawerdeck's ported
// mechanics (plain JS/TS, no React) against vaul and Base UI's Drawer
// (React). A sibling app to ../scroll-snap, not a page inside it: that
// app has no React, so adding React, vaul and Base UI there would touch
// its shared vite/tsconfig for a prototype that does not use any of its
// carousel content (see RESULTS.md's "What was built").

import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const page = (name: string) =>
  fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        'bench-drawerdeck': page('bench-drawerdeck'),
        'bench-vaul': page('bench-vaul'),
        'bench-baseui': page('bench-baseui')
      }
    }
  }
});
