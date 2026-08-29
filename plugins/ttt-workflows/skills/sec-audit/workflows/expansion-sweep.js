// expansion-sweep.js — Workflow-tool script (multi-agent, opt-in). Hunts NET-NEW findings
// on surfaces a targeted deep-read has not yet exhausted, adversarially verifies each.
// TARGET-AGNOSTIC: everything comes from `args`; nothing about any client is hardcoded.
//
// args = {
//   surfaces: [ { label, root, lens } , ... ]   // required — the code roots to hunt + focus lens
//   known_classes?: string   // optional — a plain-text list of ALREADY-KNOWN finding classes;
//                             //            candidates matching these are marked novel=false
// }
// Returns { surfaces, total_candidates, novel_candidates, confirmed_novel, findings[] }.

export const meta = {
  name: 'expansion-sweep',
  description: 'Hunt NET-NEW security findings on un-deep-read surfaces and adversarially verify them',
  phases: [{ title: 'Hunt' }, { title: 'Verify' }],
};

const surfaces = (args && args.surfaces) || [];
if (!surfaces.length) { log('expansion-sweep: no surfaces in args — nothing to hunt'); return { surfaces: 0, total_candidates: 0, novel_candidates: 0, confirmed_novel: 0, findings: [] }; }
const known = (args && args.known_classes) || '';
const knownBlock = known
  ? `\n\nALREADY-KNOWN classes (report a NEW instance only, with novel=false + overlaps set):\n${known}\n\nA NET-NEW finding is OUTSIDE those classes — a different vulnerable pattern, endpoint, or data flow. Set novel=true for those.`
  : `\n\nNo prior finding list was supplied — treat every confirmed vulnerability as novel=true.`;

const SCHEMA = {
  type: 'object', required: ['findings'],
  properties: { findings: { type: 'array', items: {
    type: 'object', required: ['title', 'severity', 'file', 'line', 'evidence', 'why_exploitable', 'novel'],
    properties: {
      title: { type: 'string' }, severity: { enum: ['CRITICAL','HIGH','MEDIUM','LOW','INFO'] },
      cwe: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
      evidence: { type: 'string' }, why_exploitable: { type: 'string' },
      novel: { type: 'boolean' }, overlaps: { type: 'string' },
    } } } },
};

phase('Hunt');
const hunted = await parallel(surfaces.map((s) => () =>
  agent(
`You are a senior application-security auditor doing a SEMANTIC deep read (SFP12 discipline) of a REAL production codebase surface, hunting NET-NEW vulnerabilities.

SURFACE: ${s.label}
ROOT: ${s.root}
FOCUS LENS: ${s.lens}

Read the actual files under ROOT (ls/grep/cat/read). Trace real data flow from an attacker-controlled entry to a sink. For each finding: cite file:line you actually read, state the concrete exploit path, set severity by real impact.${knownBlock}

Adversarially self-refute each candidate before reporting (R2): if the exploit is actually closed, drop it. Report only what survives (empty array if none).`,
    { label: `hunt:${s.label}`, phase: 'Hunt', schema: SCHEMA }
  ).then((r) => ({ surface: s.label, findings: (r?.findings || []) }))
));

const all = hunted.filter(Boolean).flatMap((h) => h.findings.map((f) => ({ ...f, surface: h.surface })));
const novel = all.filter((f) => f.novel);
log(`hunted ${all.length} candidates, ${novel.length} novel — verifying`);

phase('Verify');
const verified = await parallel(novel.map((f) => () =>
  agent(
`Adversarially VERIFY this claimed NET-NEW finding against the real code. Prove the exploit is OPEN or refute it.

TITLE: ${f.title}
FILE: ${f.file}:${f.line}
EVIDENCE: ${f.evidence}
WHY: ${f.why_exploitable}

Read the actual file and surrounding code. A refute must prove the exploit is CLOSED (input validated, authz enforced, sink safe). "It's intended" or "needs an authed caller" is a severity caveat, NOT a refutation. Return verdict CONFIRMED / STOOD-DOWN / NEEDS-DEEPER-READ with a one-line reason.`,
    { label: `verify:${f.surface}`, phase: 'Verify',
      schema: { type: 'object', required: ['verdict','reason'], properties: { verdict: { enum: ['CONFIRMED','STOOD-DOWN','NEEDS-DEEPER-READ'] }, reason: { type: 'string' } } } }
  ).then((v) => ({ ...f, verdict: v?.verdict, reason: v?.reason }))
));

const confirmed = verified.filter(Boolean).filter((f) => f.verdict === 'CONFIRMED');
return {
  surfaces: surfaces.length,
  total_candidates: all.length,
  novel_candidates: novel.length,
  confirmed_novel: confirmed.length,
  findings: confirmed.map((f) => ({ title: f.title, severity: f.severity, cwe: f.cwe, file: f.file, line: f.line, surface: f.surface, evidence: f.evidence, reason: f.reason })),
};
