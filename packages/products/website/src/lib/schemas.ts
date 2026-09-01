import * as v from 'valibot';

// A MAJOR.MINOR[.PATCH] version, with an optional leading "v" stripped. Validates the release
// tag / build-injected version before it is shown anywhere.
export const VersionSchema = v.pipe(
	v.string(),
	v.transform((s) => s.replace(/^v/u, '')),
	v.regex(/^\d+\.\d+(\.\d+)?$/u, 'expected MAJOR.MINOR[.PATCH]'),
);

export function parseVersion(input: unknown): string | null {
	const result = v.safeParse(VersionSchema, input);
	return result.success ? result.output : null;
}

// Shape of the GitHub "latest release" response, limited to the fields the site reads. v.object
// ignores the many other keys GitHub returns; returns null on any mismatch so callers fall back
// cleanly rather than trusting an unverified network payload.
export const GithubReleaseSchema = v.object({
	tag_name: v.pipe(v.string(), v.regex(/^v?\d+\.\d+/u, 'expected a version tag')),
	name: v.optional(v.nullable(v.string())),
	html_url: v.optional(v.pipe(v.string(), v.url())),
	published_at: v.optional(v.pipe(v.string(), v.isoTimestamp())),
});

export type GithubRelease = v.InferOutput<typeof GithubReleaseSchema>;

export function parseRelease(data: unknown): GithubRelease | null {
	const result = v.safeParse(GithubReleaseSchema, data);
	return result.success ? result.output : null;
}

// Reusable guards so every data const — not just external payloads — is parsed rather than
// trusted. TypeScript's types are erased at runtime; these throw at build if a value's actual
// shape drifts from what the code assumes.
export const NonEmpty = v.pipe(v.string(), v.trim(), v.minLength(1, 'must not be empty'));
export function parseNonEmpty(input: unknown): string {
	return v.parse(NonEmpty, input);
}

export const UrlSchema = v.pipe(v.string(), v.url('expected a URL'));
export function parseUrl(input: unknown): string {
	return v.parse(UrlSchema, input);
}

export const RepoSlugSchema = v.pipe(
	v.string(),
	v.regex(/^[\w.-]+\/[\w.-]+$/u, 'expected an owner/repo slug'),
);
export function parseRepoSlug(input: unknown): string {
	return v.parse(RepoSlugSchema, input);
}

// A FAQ item drives both the on-page accordion and the FAQPage JSON-LD, so a blank question or
// answer would ship malformed rich-result markup. Parsing the array at module load turns a typo
// into a build failure instead of silent bad markup.
export const FaqItemSchema = v.object({
	q: v.pipe(v.string(), v.trim(), v.minLength(1, 'FAQ question must not be empty')),
	a: v.pipe(v.string(), v.trim(), v.minLength(1, 'FAQ answer must not be empty')),
});
export type FaqItem = v.InferOutput<typeof FaqItemSchema>;
export const FaqItemsSchema = v.pipe(
	v.array(FaqItemSchema),
	v.minLength(1, 'at least one FAQ item is required'),
);
export function parseFaqItems(input: unknown): FaqItem[] {
	return v.parse(FaqItemsSchema, input);
}

// A schema.org JSON-LD graph — a context plus one or more typed nodes. Node shapes vary, so each
// is a loose object that only has to carry a non-empty @type; parsing guards the graph is
// well-formed before it is serialised into the page head.
export const StructuredDataSchema = v.object({
	'@context': v.literal('https://schema.org'),
	'@graph': v.pipe(
		v.array(v.looseObject({ '@type': v.pipe(v.string(), v.minLength(1)) })),
		v.minLength(1, 'the graph needs at least one node'),
	),
});
export function parseStructuredData<T>(input: T): T {
	v.parse(StructuredDataSchema, input);
	return input;
}

// An Astro base path: either "" (site at root) or a rooted path like "/ttt-workflows". Never a
// full URL — the whole site prefixes this onto asset and canonical URLs.
export const BasePathSchema = v.pipe(
	v.string(),
	v.regex(/^(|\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*)$/u, "expected '' or a rooted path"),
);
export function parseBasePath(input: unknown): string {
	return v.parse(BasePathSchema, input);
}
