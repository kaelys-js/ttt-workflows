import { execSync } from 'node:child_process';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { parseVersion } from './src/lib/schemas.ts';

// The plugin version this site ships in lockstep with. On a release-tag deploy it comes from the
// tag (GITHUB_REF_NAME); otherwise from the latest git tag. Each candidate is validated with the
// same valibot schema the client uses, so a malformed ref never reaches the page. Empty when
// nothing valid is available (e.g. the E2E container, which has no .git) — the head then omits
// softwareVersion rather than showing a bad value.
function appVersion() {
	const fromTag = parseVersion(process.env.GITHUB_REF_NAME);
	if (fromTag) return fromTag;
	try {
		const described = execSync('git describe --tags --abbrev=0', {
			stdio: ['ignore', 'pipe', 'ignore'],
		})
			.toString()
			.trim();
		return parseVersion(described) ?? '';
	} catch {
		return '';
	}
}
const APP_VERSION = appVersion();

// GitHub Pages project site: https://kaelys-js.github.io/ttt-workflows/
export default defineConfig({
	site: 'https://kaelys-js.github.io',
	// Production deploys under the Pages project subpath; E2E builds set ASTRO_BASE=/ so the
	// site can be served from a static server root.
	base: process.env.ASTRO_BASE ?? '/ttt-workflows',
	// Emit one canonical URL per page (trailing slash) so the sitemap has no duplicate entries.
	trailingSlash: 'always',
	integrations: [
		sitemap({
			filter: (page) => page.endsWith('/'),
			serialize(item) {
				item.lastmod = new Date().toISOString();
				return item;
			},
		}),
	],
	vite: {
		plugins: [tailwindcss()],
		// Expose the release version to components so version-referencing content stays in
		// lockstep with the plugin instead of being hard-coded.
		define: {
			'import.meta.env.PUBLIC_APP_VERSION': JSON.stringify(APP_VERSION),
		},
	},
});
