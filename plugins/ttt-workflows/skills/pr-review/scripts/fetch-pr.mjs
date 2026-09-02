#!/usr/bin/env node
// fetch-pr.mjs — READ-ONLY fetch of a GitHub or Azure DevOps pull request into a
// normalized pr.json (metadata + unified diff + changed files + existing threads).
//
// Usage:  node fetch-pr.mjs <PR_URL> [--out <path>]
// Output: writes pr.json (default ./pr.json), prints its path + a one-line summary.
//
// READ-ONLY GUARANTEE: this script only issues reads.
//   GitHub → `gh pr view` / `gh pr diff` / `gh api graphql` (GET query).
//   ADO    → `az account get-access-token` + HTTP GET against dev.azure.com REST.
// It never calls a mutating verb (no POST/PUT/PATCH/DELETE, no `gh pr comment/review/edit`).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof fetch !== 'function') {
	console.error('fetch-pr: Node 18+ required (global fetch missing)');
	process.exit(1);
}

const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'; // Azure DevOps AAD resource GUID (stable)
const HTTP_TIMEOUT_MS = 30_000; // a stalled API must fail loudly, not hang the run

function die(msg) {
	console.error(`fetch-pr: ${msg}`);
	process.exit(1);
}

function sh(cmd, args, opts = {}) {
	try {
		return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
	} catch (error) {
		const out = (error.stdout || '') + (error.stderr || '');
		throw new Error(`${cmd} ${args.join(' ')} failed: ${out.trim() || error.message}`);
	}
}

// ---- URL parsing ------------------------------------------------------------

// Exported so the offline URL-parsing surface (both platforms and every refusal branch) is
// unit-tested directly, not just through the CLI. The network fetchers below are the only part
// that needs live gh/az; they are c8-ignored and covered by real runs.
export function parseUrl(raw) {
	let u;
	try {
		u = new URL(raw.trim());
	} catch {
		die(`not a URL: ${raw}`);
	}
	const host = u.hostname.toLowerCase();
	const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);

	if (host === 'github.com' || host.endsWith('.github.com')) {
		// /<owner>/<repo>/pull/<n>
		const i = parts.indexOf('pull');
		if (i < 2 || !/^\d+$/.test(parts[i + 1] || '')) {
			die(`unrecognized GitHub PR URL (no numeric PR id): ${raw}`);
		}
		return { platform: 'github', owner: parts[i - 2], repo: parts[i - 1], number: parts[i + 1] };
	}

	const isAdo = host === 'dev.azure.com' || host.endsWith('.visualstudio.com');
	if (isAdo) {
		// dev.azure.com/<org>/...            → org = parts[0]
		// <org>.visualstudio.com/...         → org = subdomain
		let org, rest;
		if (host === 'dev.azure.com') {
			org = parts[0];
			rest = parts.slice(1);
		} else {
			org = host.split('.')[0];
			rest = parts;
		}
		const i = rest.findIndex((p) => /^pullrequest$/i.test(p));
		if (i < 0 || !/^\d+$/.test(rest[i + 1] || '')) {
			die(`unrecognized Azure DevOps PR URL (no numeric PR id): ${raw}`);
		}
		const base =
			host === 'dev.azure.com' ? `https://dev.azure.com/${org}` : `https://${org}.visualstudio.com`;
		return { platform: 'ado', org, base, number: rest[i + 1] };
	}

	die(`unsupported host '${host}'. Supported: github.com, dev.azure.com, *.visualstudio.com`);
}

// ---- GitHub -----------------------------------------------------------------

/* c8 ignore start -- live gh/az/ClickUp I/O; exercised by real fetch runs, not unit tests */
function fetchGitHub({ owner, repo, number }) {
	const R = `${owner}/${repo}`;
	const meta = JSON.parse(
		sh('gh', [
			'pr',
			'view',
			number,
			'-R',
			R,
			'--json',
			'number,title,body,author,state,isDraft,baseRefName,headRefName,headRefOid,url,additions,deletions,changedFiles,files,commits',
		]),
	);
	const diff = sh('gh', ['pr', 'diff', number, '-R', R]); // unified diff

	// Existing review threads (for re-review etiquette / R7). Non-fatal if it fails.
	let threads = [];
	try {
		const q = `query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved isOutdated comments(first:1){nodes{author{login} path line body}}}}}}}`;
		const g = JSON.parse(
			sh('gh', [
				'api',
				'graphql',
				'-f',
				`query=${q}`,
				'-F',
				`owner=${owner}`,
				'-F',
				`repo=${repo}`,
				'-F',
				`n=${number}`,
			]),
		);
		threads = (g.data.repository.pullRequest.reviewThreads.nodes || []).map((t) => {
			const c = t.comments.nodes[0] || {};
			return {
				path: c.path || null,
				line: c.line ?? null,
				author: c.author?.login || null,
				body: (c.body || '').slice(0, 500),
				isResolved: Boolean(t.isResolved),
				isOutdated: Boolean(t.isOutdated),
			};
		});
	} catch (error) {
		console.error(`fetch-pr: warning — could not read review threads: ${error.message}`);
	}

	return {
		platform: 'github',
		url: meta.url,
		owner,
		repo,
		number: Number(number),
		title: meta.title,
		body: meta.body || '',
		author: meta.author?.login || null,
		state: meta.state,
		isDraft: Boolean(meta.isDraft),
		baseRef: meta.baseRefName,
		headRef: meta.headRefName,
		headSha: meta.headRefOid,
		additions: meta.additions,
		deletions: meta.deletions,
		changedFiles: meta.changedFiles,
		files: (meta.files || []).map((f) => ({
			path: f.path,
			additions: f.additions,
			deletions: f.deletions,
		})),
		filesTruncated: (meta.files || []).length < (meta.changedFiles ?? 0),
		commits: (meta.commits || []).map((c) => ({
			sha: (c.oid || '').slice(0, 12),
			subject: c.messageHeadline || '',
		})),
		diff,
		threads,
	};
}

// ---- Azure DevOps -----------------------------------------------------------

function adoToken() {
	const t = sh('az', [
		'account',
		'get-access-token',
		'--resource',
		ADO_RESOURCE,
		'--query',
		'accessToken',
		'-o',
		'tsv',
	]).trim();
	if (!t) {
		die('empty Azure DevOps access token — run `az login` for the correct tenant first');
	}
	return t;
}

async function adoGet(url, token, asText = false) {
	const res = await fetch(url, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: asText ? 'text/plain' : 'application/json',
		},
		signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
	});
	const txt = await res.text();
	if (txt.startsWith('<!DOCTYPE html') || txt.startsWith('<html')) {
		throw new Error(`ADO returned HTML (auth/tenant problem) for ${url}`);
	}
	if (!res.ok) {
		throw new Error(`ADO GET ${res.status} ${url}: ${txt.slice(0, 300)}`);
	}
	return asText ? txt : JSON.parse(txt);
}

// Reconstruct a unified diff for one file by writing old+new blobs to temp files
// and letting git's diff engine produce the hunks (deterministic, no extra deps).
function gitDiffFile(path, oldText, newText, tmp) {
	// Write both blobs as simple names inside `tmp` and run git there, so git emits
	// `a/a` / `b/b` headers we can rewrite cleanly to the real repo path. Hunk line
	// numbers reflect full-file content, so file:line anchors read true.
	writeFileSync(join(tmp, 'a'), oldText ?? '');
	writeFileSync(join(tmp, 'b'), newText ?? '');
	let out = '';
	try {
		out = execFileSync('git', ['diff', '--no-index', '--no-color', '--', 'a', 'b'], {
			cwd: tmp,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024,
		});
	} catch (error) {
		out = error.stdout || '';
	} // git diff exits 1 when files differ — expected
	return out
		.replace(/^diff --git a\/a b\/b$/m, `diff --git a/${path} b/${path}`)
		.replace(/^--- a\/a$/m, `--- a/${path}`)
		.replace(/^\+\+\+ b\/b$/m, `+++ b/${path}`);
}

async function fetchAdo({ org, base, number }) {
	const token = adoToken();
	// Org-level PR-by-id: resolves project + repo without parsing them from the URL.
	const pr = await adoGet(`${base}/_apis/git/pullrequests/${number}?api-version=7.1`, token);
	const project = pr.repository.project.name;
	const repoId = pr.repository.id;
	const repoName = pr.repository.name;
	const P = encodeURIComponent(project);
	const apiRepo = `${base}/${P}/_apis/git/repositories/${repoId}`;

	const sourceCommit = pr.lastMergeSourceCommit?.commitId;
	const targetCommit = pr.lastMergeTargetCommit?.commitId;

	// Latest iteration → its changed-file list.
	const iters =
		(await adoGet(`${apiRepo}/pullRequests/${number}/iterations?api-version=7.1`, token)).value ||
		[];
	const lastIter = iters.length > 0 ? iters.at(-1).id : 1;
	const changes =
		(
			await adoGet(
				`${apiRepo}/pullRequests/${number}/iterations/${lastIter}/changes?$top=2000&api-version=7.1`,
				token,
			)
		).changeEntries || [];
	if (changes.length >= 2000) {
		console.error(
			'fetch-pr: warning — change list hit the 2000-entry cap; file list may be incomplete',
		);
	}

	const tmp = mkdtempSync(join(tmpdir(), 'pr-review-'));
	process.on('exit', () => {
		try {
			rmSync(tmp, { recursive: true, force: true });
		} catch {
			/* best effort */
		}
	});
	const files = [];
	let diff = '';
	async function blob(path, commit) {
		const url = `${apiRepo}/items?path=${encodeURIComponent(path)}&versionDescriptor.versionType=commit&versionDescriptor.version=${commit}&includeContent=true&$format=json&api-version=7.1`;
		// A swallowed error here would fabricate a diff (file reads as emptied). Retry
		// once for transient failures, then die loudly — never return a fake blob.
		try {
			return (await adoGet(url, token)).content ?? '';
		} catch {
			try {
				return (await adoGet(url, token)).content ?? '';
			} catch (error) {
				die(
					`could not fetch blob ${path}@${commit.slice(0, 8)} after retry: ${error.message} — refusing to fabricate a diff`,
				);
			}
		}
	}
	for (const ch of changes) {
		const item = ch.item || {};
		if (item.isFolder || item.gitObjectType === 'tree' || !item.path) {
			continue;
		}
		const ct = (ch.changeType || '').toLowerCase();
		const path = item.path.replace(/^\//, '');
		const isAdd = ct.includes('add'),
			isDel = ct.includes('delete');
		const oldText = isAdd ? '' : await blob(path, targetCommit);
		const newText = isDel ? '' : await blob(path, sourceCommit);
		files.push({ path, status: ct });
		if (oldText.includes('\u0000') || newText.includes('\u0000')) {
			diff += `diff --git a/${path} b/${path}\nBinary files differ\n`; // don't run text diff on binary blobs
			continue;
		}
		if (oldText !== newText) {
			diff += `${gitDiffFile(path, oldText, newText, tmp)}\n`;
		}
	}

	const threads = (
		(await adoGet(`${apiRepo}/pullRequests/${number}/threads?api-version=7.1`, token)).value || []
	)
		.filter((t) => !t.isDeleted && (t.comments || []).some((c) => c.commentType !== 'system'))
		.map((t) => {
			const c = (t.comments || []).find((x) => x.commentType !== 'system') || {};
			const ctx = t.threadContext || {};
			return {
				path: ctx.filePath ? ctx.filePath.replace(/^\//, '') : null,
				line: ctx.rightFileStart?.line ?? null,
				author: c.author?.displayName || null,
				body: (c.content || '').slice(0, 500),
				isResolved: ['fixed', 'closed', 'wontfix'].includes((t.status || '').toLowerCase()),
			};
		});

	return {
		platform: 'ado',
		url: `${base}/${P}/_git/${encodeURIComponent(repoName)}/pullrequest/${number}`,
		org,
		project,
		repo: repoName,
		number: Number(number),
		title: pr.title,
		body: pr.description || '',
		author: pr.createdBy?.displayName || null,
		state: pr.status,
		isDraft: Boolean(pr.isDraft),
		baseRef: (pr.targetRefName || '').replace('refs/heads/', ''),
		headRef: (pr.sourceRefName || '').replace('refs/heads/', ''),
		headSha: sourceCommit || '',
		files,
		commits: [],
		diff,
		threads,
	};
}

// ---- ClickUp ticket (optional, read-only) -----------------------------------
// If the PR title/body/branch references a ClickUp ticket, fetch it so the review
// can diff the change against the ticket's actual description/AC (intent-alignment).
// Token: $CLICKUP_TOKEN, else the file at $CLICKUP_TOKEN_FILE, else the default
// path below. The token is sent in the Authorization header only, never printed.
// Any failure here is non-fatal: the review proceeds without the ticket.

const CLICKUP_TOKEN_FILE =
	process.env.CLICKUP_TOKEN_FILE || `${process.env.HOME}/.config/ttt/clickup.token`;
const CLICKUP_TEAM_ID = process.env.CLICKUP_TEAM_ID || '8593845';

function clickupToken() {
	if (process.env.CLICKUP_TOKEN) {
		return process.env.CLICKUP_TOKEN.trim();
	}
	if (existsSync(CLICKUP_TOKEN_FILE)) {
		return readFileSync(CLICKUP_TOKEN_FILE, 'utf8').trim();
	}
	return null;
}

function findTicketRefs(pr) {
	const hay = `${pr.title || ''}\n${pr.body || ''}\n${pr.headRef || ''}`;
	const refs = [];
	// clickup URLs: app.clickup.com/t/<id> or app.clickup.com/t/<team>/<CUSTOM-ID>
	for (const m of hay.matchAll(/app\.clickup\.com\/t\/(?:(\d+)\/)?([A-Za-z0-9_-]+)/g)) {
		refs.push({ id: m[2], custom: /^[A-Z][A-Z0-9_]*-\d+$/.test(m[2]) });
	}
	// custom task ids in prose/branch: PROJ-261, TEAM-477.
	// Deny common technical tokens that share the shape (SHA-256, UTF-8, ISO-8601, …).
	const DENY = new Set([
		'SHA',
		'UTF',
		'ISO',
		'RFC',
		'CVE',
		'AES',
		'RSA',
		'TLS',
		'HTTP',
		'HTTP2',
		'MD',
		'PG',
		'IP',
		'EC',
		'OAUTH2',
		'ES',
		'P',
		'V',
	]);
	for (const m of hay.matchAll(/\b([A-Z][A-Z0-9_]{1,15}-\d{1,6})\b/g)) {
		const prefix = m[1].split('-')[0];
		if (!DENY.has(prefix)) {
			refs.push({ id: m[1], custom: true });
		}
	}
	const seen = new Set();
	return refs.filter((r) => !seen.has(r.id) && seen.add(r.id));
}

async function fetchTicket(pr) {
	pr.ticketRefs = findTicketRefs(pr).map((r) => r.id);
	pr.ticket = null; // primary (first that resolves) — what the ticket line renders
	pr.tickets = []; // every distinct ticket that resolves, so multi-ticket PRs lose nothing
	if (pr.ticketRefs.length === 0) {
		return;
	}
	const token = clickupToken();
	if (!token) {
		console.error('fetch-pr: note — ticket refs found but no ClickUp token; skipping ticket fetch');
		return;
	}
	const seenIds = new Set();
	for (const ref of findTicketRefs(pr)) {
		const q = ref.custom ? `?custom_task_ids=true&team_id=${CLICKUP_TEAM_ID}` : '';
		try {
			const res = await fetch(
				`https://api.clickup.com/api/v2/task/${encodeURIComponent(ref.id)}${q}`,
				{ headers: { Authorization: token }, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) },
			);
			if (!res.ok) {
				continue;
			}
			const t = await res.json();
			if (seenIds.has(t.id)) {
				continue;
			} // same task referenced by URL id + custom id
			seenIds.add(t.id);
			const ticket = {
				id: t.id,
				custom_id: t.custom_id || null,
				name: t.name,
				status: t.status?.status || null,
				url: t.url,
				description: (t.description || '').slice(0, 6000),
			};
			pr.tickets.push(ticket);
			if (!pr.ticket) {
				pr.ticket = ticket;
			}
		} catch {
			/* non-fatal; try next ref */
		}
	}
	if (!pr.ticket) {
		console.error(
			`fetch-pr: note — ticket ref(s) ${pr.ticketRefs.join(', ')} did not resolve on ClickUp`,
		);
	}
}
/* c8 ignore stop */

// ---- main -------------------------------------------------------------------

// The arg + URL-parse surface here is unit/CLI-tested; the network call onward needs live tools,
// so it is c8-ignored (real runs cover it).
async function main() {
	const args = process.argv.slice(2);
	const KNOWN_FLAGS = new Set(['--out']);
	for (let i = 0; i < args.length; i++) {
		if (args[i].startsWith('--')) {
			if (!KNOWN_FLAGS.has(args[i])) {
				die(`unknown flag '${args[i]}' (known: ${[...KNOWN_FLAGS].join(', ')})`);
			}
			const v = args[i + 1];
			if (v === undefined || v.startsWith('--')) {
				die(`flag '${args[i]}' needs a value`);
			}
			i++;
		}
	}
	const url = args.find((a) => !a.startsWith('--'));
	if (!url) {
		die('usage: node fetch-pr.mjs <PR_URL> [--out <path>]');
	}
	const outIdx = args.indexOf('--out');
	const out = outIdx >= 0 ? args[outIdx + 1] : 'pr.json';

	const target = parseUrl(url);
	/* c8 ignore start -- live gh/az fetch + write; exercised by real runs */
	const pr = target.platform === 'github' ? fetchGitHub(target) : await fetchAdo(target);
	await fetchTicket(pr);
	// ADO REST has no additions/deletions counters — derive them from the reconstructed diff
	// so the renderer's scope chip and oversize gate work on both platforms.
	if (typeof pr.additions !== 'number') {
		let add = 0,
			del = 0;
		for (const ln of pr.diff.split('\n')) {
			if (ln.startsWith('+') && !ln.startsWith('+++')) {
				add++;
			} else if (ln.startsWith('-') && !ln.startsWith('---')) {
				del++;
			}
		}
		pr.additions = add;
		pr.deletions = del;
	}
	pr.fetchedAt = new Date().toISOString();
	pr.diffBytes = pr.diff.length;
	writeFileSync(out, JSON.stringify(pr, null, 2));
	const ticketNote = pr.ticket
		? ` · ticket ${pr.ticket.custom_id || pr.ticket.id} (${pr.ticket.status})`
		: pr.ticketRefs?.length
			? ` · ticket refs unresolved: ${pr.ticketRefs.join(',')}`
			: '';
	console.log(
		`wrote ${out} — ${pr.platform} ${pr.owner || pr.org}/${pr.repo}#${pr.number} "${pr.title}" · ${pr.files.length} files · ${pr.diffBytes} diff bytes · ${pr.threads.length} threads${ticketNote}`,
	);
	/* c8 ignore stop */
}

// Run only as a CLI entrypoint, so importing parseUrl for unit tests never triggers a fetch.
/* c8 ignore start -- entrypoint dispatch */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	try {
		await main();
	} catch (error) {
		console.error(`fetch-pr: ${error.message}`);
		process.exit(1);
	}
}
/* c8 ignore stop */
