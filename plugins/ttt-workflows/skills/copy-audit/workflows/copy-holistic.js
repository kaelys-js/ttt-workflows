export const meta = {
	name: 'copy-audit-holistic',
	description: 'Holistic whole-page copy audit — cross-cutting + per-line findings vs standards.md',
	phases: [{ title: 'Audit' }],
};

const FINDINGS_SCHEMA = {
	type: 'object',
	properties: {
		findings: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'integer' },
					severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
					category: {
						type: 'string',
						enum: [
							'plain-language',
							'inclusive',
							'microcopy',
							'voice-grammar',
							'consistency',
							'repetition',
						],
					},
					file: { type: 'string' },
					quote: { type: 'string' },
					problem: { type: 'string' },
					fix: { type: 'string' },
				},
				required: ['id', 'severity', 'category', 'file', 'quote', 'problem', 'fix'],
				additionalProperties: false,
			},
		},
	},
	required: ['findings'],
	additionalProperties: false,
};

phase('Audit');
const { bundleCount, bundleDir } = args;
const results = await parallel(
	Array.from({ length: bundleCount }, (_, i) => async () => {
		const idx = String(i).padStart(4, '0');
		const file = `${bundleDir}/holistic-${idx}.json`;
		return agent(
			`Read ${file} via the Read tool — "system" is your rules, "user" is the copy corpus to audit holistically. Return one StructuredOutput with the findings array. Be strict and thorough; surface every defensible issue including cross-cutting terminology/repetition/voice problems. No prose.`,
			{ schema: FINDINGS_SCHEMA, label: `holistic-${idx}`, phase: 'Audit', effort: 'medium' },
		);
	}),
);
const findings = results.filter(Boolean).flatMap((r) => r.findings || []);
return { findings, bundleCount, successfulBundles: results.filter(Boolean).length };
