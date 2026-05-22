import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';

export default defineConfig({
  site: 'https://matthijs99.github.io',
  base: '/slachthuis_monitor',
  trailingSlash: 'always',
  integrations: [svelte()],
});
