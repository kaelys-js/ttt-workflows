import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
	it('joins class names', () => {
		expect(cn('a', 'b')).toBe('a b');
	});
	it('drops falsy values', () => {
		expect(cn('a', undefined, null, '', 'c')).toBe('a c');
	});
	it('merges conflicting tailwind classes, last wins', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
	});
});
