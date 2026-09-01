import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GithubButton from '@/components/GithubButton';

describe('GithubButton', () => {
	it('links to the repo and opens in a new tab safely', () => {
		render(<GithubButton />);
		const link = screen.getByRole('link', { name: /view on github/i });
		expect(link).toHaveAttribute('href', 'https://github.com/kaelys-js/ttt-workflows');
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
	});
});
