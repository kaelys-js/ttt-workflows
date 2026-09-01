import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: { '@': resolve(__dirname, 'src') },
	},
	test: {
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./test/setup.ts'],
		include: ['test/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary'],
			// The site is framework-free Astro now; the behaviour lives in lib/*.ts and is unit-tested
			// here. The .astro components are covered by the Playwright E2E + visual regression.
			include: ['src/lib/**/*.ts'],
			thresholds: { lines: 75, functions: 75, statements: 75 },
		},
	},
});
