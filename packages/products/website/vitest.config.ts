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
		include: ['test/**/*.test.{ts,tsx}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'text-summary'],
			include: ['src/components/**/*.tsx', 'src/lib/**/*.ts'],
			// .astro pages/components are covered by the Playwright E2E + visual regression.
			exclude: ['src/**/*.astro', 'src/components/ui/**'],
			thresholds: { lines: 75, functions: 75, statements: 75 },
		},
	},
});
