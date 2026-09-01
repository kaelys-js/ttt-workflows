import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CopyCommand from '@/components/CopyCommand';

describe('CopyCommand', () => {
	it('shows the command and copies it on click', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, { clipboard: { writeText } });
		render(<CopyCommand cmd="/plugin install ttt-workflows" />);
		expect(screen.getByText('/plugin install ttt-workflows')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: /copy command/i }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith('/plugin install ttt-workflows'));
	});
});
