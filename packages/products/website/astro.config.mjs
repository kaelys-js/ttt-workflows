import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages project site: https://kaelys-js.github.io/ttt-workflows/
export default defineConfig({
	site: 'https://kaelys-js.github.io',
	// Production deploys under the Pages project subpath; E2E builds set ASTRO_BASE=/ so the
	// site can be served from a static server root.
	base: process.env.ASTRO_BASE ?? '/ttt-workflows',
	integrations: [react(), sitemap()],
	vite: { plugins: [tailwindcss()] },
});
