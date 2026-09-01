import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COPIED_MS, copyText, wireCopyButtons } from '@/lib/copy';

// copyText + wireCopyButtons are the framework-free behaviour behind the CopyCommand button.

function mockClipboard(impl?: () => Promise<void>) {
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText: vi.fn(impl ?? (() => Promise.resolve())) },
	});
	return navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

// Drain the microtask queue (Promises aren't faked by fake timers) so the copy chain settles.
async function flush() {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('copyText', () => {
	afterEach(() => {
		// @ts-expect-error — restore for the "no clipboard" case
		delete navigator.clipboard;
	});

	it('writes the text and reports success', async () => {
		const writeText = mockClipboard();
		await expect(copyText('/plugin install ttt-workflows')).resolves.toBe(true);
		expect(writeText).toHaveBeenCalledWith('/plugin install ttt-workflows');
	});

	it('reports failure when the clipboard write rejects', async () => {
		mockClipboard(() => Promise.reject(new Error('denied')));
		await expect(copyText('x')).resolves.toBe(false);
	});

	it('reports failure when the Clipboard API is unavailable', async () => {
		// @ts-expect-error — simulate a context without the Clipboard API
		delete navigator.clipboard;
		await expect(copyText('x')).resolves.toBe(false);
	});
});

describe('wireCopyButtons', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
		// @ts-expect-error — cleanup
		delete navigator.clipboard;
	});

	it('flashes data-copied for COPIED_MS after a successful copy', async () => {
		const writeText = mockClipboard();
		document.body.innerHTML = '<button data-copy="/pr-review">copy</button>';
		wireCopyButtons();
		const btn = document.querySelector('button')!;
		btn.click();
		await flush();
		expect(btn.hasAttribute('data-copied')).toBe(true);
		expect(writeText).toHaveBeenCalledWith('/pr-review');
		vi.advanceTimersByTime(COPIED_MS);
		expect(btn.hasAttribute('data-copied')).toBe(false);
	});

	it('does not flash when the copy fails', async () => {
		mockClipboard(() => Promise.reject(new Error('no')));
		document.body.innerHTML = '<button data-copy="/trp">copy</button>';
		wireCopyButtons();
		const btn = document.querySelector('button')!;
		btn.click();
		await flush();
		expect(btn.hasAttribute('data-copied')).toBe(false);
	});
});
