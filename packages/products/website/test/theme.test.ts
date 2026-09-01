import { afterEach, describe, expect, it } from 'vitest';
import { parseTheme, readStoredTheme, THEME_KEY, writeTheme } from '@/lib/theme';

afterEach(() => localStorage.clear());

describe('parseTheme', () => {
	it('accepts only light or dark', () => {
		expect(parseTheme('light')).toBe('light');
		expect(parseTheme('dark')).toBe('dark');
		expect(parseTheme('neon')).toBeNull();
		expect(parseTheme(null)).toBeNull();
		expect(parseTheme(1)).toBeNull();
	});
});

describe('writeTheme / readStoredTheme', () => {
	it('round-trips a valid theme', () => {
		writeTheme('dark');
		expect(localStorage.getItem(THEME_KEY)).toBe('dark');
		expect(readStoredTheme()).toBe('dark');
	});

	it('drops an invalid theme instead of storing it', () => {
		writeTheme('rainbow');
		expect(localStorage.getItem(THEME_KEY)).toBeNull();
	});

	it('returns null when a garbage value is already stored', () => {
		localStorage.setItem(THEME_KEY, 'corrupted');
		expect(readStoredTheme()).toBeNull();
	});
});
