import { defineConfig, devices } from '@playwright/test';

// E2E builds with ASTRO_BASE=/ (see test:e2e), so the site serves from the server root.
const base = 'http://localhost:4321/';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'line',
	timeout: 30_000,
	expect: {
		timeout: 10_000,
		// Absorb sub-pixel anti-aliasing jitter (a few px on text edges) while still catching
		// any real layout/colour regression.
		toHaveScreenshot: { maxDiffPixelRatio: 0.005 },
	},
	use: {
		baseURL: base,
		trace: 'on-first-retry',
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } },
	],
	webServer: {
		// astro preview/build can hang when backgrounded in a sandbox, so `test:e2e` builds
		// first and this only serves the pre-built dist statically from the server root.
		command: 'node serve.mjs',
		url: base,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
