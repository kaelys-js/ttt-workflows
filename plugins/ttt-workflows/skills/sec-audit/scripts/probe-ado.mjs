#!/usr/bin/env node
// probe-ado.mjs — READ-ONLY Azure DevOps pipeline-posture probe. Finds CI-plane findings
// that source cannot: cleartext (non-secret) secrets in pipeline variable groups, and
// pipeline variables holding token-shaped values without isSecret. (the known-list finding class.)
//
// Usage:  node probe-ado.mjs --org <org> --project <proj> [--out ado-findings.json]
//   Auth: ADO bearer via `az account get-access-token --resource 499b84ac-...`.
//         (set AZURE_CONFIG_DIR to select a non-default az context).
//   READ-ONLY: GET on distributedtask/variablegroups only.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const KNOWN = new Set(['--org', '--project', '--out']);
for (let i = 0; i < args.length; i++) {
	if (args[i].startsWith('--')) {
		if (!KNOWN.has(args[i])) {
			die(`unknown flag ${args[i]}`);
		}
		if (!args[i + 1] || args[i + 1].startsWith('--')) {
			die(`${args[i]} needs a value`);
		}
		i++;
	}
}
const opt = (f, d) => {
	const i = args.indexOf(f);
	return i >= 0 ? args[i + 1] : d;
};
const org = opt('--org'),
	project = opt('--project'),
	out = opt('--out', 'ado-findings.json');
function die(m) {
	console.error(`probe-ado: ${m}`);
	process.exit(1);
}
if (!org || !project) {
	die('need --org and --project');
}

let token;
try {
	token = execFileSync(
		'az',
		[
			'account',
			'get-access-token',
			'--resource',
			'499b84ac-1321-427f-aa17-267ca6975798',
			'--query',
			'accessToken',
			'-o',
			'tsv',
		],
		{ encoding: 'utf8' },
	).trim();
} catch (error) {
	die(
		`could not mint ADO bearer (az login to the ADO tenant first): ${(error.stderr || error.message).toString().split('\n')[0]}`,
	);
}

function get(url) {
	try {
		return JSON.parse(
			execFileSync('curl', ['-s', '-H', `Authorization: Bearer ${token}`, url], {
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024,
			}) || 'null',
		);
	} catch (error) {
		console.error(`probe-ado: warn — GET ${url}: ${(error.message || '').split('\n')[0]}`);
		return null;
	}
}

const base = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/distributedtask/variablegroups?api-version=7.1-preview.2`;
const vg = get(base);
if (!vg || !Array.isArray(vg.value)) {
	die(
		'could not list variable groups — check ADO access to this org/project (this is an access boundary, not a clean result)',
	);
}
console.error(`probe-ado: ${vg.value.length} variable groups in ${org}/${project} · READ-ONLY`);

const findings = [];
const SECRETY_NAME = /token|secret|key|password|pwd|pat|conn|sas|apikey|sonar|client.?secret/i;
const TOKENY_VAL = /^[A-Za-z0-9_-]{24,}$|sq[apu]_[0-9a-f]{40}|xox[baprs]-|-----BEGIN|AccountKey=/;
function scanVars(container, vars) {
	for (const [vname, v] of Object.entries(vars || {})) {
		if (v.isSecret) {
			continue;
		} // correctly protected
		const val = v.value || '';
		const nameHit = SECRETY_NAME.test(vname);
		const valHit = TOKENY_VAL.test(val);
		if (nameHit || valHit) {
			findings.push({
				id_hint: 'CLEARTEXT-PIPELINE-SECRET',
				severity: nameHit && valHit ? 'HIGH' : 'MEDIUM',
				class: 'cleartext-pipeline-secret',
				resource: `${container}/${vname}`,
				evidence: `variable '${vname}' isSecret=false${valHit ? ' and holds a token-shaped value' : ''} — readable in cleartext by anyone with pipeline/definition read (SonarQube/registry token class)`,
			});
		}
	}
}
// (a) library variable groups
for (const g of vg.value) {
	scanVars(`vargroup:${g.name}`, g.variables);
}
// (b) build-definition variables (where inline pipeline vars live — this is where the known-list finding hides)
const defs = get(
	`https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/build/definitions?api-version=7.1&includeAllProperties=true`,
);
const defCount = defs && Array.isArray(defs.value) ? defs.value.length : 0;
for (const bd of defs?.value || []) {
	scanVars(`builddef:${bd.name}`, bd.variables);
}

writeFileSync(
	out,
	JSON.stringify(
		{
			org,
			project,
			groupCount: vg.value.length,
			defCount,
			probedAt: new Date().toISOString(),
			findings,
		},
		null,
		2,
	),
);
console.log(
	`wrote ${out} — ${findings.length} live-ADO findings (${vg.value.length} vargroups + ${defCount} build defs) · ids: ${[...new Set(findings.map((f) => f.id_hint))].join(', ') || '(none)'}`,
);
