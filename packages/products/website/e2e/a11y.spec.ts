import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// End-to-end accessibility gate. axe-core is run against WCAG 2.0/2.1/2.2 A + AA (the standard as
// of 2026) plus axe's best-practice rules, under both the desktop and mobile Playwright projects
// (so touch-target and small-viewport rules are exercised too). Any violation fails the build.
// axe covers the machine-checkable ~57%; the human-judgement rules (focus order, meaningful
// sequence, real alt text) are held by the review rubric, not this gate.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function scan(page: Page, label: string) {
	const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	// One line per failing node — the rule, the element, and any contrast data — so a failure
	// names exactly what to fix.
	const summary = violations.flatMap((v) =>
		v.nodes.map((n) => {
			const data = n.any?.[0]?.data;
			const extra = data?.contrastRatio
				? ` [ratio ${data.contrastRatio} < ${data.expectedContrastRatio}, fg ${data.fgColor} on ${data.bgColor}]`
				: '';
			return `${v.id} (${v.impact}) ${n.target.join(' ')}${extra}`;
		}),
	);
	expect(summary, `${label} — axe violations:\n${summary.join('\n')}`).toEqual([]);
}

// reducedMotion:'reduce' disables the scroll-reveal + hero entrance so every element is at its
// resting opacity — axe then measures real contrast, not a mid-fade frame.
test('a11y — landing page (light)', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
	await page.goto('./');
	await scan(page, 'light');
});

test('a11y — landing page (dark)', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('./');
	await page.evaluate(() => document.documentElement.classList.add('dark'));
	await scan(page, 'dark');
});

test('a11y — FAQ expanded', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('./');
	await page.locator('#faq summary').first().click();
	await scan(page, 'faq-open');
});
