/**
 * remarkAutoClassDefs — inject component classDef lines into Mermaid
 * fences that opt into the BBG look pack, based on which `:::role`
 * tokens the author actually used.
 *
 * Why: forcing authors to paste `classDef database stroke:#f97316...`
 * at the bottom of every diagram is a papercut, and authors who forget
 * get silently-degraded visuals (neutral border, no role signal). The
 * senior move is to make the taxonomy a first-class concept of the
 * toolkit and inject the binding at build time, so `:::database` is
 * all an author writes.
 *
 * Only injects classes referenced in the fence body — unused classDef
 * lines would bloat the compiled SVG.
 *
 * Scope: fences with `look="bbg"` meta only. Non-BBG diagrams keep
 * their own classDef discipline; this plugin never mutates them.
 */

import type { Code, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import {
	componentClassDef,
	type ComponentKey,
	COMPONENTS,
} from "../presets.ts";

const COMPONENT_KEYS = Object.keys(COMPONENTS) as ComponentKey[];
const LOOK_BBG_RE = /look\s*[:=]\s*"bbg"/i;

const buildRoleRe = (key: string): RegExp =>
	new RegExp(`:::\\s*${key}(?![\\w-])`);

export const remarkAutoClassDefs: Plugin<[], Root> = () => {
	return (tree) => {
		visit(tree, "code", (node: Code) => {
			if (node.lang !== "mermaid") return;
			if (!node.meta || !LOOK_BBG_RE.test(node.meta)) return;

			const used: ComponentKey[] = [];
			for (const key of COMPONENT_KEYS) {
				if (buildRoleRe(key).test(node.value)) used.push(key);
			}
			if (used.length === 0) return;

			// Only inject classes the author hasn't already defined — so a
			// per-diagram override (e.g., `classDef database stroke:#ff0000`
			// for a specific post) still wins.
			const needed = used.filter(
				(key) => !new RegExp(`classDef\\s+${key}\\b`).test(node.value),
			);
			if (needed.length === 0) return;

			const classDefs = needed.map(componentClassDef).join("\n");
			node.value = `${node.value.replace(/\s+$/, "")}\n\n${classDefs}\n`;
		});
	};
};

export default remarkAutoClassDefs;
