import { expect, test } from '@playwright/test';

// Visual regression on the hero, in both themes. Runs in CI, not skipped: the suite executes
// inside the pinned Playwright Docker container (see the web-e2e gate), so rendering is
// byte-identical on every machine. Any live GitHub version fetch is stubbed to a fixed tag so
// the render is deterministic. Animations disabled.
test.describe('visual', () => {
	test.beforeEach(async ({ page }) => {
		await page.route('**/api.github.com/**', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ tag_name: 'v0.0.0' }),
			}),
		);
	});

	test('hero — light', async ({ page }) => {
		await page.goto('./');
		await page.emulateMedia({ colorScheme: 'light' });
		await expect(page.locator('section').first()).toHaveScreenshot('hero-light.png', {
			animations: 'disabled',
		});
	});

	test('hero — dark', async ({ page }) => {
		await page.goto('./');
		await page.evaluate(() => document.documentElement.classList.add('dark'));
		await expect(page.locator('section').first()).toHaveScreenshot('hero-dark.png', {
			animations: 'disabled',
		});
	});
});
