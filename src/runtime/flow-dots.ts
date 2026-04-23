/**
 * Flow-dot overlay — clone each Mermaid edge with a dashed stroke that
 * animates along the path, so every line reads as "solid line with a bead
 * traveling along it."
 *
 * Idempotent via data-flow-cloned. One clone per direction — bi-directional
 * arrows get two clones (forward + reverse).
 */

const EDGE_SELECTORS = [
	".edgePath path",
	".flowchart-link",
	".messageLine0",
	".messageLine1",
	".transition",
	".relation",
	"g.edges path",
	"g.edge > path",
	"path.edge",
].join(",");

function makeEdgeClone(edge: SVGGeometryElement): SVGElement {
	const tag = edge.tagName.toLowerCase();
	if (tag === "line") {
		const clone = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"line",
		);
		const line = edge as unknown as SVGLineElement;
		clone.setAttribute("x1", line.getAttribute("x1") || "0");
		clone.setAttribute("y1", line.getAttribute("y1") || "0");
		clone.setAttribute("x2", line.getAttribute("x2") || "0");
		clone.setAttribute("y2", line.getAttribute("y2") || "0");
		return clone;
	}
	return edge.cloneNode(false) as SVGElement;
}

/**
 * Inspect marker-end / marker-start to decide arrow direction. Mermaid
 * decorates directed paths with marker-end; bi-directional edges set both.
 */
function edgeDirections(edge: Element): { forward: boolean; reverse: boolean } {
	const end = (edge.getAttribute("marker-end") || "").trim();
	const start = (edge.getAttribute("marker-start") || "").trim();
	const hasEnd = edge.hasAttribute("marker-end") && end !== "" && end !== "none";
	const hasStart =
		edge.hasAttribute("marker-start") && start !== "" && start !== "none";
	if (hasEnd && hasStart) return { forward: true, reverse: true };
	if (hasStart && !hasEnd) return { forward: false, reverse: true };
	return { forward: true, reverse: false };
}

/**
 * Copy edge pattern/thickness classes to the clone so CSS can target by
 * semantic (dashed, thick). Mermaid marks paths with `edge-pattern-dotted|dashed`
 * and `edge-thickness-thick|normal|thin`.
 */
function edgeSemantic(edge: Element): { dashed: boolean; thick: boolean } {
	const cls = edge.getAttribute("class") || "";
	const dashed =
		cls.includes("edge-pattern-dashed") || cls.includes("edge-pattern-dotted");
	const thick = cls.includes("edge-thickness-thick");
	return { dashed, thick };
}

export function overlayFlowDots(root: ParentNode = document): void {
	const svgs = root.querySelectorAll<SVGElement>(
		'pre.mermaid[data-processed="true"] svg',
	);
	svgs.forEach((svg) => {
		svg
			.querySelectorAll<SVGGeometryElement>(EDGE_SELECTORS)
			.forEach((edge, i) => {
				if (edge.getAttribute("data-flow-cloned") === "true") return;
				const dir = edgeDirections(edge);
				const sem = edgeSemantic(edge);
				const addClone = (reverse: boolean) => {
					const clone = makeEdgeClone(edge);
					clone.removeAttribute("marker-end");
					clone.removeAttribute("marker-start");
					clone.removeAttribute("id");
					clone.removeAttribute("style");
					const classes = ["diagram-flow-dot"];
					if (reverse) classes.push("reverse");
					if (sem.dashed) classes.push("dashed");
					if (sem.thick) classes.push("thick");
					clone.setAttribute("class", classes.join(" "));
					// stagger so beads on neighbors don't pulse in lockstep
					(clone as SVGElement).style.animationDelay = `${(i % 8) * 0.18}s`;
					edge.parentNode?.insertBefore(clone, edge.nextSibling);
				};
				if (dir.forward) addClone(false);
				if (dir.reverse) addClone(true);
				edge.setAttribute("data-flow-cloned", "true");
			});
	});
}
