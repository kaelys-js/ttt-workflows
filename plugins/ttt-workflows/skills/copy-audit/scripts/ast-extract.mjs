// AST-based copy extraction. Replaces the old regex/allowlist heuristics with real
// parsers so capture is complete and robust across conventions:
//   .js/.ts/.jsx/.tsx/.mjs/.cjs/.mts/.cts  -> @babel/parser (string + JSX-text + attrs)
//   .astro                                 -> @astrojs/compiler (frontmatter as JS + template)
//   .svelte / .vue                         -> <script> as JS + template via a tag scan
//   .md/.mdx/.markdown/.mdc                -> mdast (remark) block prose + frontmatter YAML
//   .yml/.yaml                             -> the `yaml` CST (values under copy-ish context)
//   .json/.jsonc/.json5/.webmanifest       -> offset-tracking JSON scanner
//   .txt/.text                             -> paragraphs
//
// Each source string is captured WITH its AST context (JSX text, attribute name, object
// key, call arg, array element, assignment), and a single principled classifier —
// isCopyPhrase — decides copy vs code. Spans are exact source offsets of the editable
// payload, so the SHA-guarded splice only ever changes human-readable text.

import { parse as babelParse } from '@babel/parser';
import { parse as astroParse } from '@astrojs/compiler';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import YAML from 'yaml';
import path from 'node:path';
import { extractTreeSitter, extractTreeSitterComments, treeSitterSupports } from './ts-extract.mjs';

// ---------------------------------------------------------------------------
// Copy / not-copy classification
// ---------------------------------------------------------------------------

// Keys/attrs whose values are structural, never copy — even when phrase-shaped.
const NON_COPY_KEYS = new Set([
	'class',
	'classname',
	'id',
	'key',
	'href',
	'src',
	'srcset',
	'to',
	'path',
	'url',
	'rel',
	'target',
	'type',
	'style',
	'icon',
	'name', // usually a slug/identifier in data; real display names use title/label/heading
	'slug',
	'cmd',
	'command',
	'role',
	'for',
	'action',
	'method',
	'slot',
	'lang',
	'dir',
	'charset',
	'property',
	'rel',
	'as',
	'crossorigin',
	'integrity',
	'sizes',
	'media',
	'viewbox',
	'd',
	'fill',
	'stroke',
	'xmlns',
	'width',
	'height',
	'loading',
	'decoding',
	'fetchpriority',
	'datatype',
	'testid',
	'data-testid',
	'variant',
	'size',
	'color',
	'align',
	'position',
]);
// Attributes always treated as copy when static.
const COPY_ATTRS = new Set([
	'alt',
	'title',
	'placeholder',
	'label',
	'aria-label',
	'aria-description',
	'aria-roledescription',
	'aria-placeholder',
	'aria-valuetext',
	'content', // meta description/title etc — phrase filter still guards viewport-style values
]);
// Terse copy keys where even a 2-char label ("OK") is meaningful.
const COPY_KEYS = new Set([
	'title',
	'subtitle',
	'heading',
	'subheading',
	'label',
	'text',
	'body',
	'description',
	'summary',
	'tagline',
	'cta',
	'button',
	'placeholder',
	'message',
	'error',
	'hint',
	'tooltip',
	'alt',
	'caption',
	'headline',
	'blurb',
	'lead',
	'intro',
	'notice',
	'warning',
	'confirm',
	'empty',
	'success',
	'prompt',
	'question',
	'answer',
	'content',
	'does',
	'produces',
	'boundary',
	'boundarynote',
	'note',
]);
const DOM_EVENTS = new Set([
	'click',
	'dblclick',
	'submit',
	'change',
	'input',
	'keydown',
	'keyup',
	'keypress',
	'mousedown',
	'mouseup',
	'mouseover',
	'mouseout',
	'mouseenter',
	'mouseleave',
	'focus',
	'blur',
	'load',
	'unload',
	'scroll',
	'resize',
	'hover',
	'touchstart',
	'touchend',
	'pointerdown',
	'pointerup',
	'transitionend',
	'animationend',
	'beforeunload',
]);

function decodeMinimal(raw) {
	return raw
		.replaceAll(String.raw`\n`, ' ')
		.replaceAll(String.raw`\t`, ' ')
		.replaceAll(String.raw`\"`, '"')
		.replaceAll(String.raw`\'`, "'")
		.replaceAll('\\`', '`')
		.replaceAll(String.raw`\\`, '\\');
}

// Decide whether a raw string is human-facing copy. `keyed` relaxes the single-word rule
// for values in a known copy slot (a copy key or a copy attribute) so terse labels ("OK",
// "Save") survive.
export function isCopyPhrase(raw, { keyed = false } = {}) {
	const s = decodeMinimal(raw).trim();
	if (s.length < (keyed ? 2 : 3)) {
		return false;
	}
	if (!/[A-Za-z]/.test(s)) {
		return false;
	}
	if (/^https?:\/\//i.test(s) || /^www\./i.test(s) || /^mailto:/i.test(s)) {
		return false; // URL
	}
	if (/^[./~]/.test(s) && !/\s/.test(s)) {
		return false; // relative/abs path
	}
	if (/\//.test(s) && !/\s/.test(s)) {
		return false; // slash token: path/url fragment
	}
	if (/[[\]{}]/.test(s) && !/[.!?]/.test(s)) {
		return false; // selector / interpolation / object-ish, not a sentence
	}
	if (/^[#.]?[\w-]+$/.test(s) && !/\s/.test(s) && !keyed) {
		return false; // single identifier / class / token
	}
	if (!/\s/.test(s) && (/[a-z][A-Z]/.test(s) || /_/.test(s))) {
		return false; // camelCase / snake_case identifier
	}
	if (!/\s/.test(s) && /^[\w]+(\.[\w]+)+$/.test(s)) {
		return false; // dotted identifier (SF Symbol "checkmark.circle.fill", enum path)
	}
	if (DOM_EVENTS.has(s)) {
		return false; // lowercase DOM event
	}
	if (/^[A-Z0-9]+_[A-Z0-9_]+$/.test(s)) {
		return false; // CONSTANT_CASE
	}
	if (/^[\d\s.,:%+-]+$/.test(s)) {
		return false; // number/date
	}
	if (/\w+=[\w-]/.test(s) && !/[.!?]/.test(s)) {
		return false; // key=value config (e.g. width=device-width, initial-scale=1)
	}
	// A CSS/Tailwind class list: 2+ all-lowercase tokens, no sentence punctuation, AND at
	// least half the tokens carry a utility-class signal (hyphen, colon, slash, or digit —
	// e.g. "flex items-center gap-2 md:grid-cols-3"). This must NOT fire on plain lowercase
	// prose like "reset your password now" (no class-ish tokens), which is real copy.
	const toks = s.split(/\s+/);
	if (
		toks.length >= 2 &&
		!/[.!?,]/.test(s) &&
		toks.every((t) => /^[a-z0-9:_/-]+$/.test(t)) &&
		toks.filter((t) => /[:/-]/.test(t) || /\d/.test(t)).length >= toks.length / 2
	) {
		return false;
	}
	if (keyed) {
		return true;
	}
	return /\s/.test(s) || /[.!?…:]$/.test(s);
}

function isCopyKey(k) {
	return COPY_KEYS.has(String(k).toLowerCase());
}
function isNonCopyKey(k) {
	return NON_COPY_KEYS.has(String(k).toLowerCase());
}

// ---------------------------------------------------------------------------
// JS / TS / JSX / TSX  (babel)
// ---------------------------------------------------------------------------
// Capture StringLiteral / TemplateLiteral(no expr) / JSXText / JSX attribute values,
// each with its parent context, at absolute offsets (base added for embedded scripts).
export function extractJs(src, file, base = 0) {
	let ast;
	try {
		ast = babelParse(src, {
			sourceType: 'unambiguous',
			plugins: ['jsx', 'typescript', 'importAttributes', 'decorators-legacy', 'topLevelAwait'],
			errorRecovery: true,
			ranges: false,
		});
	} catch {
		return []; // unparseable — skip rather than crash the sweep
	}
	const units = [];
	const add = (syntax, innerStart, innerEnd, raw, keyed) => {
		if (innerEnd <= innerStart) {
			return;
		}
		if (isCopyPhrase(raw, { keyed })) {
			units.push({
				syntax,
				char_start: base + innerStart,
				char_end: base + innerEnd,
				block_text: raw,
			});
		}
	};
	// StringLiteral raw inner span (strip the surrounding quotes babel includes).
	const strInner = (node) => ({
		start: node.start + 1,
		end: node.end - 1,
		raw: src.slice(node.start + 1, node.end - 1),
	});
	const tmplInner = (node) => {
		// backtick at node.start; cooked content between the backticks
		return {
			start: node.start + 1,
			end: node.end - 1,
			raw: src.slice(node.start + 1, node.end - 1),
		};
	};

	function walk(node, parent) {
		if (!node || typeof node !== 'object') {
			return;
		}
		if (Array.isArray(node)) {
			for (const c of node) {
				walk(c, parent);
			}
			return;
		}
		switch (node.type) {
			case 'ImportDeclaration':
			case 'ExportNamedDeclaration':
			case 'ExportAllDeclaration': {
				// don't descend into module specifiers / source strings
				if (node.source) {
					// still walk any inline stuff besides the source
				}
				break;
			}
			case 'JSXText': {
				const raw = node.value;
				const trimmedStart = node.start + (raw.length - raw.trimStart().length);
				const trimmedEnd = node.end - (raw.length - raw.trimEnd().length);
				add('jsx-text', trimmedStart, trimmedEnd, raw.trim(), true);
				break;
			}
			case 'JSXAttribute': {
				const attr = String(node.name?.name || '').toLowerCase();
				const v = node.value;
				if (v && v.type === 'StringLiteral' && !isNonCopyKey(attr)) {
					const { start, end, raw } = strInner(v);
					add('attr-copy', start, end, raw, COPY_ATTRS.has(attr));
				}
				// don't fall through to generic string handling for the attr value
				walk(node.name, node);
				if (v && v.type !== 'StringLiteral') {
					walk(v, node);
				}
				return;
			}
			case 'StringLiteral': {
				// classify by parent
				const p = parent || {};
				if (
					p.type === 'ImportDeclaration' ||
					p.type === 'ExportNamedDeclaration' ||
					p.type === 'ExportAllDeclaration'
				) {
					break; // module source
				}
				if (
					p.type === 'TSLiteralType' ||
					p.type === 'TSEnumMember' ||
					p.type === 'TSModuleDeclaration'
				) {
					break; // type space
				}
				if (p.type === 'ObjectProperty' && p.key === node) {
					break; // it's a key, not a value
				}
				const { start, end, raw } = strInner(node);
				let keyed = false;
				if (p.type === 'ObjectProperty') {
					const k = p.key?.name ?? p.key?.value;
					if (isNonCopyKey(k)) {
						break;
					}
					keyed = isCopyKey(k);
				} else if (p.type === 'AssignmentExpression' || p.type === 'VariableDeclarator') {
					const k = (p.id && p.id.name) || (p.left && p.left.name);
					if (isNonCopyKey(k)) {
						break;
					}
					keyed = isCopyKey(k);
				} else if (p.type === 'ArrayExpression') {
					keyed = true; // labels/chips in a data array
				} else if (p.type === 'CallExpression' || p.type === 'NewExpression') {
					keyed = false; // args: only real phrases
				}
				add('js-string', start, end, raw, keyed);
				break;
			}
			case 'TemplateLiteral': {
				if (node.expressions && node.expressions.length > 0) {
					break; // interpolated — unsafe to treat as static copy
				}
				const p = parent || {};
				if (p.type === 'ImportDeclaration') {
					break;
				}
				const { start, end, raw } = tmplInner(node);
				let keyed = false;
				if (p.type === 'ObjectProperty') {
					const k = p.key?.name ?? p.key?.value;
					if (isNonCopyKey(k)) {
						break;
					}
					keyed = isCopyKey(k);
				} else if (p.type === 'ArrayExpression') {
					keyed = true;
				}
				add('js-string', start, end, raw, keyed);
				break;
			}
			default: {
				break;
			}
		}
		for (const k in node) {
			if (
				k === 'loc' ||
				k === 'start' ||
				k === 'end' ||
				k === 'range' ||
				k === 'leadingComments' ||
				k === 'trailingComments' ||
				k === 'comments'
			) {
				continue;
			}
			const c = node[k];
			if (c && typeof c === 'object') {
				walk(c, node);
			}
		}
	}
	walk(ast.program, null);
	return units;
}

// ---------------------------------------------------------------------------
// Comment + test-name extraction (comment-audit mode) — AST-based
// ---------------------------------------------------------------------------
const JS_PRAGMA_RE =
	/^\s*(eslint-|@ts-|ts-nocheck|prettier-ignore|c8 ignore|istanbul ignore|biome-ignore|stylelint-|global\s|jshint|jslint|noinspection|@flow|@jsx|webpack)/;
const TESTNAME_CALLEES = new Set([
	'it',
	'test',
	'describe',
	'context',
	'suite',
	'bench',
	'xit',
	'xdescribe',
	'fit',
	'fdescribe',
]);
// JS/TS comments (line + block) and test-runner name strings, via babel.
export function extractJsComments(src, file, base = 0) {
	let ast;
	try {
		ast = babelParse(src, {
			sourceType: 'unambiguous',
			plugins: ['jsx', 'typescript', 'importAttributes', 'decorators-legacy', 'topLevelAwait'],
			errorRecovery: true,
			attachComment: true,
		});
	} catch {
		return [];
	}
	const units = [];
	for (const c of ast.comments || []) {
		const raw = src.slice(c.start, c.end);
		if (/[A-Za-z]/.test(raw) && !JS_PRAGMA_RE.test(c.value) && !raw.startsWith('#!')) {
			units.push({
				syntax: 'comment',
				char_start: base + c.start,
				char_end: base + c.end,
				block_text: raw,
			});
		}
	}
	// test-runner names: it("…"), describe.skip("…"), test.each(...)("…")
	function baseCallee(node) {
		let n = node;
		while (n && (n.type === 'MemberExpression' || n.type === 'CallExpression')) {
			n = n.type === 'MemberExpression' ? n.object : n.callee;
		}
		return n && n.type === 'Identifier' ? n.name : null;
	}
	function walk(node) {
		if (!node || typeof node !== 'object') {
			return;
		}
		if (Array.isArray(node)) {
			for (const c of node) {
				walk(c);
			}
			return;
		}
		if (node.type === 'CallExpression') {
			const name = baseCallee(node.callee);
			const arg = node.arguments && node.arguments[0];
			if (name && TESTNAME_CALLEES.has(name) && arg && arg.type === 'StringLiteral') {
				units.push({
					syntax: 'testname',
					char_start: base + arg.start + 1,
					char_end: base + arg.end - 1,
					block_text: src.slice(arg.start + 1, arg.end - 1),
				});
			}
		}
		for (const k in node) {
			if (
				k === 'loc' ||
				k === 'start' ||
				k === 'end' ||
				k === 'range' ||
				k === 'leadingComments' ||
				k === 'trailingComments'
			) {
				continue;
			}
			const c = node[k];
			if (c && typeof c === 'object') {
				walk(c);
			}
		}
	}
	walk(ast.program);
	return units;
}

// Dispatcher for comment/test-name mode across all file types.
export async function extractComments(text, file) {
	const ext = path.extname(file).toLowerCase();
	let units = [];
	try {
		if (JS_EXT.has(ext)) {
			units = extractJsComments(text, file, 0);
		} else if (ext === '.astro') {
			const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
			if (fm) {
				units.push(...extractJsComments(fm[1], file, fm.index + fm[0].indexOf(fm[1])));
			}
			for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) {
				if (/[A-Za-z]/.test(m[1])) {
					units.push({
						syntax: 'comment',
						char_start: m.index,
						char_end: m.index + m[0].length,
						block_text: m[0],
					});
				}
			}
		} else if (
			[
				'.md',
				'.mdx',
				'.markdown',
				'.mdc',
				'.html',
				'.htm',
				'.xml',
				'.svg',
				'.vue',
				'.svelte',
			].includes(ext)
		) {
			for (const m of text.matchAll(/<!--([\s\S]*?)-->/g)) {
				if (/[A-Za-z]/.test(m[1])) {
					units.push({
						syntax: 'comment',
						char_start: m.index,
						char_end: m.index + m[0].length,
						block_text: m[0],
					});
				}
			}
			// script blocks (svelte/vue/html) also carry JS comments + testnames
			for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
				units.push(...extractJsComments(m[1], file, m.index + m[0].indexOf(m[1])));
			}
		} else if (treeSitterSupports(file)) {
			units = await extractTreeSitterComments(text, file);
		}
	} catch {
		units = [];
	}
	units.sort((a, b) => a.char_start - b.char_start || a.char_end - b.char_end);
	const out = [];
	let lastEnd = -1;
	for (const u of units) {
		if (u.char_start < lastEnd || u.char_end <= u.char_start) {
			continue;
		}
		out.push(u);
		lastEnd = u.char_end;
	}
	return out;
}

// ---------------------------------------------------------------------------
// Astro (@astrojs/compiler): frontmatter as JS + template text/attrs
// ---------------------------------------------------------------------------
export async function extractAstro(src, file) {
	const units = [];
	let ast;
	try {
		({ ast } = await astroParse(src, { position: true }));
	} catch {
		return [];
	}
	function walk(node, parentType) {
		if (!node) {
			return;
		}
		const t = node.type;
		if (t === 'frontmatter') {
			const js = node.value || '';
			const base = src.indexOf(js);
			if (base >= 0 && js.trim()) {
				for (const u of extractJs(js, file, base)) {
					units.push(u);
				}
			}
		} else if (t === 'text') {
			// skip text that is actually the inside of an expression ({title})
			if (parentType !== 'expression') {
				const raw = node.value || '';
				const v = raw.trim();
				const off = node.position?.start?.offset;
				if (v && off !== undefined && isCopyPhrase(v, { keyed: true })) {
					const cs = off + (raw.length - raw.trimStart().length);
					units.push({
						syntax: 'jsx-text',
						char_start: cs,
						char_end: cs + v.length,
						block_text: v,
					});
				}
			}
		} else if (t === 'element' || t === 'component') {
			for (const a of node.attributes || []) {
				if (a.kind === 'quoted' && a.value && a.position) {
					const attr = String(a.name || '').toLowerCase();
					if (!isNonCopyKey(attr) && isCopyPhrase(a.value, { keyed: COPY_ATTRS.has(attr) })) {
						// locate the value inside the attribute's source span
						const aStart = a.position.start.offset;
						const aEnd =
							a.position.end?.offset ?? aStart + (a.name?.length || 0) + a.value.length + 3;
						const rawAttr = src.slice(aStart, aEnd + 2);
						const idx = rawAttr.indexOf(a.value);
						if (idx >= 0) {
							const cs = aStart + idx;
							units.push({
								syntax: 'attr-copy',
								char_start: cs,
								char_end: cs + a.value.length,
								block_text: a.value,
							});
						}
					}
				}
			}
		}
		// skip <script> and <style> element bodies for text (their children are code/css)
		const skipChildren = t === 'element' && (node.name === 'script' || node.name === 'style');
		if (!skipChildren) {
			for (const c of node.children || []) {
				walk(c, t);
			}
		}
	}
	walk(ast, null);
	return units;
}

// ---------------------------------------------------------------------------
// Svelte / Vue: <script> blocks as JS, template text + attrs via a tag scan
// ---------------------------------------------------------------------------
function extractMarkup(src, file) {
	const units = [];
	const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
	for (const m of scripts) {
		const inner = m[1];
		const base = m.index + m[0].indexOf(inner);
		for (const u of extractJs(inner, file, base)) {
			units.push(u);
		}
	}
	let masked = src;
	masked = masked.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) =>
		m.replaceAll(/[^\n]/g, ' '),
	);
	masked = masked.replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) =>
		m.replaceAll(/[^\n]/g, ' '),
	);
	masked = masked.replaceAll(/<!--[\s\S]*?-->/g, (m) => m.replaceAll(/[^\n]/g, ' '));
	// Template-directive blocks (ERB/EJS <% %>, Jinja/Liquid/Twig {% %} and {{ }}, {# #},
	// Handlebars {{! }}, Blade @if/@endif and {{ }}) — mask so their code isn't read as text.
	masked = masked.replaceAll(/<%[\s\S]*?%>/g, (m) => m.replaceAll(/[^\n]/g, ' '));
	masked = masked.replaceAll(/\{%[\s\S]*?%\}/g, (m) => m.replaceAll(/[^\n]/g, ' '));
	masked = masked.replaceAll(/\{\{[\s\S]*?\}\}/g, (m) => m.replaceAll(/[^\n]/g, ' '));
	masked = masked.replaceAll(/\{#[\s\S]*?#\}/g, (m) => m.replaceAll(/[^\n]/g, ' '));
	// text nodes
	const textRe = />([^<>{}]+)</g;
	let tm;
	while ((tm = textRe.exec(masked)) !== null) {
		const seg = tm[1];
		if (!/[A-Za-z]/.test(seg)) {
			continue;
		}
		let cs = tm.index + 1;
		let ce = cs + seg.length;
		while (cs < ce && /\s/.test(masked[cs])) {
			cs++;
		}
		while (ce > cs && /\s/.test(masked[ce - 1])) {
			ce--;
		}
		const raw = src.slice(cs, ce);
		if (isCopyPhrase(raw, { keyed: true })) {
			units.push({ syntax: 'jsx-text', char_start: cs, char_end: ce, block_text: raw });
		}
	}
	// copy attributes
	const attrRe = /\b([a-zA-Z-]+)\s*=\s*"([^"{}]*)"/g;
	let am;
	while ((am = attrRe.exec(masked)) !== null) {
		const attr = am[1].toLowerCase();
		if (isNonCopyKey(attr)) {
			continue;
		}
		const val = am[2];
		if (!isCopyPhrase(val, { keyed: COPY_ATTRS.has(attr) })) {
			continue;
		}
		const cs = am.index + am[0].length - val.length - 1;
		units.push({ syntax: 'attr-copy', char_start: cs, char_end: cs + val.length, block_text: val });
	}
	return units;
}

// ---------------------------------------------------------------------------
// Markdown (mdast)
// ---------------------------------------------------------------------------
export function extractMarkdown(src) {
	const units = [];
	// Leading YAML frontmatter (--- ... ---): extract via YAML, then MASK it so mdast does
	// not re-parse those lines as prose (which would collide with the YAML spans).
	let masked = src;
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
	if (fm) {
		const base = fm.index + fm[0].indexOf(fm[1]);
		for (const u of extractYaml(fm[1], 'frontmatter')) {
			units.push({ ...u, char_start: u.char_start + base, char_end: u.char_end + base });
		}
		masked =
			src.slice(0, fm.index) + fm[0].replaceAll(/[^\n]/g, ' ') + src.slice(fm.index + fm[0].length);
	}
	let tree;
	try {
		tree = fromMarkdown(masked, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
	} catch {
		return units;
	}
	const pushSpan = (syntax, cs, ceEnd) => {
		let ce = ceEnd;
		while (ce > cs && /\s/.test(src[ce - 1])) {
			ce--;
		}
		const raw = src.slice(cs, ce);
		if (/[A-Za-z]/.test(raw) && raw.length >= 2) {
			units.push({ syntax, char_start: cs, char_end: ce, block_text: raw });
		}
	};
	const childrenSpan = (node) => {
		const ks = (node.children || []).filter((c) => c.position);
		return ks.length ? [ks[0].position.start.offset, ks.at(-1).position.end.offset] : null;
	};
	const imagesIn = (node, acc) => {
		if (!node) {
			return;
		}
		if (node.type === 'image') {
			acc.push(node);
			return;
		}
		for (const c of node.children || []) {
			imagesIn(c, acc);
		}
	};
	function walk(node, ctx) {
		if (!node) {
			return;
		}
		if (['code', 'inlineCode', 'html', 'yaml'].includes(node.type)) {
			return;
		}
		if (node.type === 'heading') {
			const sp = childrenSpan(node);
			if (sp) {
				pushSpan('md-heading', sp[0], sp[1]);
			}
			return;
		}
		if (node.type === 'blockquote') {
			for (const c of node.children || []) {
				walk(c, 'blockquote');
			}
			return;
		}
		if (node.type === 'listItem') {
			for (const c of node.children || []) {
				walk(c, 'listitem');
			}
			return;
		}
		if (node.type === 'paragraph') {
			const imgs = [];
			imagesIn(node, imgs);
			for (const im of imgs) {
				if (im.alt && im.position && isCopyPhrase(im.alt, { keyed: true })) {
					const s = im.position.start.offset;
					const raw = src.slice(s, im.position.end.offset);
					const idx = raw.indexOf('![');
					if (idx >= 0) {
						const cs = s + idx + 2;
						units.push({
							syntax: 'md-alt',
							char_start: cs,
							char_end: cs + im.alt.length,
							block_text: im.alt,
						});
					}
				}
			}
			const hasText = (node.children || []).some(
				(c) => c.type !== 'image' && c.type !== 'html' && (c.type !== 'text' || c.value.trim()),
			);
			if (hasText && node.position) {
				const syntax =
					ctx === 'listitem' ? 'md-listitem' : ctx === 'blockquote' ? 'md-blockquote' : 'md-prose';
				pushSpan(syntax, node.position.start.offset, node.position.end.offset);
			}
			return;
		}
		if (node.type === 'tableCell' && node.position) {
			pushSpan('md-prose', node.position.start.offset, node.position.end.offset);
			return;
		}
		for (const c of node.children || []) {
			walk(c, ctx);
		}
	}
	walk(tree, null);
	return units;
}

// ---------------------------------------------------------------------------
// YAML (values under copy-ish keys), JSON (offset-tracking scanner), plain text
// ---------------------------------------------------------------------------
export function extractYaml(src, syntax = 'yaml-copy') {
	const units = [];
	let doc;
	try {
		doc = YAML.parseDocument(src, { keepSourceTokens: true });
	} catch {
		return units;
	}
	const visit = (node, keyName) => {
		if (!node || typeof node !== 'object') {
			return;
		}
		if (node.items) {
			// map or seq
			for (const it of node.items) {
				if (it.key !== undefined && it.value !== undefined) {
					visit(it.value, it.key?.value ?? keyName);
				} else {
					visit(it, keyName); // seq item
				}
			}
			return;
		}
		if (typeof node.value === 'string' && node.range) {
			const isKeyedCopy = keyName !== undefined && isCopyKey(keyName);
			if (
				isCopyPhrase(node.value, { keyed: isKeyedCopy }) &&
				(isKeyedCopy || /\s/.test(node.value))
			) {
				// node.range = [start, valueEnd, nodeEnd]; for quoted scalars start points at quote
				let cs = node.range[0];
				let ce = node.range[1];
				// if quoted, move inside the quotes
				const q = src[cs];
				if (q === '"' || q === "'") {
					cs += 1;
					ce -= 1;
				}
				const raw = src.slice(cs, ce);
				if (raw === node.value || decodeMinimal(raw) === node.value || raw.length) {
					units.push({ syntax, char_start: cs, char_end: ce, block_text: raw });
				}
			}
		}
	};
	visit(doc.contents, null);
	return units;
}

export function extractJson(src) {
	const units = [];
	let i = 0;
	const n = src.length;
	const ws = () => {
		for (;;) {
			while (i < n && /\s/.test(src[i])) {
				i++;
			}
			if (src[i] === '/' && src[i + 1] === '/') {
				while (i < n && src[i] !== '\n') {
					i++;
				}
				continue;
			}
			if (src[i] === '/' && src[i + 1] === '*') {
				i += 2;
				while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
					i++;
				}
				i += 2;
				continue;
			}
			break;
		}
	};
	const str = () => {
		i++;
		const s = i;
		while (i < n) {
			const c = src[i];
			if (c === '\\') {
				i += 2;
				continue;
			}
			if (c === '"') {
				const e = i;
				i++;
				return { s, e, raw: src.slice(s, e) };
			}
			i++;
		}
		return { s, e: i, raw: src.slice(s, i) };
	};
	const maybe = (key, o) => {
		const keyed = key !== undefined && isCopyKey(key);
		if (isCopyPhrase(o.raw, { keyed: keyed || key !== undefined })) {
			units.push({ syntax: 'json-copy', char_start: o.s, char_end: o.e, block_text: o.raw });
		}
	};
	const val = (key) => {
		ws();
		if (i >= n) {
			return;
		}
		const c = src[i];
		if (c === '"') {
			if (key !== undefined && isNonCopyKey(key)) {
				str();
			} else {
				maybe(key, str());
			}
		} else if (c === '{') {
			obj();
		} else if (c === '[') {
			arr(key);
		} else {
			while (i < n && !/[,\]}\s]/.test(src[i])) {
				i++;
			}
		}
	};
	const obj = () => {
		i++;
		ws();
		if (src[i] === '}') {
			i++;
			return;
		}
		for (;;) {
			ws();
			if (src[i] !== '"') {
				break;
			}
			const k = str();
			ws();
			if (src[i] === ':') {
				i++;
			}
			val(k.raw);
			ws();
			if (src[i] === ',') {
				i++;
				continue;
			}
			if (src[i] === '}') {
				i++;
				break;
			}
			break;
		}
	};
	const arr = (key) => {
		i++;
		ws();
		if (src[i] === ']') {
			i++;
			return;
		}
		for (;;) {
			val(key);
			ws();
			if (src[i] === ',') {
				i++;
				continue;
			}
			if (src[i] === ']') {
				i++;
				break;
			}
			break;
		}
	};
	ws();
	val(null);
	return units;
}

// Typst (.typ): no tree-sitter grammar on npm, and its prose is bare markup text (not
// string literals). Lightweight line-based extractor: (1) `key: "value"` string args (the
// #show/.with(...) metadata — tagline, produces, …), (2) `= Heading` text, (3) prose
// paragraphs, skipping code fences and #-directive lines.
function extractTypst(src) {
	const units = [];
	// 1. key: "value" string arguments anywhere (metadata block)
	const keyRe = /\b([A-Za-z_][\w-]*)\s*:\s*"((?:\\.|[^"\\])*)"/g;
	let m;
	while ((m = keyRe.exec(src)) !== null) {
		const val = m[2];
		const innerStart = m.index + m[0].length - val.length - 1;
		if (isCopyPhrase(val, { keyed: isCopyKey(m[1]) })) {
			units.push({
				syntax: 'typ-copy',
				char_start: innerStart,
				char_end: innerStart + val.length,
				block_text: val,
			});
		}
	}
	// 2. headings + prose (line-based)
	const lines = src.split('\n');
	const starts = [0];
	for (let i = 0; i < src.length; i++) {
		if (src[i] === '\n') {
			starts.push(i + 1);
		}
	}
	let inFence = false;
	let para = null;
	const flush = () => {
		if (!para) {
			return;
		}
		let cs = starts[para.s];
		let ce = starts[para.e] + lines[para.e].length;
		while (cs < ce && /\s/.test(src[cs])) {
			cs++;
		}
		while (ce > cs && /\s/.test(src[ce - 1])) {
			ce--;
		}
		const raw = src.slice(cs, ce);
		if (/[A-Za-z]/.test(raw) && /\s/.test(raw)) {
			units.push({ syntax: 'md-prose', char_start: cs, char_end: ce, block_text: raw });
		}
		para = null;
	};
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		if (/^\s*```/.test(ln)) {
			flush();
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			continue;
		}
		if (ln.trim() === '') {
			flush();
			continue;
		}
		const h = ln.match(/^(\s*=+\s+)(.+?)\s*$/);
		if (h) {
			flush();
			const cs = starts[i] + h[1].length;
			units.push({
				syntax: 'md-heading',
				char_start: cs,
				char_end: cs + h[2].length,
				block_text: h[2],
			});
			continue;
		}
		if (/^\s*#/.test(ln) || /^\s*[A-Za-z_][\w-]*\s*:\s*"/.test(ln) || /^\s*[)\]}]/.test(ln)) {
			flush();
			continue;
		}
		if (para) {
			para.e = i;
		} else {
			para = { s: i, e: i };
		}
	}
	flush();
	return units;
}

// .env files: KEY=value / KEY="value". Copy is rare (mostly config), so capture only
// phrase-shaped values, keyed when the KEY names user-facing text (NAME/TITLE/MESSAGE…).
const ENV_COPY_KEY =
	/(NAME|TITLE|DESC|DESCRIPTION|MESSAGE|LABEL|GREETING|SUBJECT|TAGLINE|PROMPT|HEADING|BODY)/;
export function isEnvFile(file) {
	const b = path.basename(file);
	return b === '.env' || b.startsWith('.env.') || b.endsWith('.env') || b === '.env.example';
}
function extractEnv(src) {
	const units = [];
	const lines = src.split('\n');
	const starts = [0];
	for (let i = 0; i < src.length; i++) {
		if (src[i] === '\n') {
			starts.push(i + 1);
		}
	}
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		const cm = ln.match(/^(\s*#\s?)(\S.*)$/);
		if (cm) {
			const cs = starts[i] + cm[1].length;
			const ce = starts[i] + ln.replace(/\s+$/, '').length;
			const raw = src.slice(cs, ce);
			if (isCopyPhrase(raw, { keyed: false })) {
				units.push({ syntax: 'config-comment', char_start: cs, char_end: ce, block_text: raw });
			}
			continue;
		}
		const m = ln.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
		if (!m) {
			continue;
		}
		const key = m[1];
		let vs = ln.indexOf('=') + 1;
		while (vs < ln.length && /\s/.test(ln[vs])) {
			vs++;
		}
		let raw = ln.slice(vs).replace(/\s+$/, '');
		let cs = starts[i] + vs;
		let ce = starts[i] + ln.replace(/\s+$/, '').length;
		const q = raw[0];
		if (q === '"' || q === "'") {
			const close = raw.indexOf(q, 1);
			if (close > 0) {
				cs += 1;
				ce = cs + (close - 1);
				raw = raw.slice(1, close);
			}
		}
		const keyed = ENV_COPY_KEY.test(key.toUpperCase());
		if (isCopyPhrase(raw, { keyed }) && (keyed || /\s/.test(raw))) {
			units.push({
				syntax: 'env-value',
				char_start: cs,
				char_end: ce,
				block_text: src.slice(cs, ce),
			});
		}
	}
	return units;
}

// Hash/ignore config files (.editorconfig, .gitignore, .gitattributes, .npmrc, CODEOWNERS,
// …): supported regardless of whether they hold copy — capture #/;-comment prose and
// key=value phrase values; patterns/paths/rules are dropped by the phrase filter.
const HASH_CONFIG = new Set([
	'.editorconfig',
	'.gitattributes',
	'.gitignore',
	'.dockerignore',
	'.npmrc',
	'.oxfmtignore',
	'.yamllint',
	'.nvmrc',
	'.prettierignore',
	'.eslintignore',
	'.trufflehog-exclude',
	'.node-version',
	'.ruby-version',
	'.tool-versions',
	'codeowners',
	'.shellcheckrc',
]);
const INI_EXT = new Set(['.ini', '.cfg', '.conf', '.properties', '.editorconfig']);
export function isHashConfig(file) {
	const b = path.basename(file).toLowerCase();
	return (
		HASH_CONFIG.has(b) ||
		INI_EXT.has(path.extname(file).toLowerCase()) ||
		b === 'dockerfile' ||
		b === 'containerfile' ||
		b.startsWith('dockerfile.')
	);
}
// Extension-less prose/legal/manifest files handled as plain text.
export function isPlainTextFile(file) {
	const b = path.basename(file).toUpperCase();
	return (
		['LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'VERSION', 'AUTHORS', 'CONTRIBUTORS'].includes(b) ||
		b.startsWith('LICENSE') ||
		b.startsWith('LICENCE')
	);
}
// Files copy-audit accepts beyond the extension/tree-sitter sets (for the candidate filter).
export function isCopyAuditTarget(file) {
	return isEnvFile(file) || isHashConfig(file) || isPlainTextFile(file);
}
function extractHashConfig(src) {
	const units = [];
	const lines = src.split('\n');
	const starts = [0];
	for (let i = 0; i < src.length; i++) {
		if (src[i] === '\n') {
			starts.push(i + 1);
		}
	}
	for (let i = 0; i < lines.length; i++) {
		const ln = lines[i];
		const cm = ln.match(/^(\s*[#;!]\s?)(\S.*)$/);
		if (cm) {
			const cs = starts[i] + cm[1].length;
			const ce = starts[i] + ln.replace(/\s+$/, '').length;
			const raw = src.slice(cs, ce);
			if (isCopyPhrase(raw, { keyed: false })) {
				units.push({ syntax: 'config-comment', char_start: cs, char_end: ce, block_text: raw });
			}
			continue;
		}
		const kv = ln.match(/^\s*([\w.-]+)\s*=\s*(\S.*)$/);
		if (kv) {
			let vs = ln.indexOf('=') + 1;
			while (vs < ln.length && /\s/.test(ln[vs])) {
				vs++;
			}
			let cs = starts[i] + vs;
			let ce = starts[i] + ln.replace(/\s+$/, '').length;
			let raw = src.slice(cs, ce);
			const q = raw[0];
			if (q === '"' || q === "'") {
				const c = raw.indexOf(q, 1);
				if (c > 0) {
					cs += 1;
					ce = cs + (c - 1);
					raw = raw.slice(1, c);
				}
			}
			if (isCopyPhrase(raw, { keyed: false })) {
				units.push({ syntax: 'config-value', char_start: cs, char_end: ce, block_text: raw });
			}
		}
	}
	return units;
}

// TSV/CSV / delimited data: capture phrase-shaped cells.
function extractTsv(src, sep = /(\t|\|)/) {
	const units = [];
	const lines = src.split('\n');
	const starts = [0];
	for (let i = 0; i < src.length; i++) {
		if (src[i] === '\n') {
			starts.push(i + 1);
		}
	}
	for (let i = 0; i < lines.length; i++) {
		let pos = starts[i];
		for (const part of lines[i].split(sep)) {
			if (part === '\t' || part === '|' || part === ',') {
				pos += part.length;
				continue;
			}
			const t = part.trim();
			if (t && isCopyPhrase(t, { keyed: false })) {
				const cs = pos + (part.length - part.trimStart().length);
				units.push({ syntax: 'tsv-cell', char_start: cs, char_end: cs + t.length, block_text: t });
			}
			pos += part.length;
		}
	}
	return units;
}

function extractText(src) {
	const units = [];
	const lines = src.split('\n');
	const starts = [0];
	for (let i = 0; i < src.length; i++) {
		if (src[i] === '\n') {
			starts.push(i + 1);
		}
	}
	let para = null;
	const flush = () => {
		if (!para) {
			return;
		}
		const from = starts[para.s];
		const to = starts[para.e] + lines[para.e].length;
		let cs = from,
			ce = to;
		while (cs < ce && /\s/.test(src[cs])) {
			cs++;
		}
		while (ce > cs && /\s/.test(src[ce - 1])) {
			ce--;
		}
		const raw = src.slice(cs, ce);
		if (/[A-Za-z]/.test(raw) && /\s/.test(raw)) {
			units.push({ syntax: 'text-line', char_start: cs, char_end: ce, block_text: raw });
		}
		para = null;
	};
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === '') {
			flush();
		} else if (para) {
			para.e = i;
		} else {
			para = { s: i, e: i };
		}
	}
	flush();
	return units;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
const JS_EXT = new Set(['.js', '.ts', '.mjs', '.cjs', '.mts', '.cts', '.jsx', '.tsx']);

export async function extractUnits(text, file) {
	const ext = path.extname(file).toLowerCase();
	let units = [];
	try {
		if (['.md', '.mdx', '.markdown', '.mdc'].includes(ext)) {
			units = extractMarkdown(text);
		} else if (ext === '.astro') {
			units = await extractAstro(text, file);
		} else if (
			[
				'.svelte',
				'.vue',
				'.html',
				'.htm',
				'.xml',
				'.svg',
				'.hbs',
				'.handlebars',
				'.mustache',
				'.plist',
				'.xsl',
				'.xslt',
				'.erb',
				'.ejs',
				'.jinja',
				'.jinja2',
				'.j2',
				'.liquid',
				'.twig',
				'.heex',
			].includes(ext) ||
			file.endsWith('.blade.php')
		) {
			// markup / HTML-embedded templates: element text nodes + copy attributes, with
			// <%…%> / {%…%} / {{…}} / {#…#} directive blocks masked out.
			units = extractMarkup(text, file);
		} else if (JS_EXT.has(ext)) {
			units = extractJs(text, file, 0);
		} else if (['.json', '.jsonc', '.json5', '.webmanifest'].includes(ext)) {
			units = extractJson(text);
		} else if (ext === '.yml' || ext === '.yaml') {
			units = extractYaml(text);
		} else if (ext === '.typ') {
			units = extractTypst(text);
		} else if (ext === '.tsv') {
			units = extractTsv(text);
		} else if (ext === '.csv') {
			units = extractTsv(text, /(,)/);
		} else if (isEnvFile(file)) {
			units = extractEnv(text);
		} else if (isHashConfig(file)) {
			units = extractHashConfig(text);
		} else if (treeSitterSupports(file)) {
			// tree-sitter languages (Swift…Python…SQL, Nix, Perl, R, Prisma, Proto, …)
			units = await extractTreeSitter(text, file, { isCopyPhrase, isCopyKey });
		} else if (
			ext === '.txt' ||
			ext === '.text' ||
			ext === '.tpl' ||
			ext === '.pug' ||
			ext === '.jade' ||
			isPlainTextFile(file)
		) {
			units = extractText(text);
		}
	} catch {
		units = [];
	}
	// de-overlap: sort, drop nested/overlapping spans so bottom-up splice is safe
	units.sort((a, b) => a.char_start - b.char_start || a.char_end - b.char_end);
	const out = [];
	let lastEnd = -1;
	for (const u of units) {
		if (u.char_start < lastEnd || u.char_end <= u.char_start) {
			continue;
		}
		out.push(u);
		lastEnd = u.char_end;
	}
	return out;
}
