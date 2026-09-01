import { expect, test, type Page } from '@playwright/test';

// Visual regression across the whole landing page, both themes. Runs in CI, not skipped: the
// suite executes inside the pinned Playwright Docker container (see the web-e2e gate), so
// rendering is byte-identical on every machine. Animations disabled for determinism.

test.describe('visual — hero', () => {
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

// Every other section, in both themes, so a colour or layout regression anywhere on the page is
// caught — not just in the hero.
test.describe('visual — page sections', () => {
	// Reveal-on-scroll starts elements at opacity:0 and fades them in on intersection; force the
	// end state so a section is never captured mid-reveal regardless of scroll timing.
	const revealAll = (page: Page) =>
		page.evaluate(() =>
			document
				.querySelectorAll('[data-reveal],[data-stagger]')
				.forEach((el) => el.classList.add('is-visible')),
		);

	const SECTIONS: { name: string; selector: string; ready?: string }[] = [
		{ name: 'nav', selector: 'header' },
		{ name: 'trust', selector: '#trust', ready: 'Read-only by default' },
		{ name: 'skills', selector: '#skills', ready: 'Three skills' },
		{ name: 'install', selector: '#install', ready: 'Install once' },
		{ name: 'in-action', selector: '#in-action', ready: 'Skills in action' },
		{ name: 'playbooks', selector: '#playbooks', ready: "Operator's playbooks" },
		{ name: 'faq', selector: '#faq', ready: 'Questions' },
		{ name: 'footer', selector: 'footer' },
	];

	for (const { name, selector, ready } of SECTIONS) {
		test(`${name} — light`, async ({ page }) => {
			await page.goto('./');
			await page.emulateMedia({ colorScheme: 'light' });
			await revealAll(page);
			if (ready) await expect(page.getByText(ready).first()).toBeVisible();
			await expect(page.locator(selector)).toHaveScreenshot(`${name}-light.png`, {
				animations: 'disabled',
			});
		});

		test(`${name} — dark`, async ({ page }) => {
			await page.goto('./');
			await page.evaluate(() => document.documentElement.classList.add('dark'));
			await revealAll(page);
			if (ready) await expect(page.getByText(ready).first()).toBeVisible();
			await expect(page.locator(selector)).toHaveScreenshot(`${name}-dark.png`, {
				animations: 'disabled',
			});
		});
	}
});
