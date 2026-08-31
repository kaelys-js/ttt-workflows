#!/usr/bin/env node
// probe-entra.mjs — READ-ONLY Entra (Azure AD) app-registration posture probe. Finds the
// identity-tenant findings that source/IaC cannot: reply-URL hygiene, implicit/hybrid
// flow, localhost/http reply URLs, long-lived / shared client credentials, orphaned URIs.
//
// Usage:  node probe-entra.mjs [--filter <substr,substr>] [--out entra-findings.json]
//   --filter is a comma list of case-insensitive display-name substrings; omit to scan all.
//   Auth: ambient `az` (needs Graph app-read; set AZURE_CONFIG_DIR to select a context).
//   READ-ONLY: `az ad app list/show` GETs only.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const KNOWN = new Set(['--filter', '--out']);
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
const filters = (opt('--filter', '') || '')
	.toLowerCase()
	.split(',')
	.map((s) => s.trim())
	.filter(Boolean);
const out = opt('--out', 'entra-findings.json');
function die(m) {
	console.error(`probe-entra: ${m}`);
	process.exit(1);
}
function az(argv) {
	const joined = argv.join(' ');
	if (!/\b(list|show)\b/.test(joined)) {
		die(`refused non-read az call: az ${joined}`);
	}
	try {
		return JSON.parse(
			execFileSync('az', [...argv, '-o', 'json'], {
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024,
			}) || 'null',
		);
	} catch (error) {
		console.error(
			`probe-entra: warn — az ${joined}: ${(error.stderr || error.message).toString().split('\n')[0]}`,
		);
		return null;
	}
}

const apps = az(['ad', 'app', 'list', '--all']);
if (apps === null) {
	die(
		'could not list app registrations — the signed-in identity likely lacks Directory app-read (Graph Application.Read.All). This is an access boundary, not a clean result.',
	);
}
const scoped =
	filters.length > 0
		? apps.filter((a) => filters.some((f) => (a.displayName || '').toLowerCase().includes(f)))
		: apps;
console.error(
	`probe-entra: ${apps.length} app-regs, ${scoped.length} in scope [${filters.join(', ') || 'all'}] · READ-ONLY`,
);

const findings = [];
const add = (f) => findings.push(f);
const now = Date.now();

for (const a of scoped) {
	const name = a.displayName;
	const webUris = a.web?.redirectUris || [];
	const spaUris = a.spa?.redirectUris || [];
	const allUris = [...webUris, ...spaUris, ...(a.publicClient?.redirectUris || [])];
	// localhost / http / postman reply URLs
	const risky = allUris.filter((u) =>
		/localhost|127\.0\.0\.1|^http:\/\/|postman|\.ngrok\./i.test(u),
	);
	if (risky.length > 0) {
		add({
			id_hint: 'REPLY-URL-LOCALHOST',
			severity: 'MEDIUM',
			class: 'reply-url/localhost-http',
			resource: name,
			evidence: `reply URLs include ${risky.slice(0, 3).join(', ')}${risky.length > 3 ? ' …' : ''}`,
		});
	}
	// implicit / hybrid flow
	if (
		a.web?.implicitGrantSettings?.enableAccessTokenIssuance ||
		a.web?.implicitGrantSettings?.enableIdTokenIssuance
	) {
		add({
			id_hint: 'IMPLICIT-FLOW',
			severity: 'HIGH',
			class: 'implicit-hybrid-flow',
			resource: name,
			evidence: `implicit grant enabled (access=${Boolean(a.web.implicitGrantSettings.enableAccessTokenIssuance)}, id=${Boolean(a.web.implicitGrantSettings.enableIdTokenIssuance)}) — token leaks into URL fragment`,
		});
	}
	// long-lived / many client secrets
	const creds = [...(a.passwordCredentials || []), ...(a.keyCredentials || [])];
	for (const c of creds) {
		const end = c.endDateTime ? new Date(c.endDateTime).getTime() : 0;
		if (end && end - now > 5 * 365 * 24 * 3600 * 1000) {
			add({
				id_hint: 'LONG-LIVED-CRED',
				severity: 'MEDIUM',
				class: 'long-lived-credential',
				resource: name,
				evidence: `client credential expires ${c.endDateTime} (>5y out)`,
			});
		}
	}
	// orphaned / external reply URLs — non-azure, non-msft hosts
	const external = allUris.filter((u) => {
		try {
			const h = new URL(u).hostname;
			return h && !/localhost|127\.|azurewebsites\.net|microsoft|azure\.com|msft/i.test(h);
		} catch {
			return false;
		}
	});
	if (external.length > 0) {
		add({
			id_hint: /industrio|orphan/i.test(name) ? 'ORPHANED-REPLY-URL' : 'EXTERNAL-REPLY-URL',
			severity: 'MEDIUM',
			class: 'external-reply-url',
			resource: name,
			evidence: `reply URLs point at external hosts: ${external.slice(0, 3).join(', ')} — verify each domain is still owned/registered (orphaned URI = takeover)`,
		});
	}
	// SPA redirect URIs — auth-code-in-browser surface
	if (spaUris.length > 0) {
		add({
			id_hint: 'SPA-REDIRECT',
			severity: 'LOW',
			class: 'spa-redirect',
			resource: name,
			evidence: `${spaUris.length} SPA redirect URI(s) (${spaUris.slice(0, 2).join(', ')}) — auth code returned to browser; confirm PKCE + tight origin list`,
		});
	}
	// multiple environment azurewebsites reply URLs on one app-reg — env-collapse / stale
	const aws = allUris.filter((u) => /azurewebsites\.net/i.test(u));
	const awsHosts = new Set(
		aws.map((u) => {
			try {
				return new URL(u).hostname;
			} catch {
				return u;
			}
		}),
	);
	if (awsHosts.size >= 2) {
		add({
			id_hint: 'MULTI-ENV-REPLY-URL',
			severity: 'MEDIUM',
			class: 'multi-env-reply-url',
			resource: name,
			evidence: `one app-reg lists ${awsHosts.size} distinct env reply hosts (${[...awsHosts].slice(0, 3).join(', ')}) — prod + non-prod collapsed into a single identity; a non-prod compromise mints prod tokens`,
		});
	}
}

writeFileSync(
	out,
	JSON.stringify(
		{ filters, appCount: scoped.length, probedAt: new Date().toISOString(), findings },
		null,
		2,
	),
);
const ids = [...new Set(findings.map((f) => f.id_hint))].join(', ');
console.log(
	`wrote ${out} — ${findings.length} live-Entra findings across ${scoped.length} app-regs · ids: ${ids || '(none)'}`,
);
