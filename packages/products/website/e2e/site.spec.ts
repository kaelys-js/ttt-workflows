import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('./');
});

test('loads with the right title and a skip link', async ({ page }) => {
	await expect(page).toHaveTitle(/ttt-workflows/);
	await expect(page.getByRole('link', { name: /skip to content/i })).toBeAttached();
});

test('the theme toggle flips light and dark', async ({ page }) => {
	const html = page.locator('html');
	const before = await html.evaluate((el) => el.classList.contains('dark'));
	await page
		.getByRole('button', { name: /toggle dark mode/i })
		.first()
		.click();
	// The toggle applies the class inside a View Transition callback (async), so poll.
	await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(!before);
});

test('an FAQ answer expands when its question is clicked', async ({ page }) => {
	const q = page.getByRole('button', { name: /Is my data sent anywhere/i });
	await q.scrollIntoViewIfNeeded();
	await q.click();
	await expect(page.getByText(/no telemetry and no phone-home/i)).toBeVisible();
});

test('the install commands are shown for copying', async ({ page }) => {
	await expect(
		page.getByText('/plugin marketplace add kaelys-js/ttt-workflows').first(),
	).toBeVisible();
	await expect(page.getByText('/plugin install ttt-workflows').first()).toBeVisible();
});

test('external GitHub links open in a new tab safely', async ({ page }) => {
	const gh = page.locator('a[href="https://github.com/kaelys-js/ttt-workflows"]').first();
	await expect(gh).toHaveAttribute('target', '_blank');
	await expect(gh).toHaveAttribute('rel', /noopener/);
});
