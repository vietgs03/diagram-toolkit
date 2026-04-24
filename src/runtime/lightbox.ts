/**
 * Diagram lightbox — click any rendered diagram to expand it, with zoom /
 * pan controls and an auto-generated legend that explains the visual
 * vocabulary actually used in the diagram.
 *
 * Design choices:
 *   • Native <dialog>.showModal() — we get ESC, focus trap, background
 *     inert-ing, and ::backdrop for free. No a11y plumbing to duplicate.
 *   • Clone + uniquify IDs (see uniquifyIds) — Mermaid SVGs carry <defs>
 *     markers referenced by `url(#…)`; two identical IDs in the DOM
 *     cause the original arrows to break.
 *   • Wrap the clone in `pre.mermaid[data-processed="true"]` so every
 *     existing `[data-look="bbg"] pre.mermaid … svg` selector matches
 *     inside the dialog. Zero duplicated CSS rules.
 *   • Legend is scanned from the *rendered* SVG (not the source) —
 *     author-neutral and always in sync with what's actually on screen.
 *     Only items whose selectors hit appear; unused vocabulary is
 *     silently omitted.
 *   • Zoom/pan via CSS transform. Don't rewrite viewBox — cheaper, and
 *     the stage's overflow-hidden clips visually without layout churn.
 *   • Opt out per figure with `data-no-lightbox`.
 */

// ---- Shared dialog -----------------------------------------------------

let sharedDialog: HTMLDialogElement | null = null;

interface ZoomState {
	scale: number;
	tx: number;
	ty: number;
}
let zoom: ZoomState = { scale: 1, tx: 0, ty: 0 };

const MIN_SCALE = 0.25;
const MAX_SCALE = 6;

function applyTransform(svg: SVGSVGElement, label: HTMLElement | null): void {
	svg.style.transform = `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`;
	svg.style.transformOrigin = "center center";
	if (label) label.textContent = `${Math.round(zoom.scale * 100)}%`;
}

function setScale(
	svg: SVGSVGElement,
	label: HTMLElement | null,
	next: number,
): void {
	zoom.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
	applyTransform(svg, label);
}

function resetZoom(svg: SVGSVGElement, label: HTMLElement | null): void {
	zoom = { scale: 1, tx: 0, ty: 0 };
	applyTransform(svg, label);
}

// ---- Legend ------------------------------------------------------------

/** One per role in COMPONENTS. Keep in sync with presets.ts. Duplicating
 *  the color here instead of importing presets keeps the runtime bundle
 *  standalone (no build-time type dep pulled into the browser). */
const ROLE_LEGEND: Record<string, { color: string; label: string; desc: string }> = {
	client: { color: "#64748b", label: "Client", desc: "user-facing entry" },
	edge: { color: "#3b82f6", label: "Edge", desc: "DNS, CDN, LB" },
	compute: { color: "#7c3aed", label: "Compute", desc: "API, worker, job" },
	database: { color: "#f97316", label: "Database", desc: "relational / doc store" },
	cache: { color: "#10b981", label: "Cache", desc: "K/V in-memory" },
	queue: { color: "#a855f7", label: "Queue", desc: "broker / stream" },
	storage: { color: "#f59e0b", label: "Storage", desc: "object store" },
	search: { color: "#0ea5e9", label: "Search", desc: "full-text index" },
	observability: { color: "#94a3b8", label: "Observability", desc: "logs, metrics" },
	external: { color: "#64748b", label: "External", desc: "3rd-party (dashed)" },
};

interface LegendItem {
	kind: "role" | "focal" | "edge-solid" | "edge-dashed" | "edge-thick";
	color?: string;
	label: string;
	desc: string;
}

function buildLegendFromSvg(svg: SVGElement): LegendItem[] {
	const items: LegendItem[] = [];

	// Focal gets its own row, even though `.highlight` is technically a role.
	if (svg.querySelector(".node.highlight")) {
		items.push({
			kind: "focal",
			color: "#7c3aed",
			label: "Focal",
			desc: "subject of the post",
		});
	}

	for (const [key, def] of Object.entries(ROLE_LEGEND)) {
		if (svg.querySelector(`.node.${key}`)) {
			items.push({
				kind: "role",
				color: def.color,
				label: def.label,
				desc: def.desc,
			});
		}
	}

	// Edge types — presence of each distinct style means it carries meaning
	// (R7). Mermaid class-tags its edges: `edge-pattern-dashed|dotted`,
	// `edge-thickness-thick`. Anything without those is the default solid.
	const hasDashed = !!svg.querySelector(".edge-pattern-dashed, .edge-pattern-dotted");
	const hasThick = !!svg.querySelector(".edge-thickness-thick");
	const hasAnyEdge = !!svg.querySelector(".flowchart-link, .edgePath path, g.edge > path");

	if (hasAnyEdge) {
		items.push({
			kind: "edge-solid",
			label: "Solid →",
			desc: "synchronous call",
		});
	}
	if (hasDashed) {
		items.push({
			kind: "edge-dashed",
			label: "Dashed -.->",
			desc: "async / side-channel",
		});
	}
	if (hasThick) {
		items.push({
			kind: "edge-thick",
			label: "Thick ==>",
			desc: "hot path (p99)",
		});
	}
	return items;
}

function renderLegend(items: LegendItem[]): string {
	if (items.length === 0) return "";
	const rows = items
		.map((it) => {
			const swatchStyle =
				it.kind === "role" || it.kind === "focal"
					? `style="border-color: ${it.color};"`
					: "";
			return `<li>
				<span class="diagram-lightbox-swatch diagram-lightbox-swatch-${it.kind}" ${swatchStyle}></span>
				<div class="diagram-lightbox-legend-text">
					<strong>${escapeText(it.label)}</strong>
					<small>${escapeText(it.desc)}</small>
				</div>
			</li>`;
		})
		.join("");
	return `<h4>Legend</h4><ul>${rows}</ul>`;
}

function escapeText(s: string): string {
	return s.replace(/[&<>]/g, (c) =>
		c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
	);
}

// ---- ID uniquification (cloned SVG) ------------------------------------

/** Rewrite every `id` in the cloned SVG and every `url(#id)` / `href="#id"`
 *  reference to match. Prevents the original SVG's `marker-end="url(#X)"`
 *  from resolving to the clone's defs once both coexist in the DOM. */
function uniquifyIds(svg: SVGElement, salt: string): void {
	const idMap = new Map<string, string>();
	svg.querySelectorAll<Element>("[id]").forEach((el) => {
		const oldId = el.getAttribute("id");
		if (!oldId) return;
		const newId = `${oldId}${salt}`;
		idMap.set(oldId, newId);
		el.setAttribute("id", newId);
	});
	if (idMap.size === 0) return;
	const refAttrs = [
		"marker-start",
		"marker-end",
		"marker-mid",
		"clip-path",
		"mask",
		"filter",
		"fill",
		"stroke",
		"href",
	];
	// Shared rewrite used for attributes, inline style= strings, and the
	// embedded <style> CSS text. Done once so a single idMap pass handles
	// every surface that can reference a def id.
	const rewriteRefs = (value: string): string => {
		let next = value;
		for (const [oldId, newId] of idMap) {
			next = next.split(`#${oldId}`).join(`#${newId}`);
		}
		return next;
	};
	svg.querySelectorAll<Element>("*").forEach((el) => {
		for (const attr of refAttrs) {
			const val = el.getAttribute(attr);
			if (!val || !val.includes("#")) continue;
			const next = rewriteRefs(val);
			if (next !== val) el.setAttribute(attr, next);
		}
		// Inline style="…" can carry url(#id) references (clip-path, filter,
		// fill, etc.) that the named-attribute loop above misses.
		const style = el.getAttribute("style");
		if (style?.includes("#")) {
			const next = rewriteRefs(style);
			if (next !== style) el.setAttribute("style", next);
		}
		const xlink = el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
		if (xlink && xlink.startsWith("#")) {
			const newId = idMap.get(xlink.slice(1));
			if (newId)
				el.setAttributeNS(
					"http://www.w3.org/1999/xlink",
					"href",
					`#${newId}`,
				);
		}
	});
	svg.querySelectorAll<SVGStyleElement>("style").forEach((styleEl) => {
		const css = styleEl.textContent ?? "";
		if (!css) return;
		const next = rewriteRefs(css);
		if (next !== css) styleEl.textContent = next;
	});
}

// ---- Share actions ------------------------------------------------------

/**
 * Serialize an SVG element to a standalone document string — suitable for
 * pasting into Figma, another editor, or saving as a `.svg` file. The
 * cloned SVG already carries the Mermaid-generated `<style>` block and
 * the toolkit's uniquified ids, so the result renders standalone.
 */
function serializeSvg(svg: SVGSVGElement): string {
	const clone = svg.cloneNode(true) as SVGSVGElement;
	// Ensure the root has an xmlns so a standalone .svg file renders in any
	// context (browsers, design tools). Clones from innerHTML can omit it.
	if (!clone.getAttribute("xmlns")) {
		clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	}
	// Strip UI-only attributes we added during lightbox mount.
	clone.style.transform = "";
	clone.style.width = "";
	clone.style.height = "";
	const serializer = new XMLSerializer();
	const xml = serializer.serializeToString(clone);
	return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

function flashButton(btn: HTMLElement, ok: boolean): void {
	const prev = btn.textContent ?? "";
	btn.textContent = ok ? "✓ Copied" : "✗ Failed";
	btn.classList.toggle("is-success", ok);
	btn.classList.toggle("is-error", !ok);
	setTimeout(() => {
		btn.textContent = prev;
		btn.classList.remove("is-success", "is-error");
	}, 1500);
}

async function copyToClipboard(text: string, btn: HTMLElement): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		flashButton(btn, true);
	} catch {
		flashButton(btn, false);
	}
}

function downloadSvg(text: string, btn: HTMLElement): void {
	try {
		const blob = new Blob([text], { type: "image/svg+xml" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "diagram.svg";
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		flashButton(btn, true);
	} catch {
		flashButton(btn, false);
	}
}

// ---- Dialog construction -----------------------------------------------

function ensureDialog(): HTMLDialogElement {
	if (sharedDialog && document.body.contains(sharedDialog)) return sharedDialog;

	const d = document.createElement("dialog");
	d.className = "diagram-lightbox";
	d.innerHTML = `
		<button type="button" class="diagram-lightbox-close" aria-label="Close diagram">×</button>
		<div class="diagram-lightbox-title"></div>
		<div class="diagram-lightbox-body">
			<div class="diagram-lightbox-main">
				<div class="diagram-lightbox-controls" role="toolbar" aria-label="Zoom controls">
					<button type="button" data-zoom="out" aria-label="Zoom out">−</button>
					<button type="button" data-zoom="reset" aria-label="Reset zoom" class="diagram-lightbox-zoom-label">100%</button>
					<button type="button" data-zoom="in" aria-label="Zoom in">+</button>
					<button type="button" data-zoom="fit" aria-label="Fit to view">⊡</button>
					<button type="button" data-action="copy-svg" aria-label="Copy SVG to clipboard" class="diagram-lightbox-action">Copy SVG</button>
					<button type="button" data-action="download-svg" aria-label="Download SVG" class="diagram-lightbox-action">Download</button>
					<span class="diagram-lightbox-hint">drag to pan · wheel to zoom · +/−/0</span>
				</div>
				<div class="diagram-lightbox-stage"></div>
			</div>
			<aside class="diagram-lightbox-legend" hidden></aside>
		</div>
		<div class="diagram-lightbox-caption"></div>
	`;

	// Backdrop click: <dialog>'s click target is the dialog itself when the
	// user clicks outside the content box. Any inner click bubbles with a
	// different target. Exception: a drag that happens to end on the
	// backdrop should not close (we suppress via `justFinishedDrag`).
	let justFinishedDrag = false;
	d.addEventListener("click", (e) => {
		const t = e.target as HTMLElement;
		if (justFinishedDrag) {
			justFinishedDrag = false;
			return;
		}
		if (t === d || t.classList.contains("diagram-lightbox-close")) {
			d.close();
		}
	});

	const stage = d.querySelector<HTMLDivElement>(".diagram-lightbox-stage");
	const zoomLabel = d.querySelector<HTMLElement>(".diagram-lightbox-zoom-label");

	const getSvg = (): SVGSVGElement | null =>
		stage?.querySelector<SVGSVGElement>("svg") ?? null;

	d.addEventListener("click", (e) => {
		const t = e.target as HTMLElement;
		const zoomAction = t.closest("[data-zoom]")?.getAttribute("data-zoom");
		if (zoomAction) {
			const svg = getSvg();
			if (!svg) return;
			if (zoomAction === "in") setScale(svg, zoomLabel, zoom.scale * 1.2);
			else if (zoomAction === "out") setScale(svg, zoomLabel, zoom.scale / 1.2);
			else if (zoomAction === "reset") resetZoom(svg, zoomLabel);
			else if (zoomAction === "fit") resetZoom(svg, zoomLabel);
			return;
		}
		const shareAction = t.closest("[data-action]")?.getAttribute("data-action");
		if (shareAction === "copy-svg" || shareAction === "download-svg") {
			const svg = getSvg();
			if (!svg) return;
			const svgString = serializeSvg(svg);
			if (shareAction === "copy-svg") copyToClipboard(svgString, t);
			else downloadSvg(svgString, t);
		}
	});

	// Wheel to zoom (ctrl-wheel is the "zoom" gesture on mac trackpads;
	// plain wheel would hijack scroll). Accept both — the stage has no
	// scroll content of its own, so plain wheel is fine here.
	stage?.addEventListener(
		"wheel",
		(e) => {
			const svg = getSvg();
			if (!svg) return;
			e.preventDefault();
			const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
			setScale(svg, zoomLabel, zoom.scale * factor);
		},
		{ passive: false },
	);

	// Drag to pan
	let dragging = false;
	let dragStart = { x: 0, y: 0, tx: 0, ty: 0 };
	stage?.addEventListener("mousedown", (e) => {
		const svg = getSvg();
		if (!svg) return;
		if (e.button !== 0) return;
		dragging = true;
		dragStart = { x: e.clientX, y: e.clientY, tx: zoom.tx, ty: zoom.ty };
		stage.classList.add("is-dragging");
		e.preventDefault();
	});
	window.addEventListener("mousemove", (e) => {
		if (!dragging) return;
		const svg = getSvg();
		if (!svg) return;
		zoom.tx = dragStart.tx + (e.clientX - dragStart.x);
		zoom.ty = dragStart.ty + (e.clientY - dragStart.y);
		applyTransform(svg, zoomLabel);
	});
	window.addEventListener("mouseup", () => {
		if (!dragging) return;
		dragging = false;
		justFinishedDrag = true;
		stage?.classList.remove("is-dragging");
	});

	// Keyboard zoom
	d.addEventListener("keydown", (e) => {
		const svg = getSvg();
		if (!svg) return;
		if (e.key === "+" || e.key === "=") {
			setScale(svg, zoomLabel, zoom.scale * 1.2);
			e.preventDefault();
		} else if (e.key === "-" || e.key === "_") {
			setScale(svg, zoomLabel, zoom.scale / 1.2);
			e.preventDefault();
		} else if (e.key === "0") {
			resetZoom(svg, zoomLabel);
			e.preventDefault();
		}
	});

	// Reset state each open so a previous zoom doesn't persist across diagrams.
	d.addEventListener("close", () => {
		zoom = { scale: 1, tx: 0, ty: 0 };
		const stageEl = d.querySelector<HTMLDivElement>(".diagram-lightbox-stage");
		if (stageEl) stageEl.replaceChildren();
	});

	document.body.appendChild(d);
	sharedDialog = d;
	return d;
}

// ---- Open ---------------------------------------------------------------

function open(fig: HTMLElement): void {
	const svg = fig.querySelector<SVGSVGElement>(
		'pre.mermaid[data-processed="true"] svg',
	);
	if (!svg) return;

	const d = ensureDialog();
	const titleText = fig.querySelector(".diagram-title")?.textContent?.trim() ?? "";
	const captionText = fig.querySelector(".diagram-caption")?.textContent?.trim() ?? "";

	const titleEl = d.querySelector<HTMLDivElement>(".diagram-lightbox-title");
	const capEl = d.querySelector<HTMLDivElement>(".diagram-lightbox-caption");
	const stageEl = d.querySelector<HTMLDivElement>(".diagram-lightbox-stage");
	const legendEl = d.querySelector<HTMLElement>(".diagram-lightbox-legend");
	const zoomLabel = d.querySelector<HTMLElement>(".diagram-lightbox-zoom-label");
	if (!titleEl || !capEl || !stageEl || !legendEl) return;

	titleEl.textContent = titleText;
	titleEl.hidden = !titleText;
	capEl.textContent = captionText;
	capEl.hidden = !captionText;

	// Stage: wrap clone in `pre.mermaid[data-processed="true"]` so every
	// existing BBG selector matches verbatim.
	stageEl.replaceChildren();
	const pre = document.createElement("pre");
	pre.className = "mermaid";
	pre.setAttribute("data-processed", "true");
	const clone = svg.cloneNode(true) as SVGSVGElement;
	uniquifyIds(clone, `-lb-${Date.now().toString(36)}`);
	clone.removeAttribute("width");
	clone.removeAttribute("height");
	clone.style.width = "100%";
	clone.style.height = "100%";
	pre.appendChild(clone);
	stageEl.appendChild(pre);

	// Forward look so [data-look] selectors reach the clone.
	const look = fig.getAttribute("data-look");
	if (look) d.setAttribute("data-look", look);
	else d.removeAttribute("data-look");

	// Legend — from the *live* SVG in the figure, not the clone, so we
	// read it before uniquification possibly changed attribute values.
	const items = buildLegendFromSvg(svg);
	if (items.length > 0) {
		legendEl.innerHTML = renderLegend(items);
		legendEl.hidden = false;
	} else {
		legendEl.innerHTML = "";
		legendEl.hidden = true;
	}

	// Reset zoom to 1× every open.
	zoom = { scale: 1, tx: 0, ty: 0 };
	applyTransform(clone, zoomLabel);

	d.showModal();
}

// ---- Wiring -------------------------------------------------------------

function wireFigure(fig: HTMLElement): void {
	if (fig.dataset.lightboxWired === "true") return;
	if (fig.hasAttribute("data-no-lightbox")) return;
	fig.dataset.lightboxWired = "true";

	fig.addEventListener("click", (e) => {
		const t = e.target as HTMLElement;
		if (t.closest("a, button, [role='button']")) return;
		open(fig);
	});
}

export function initLightbox(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>("figure.diagram-figure").forEach(wireFigure);
}
