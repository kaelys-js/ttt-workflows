import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ThemeToggle from '@/components/ThemeToggle';

describe('ThemeToggle', () => {
	beforeEach(() => {
		document.documentElement.classList.remove('dark');
		localStorage.clear();
	});
	afterEach(() => localStorage.clear());

	it('renders a labelled toggle', () => {
		render(<ThemeToggle />);
		expect(screen.getByRole('button', { name: /toggle dark mode/i })).toBeInTheDocument();
	});

	it('turns dark mode on and persists it', () => {
		render(<ThemeToggle />);
		fireEvent.click(screen.getByRole('button', { name: /toggle dark mode/i }));
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(localStorage.getItem('theme')).toBe('dark');
	});

	it('toggles back to light on a second click', () => {
		render(<ThemeToggle />);
		const btn = screen.getByRole('button', { name: /toggle dark mode/i });
		fireEvent.click(btn);
		fireEvent.click(btn);
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(localStorage.getItem('theme')).toBe('light');
	});
});
