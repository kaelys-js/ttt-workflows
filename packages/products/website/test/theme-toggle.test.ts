import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleTheme } from '@/lib/theme';

// toggleTheme is the framework-free behaviour behind the (now server-rendered) theme button.
// These exercise it directly rather than through a UI framework.

function setReducedMotion(matches: boolean) {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: query.includes('reduced-motion') ? matches : false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
}

describe('toggleTheme', () => {
	beforeEach(() => {
		document.documentElement.className = '';
		localStorage.clear();
		delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('flips light → dark and persists it (reduced motion, no animation path)', () => {
		setReducedMotion(true);
		toggleTheme();
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(localStorage.getItem('theme')).toBe('dark');
	});

	it('flips dark → light and persists it', () => {
		setReducedMotion(true);
		document.documentElement.classList.add('dark');
		toggleTheme();
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(localStorage.getItem('theme')).toBe('light');
	});

	it('uses the View Transitions API when available', () => {
		setReducedMotion(false);
		const startViewTransition = vi.fn((cb: () => void) => cb());
		(document as unknown as { startViewTransition: unknown }).startViewTransition =
			startViewTransition;
		toggleTheme();
		expect(startViewTransition).toHaveBeenCalledOnce();
		expect(document.documentElement.classList.contains('dark')).toBe(true);
	});

	it('falls back to a brief theme-anim class when View Transitions are absent', () => {
		vi.useFakeTimers();
		setReducedMotion(false);
		toggleTheme();
		expect(document.documentElement.classList.contains('theme-anim')).toBe(true);
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		vi.advanceTimersByTime(320);
		expect(document.documentElement.classList.contains('theme-anim')).toBe(false);
	});
});
