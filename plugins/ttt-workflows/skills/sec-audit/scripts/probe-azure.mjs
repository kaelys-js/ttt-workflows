#!/usr/bin/env node
// probe-azure.mjs — READ-ONLY live Azure ARM posture probe. Finds the running-state
// findings that source/IaC reads cannot: firewall public access, TLS floors, Key Vault
// network + purge, ACR admin, Defender tier, diagnostic settings, PG version/settings.
//
// Usage:  node probe-azure.mjs [--sub <id>] [--rg-prefix <substr>] [--out azure-findings.json]
//   --rg-prefix filters resource groups by case-insensitive substring; omit to scan all.
//   Auth: uses the ambient `az` login (set AZURE_CONFIG_DIR to select a non-default context).
//   READ-ONLY: only `az ... list/show` GETs. No create/update/delete verb is ever issued.
//
// Emits structured findings (id-hint, severity, cvss, resource, evidence) mapping to the
// known-list running-state finding classes.

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const KNOWN = new Set(['--sub', '--rg-prefix', '--out']);
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
/* c8 ignore start -- live Azure posture I/O below; exercised by real sweeps, not unit tests */
const opt = (f, d) => {
	const i = args.indexOf(f);
	return i >= 0 ? args[i + 1] : d;
};
const out = opt('--out', 'azure-findings.json');
const rgPrefix = (opt('--rg-prefix', '') || '').toLowerCase();

function die(m) {
	console.error(`probe-azure: ${m}`);
	process.exit(1);
}
// Only read verbs are allowed through az() — enforced so this stays read-only.
function az(argv) {
	const joined = argv.join(' ');
	if (!/\b(list|show)\b/.test(joined) && !joined.startsWith('account show')) {
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
			`probe-azure: warn — az ${joined}: ${(error.stderr || error.message).toString().split('\n')[0]}`,
		);
		return null;
	}
}

const findings = [];
const add = (f) => findings.push(f);

const sub = opt('--sub', (az(['account', 'show']) || {}).id);
if (!sub) {
	die('no subscription — run `az login`, choose a context via AZURE_CONFIG_DIR, or pass --sub');
}
console.error(
	`probe-azure: subscription ${String(sub).slice(0, 8)}… · rg-scope '${rgPrefix || 'all'}' · READ-ONLY`,
);

const pgs = (az(['postgres', 'flexible-server', 'list', '--subscription', sub]) || []).filter((s) =>
	(s.resourceGroup || '').toLowerCase().includes(rgPrefix),
);
for (const s of pgs) {
	const rg = s.resourceGroup,
		{ name } = s;
	if ((s.network?.publicNetworkAccess || '') === 'Enabled') {
		add({
			id_hint: 'PUBLIC-DB',
			severity: 'CRITICAL',
			cvss: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H',
			class: 'network/public-db',
			resource: `${rg}/${name}`,
			evidence:
				'postgres flexibleServer network.publicNetworkAccess = Enabled (reachable from any Azure customer VM)',
		});
	}
	const cfg =
		az([
			'postgres',
			'flexible-server',
			'parameter',
			'list',
			'--server-name',
			name,
			'--resource-group',
			rg,
		]) || [];
	const thr = cfg.find(
		(p) => p.name === 'connection_throttle.enable' || p.name === 'connection_throttling',
	);
	if (thr && String(thr.value).toLowerCase() === 'off') {
		add({
			id_hint: 'NO-CONN-THROTTLE',
			severity: 'HIGH',
			cvss: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:L/SC:H/SI:H',
			class: 'no-throttle',
			resource: `${rg}/${name}`,
			evidence: `connection_throttle.enable = off (no per-IP failed-auth throttle)`,
		});
	}
	if (s.version && Number(s.version) < 13) {
		add({
			id_hint: 'EOL-DB-ENGINE',
			severity: 'HIGH',
			cvss: 'CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H',
			class: 'eol-engine',
			resource: `${rg}/${name}`,
			evidence: `PostgreSQL ${s.version} (past community EOL — no security patches)`,
		});
	}
	const mc = cfg.find((p) => p.name === 'max_connections');
	if (mc && Number(mc.value) >= 1000 && (s.network?.publicNetworkAccess || '') === 'Enabled') {
		add({
			id_hint: 'DB-MAX-CONN-DOS',
			severity: 'MEDIUM',
			cvss: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:H',
			class: 'conn-exhaustion-dos',
			resource: `${rg}/${name}`,
			evidence: `max_connections=${mc.value} on a public server with no pooler in front — connection-exhaustion DoS surface`,
		});
	}
	const pwenc = cfg.find((p) => p.name === 'password_encryption');
	if (pwenc && String(pwenc.value).toLowerCase() === 'md5') {
		add({
			id_hint: 'WEAK-PW-HASH',
			severity: 'MEDIUM',
			cvss: 'CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:H/VI:N/VA:N',
			class: 'weak-pw-hash',
			resource: `${rg}/${name}`,
			evidence: `password_encryption = md5 (downgradeable protocol-level auth; SCRAM available)`,
		});
	}
	const fw =
		az([
			'postgres',
			'flexible-server',
			'firewall-rule',
			'list',
			'--server-name',
			name,
			'--resource-group',
			rg,
		]) || [];
	for (const r of fw) {
		if (r.startIpAddress === '0.0.0.0' && r.endIpAddress === '0.0.0.0') {
			add({
				id_hint: 'PUBLIC-DB',
				severity: 'CRITICAL',
				cvss: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H',
				class: 'firewall/allow-all-azure',
				resource: `${rg}/${name}`,
				evidence: `firewall rule '${r.name}' = 0.0.0.0-0.0.0.0 (AllowAllAzure — every Azure customer VM)`,
			});
		} else if (
			/^\d/.test(r.startIpAddress || '') &&
			r.startIpAddress === r.endIpAddress &&
			r.startIpAddress !== '0.0.0.0'
		) {
			add({
				id_hint: 'PERSONAL-IP-FIREWALL',
				severity: 'HIGH',
				cvss: 'CVSS:4.0/AV:N/AC:L/AT:P/PR:N/UI:N/VC:H/VI:H/VA:H',
				class: 'firewall/personal-ip',
				resource: `${rg}/${name}`,
				evidence: `single-IP firewall rule '${r.name}' (${r.startIpAddress}) — likely a personal/home IP allowlist entry`,
			});
		}
	}
	const diag = az(['monitor', 'diagnostic-settings', 'list', '--resource', s.id]) || { value: [] };
	if ((diag.value || diag || []).length === 0) {
		add({
			id_hint: 'NO-DIAGNOSTICS',
			severity: 'HIGH',
			cvss: '',
			class: 'no-diagnostics',
			resource: `${rg}/${name}`,
			evidence: 'zero diagnostic settings (failed-auth events are ephemeral, ship nowhere)',
		});
	}
}

const pricing = az([
	'security',
	'pricing',
	'show',
	'--name',
	'OpenSourceRelationalDatabases',
	'--subscription',
	sub,
]);
if (pricing && (pricing.pricingTier || '').toLowerCase() === 'free') {
	add({
		id_hint: 'DEFENDER-OFF',
		severity: 'HIGH',
		cvss: '',
		class: 'defender-off',
		resource: `sub/${String(sub).slice(0, 8)}`,
		evidence:
			'Microsoft Defender for OpenSourceRelationalDatabases tier = Free (no brute-force/anomaly detection)',
	});
}

for (const kv of (az(['keyvault', 'list', '--subscription', sub]) || []).filter((k) =>
	(k.resourceGroup || '').toLowerCase().includes(rgPrefix),
)) {
	const d = az(['keyvault', 'show', '--name', kv.name]) || {};
	const p = d.properties || {};
	if (
		(p.publicNetworkAccess || 'Enabled') === 'Enabled' &&
		(p.networkAcls?.defaultAction || 'Allow') === 'Allow'
	) {
		add({
			id_hint: 'KV-PUBLIC',
			severity: 'MEDIUM',
			cvss: 'CVSS:4.0/AV:N/AC:H/AT:P/PR:H/UI:N/VC:H/VI:H/VA:H',
			class: 'kv-public',
			resource: kv.name,
			evidence: 'Key Vault publicNetworkAccess Enabled + networkAcls default Allow',
		});
	}
	if (p.enablePurgeProtection !== true) {
		add({
			id_hint: 'KV-PUBLIC',
			severity: 'MEDIUM',
			cvss: '',
			class: 'kv-no-purge',
			resource: kv.name,
			evidence: 'Key Vault purge protection not enabled',
		});
	}
	const pol = (p.accessPolicies || []).length;
	if (!p.enableRbacAuthorization && pol >= 5) {
		add({
			id_hint: 'KV-BROAD-ACCESS',
			severity: 'HIGH',
			cvss: 'CVSS:4.0/AV:N/AC:L/AT:N/PR:L/UI:N/VC:H/VI:H/VA:L',
			class: 'kv-broad-access',
			resource: kv.name,
			evidence: `legacy access-policy model with ${pol} principals granted (JWT_SECRET readable offline by each)`,
		});
	}
}

for (const acr of (az(['acr', 'list', '--subscription', sub]) || []).filter((a) =>
	(a.resourceGroup || '').toLowerCase().includes(rgPrefix),
)) {
	if (acr.adminUserEnabled === true) {
		add({
			id_hint: 'ACR-ADMIN',
			severity: 'MEDIUM',
			cvss: 'CVSS:4.0/AV:N/AC:L/AT:P/PR:H/UI:N/VC:H/VI:H/VA:L',
			class: 'acr-admin',
			resource: acr.name,
			evidence: `ACR adminUserEnabled = true (shared static push credential)${acr.publicNetworkAccess === 'Enabled' ? ' + public network' : ''}`,
		});
	}
}

for (const st of (az(['storage', 'account', 'list', '--subscription', sub]) || []).filter((a) =>
	(a.resourceGroup || '').toLowerCase().includes(rgPrefix),
)) {
	if (
		!st.minimumTlsVersion ||
		st.minimumTlsVersion === 'TLS1_0' ||
		st.minimumTlsVersion === 'TLS1_1'
	) {
		add({
			id_hint: 'STORAGE-WEAK-TLS',
			severity: 'MEDIUM',
			cvss: 'CVSS:4.0/AV:N/AC:H/AT:P/PR:N/UI:N/VC:L/VI:L/VA:N',
			class: 'storage-weak-tls',
			resource: st.name,
			evidence: `storage minimumTlsVersion = ${st.minimumTlsVersion || 'unset (defaults TLS1_0)'}`,
		});
	}
	if (
		(st.publicNetworkAccess || 'Enabled') === 'Enabled' &&
		(st.networkRuleSet?.defaultAction || 'Allow') === 'Allow'
	) {
		add({
			id_hint: 'STORAGE-WEAK-TLS',
			severity: 'MEDIUM',
			cvss: '',
			class: 'storage-public',
			resource: st.name,
			evidence: 'storage publicNetworkAccess Enabled + default network action Allow',
		});
	}
	if (st.allowSharedKeyAccess !== false) {
		add({
			id_hint: 'STORAGE-SHARED-KEY',
			severity: 'MEDIUM',
			cvss: 'CVSS:4.0/AV:N/AC:L/AT:P/PR:H/UI:N/VC:H/VI:H/VA:L',
			class: 'storage-shared-key',
			resource: st.name,
			evidence:
				'allowSharedKeyAccess not disabled — account-key auth accepted (a leaked key = full data-plane; Entra-only is available)',
		});
	}
}

writeFileSync(
	out,
	JSON.stringify(
		{ subscription: sub, rgPrefix, probedAt: new Date().toISOString(), findings },
		null,
		2,
	),
);
const bySev = findings.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {});
console.log(
	`wrote ${out} — ${findings.length} live-Azure findings ${JSON.stringify(bySev)} · ids: ${[...new Set(findings.map((f) => f.id_hint))].join(', ')}`,
);
/* c8 ignore stop */
