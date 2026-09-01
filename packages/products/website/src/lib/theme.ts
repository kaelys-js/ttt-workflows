import * as v from 'valibot';

// The theme is persisted in localStorage under this key by the pre-paint inline script in
// Layout.astro and by ThemeToggle. Its value is user-controllable, so it is validated on the
// way in and out with valibot rather than trusted.
export const THEME_KEY = 'theme';

export const ThemeSchema = v.picklist(['light', 'dark']);
export type Theme = v.InferOutput<typeof ThemeSchema>;

export function parseTheme(input: unknown): Theme | null {
	const result = v.safeParse(ThemeSchema, input);
	return result.success ? result.output : null;
}

// Read the stored theme, validated — returns null when nothing valid is stored.
export function readStoredTheme(): Theme | null {
	try {
		return parseTheme(localStorage.getItem(THEME_KEY));
	} catch {
		return null;
	}
}

// Persist a theme, validated — a bad value is dropped instead of being written.
export function writeTheme(theme: unknown): void {
	const valid = parseTheme(theme);
	if (valid) localStorage.setItem(THEME_KEY, valid);
}
