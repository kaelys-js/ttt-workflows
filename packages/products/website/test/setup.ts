import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom under an opaque origin exposes no Storage; the theme lib reads/writes localStorage.
if (!globalThis.localStorage) {
	let store: Record<string, string> = {};
	globalThis.localStorage = {
		getItem: (k: string) => (k in store ? store[k] : null),
		setItem: (k: string, val: string) => {
			store[k] = String(val);
		},
		removeItem: (k: string) => {
			delete store[k];
		},
		clear: () => {
			store = {};
		},
		key: (i: number) => Object.keys(store)[i] ?? null,
		get length() {
			return Object.keys(store).length;
		},
	} as Storage;
}

// jsdom doesn't implement matchMedia; components read it for reduced-motion.
if (!window.matchMedia) {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		addListener: vi.fn(),
		removeListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}));
}
