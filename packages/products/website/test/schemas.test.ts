import { describe, expect, it } from 'vitest';
import {
	parseBasePath,
	parseFaqItems,
	parseRelease,
	parseStructuredData,
	parseVersion,
} from '@/lib/schemas';

describe('parseVersion', () => {
	it('accepts MAJOR.MINOR[.PATCH] and strips a leading v', () => {
		expect(parseVersion('v1.2.3')).toBe('1.2.3');
		expect(parseVersion('1.2')).toBe('1.2');
	});
	it('rejects junk', () => {
		expect(parseVersion('latest')).toBeNull();
		expect(parseVersion(undefined)).toBeNull();
	});
});

describe('parseRelease', () => {
	it('accepts a version-tagged release, ignoring extra keys', () => {
		expect(parseRelease({ tag_name: 'v1.1.0', extra: true })?.tag_name).toBe('v1.1.0');
	});
	it('rejects a bad shape', () => {
		expect(parseRelease({ tag_name: 'nope' })).toBeNull();
		expect(parseRelease(null)).toBeNull();
	});
});

describe('parseBasePath', () => {
	it('accepts "" and a rooted path', () => {
		expect(parseBasePath('')).toBe('');
		expect(parseBasePath('/ttt-workflows')).toBe('/ttt-workflows');
	});
	it('rejects a full URL', () => {
		expect(() => parseBasePath('https://example.com')).toThrow();
	});
});

describe('parseFaqItems', () => {
	it('accepts non-empty items', () => {
		expect(parseFaqItems([{ q: 'Q?', a: 'A.' }])).toHaveLength(1);
	});
	it('rejects a blank answer or an empty list', () => {
		expect(() => parseFaqItems([{ q: 'Q?', a: '' }])).toThrow();
		expect(() => parseFaqItems([])).toThrow();
	});
});

describe('parseStructuredData', () => {
	it('accepts a graph with a typed node', () => {
		const g = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }] } as const;
		expect(parseStructuredData(g)).toBe(g);
	});
	it('rejects an empty graph', () => {
		expect(() => parseStructuredData({ '@context': 'https://schema.org', '@graph': [] })).toThrow();
	});
});
