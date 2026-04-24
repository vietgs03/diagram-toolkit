/**
 * remarkInlineIcons — resolve `{iconify:pack:name}` tokens inside ```mermaid
 * fences at build time, replacing each with an `<img src="/icons/...svg">`
 * that references a static SVG file extracted from the local iconify packs.
 *
 * Why file-based (not data URL): Mermaid's DOMPurify sanitizer strips
 * `data:` URLs on `<img src>` under `securityLevel: "strict"` (default) and
 * sometimes under `"loose"` too. Pointing at a real file path sidesteps the
 * sanitizer entirely.
 *
 * Output layout:
 *   <blog>/public/icons/<pack>-<name>.svg   — written at build-time, cached
 *   <img src="/icons/<pack>-<name>.svg" class="diagram-node-icon" />
 *
 * Author syntax inside a flowchart label:
 *
 *     A["{iconify:logos:postgresql} Primary Database<br/><span class='sub'>Aurora MySQL</span>"]
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { Code, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

export interface InlineIconsOptions {
	/** Directory containing `<pack>.json` files. Default: `./public/iconify`. */
	packsDir?: string;
	/** Output directory for extracted SVG files. Default: `./public/icons`. */
	outDir?: string;
	/** URL prefix the browser uses for extracted SVGs. Default: `/icons`. */
	urlBase?: string;
	/** Rendered icon pixel size. Default: 24 (matches BBG preset). */
	size?: number;
}

interface IconifyPack {
	icons: Record<string, { body: string; width?: number; height?: number }>;
	width?: number;
	height?: number;
}

const TOKEN_RE = /\{iconify:([a-z0-9-]+):([a-z0-9-]+)\}/gi;

export const remarkInlineIcons: Plugin<[InlineIconsOptions?], Root> = (
	opts = {},
) => {
	const packsDir = path.resolve(opts.packsDir ?? "./public/iconify");
	const outDir = path.resolve(opts.outDir ?? "./public/icons");
	const urlBase = (opts.urlBase ?? "/icons").replace(/\/$/, "");
	const size = opts.size ?? 24;

	const packCache = new Map<string, IconifyPack | null>();
	const writtenFiles = new Set<string>();
	let outDirReady = false;

	const loadPack = async (name: string): Promise<IconifyPack | null> => {
		if (packCache.has(name)) return packCache.get(name) ?? null;
		try {
			const raw = await readFile(path.join(packsDir, `${name}.json`), "utf-8");
			const pack = JSON.parse(raw) as IconifyPack;
			packCache.set(name, pack);
			return pack;
		} catch {
			packCache.set(name, null);
			return null;
		}
	};

	const ensureOutDir = async () => {
		if (outDirReady) return;
		await mkdir(outDir, { recursive: true });
		outDirReady = true;
	};

	const ensureIconFile = async (
		pack: IconifyPack,
		iconName: string,
		packName: string,
	): Promise<string | null> => {
		// Own-property check so `{iconify:mdi:constructor}` or other built-in
		// prototype property names don't resolve to Object.prototype values.
		const icon = Object.hasOwn(pack.icons, iconName)
			? pack.icons[iconName]
			: undefined;
		if (!icon) return null;
		const filename = `${packName}-${iconName}.svg`;
		if (writtenFiles.has(filename)) return `${urlBase}/${filename}`;

		const filePath = path.join(outDir, filename);
		let exists = false;
		try {
			await access(filePath, constants.F_OK);
			exists = true;
		} catch {
			exists = false;
		}

		if (!exists) {
			await ensureOutDir();
			const w = icon.width ?? pack.width ?? 24;
			const h = icon.height ?? pack.height ?? 24;
			const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${size}" height="${size}">${icon.body}</svg>`;
			await writeFile(filePath, svg, "utf-8");
		}
		writtenFiles.add(filename);
		return `${urlBase}/${filename}`;
	};

	// Dimensions + inline style are load-bearing — Mermaid measures labels
	// on a scratch DOM node that is NOT inside `.diagram-figure[data-look]`
	// or `svg`, so any layout CSS gated behind those ancestors fires only
	// post-commit and the foreignObject is already sized wrong. Inline
	// attributes + `style` always apply, including during measurement:
	//   width/height → reserves space before the SVG file loads
	//   display:block + margin:auto → stacks icon above title (icon-TOP per R5),
	//     so scratch measures a tall-narrow label, not a wide-short one.
	const imgTag = (src: string, alt: string): string =>
		`<img src="${src}" alt="${alt}" class="diagram-node-icon" width="${size}" height="${size}" style="display:block;margin:0 auto 4px;" />`;

	return async (tree) => {
		const jobs: Promise<void>[] = [];

		visit(tree, "code", (node: Code) => {
			if (node.lang !== "mermaid") return;
			if (!node.value.includes("{iconify:")) return;

			jobs.push(
				(async () => {
					TOKEN_RE.lastIndex = 0;
					const matches = [...node.value.matchAll(TOKEN_RE)];
					const replacements = new Map<string, string>();
					for (const m of matches) {
						const token = m[0];
						if (replacements.has(token)) continue;
						const packName = m[1];
						const iconName = m[2];
						const pack = await loadPack(packName);
						if (!pack) continue;
						const url = await ensureIconFile(pack, iconName, packName);
						if (!url) continue;
						replacements.set(token, imgTag(url, `${packName}:${iconName}`));
					}
					let out = node.value;
					for (const [token, img] of replacements) {
						out = out.split(token).join(img);
					}
					node.value = out;
				})(),
			);
		});

		await Promise.all(jobs);
	};
};

export default remarkInlineIcons;
