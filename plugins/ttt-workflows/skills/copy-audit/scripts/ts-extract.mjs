// Universal string extraction for the broad language set via tree-sitter (web-tree-sitter
// WASM + prebuilt grammars). One parser, one code path for Swift, Rust, Go, Java, Kotlin,
// C/C++/Obj-C, PHP, Python, Ruby, Shell, TOML, Lua, Scala, C#, Elixir, Dart, Zig, Solidity.
// Each grammar exposes string-literal nodes with byte spans; we take the outermost string,
// skip interpolated ones (unsafe to rewrite), strip the quote delimiters, and phrase-filter.
// A string that is an argument to a known UI/copy marker (Text(), NSLocalizedString(), t(),
// getString()…) is treated as keyed so terse labels ("Save") survive.
import { Parser, Language } from 'web-tree-sitter';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WASM_DIR = path.join(HERE, 'grammars'); // vendored modern-ABI grammar wasms

// extension -> grammar name (a wasm must exist in grammars/)
const LANG_BY_EXT = {
	'.swift': 'swift',
	'.rs': 'rust',
	'.go': 'go',
	'.java': 'java',
	'.kt': 'kotlin',
	'.kts': 'kotlin',
	'.c': 'c',
	'.h': 'c',
	'.cpp': 'cpp',
	'.cc': 'cpp',
	'.cxx': 'cpp',
	'.hpp': 'cpp',
	'.hh': 'cpp',
	'.m': 'objc',
	'.mm': 'objc',
	'.php': 'php',
	'.py': 'python',
	'.rb': 'ruby',
	'.sh': 'bash',
	'.bash': 'bash',
	'.zsh': 'bash',
	'.toml': 'toml',
	'.lua': 'lua',
	'.scala': 'scala',
	'.sbt': 'scala',
	'.cs': 'c_sharp',
	'.ex': 'elixir',
	'.exs': 'elixir',
	'.dart': 'dart',
	'.zig': 'zig',
	'.sol': 'solidity',
	'.tf': 'terraform',
	'.tfvars': 'terraform',
	'.hcl': 'hcl',
	'.bicep': 'bicep',
	'.css': 'css',
	'.scss': 'css',
	'.sass': 'css',
	'.less': 'css',
	'.pcss': 'css',
	'.postcss': 'css',
	'.sql': 'sql',
	'.nix': 'nix',
	'.ml': 'ocaml',
	'.mli': 'ocaml_interface',
	'.hs': 'haskell',
	'.lhs': 'haskell',
	'.pl': 'perl',
	'.pm': 'perl',
	'.pod': 'perl',
	'.r': 'r',
	'.ps1': 'powershell',
	'.psd1': 'powershell',
	'.psm1': 'powershell',
	'.fish': 'fish',
	'.nim': 'nim',
	'.nims': 'nim',
	'.gd': 'gdscript',
	'.v': 'v',
	'.cr': 'crystal',
	'.fs': 'fsharp',
	'.fsi': 'fsharp_signature',
	'.fsx': 'fsharp',
	'.bzl': 'starlark',
	'.star': 'starlark',
	'.sky': 'starlark',
	'.cmake': 'cmake',
	'.gradle': 'groovy',
	'.groovy': 'groovy',
	'.gvy': 'groovy',
	'.mk': 'make',
	'.prisma': 'prisma',
	'.proto': 'proto',
	'.jsonnet': 'jsonnet',
	'.libsonnet': 'jsonnet',
	'.cue': 'cue',
	'.erl': 'erlang',
	'.hrl': 'erlang',
	// ruby / python extra extensions (reuse existing grammars)
	'.gemspec': 'ruby',
	'.rake': 'ruby',
	'.rbi': 'ruby',
	'.pyi': 'python',
};
// Files with no extension whose basename picks the grammar.
const LANG_BY_BASENAME = {
	makefile: 'make',
	gnumakefile: 'make',
	'cmakelists.txt': 'cmake',
	gemfile: 'ruby',
	rakefile: 'ruby',
	podfile: 'ruby',
	guardfile: 'ruby',
};
function langFor(file) {
	const b = path.basename(file).toLowerCase();
	if (LANG_BY_BASENAME[b]) {
		return LANG_BY_BASENAME[b];
	}
	return LANG_BY_EXT[path.extname(file).toLowerCase()];
}

export function treeSitterSupports(file) {
	const lang = langFor(file);
	return Boolean(lang) && existsSync(path.join(WASM_DIR, `tree-sitter-${lang}.wasm`));
}

let initPromise = null;
const langCache = new Map();
async function loadLang(lang) {
	if (!initPromise) {
		initPromise = Parser.init();
	}
	await initPromise;
	if (langCache.has(lang)) {
		return langCache.get(lang);
	}
	const l = await Language.load(path.join(WASM_DIR, `tree-sitter-${lang}.wasm`));
	langCache.set(lang, l);
	return l;
}

// node type is a string literal (outermost) — grammar-agnostic
const STRING_TYPE_RE = /(^|_)(string|encapsed_string|heredoc)(_literal|_fragment)?$/;
const STRING_EXCLUDE = new Set([
	'string_content',
	'string_start',
	'string_end',
	'string_type',
	'string_scalar',
]);
const INTERP_RE = /(interpolat|substitution|template_sub|str_expr|expression_substitution)/;
// callee names (lowercased, last identifier) whose string args are UI/copy
const MARKERS = new Set([
	'text',
	'button',
	'label',
	'title',
	'navigationtitle',
	'alert',
	'tooltip',
	'placeholder',
	'nslocalizedstring',
	'localizedstring',
	'localized',
	'getstring',
	'gettext',
	'ngettext',
	'tr',
	't',
	'_',
	'i18n',
	'translate',
	'message',
	'toast',
	'snackbar',
	'setttitle',
	'settext',
	'accessibilitylabel',
	'confirm',
	'prompt',
	'description',
	'metadata',
]);

const STRING_TYPES = new Set([
	'string',
	'string_literal',
	'interpreted_string_literal',
	'raw_string_literal',
	'line_string_literal',
	'multiline_string_literal',
	'multi_line_string_literal',
	'encapsed_string',
	'heredoc',
	'heredoc_body',
	'simple_string',
	'quoted_string',
	'string_lit',
	'string_value', // HCL/Terraform, CSS/SCSS
	'literal', // SQL (single-quoted string; numeric literals dropped by the phrase filter)
]);
function isStringNode(type) {
	if (STRING_EXCLUDE.has(type) || type === 'char_literal') {
		return false;
	}
	return STRING_TYPES.has(type) || STRING_TYPE_RE.test(type);
}

function hasInterpolation(node) {
	// shallow scan of descendants for an interpolation/substitution node
	const stack = [];
	for (let i = 0; i < node.childCount; i++) {
		stack.push(node.child(i));
	}
	while (stack.length) {
		const n = stack.pop();
		if (!n) {
			continue;
		}
		if (INTERP_RE.test(n.type)) {
			return true;
		}
		for (let i = 0; i < n.childCount; i++) {
			stack.push(n.child(i));
		}
	}
	return false;
}

// HCL/Terraform attribute keys whose string value is human-readable copy, not live
// infrastructure config. Everything else in a .tf attribute (names, ids, display names,
// SKUs, regions, roles, …) is a resource setting: rewriting it changes infrastructure
// and can break a plan/apply, so it must NOT be treated as editable copy.
const HCL_COPY_KEYS = new Set([
	'description',
	'summary',
	'message',
	'long_description',
	'help',
	'hint',
	'markdown',
]);

function markerKeyed(node) {
	// climb to an enclosing call and read the callee's last identifier; only the FIRST
	// string argument of a marker call is the copy (so Label("Delete", systemImage:"trash")
	// keys "Delete", not "trash").
	let cur = node.parent;
	let hops = 0;
	while (cur && hops < 4) {
		if (/call|invocation|macro/.test(cur.type)) {
			const txt = cur.text.slice(0, 60).toLowerCase();
			const m = txt.match(/([a-z_][\w]*)\s*[(!]/);
			if (m && MARKERS.has(m[1])) {
				let minStart = Infinity;
				const scan = (x) => {
					if (isStringNode(x.type)) {
						minStart = Math.min(minStart, x.startIndex);
					}
					for (let i = 0; i < x.childCount; i++) {
						scan(x.child(i));
					}
				};
				scan(cur);
				return node.startIndex === minStart;
			}
		}
		cur = cur.parent;
		hops++;
	}
	return false;
}

// Comment nodes across every tree-sitter language (line_comment / block_comment /
// comment). Pragma/lint-directive comments are dropped (they are load-bearing, not prose).
const PRAGMA_RE =
	/(eslint-|ts-ignore|ts-expect-error|ts-nocheck|prettier-ignore|c8 ignore|istanbul ignore|biome-ignore|stylelint-|swiftlint:|swiftformat:|clippy::|allow\(|deny\(|noinspection|nolint|gcov_excl|@ts-|type: ignore|noqa|pylint:|rubocop:|shellcheck)/;
export async function extractTreeSitterComments(src, file) {
	const lang = langFor(file);
	if (!lang || !treeSitterSupports(file)) {
		return [];
	}
	let language;
	try {
		language = await loadLang(lang);
	} catch {
		return [];
	}
	const parser = new Parser();
	parser.setLanguage(language);
	let tree;
	try {
		tree = parser.parse(src);
	} catch {
		return [];
	}
	const units = [];
	const seen = new Set();
	function walk(node) {
		if (/comment/.test(node.type)) {
			const s = node.startIndex;
			const e = node.endIndex;
			if (!seen.has(s) && e > s) {
				seen.add(s);
				const raw = src.slice(s, e);
				if (/[A-Za-z]/.test(raw) && !PRAGMA_RE.test(raw) && !raw.startsWith('#!')) {
					units.push({ syntax: 'comment', char_start: s, char_end: e, block_text: raw });
				}
			}
			return;
		}
		for (let i = 0; i < node.childCount; i++) {
			walk(node.child(i));
		}
	}
	walk(tree.rootNode);
	return units;
}

export async function extractTreeSitter(src, file, filters) {
	const lang = langFor(file);
	if (!lang || !treeSitterSupports(file)) {
		return [];
	}
	let language;
	try {
		language = await loadLang(lang);
	} catch {
		return [];
	}
	const parser = new Parser();
	parser.setLanguage(language);
	let tree;
	try {
		tree = parser.parse(src);
	} catch {
		return [];
	}
	const units = [];
	const { isCopyPhrase } = filters;
	const isHcl = lang === 'terraform' || lang === 'hcl';

	// For HCL/Terraform, find the key of the nearest enclosing attribute (`key = <value>`)
	// so a live resource-attribute value is not mistaken for copy. Returns null when the
	// string is not inside an attribute (e.g. a marker call argument).
	function hclAttrKey(node) {
		let n = node.parent;
		while (n) {
			if (n.type === 'attribute') {
				for (let i = 0; i < n.childCount; i++) {
					const c = n.child(i);
					if (c.type === 'identifier') {
						return src.slice(c.startIndex, c.endIndex);
					}
				}
				return null;
			}
			n = n.parent;
		}
		return null;
	}

	function stripQuotes(s, e) {
		const q = src[s];
		if (q === '"' || q === "'" || q === '`') {
			let ls = s;
			while (ls < e && src[ls] === q) {
				ls++;
			}
			let le = e;
			while (le > ls && src[le - 1] === q) {
				le--;
			}
			return [ls, le];
		}
		return [s, e];
	}

	function walk(node, insideString) {
		const type = node.type;
		if (!insideString && isStringNode(type)) {
			// Skip a bare string statement (Python/Ruby/Elixir docstring or no-op string) —
			// developer documentation, not product copy. Real copy is in an assignment,
			// call argument, object value, etc., never a standalone expression statement.
			const pt = node.parent?.type;
			if (pt === 'expression_statement' || pt === 'comment') {
				return;
			}
			if (!hasInterpolation(node)) {
				const [s, e] = stripQuotes(node.startIndex, node.endIndex);
				if (e > s) {
					const raw = src.slice(s, e);
					const keyed = markerKeyed(node);
					// In HCL, a string that is an attribute value is live config unless its
					// key is a copy carrier (variable description, alert message, …). Skip
					// the rest — rewriting them would mutate infrastructure. Strings outside
					// an attribute (key === null) fall through to the normal classifier.
					const hclKey = isHcl ? hclAttrKey(node) : null;
					const hclBlocked = hclKey !== null && !HCL_COPY_KEYS.has(hclKey);
					if (!hclBlocked && isCopyPhrase(raw, { keyed })) {
						units.push({ syntax: 'code-string', char_start: s, char_end: e, block_text: raw });
					}
				}
			}
			return; // don't descend into a captured string
		}
		for (let i = 0; i < node.childCount; i++) {
			walk(node.child(i), insideString);
		}
	}
	walk(tree.rootNode, false);
	return units;
}
