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
 *   R4   node count ≤ 12 (per-fence override: `maxNodes=N` in meta)
 *   R6.1 each `<span class="sub">…</span>` subtitle ≤ 15 chars
 *   R7   flowcharts with ≥ 4 edges must label at least one edge
 *   R9   at most one `:::highlight`
 *   R10  `sequenceDiagram` must use `autonumber`
 *   R11  `look="bbg"` fences must have both `title=` and `caption=`
 *   R13  ban `[(cylinder)]` and `([stadium])` shape tokens
 *   R14  flowcharts must carry a palette (classDef, :::role token, or BBG)
 *
 * Per-fence escape hatches (meta attributes):
 *   • `maxNodes=20` — raise the R4 ceiling for a justified comparison grid
 *   • `novalidate`  — skip every check (use sparingly; say why in prose)
 *
 * Rules NOT enforced (judgment-dependent, not string-detectable):
 *   R1 (axis), R2 (tier count), R3 (replica collapse), R8 (crossings),
 *   R12 (motion budget).
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
	/** R7 trigger: flowcharts with at least this many unlabeled directed
	 *  edges (and zero labeled ones) are flagged. Default: 4. */
	minEdgesForLabels?: number;
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

/** Diagram kind from the first directive line. */
function diagramKind(body: string): string {
	const m = body.match(
		/^\s*(flowchart|graph|sequenceDiagram|stateDiagram-v2|stateDiagram|classDiagram|erDiagram|gantt|pie|architecture-beta|timeline|mindmap)\b/m,
	);
	return m ? m[1] : "unknown";
}

const isFlowchart = (kind: string): boolean =>
	kind === "flowchart" || kind === "graph";

/** R7: count labeled vs unlabeled directed edges in a flowchart.
 *  `A --> B` is unlabeled; `A -->|"text"| B` and `A -- text --> B` are
 *  labeled. Undirected ties (`---`) are structural and don't count. */
function edgeLabelStats(body: string): { labeled: number; unlabeled: number } {
	let labeled = 0;
	let unlabeled = 0;
	for (const line of body.split(/\r?\n/)) {
		if (/^\s*(?:%%|classDef|class\b|click|linkStyle|style|subgraph|direction)/.test(line)) continue;
		// labeled: -->|...|  or  ==>|...|  or  -.->|...|  or  -- text -->
		labeled += (line.match(/[-=.]+>\s*\|/g) || []).length;
		labeled += (line.match(/--\s+[^->|]+\s+-->/g) || []).length;
		// total directed arrows minus the labeled ones = unlabeled
		const arrows = (line.match(/[-=.]+>/g) || []).length;
		const labeledHere =
			(line.match(/[-=.]+>\s*\|/g) || []).length +
			(line.match(/--\s+[^->|]+\s+-->/g) || []).length;
		unlabeled += Math.max(0, arrows - labeledHere);
	}
	return { labeled, unlabeled };
}

/** R14: a flowchart with no classDef, no :::role token, and no BBG look
 *  renders in Mermaid's default theme — visually off-palette. */
function hasPalette(body: string, isBbg: boolean): boolean {
	if (isBbg) return true;
	if (/classDef\s+\w+/.test(body)) return true;
	if (/:::\s*[\w-]+/.test(body)) return true;
	return false;
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
	const kind = diagramKind(body);

	// Escape hatch: `novalidate` in meta skips every check.
	if (/\bnovalidate\b/i.test(meta)) return v;

	// Per-fence R4 ceiling override: `maxNodes=20`.
	const metaMax = meta.match(/maxNodes\s*[:=]\s*"?(\d+)"?/i);
	const maxNodes = metaMax ? Number(metaMax[1]) : opts.maxNodes;

	const nodes = countNodes(body);
	if (nodes > maxNodes)
		v.push({
			rule: "R4",
			text: `diagram has ${nodes} nodes, ceiling is ${maxNodes}. Split into two diagrams (or annotate the fence with maxNodes=${nodes} and justify in prose).`,
		});

	const longs = longSubtitles(body, opts.maxSubtitleChars);
	for (const s of longs)
		v.push({
			rule: "R6.1",
			text: `subtitle ${s.length} chars > ${opts.maxSubtitleChars}: “${s}”. Shorten or move to caption.`,
		});

	// R7: a flowchart whose edges are all unlabeled is not self-documenting.
	if (isFlowchart(kind)) {
		const { labeled, unlabeled } = edgeLabelStats(body);
		if (unlabeled >= opts.minEdgesForLabels && labeled === 0)
			v.push({
				rule: "R7",
				text: `${unlabeled} directed edges, none labeled. Label at least the cross-tier edges (A -->|"sync write"| B).`,
			});
	}

	const focals = highlightCount(body);
	if (focals > 1)
		v.push({
			rule: "R9",
			text: `${focals} :::highlight nodes — diagrams have exactly one focal. Split if you need two.`,
		});

	// R10: sequence diagrams must number their messages.
	if (kind === "sequenceDiagram" && !/^\s*autonumber\b/m.test(body))
		v.push({
			rule: "R10",
			text: `sequenceDiagram without autonumber. Add it on the line after the directive.`,
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

	// R14: flowcharts must opt into the palette, one way or another.
	if (isFlowchart(kind) && !hasPalette(body, isBbg))
		v.push({
			rule: "R14",
			text: `flowchart carries no classDef / :::role token / BBG look — it will render in Mermaid's default theme, off the blog palette.`,
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
		minEdgesForLabels: raw.minEdgesForLabels ?? 4,
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
