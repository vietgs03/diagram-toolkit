/**
 * remarkDiagramFigure — wrap ```mermaid fences in <figure> + optional <figcaption>.
 *
 * Opt-in per fence. Default mermaid blocks (no meta string) pass through
 * unchanged so existing posts stay byte-identical.
 *
 * Author syntax (in the fence info-string, after `mermaid`):
 *
 *     ```mermaid {caption="Read replica failover", look="bbg"}
 *     sequenceDiagram ...
 *     ```
 *
 * Supported meta keys:
 *   • caption="..." — rendered as <figcaption>
 *   • id="..."      — becomes the <figure id="...">
 *   • look="..."    — emits data-look="..." on the figure (e.g. "bbg" for
 *                     the ByteByteGo style pack). Orthogonal to Mermaid's
 *                     own `look: handDrawn|neo|classic` frontmatter.
 *   • static        — bare flag; disables animations for this diagram
 *
 * Caveat: avoid echoing the literal meta string in prose — inline code
 * like `{look="bbg"}` inside a post's body can interact poorly with the
 * Tailwind/PostCSS pipeline (observed: strips data-* from emitted HTML
 * in unrelated figures). Quote by describing instead of copy-pasting.
 *
 * The plugin inserts two `html` sibling nodes around the code fence, so
 * astro-mermaid still processes the code node normally.
 */

import type { Code, Html, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { SKIP, visit } from "unist-util-visit";

export interface FenceMeta {
	title?: string;
	caption?: string;
	id?: string;
	static?: boolean;
	/**
	 * Visual style pack applied to the figure wrapper. Orthogonal to Mermaid's
	 * built-in `look: "handDrawn" | "neo" | "classic"` config (which the
	 * author sets inside the fence body via `---\nconfig:\n  look: …`).
	 *
	 * Current values:
	 *   • "bbg" — ByteByteGo editorial: flat nodes, dashed clusters, no anim.
	 */
	look?: string;
}

/** Parse the raw meta string after ```mermaid — lenient about quotes / separators. */
export function parseFenceMeta(meta: string | null | undefined): FenceMeta {
	if (!meta) return {};
	const out: FenceMeta = {};

	const title = meta.match(/title\s*[:=]\s*"([^"]*)"/);
	if (title) out.title = title[1];

	const caption = meta.match(/caption\s*[:=]\s*"([^"]*)"/);
	if (caption) out.caption = caption[1];

	const id = meta.match(/id\s*[:=]\s*"([^"]*)"/);
	if (id) out.id = id[1];

	const look = meta.match(/look\s*[:=]\s*"([^"]+)"/);
	if (look) out.look = look[1];

	if (/\bstatic\b/.test(meta)) out.static = true;

	return out;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

const remarkDiagramFigure: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "code", (node: Code, index, parent) => {
			if (!parent || typeof index !== "number") return;
			if (node.lang !== "mermaid") return;

			const meta = parseFenceMeta(node.meta);
			if (
				!meta.title &&
				!meta.caption &&
				!meta.id &&
				!meta.static &&
				!meta.look
			) {
				return;
			}

			const figAttrs: string[] = ['class="diagram-figure"'];
			if (meta.look)
				figAttrs.push(`data-look="${escapeHtml(meta.look.toLowerCase())}"`);
			if (meta.id) figAttrs.push(`id="${escapeHtml(meta.id)}"`);
			if (meta.static) figAttrs.push('data-static="true"');

			const titleHtml = meta.title
				? `<div class="diagram-title">${escapeHtml(meta.title)}</div>`
				: "";
			const captionHtml = meta.caption
				? `<figcaption class="diagram-caption">${escapeHtml(meta.caption)}</figcaption>`
				: "";

			const openHtml: Html = {
				type: "html",
				value: `<figure ${figAttrs.join(" ")}>${titleHtml}`,
			};
			const closeHtml: Html = {
				type: "html",
				value: `${captionHtml}</figure>`,
			};

			(parent.children as RootContent[]).splice(
				index,
				1,
				openHtml,
				node,
				closeHtml,
			);
			return [SKIP, index + 3];
		});
	};
};

export default remarkDiagramFigure;
export { remarkDiagramFigure };
