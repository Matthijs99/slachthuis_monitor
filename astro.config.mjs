import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  // TODO: replace 'example' with the actual GitHub username before deploying.
  // The site field only affects absolute URLs (canonical link, sitemap) —
  // the page still works at /slachthuis_monitor/ with the placeholder.
  site: 'https://example.github.io',
  base: '/slachthuis_monitor',
  trailingSlash: 'always',
  integrations: [svelte()],
});
