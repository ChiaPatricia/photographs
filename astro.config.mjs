// @ts-check
import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const site = parse(readFileSync(new URL('./content/site.yaml', import.meta.url), 'utf8'));

export default defineConfig({
  site: site.url || undefined,
  base: site.base || '/',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  // Photographs are prepared by scripts/build-photos.mjs, not by Astro's image service.
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  devToolbar: { enabled: false },
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  vite: {
    server: { watch: { ignored: ['**/photography/**', '**/.cache/**'] } },
  },
});
