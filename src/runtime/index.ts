/**
 * Runtime enhancer entry — wires up:
 *   • flow-dot edge overlay (MutationObserver reacts to data-processed flips)
 *   • Swup page:view / content:replace → kick Mermaid re-render
 *
 * Idempotent: multiple calls are no-ops after the first. The side-effect
 * stylesheet import also loads from this entry so callers only need one line.
 */

import "../styles.css";
import { overlayFlowDots } from "./flow-dots.ts";
import { initLightbox } from "./lightbox.ts";

let initialized = false;

type MermaidRunner = {
	mermaid?: { run?: (opts: { nodes: Element[] }) => Promise<void> };
};

type SwupHookHost = {
	swup?: { hooks?: { on: (event: string, cb: () => void) => void } };
};

export function initDiagramRuntime(): void {
	if (initialized) return;
	initialized = true;

	const flowObserver = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.type === "attributes" && m.attributeName === "data-processed") {
				const target = m.target as HTMLElement;
				if (
					target.matches?.("pre.mermaid") &&
					target.getAttribute("data-processed") === "true"
				) {
					overlayFlowDots(target);
				}
			} else if (m.type === "childList") {
				m.addedNodes.forEach((n) => {
					if (!(n instanceof Element)) return;
					n.querySelectorAll?.("pre.mermaid").forEach((el) => {
						flowObserver.observe(el, {
							attributes: true,
							attributeFilter: ["data-processed"],
						});
					});
				});
			}
		}
	});

	const wire = () => {
		document.querySelectorAll("pre.mermaid").forEach((el) => {
			flowObserver.observe(el, {
				attributes: true,
				attributeFilter: ["data-processed"],
			});
		});
		flowObserver.observe(document.body, { childList: true, subtree: true });
		document
			.querySelectorAll('pre.mermaid[data-processed="true"]')
			.forEach((el) => overlayFlowDots(el as HTMLElement));
		initLightbox();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", wire, { once: true });
	} else {
		wire();
	}

	wireSwupBridge();
}

/**
 * Swup nav replaces <main>, which drops the previously-rendered SVG. Re-run
 * mermaid against the freshly-inserted `pre.mermaid` nodes.
 */
function kickMermaid(): void {
	const diagrams = document.querySelectorAll("pre.mermaid");
	if (diagrams.length === 0) return;
	diagrams.forEach((el) => el.removeAttribute("data-processed"));
	const w = window as unknown as MermaidRunner;
	const run = () => {
		if (w.mermaid?.run) {
			w.mermaid.run({ nodes: Array.from(diagrams) }).catch(() => {});
		}
	};
	if (w.mermaid?.run) run();
	else setTimeout(run, 400);
	// Freshly swapped <main> has new figures — wire them for lightbox.
	initLightbox();
}

function wireSwupBridge(): void {
	const w = window as unknown as SwupHookHost;
	if (w.swup?.hooks) {
		w.swup.hooks.on("page:view", kickMermaid);
		w.swup.hooks.on("content:replace", kickMermaid);
	} else {
		document.addEventListener("swup:enable", wireSwupBridge, { once: true });
	}
}
