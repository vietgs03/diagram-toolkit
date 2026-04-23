/**
 * remarkDiagramValidator — build-time lint for Mermaid fences.
 *
 * Keeps R1–R13 honest without a human reviewer. Every fence is checked
 * for the rules we *can* enforce with string inspection (no Mermaid AST
 * parsing — too heavy for a blog toolkit). Violations are reported via
 * `VFile.message()` so Astro surfaces them in the build output with
 * file + line context.
 *
 * Failure modes:
 *   • `strict: false` (default) — messages surface as warnings, build
 *     continues. Good during migration / iterative styling.
 *   • `strict: true` — any violation becomes fatal and aborts the build.
 *     Flip this on once the blog is fully migrated; it's the thing that
 *     actually keeps the grid from rotting the minute you ship a post
 *     at 1 AM.
 *
 * Rules enforced (see DIAGRAM_LAYOUT.md for rationale):
 *
 *   R4   node count ≤ 12
 *   R6.1 each `<span class="sub">…</span>` subtitle ≤ 15 chars
 *   R9   at most one `:::highlight`
 *   R11  `look="bbg"` fences must have both `title=` and `caption=`
 *   R13  ban `[(cylinder)]` and `([stadium])` shape tokens
 *
 * Rules NOT enforced (judgment-dependent, not string-detectable):
 *   R1 (axis), R2 (tier count), R3 (replica collapse), R7 (edge semantics),
 *   R8 (crossings), R10 (ordering), R12 (motion budget).
 */

import type { Code, Root } from "mdast";
import type { Plugin } from "unified";
import type { VFile } from "vfile";
import { visit } from "unist-util-visit";

export interface ValidatorOptions {
	/** Turn violations into fatal build errors. Default: false (warn only). */
	strict?: boolean;
	/** Override the R4 ceiling for special cases. Default: 12. */
	maxNodes?: number;
	/** Override the R6.1 ceiling for subtitles. Default: 15. */
	maxSubtitleChars?: number;
}

interface Violation {
	rule: string;
	text: string;
}

// ---- Rule implementations ----------------------------------------------

/** R4: rough node count. Counts non-arrow lines of the form
 *  `id[...]`, `id(...)`, `id{...}` — good enough for "is this a 5-node
 *  diagram or a 20-node one?" */
function countNodes(body: string): number {
	const seen = new Set<string>();
	const lines = body.split(/\r?\n/);
	const re = /(?:^|[\s|>])([A-Za-z_][\w-]*)\s*[\[({]/g;
	for (const line of lines) {
		// Skip fence-level directives and comments
		if (/^\s*(?:%%|---|subgraph\b|end\b|direction\b|class\b|classDef\b|click\b|linkStyle\b|style\b)/.test(line))
			continue;
		for (const m of line.matchAll(re)) seen.add(m[1]);
	}
	return seen.size;
}

/** R6.1: flag any `<span class='sub'>…</span>` whose visible text exceeds the
 *  cap. Matches both quote styles and trims inner whitespace. */
function longSubtitles(body: string, cap: number): string[] {
	const re = /<span\s+class=['"]sub['"]>([^<]*)<\/span>/gi;
	const over: string[] = [];
	for (const m of body.matchAll(re)) {
		const text = m[1].trim();
		if (text.length > cap) over.push(text);
	}
	return over;
}

/** R9: more than one focal is a bug by definition. */
function highlightCount(body: string): number {
	return (body.match(/:::\s*highlight\b/g) || []).length;
}

/** R13: ban cylinder and stadium shape tokens. */
function forbiddenShapes(body: string): string[] {
	const found: string[] = [];
	if (/[A-Za-z_][\w-]*\s*\[\(/.test(body)) found.push("[(...)] cylinder");
	if (/[A-Za-z_][\w-]*\s*\(\[/.test(body)) found.push("([...]) stadium");
	return found;
}

// ---- Plugin ------------------------------------------------------------

function validate(
	node: Code,
	opts: Required<ValidatorOptions>,
): Violation[] {
	const v: Violation[] = [];
	const body = node.value;
	const meta = node.meta ?? "";
	const isBbg = /look\s*[:=]\s*"bbg"/i.test(meta);

	const nodes = countNodes(body);
	if (nodes > opts.maxNodes)
		v.push({
			rule: "R4",
			text: `diagram has ${nodes} nodes, ceiling is ${opts.maxNodes}. Split into two diagrams.`,
		});

	const longs = longSubtitles(body, opts.maxSubtitleChars);
	for (const s of longs)
		v.push({
			rule: "R6.1",
			text: `subtitle ${s.length} chars > ${opts.maxSubtitleChars}: “${s}”. Shorten or move to caption.`,
		});

	const focals = highlightCount(body);
	if (focals > 1)
		v.push({
			rule: "R9",
			text: `${focals} :::highlight nodes — diagrams have exactly one focal. Split if you need two.`,
		});

	if (isBbg) {
		if (!/title\s*[:=]\s*"/i.test(meta))
			v.push({
				rule: "R11",
				text: `look="bbg" fence is missing title="…". Add one above the caption.`,
			});
		if (!/caption\s*[:=]\s*"/i.test(meta))
			v.push({
				rule: "R11",
				text: `look="bbg" fence is missing caption="…". Add a one-sentence takeaway.`,
			});
	}

	const shapes = forbiddenShapes(body);
	for (const s of shapes)
		v.push({
			rule: "R13",
			text: `${s} shape used. Use a rectangle [...] and :::<role> classDef instead.`,
		});

	return v;
}

export const remarkDiagramValidator: Plugin<[ValidatorOptions?], Root> = (
	raw = {},
) => {
	const opts: Required<ValidatorOptions> = {
		strict: raw.strict ?? false,
		maxNodes: raw.maxNodes ?? 12,
		maxSubtitleChars: raw.maxSubtitleChars ?? 15,
	};

	return (tree, file: VFile) => {
		visit(tree, "code", (node: Code) => {
			if (node.lang !== "mermaid") return;
			const violations = validate(node, opts);
			for (const vio of violations) {
				const msg = file.message(
					`[diagram ${vio.rule}] ${vio.text}`,
					node,
					"diagram-toolkit:validator",
				);
				if (opts.strict) msg.fatal = true;
			}
		});
	};
};

export default remarkDiagramValidator;
