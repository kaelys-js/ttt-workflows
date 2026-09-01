import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Faq from '@/components/Faq';

describe('Faq', () => {
	it('renders every question', () => {
		render(<Faq />);
		expect(screen.getByText(/Does it work on GitHub and Azure DevOps/i)).toBeInTheDocument();
		expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(6);
	});

	it('expands an answer when its question is clicked', () => {
		render(<Faq />);
		fireEvent.click(screen.getByRole('button', { name: /Is my data sent anywhere/i }));
		expect(screen.getByText(/no telemetry and no phone-home/i)).toBeVisible();
	});
});
