#!/usr/bin/env node
// resolve-target.mjs — normalize any audit target into {kind, root, sha, platform, scope}
// plus an SP1 provenance stamp, so the mode machines don't care which of the four it was.
//
// Usage:  node resolve-target.mjs <TARGET> [--out target.json]
// Targets:
//   GitHub/ADO repo URL   → clones read-only to a scratch worktree at HEAD, records SHA
//   GitHub/ADO PR URL     → delegates to pr-review's fetch-pr.mjs; scope = the PR diff
//   local repo path       → read in place at HEAD (git sha recorded)
//   file / folder path    → scoped scan root (sha = containing-repo HEAD if any)
//
// READ-ONLY: clones/reads only. No writes to any client repo. Node 18+.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof fetch !== 'function') {
	console.error('resolve-target: Node 18+ required');
	process.exit(1);
}
const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';
// Locate the sibling pr-review skill's fetch-pr.mjs. Self-locating relative to this file
// resolves correctly in both layouts (plugin: skills/sec-audit/scripts → skills/pr-review;
// and ~/.claude/skills/sec-audit/scripts → ~/.claude/skills/pr-review). CLAUDE_PLUGIN_ROOT
// and the legacy ~/.claude path are tried as fallbacks.
const __d = dirname(fileURLToPath(import.meta.url));
const PR_REVIEW_FETCH =
	[
		join(__d, '../../pr-review/scripts/fetch-pr.mjs'),
		process.env.CLAUDE_PLUGIN_ROOT &&
			join(process.env.CLAUDE_PLUGIN_ROOT, 'skills/pr-review/scripts/fetch-pr.mjs'),
		`${process.env.HOME}/.claude/skills/pr-review/scripts/fetch-pr.mjs`,
	]
		.filter(Boolean)
		.find((p) => existsSync(p)) || join(__d, '../../pr-review/scripts/fetch-pr.mjs');

function die(m) {
	console.error(`resolve-target: ${m}`);
	process.exit(1);
}
function sh(cmd, args, opts = {}) {
	try {
		return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
	} catch (error) {
		throw new Error(
			`${cmd} ${args.join(' ')}: ${(error.stderr || error.stdout || error.message).toString().trim()}`,
		);
	}
}
function sha256(s) {
	return createHash('sha256').update(s).digest('hex');
}

const args = process.argv.slice(2);
const KNOWN = new Set(['--out']);
for (let i = 0; i < args.length; i++) {
	if (args[i].startsWith('--')) {
		if (!KNOWN.has(args[i])) {
			die(`unknown flag '${args[i]}' (known: --out)`);
		}
		if (args[i + 1] === undefined || args[i + 1].startsWith('--')) {
			die(`flag '${args[i]}' needs a value`);
		}
		i++;
	}
}
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
	die('usage: node resolve-target.mjs <repo-url | pr-url | path> [--out target.json]');
}
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : 'target.json';

// ---- classify ----------------------------------------------------------------

function classify(t) {
	let u = null;
	try {
		u = new URL(t);
	} catch {
		/* not a URL → a path */
	}
	if (u) {
		const host = u.hostname.toLowerCase();
		const isGh = host === 'github.com' || host.endsWith('.github.com');
		const isAdo = host === 'dev.azure.com' || host.endsWith('.visualstudio.com');
		if (!isGh && !isAdo) {
			die(`unsupported host '${host}' (github.com, dev.azure.com, *.visualstudio.com)`);
		}
		const isPR = /\/pull\/\d+|\/pullrequest\/\d+/i.test(u.pathname);
		return { url: t, platform: isGh ? 'github' : 'ado', kind: isPR ? 'pr' : 'repo' };
	}
	if (!existsSync(t)) {
		die(`path does not exist: ${t}`);
	}
	const st = statSync(t);
	return {
		path: t,
		platform: 'local',
		kind: st.isDirectory() ? (existsSync(join(t, '.git')) ? 'repo' : 'folder') : 'file',
	};
}

// ---- resolvers ---------------------------------------------------------------

function gitInfo(dir, subpath) {
	let remote = null,
		sha = null;
	try {
		sha = sh('git', ['-C', dir, 'rev-parse', 'HEAD']).trim();
	} catch {
		/* not a repo */
	}
	try {
		remote = sh('git', ['-C', dir, 'config', '--get', 'remote.origin.url']).trim();
	} catch {
		/* none */
	}
	return { sha, remote, scope: subpath || null };
}

/* c8 ignore start -- live clone + pr-review delegation (git/network); real runs cover it */
function cloneRepo({ url, platform }) {
	const tmp = mkdtempSync(join(tmpdir(), 'sec-audit-'));
	const dest = join(tmp, 'repo');
	if (platform === 'github') {
		sh('gh', ['repo', 'clone', url.replace(/\/$/, ''), dest, '--', '--depth', '1']);
	} else {
		const token = sh('az', [
			'account',
			'get-access-token',
			'--resource',
			ADO_RESOURCE,
			'--query',
			'accessToken',
			'-o',
			'tsv',
		]).trim();
		if (!token) {
			die('empty ADO token — az login for the right tenant first');
		}
		sh('git', [
			'-c',
			`http.extraheader=AUTHORIZATION: bearer ${token}`,
			'clone',
			'--depth',
			'1',
			url,
			dest,
		]);
	}
	const g = gitInfo(dest);
	return {
		kind: 'repo',
		root: dest,
		sha: g.sha,
		platform,
		remote: url,
		scope: null,
		ephemeral: tmp,
	};
}

async function resolvePR({ url, platform }) {
	if (!existsSync(PR_REVIEW_FETCH)) {
		die(`pr-review fetch not found at ${PR_REVIEW_FETCH}`);
	}
	const tmp = mkdtempSync(join(tmpdir(), 'sec-audit-'));
	const prJson = join(tmp, 'pr.json');
	sh('node', [PR_REVIEW_FETCH, url, '--out', prJson]);
	const pr = JSON.parse(readFileSync(prJson, 'utf8'));
	return {
		kind: 'pr',
		root: null,
		sha: pr.headSha,
		platform,
		remote: url,
		scope: (pr.files || []).map((f) => f.path),
		prJson,
		diffProvenance: sha256(pr.diff || ''),
	};
}
/* c8 ignore stop */

function resolveLocal({ path, kind }) {
	const dir = kind === 'file' ? (path.includes('/') ? path.replace(/\/[^/]+$/, '') : '.') : path;
	const g = gitInfo(dir);
	return {
		kind,
		root: path,
		sha: g.sha,
		platform: 'local',
		remote: g.remote,
		scope: kind === 'repo' ? null : [path],
	};
}

// ---- main --------------------------------------------------------------------

const c = classify(target);
let resolved;
try {
	if (c.platform !== 'local' && c.kind === 'pr') {
		resolved = await resolvePR(c);
	} else if (c.platform !== 'local' && c.kind === 'repo') {
		resolved = cloneRepo(c);
	} else {
		resolved = resolveLocal(c);
	}
} catch (error) {
	die(error.message);
}

// SP1 provenance: repo@sha@scope + a content checksum of the audited surface
resolved.provenance = {
	source: resolved.remote || resolved.root,
	sha: resolved.sha,
	scope: resolved.scope || 'whole-repo',
	stampedAt: new Date().toISOString(),
};
if (resolved.root && c.kind === 'file') {
	try {
		resolved.provenance.contentSha256 = sha256(readFileSync(resolved.root, 'utf8'));
	} catch {
		/* binary */
	}
}

writeFileSync(out, JSON.stringify(resolved, null, 2));
console.log(
	`wrote ${out} — kind=${resolved.kind} platform=${resolved.platform} sha=${(resolved.sha || 'n/a').slice(0, 12)} scope=${Array.isArray(resolved.scope) ? `${resolved.scope.length} paths` : resolved.scope || 'whole-repo'}${resolved.ephemeral ? ` (clone: ${resolved.ephemeral})` : ''}`,
);
