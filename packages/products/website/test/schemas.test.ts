import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import {
	parseBasePath,
	parseFaqItems,
	parseRelease,
	parseStructuredData,
	parseVersion,
	PlaybookSchema,
	SkillSchema,
} from '@/lib/schemas';

describe('parseVersion', () => {
	it('accepts MAJOR.MINOR[.PATCH] and strips a leading v', () => {
		expect(parseVersion('v1.2.3')).toBe('1.2.3');
		expect(parseVersion('1.2')).toBe('1.2');
	});
	it('rejects a non-version string or undefined', () => {
		expect(parseVersion('latest')).toBeNull();
		expect(parseVersion(undefined)).toBeNull();
	});
});

describe('parseRelease', () => {
	it('accepts a version-tagged release, ignoring extra keys', () => {
		expect(parseRelease({ tag_name: 'v1.1.0', extra: true })?.tag_name).toBe('v1.1.0');
	});
	it('rejects a non-version tag_name or a null release', () => {
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

describe('PlaybookSchema', () => {
	it('accepts each of the four real playbook slugs', () => {
		for (const slug of ['pr-review', 'sec-audit', 'trp', 'copy-audit'] as const) {
			expect(v.parse(PlaybookSchema, { slug, name: 'N', body: 'B' }).slug).toBe(slug);
		}
	});
	it('rejects an unknown slug (would link a 404)', () => {
		expect(() => v.parse(PlaybookSchema, { slug: 'nope', name: 'N', body: 'B' })).toThrow();
	});
});

describe('SkillSchema', () => {
	const base = {
		icon: 'file-text',
		name: 'copy-audit',
		cmd: '/copy-audit',
		does: 'Audits the copy.',
		tags: ['plain-language', 'inclusive'],
		produces: 'Verdicts with a rewrite for each.',
		boundary: 'Approval-gated',
		boundaryNote: 'Nothing is written until you approve.',
	};
	it('accepts a well-formed skill card', () => {
		expect(v.parse(SkillSchema, base).name).toBe('copy-audit');
	});
	it('rejects an unknown boundary label', () => {
		expect(() => v.parse(SkillSchema, { ...base, boundary: 'Whenever' })).toThrow();
	});
	it('rejects a command without a leading slash and an empty tag list', () => {
		expect(() => v.parse(SkillSchema, { ...base, cmd: 'copy-audit' })).toThrow();
		expect(() => v.parse(SkillSchema, { ...base, tags: [] })).toThrow();
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
