import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages project site: https://kaelys-js.github.io/ttt-workflows/
export default defineConfig({
	site: 'https://kaelys-js.github.io',
	base: '/ttt-workflows',
	integrations: [react(), sitemap()],
	vite: { plugins: [tailwindcss()] },
});
