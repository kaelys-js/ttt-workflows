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

// Flip the document theme and persist it. Prefers a whole-viewport crossfade via the View
// Transitions API, falls back to a brief surface-colour transition, and honours reduced-motion.
// Lives here rather than in the toggle control so the behaviour is unit-tested directly instead
// of through a UI framework — the control is now a plain server-rendered button.
export function toggleTheme(): void {
	const root = document.documentElement;
	const next = !root.classList.contains('dark');
	const apply = (): void => {
		root.classList.toggle('dark', next);
		writeTheme(next ? 'dark' : 'light');
	};

	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		apply();
		return;
	}

	const startVT = (document as unknown as { startViewTransition?: (cb: () => void) => unknown })
		.startViewTransition;
	if (typeof startVT === 'function') {
		startVT.call(document, apply);
		return;
	}

	root.classList.add('theme-anim');
	apply();
	window.setTimeout(() => root.classList.remove('theme-anim'), 320);
}
