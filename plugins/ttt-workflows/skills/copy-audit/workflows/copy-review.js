export const meta = {
	name: 'copy-audit-review',
	description: 'Review N copy bundles for keep/rewrite/flag verdicts against the 4 pillars',
	phases: [{ title: 'Review' }],
};

// One verdict object per copy unit id. rewrite is a string ONLY when verdict is
// "rewrite"; category + severity + note are set for rewrite and flag, null for keep.
const VERDICT_SCHEMA = {
	type: 'object',
	properties: {
		verdicts: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					verdict: { type: 'string', enum: ['keep', 'rewrite', 'flag', 'delete'] },
					rewrite: { type: ['string', 'null'] },
					category: {
						type: ['string', 'null'],
						enum: [
							'plain-language',
							'inclusive',
							'microcopy',
							'voice-grammar',
							'comment',
							'testname',
							null,
						],
					},
					severity: {
						type: ['string', 'null'],
						enum: ['blocker', 'high', 'medium', 'low', null],
					},
					note: { type: ['string', 'null'] },
				},
				required: ['id', 'verdict', 'rewrite', 'category', 'severity', 'note'],
				additionalProperties: false,
			},
		},
	},
	required: ['verdicts'],
	additionalProperties: false,
};

phase('Review');
const { bundleCount, bundleDir } = args;
const results = await parallel(
	Array.from({ length: bundleCount }, (_, i) => async () => {
		const idx = String(i).padStart(4, '0');
		const file = `${bundleDir}/bundle-${idx}.json`;
		return agent(
			`Read ${file} via the Read tool — treat "system" as your rules, "user" as your task input. Return one StructuredOutput call with one verdict object per id in "Expected ids". "rewrite" is a string only when verdict is "rewrite" (else null); set category+severity+note for rewrite and flag, null for keep. No prose.`,
			{ schema: VERDICT_SCHEMA, label: `copy-review-${idx}`, phase: 'Review', effort: 'low' },
		);
	}),
);
const verdicts = results.filter(Boolean).flatMap((r) => r.verdicts || []);
// The workflow VM caps any single returned array at 4096 items, so a whole-repo sweep
// (thousands of units) would throw at the boundary. Chunk the verdicts into sub-arrays that
// each stay under the cap; the outer array holds only a handful of chunks. Callers flatten
// verdictChunks. The per-agent journal remains the canonical source either way (see
// reference/usage.md — jq over journal.jsonl).
const CHUNK = 2000;
const verdictChunks = [];
for (let i = 0; i < verdicts.length; i += CHUNK) {
	verdictChunks.push(verdicts.slice(i, i + CHUNK));
}
return {
	verdictChunks,
	verdictCount: verdicts.length,
	bundleCount,
	successfulBundles: results.filter(Boolean).length,
};
