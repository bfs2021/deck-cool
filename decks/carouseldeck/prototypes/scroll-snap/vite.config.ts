import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const page = (name: string) =>
  fileURLToPath(new URL(`./${name}.html`, import.meta.url));

export default defineConfig({
  // Relative asset paths, so `dist/` works served from any origin root or
  // subpath.
  base: './',
  build: {
    rolldownOptions: {
      input: {
        index: page('index'),
        'loop-clone-jump': page('loop-clone-jump'),
        'loop-reposition': page('loop-reposition'),
        'loop-one-instance': page('loop-one-instance'),
        drag: page('drag'),
        fade: page('fade'),
        // #138's smoothness bench.
        bench: page('bench'),
        'bench-carouseldeck': page('bench-carouseldeck'),
        'bench-one-instance': page('bench-one-instance'),
        'bench-embla': page('bench-embla'),
        'bench-keen': page('bench-keen'),
        'bench-swiper': page('bench-swiper'),
        'bench-splide': page('bench-splide'),
        'bench-flicking': page('bench-flicking'),
        'bench-iphone': page('bench-iphone')
      }
    }
  }
});
