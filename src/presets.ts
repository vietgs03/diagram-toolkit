/**
 * Shared color tokens + classDef strings for Mermaid blocks.
 *
 * Single source of truth: every diagram across every post inherits the same
 * palette. Consumed by:
 *   • astro.config.mjs — `MERMAID_THEME_VARS` feeds Mermaid themeVariables
 *   • diagram validator — rule checks (palette adherence)
 *   • remark plugin — caption/figure wrapping
 *   • runtime enhancer — focal-node emphasis (Phase 2)
 *
 * If you change a color here, every diagram picks it up on next build.
 */

/** Primary blog hue, in OKLCH-friendly hex. Matches the blog's themeColor.hue = 210. */
export const PALETTE = {
	ink: "#0f172a",
	inkMuted: "#475569",
	inkFaint: "#6b7280",
	line: "#94a3b8",

	blue: { fill: "#dbeafe", stroke: "#3b6fd6", text: "#0f172a" },
	green: { fill: "#dcfce7", stroke: "#16a34a", text: "#14532d" },
	amber: { fill: "#fef3c7", stroke: "#d97706", text: "#78350f" },
	red: { fill: "#fee2e2", stroke: "#dc2626", text: "#7f1d1d" },
	purple: { fill: "#e9d5ff", stroke: "#7c3aed", text: "#4c1d95" },
	orange: { fill: "#fed7aa", stroke: "#ea580c", text: "#7c2d12" },
	slate: { fill: "#f3f4f6", stroke: "#6b7280", text: "#1f2937" },
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Shared Mermaid themeVariables — plug into astro-mermaid mermaidConfig.themeVariables. */
export const MERMAID_THEME_VARS = {
	fontFamily: '"Geist Variable", Inter, system-ui, sans-serif',
	fontSize: "14px",
	primaryColor: PALETTE.blue.fill,
	primaryTextColor: PALETTE.ink,
	primaryBorderColor: PALETTE.blue.stroke,
	lineColor: "#1e40af",
	secondaryColor: "#eef4ff",
	tertiaryColor: "#f8fafc",
	actorBkg: PALETTE.blue.fill,
	actorBorder: PALETTE.blue.stroke,
	actorTextColor: PALETTE.ink,
	actorLineColor: PALETTE.line,
	signalColor: "#1e40af",
	signalTextColor: PALETTE.ink,
	noteBkgColor: "#fef9c3",
	noteBorderColor: "#ca8a04",
	noteTextColor: "#713f12",
	labelBoxBkgColor: PALETTE.blue.fill,
	labelBoxBorderColor: PALETTE.blue.stroke,
	labelTextColor: PALETTE.ink,
	loopTextColor: PALETTE.ink,
	activationBkgColor: "#93c5fd",
	activationBorderColor: "#1e40af",
	sequenceNumberColor: PALETTE.ink,
	stateBkg: "#eff6ff",
	altBackground: PALETTE.blue.fill,
	specialStateColor: PALETTE.blue.stroke,
	compositeBackground: "#f1f5f9",
	clusterBkg: "#f1f5f9",
	clusterBorder: PALETTE.line,
	edgeLabelBackground: "#ffffff",
	errorBkgColor: PALETTE.red.fill,
	errorTextColor: PALETTE.red.text,
} as const;

/**
 * Copy-pasteable classDef blocks for flowchart / state diagrams.
 * Keep strings short — copy-paste is the UX we're optimizing for.
 */
export const CLASSDEF = {
	ok: `classDef ok fill:${PALETTE.green.fill},stroke:${PALETTE.green.stroke},stroke-width:1.5px,color:${PALETTE.green.text};`,
	bad: `classDef bad fill:${PALETTE.red.fill},stroke:${PALETTE.red.stroke},stroke-width:1.5px,color:${PALETTE.red.text};`,
	neutral: `classDef neutral fill:${PALETTE.blue.fill},stroke:${PALETTE.blue.stroke},stroke-width:1.5px,color:${PALETTE.blue.text};`,
	warn: `classDef warn fill:${PALETTE.amber.fill},stroke:${PALETTE.amber.stroke},stroke-width:1.5px,color:${PALETTE.amber.text};`,
	highlight: `classDef highlight fill:${PALETTE.purple.fill},stroke:${PALETTE.purple.stroke},stroke-width:2px,color:${PALETTE.purple.text};`,
	storage: `classDef storage fill:${PALETTE.orange.fill},stroke:${PALETTE.orange.stroke},stroke-width:1.5px,color:${PALETTE.orange.text};`,
	faded: `classDef faded fill:${PALETTE.slate.fill},stroke:${PALETTE.slate.stroke},stroke-width:1.5px,color:${PALETTE.slate.text};`,
} as const;

export type ClassDefKey = keyof typeof CLASSDEF;

/** All seven together — convenient for the bottom of a large diagram. */
export const ALL_CLASSDEFS = Object.values(CLASSDEF).join("\n");

/** Phase-colored `rect rgb(...)` backgrounds for sequence diagrams. */
export const PHASE_RECTS = {
	blue: "rect rgb(219, 234, 254)",
	green: "rect rgb(220, 252, 231)",
	amber: "rect rgb(254, 243, 199)",
	red: "rect rgb(254, 226, 226)",
	purple: "rect rgb(233, 213, 255)",
} as const;

/**
 * Short-hand iconify keys. Prefer these over ad-hoc strings so typos surface
 * in one place.
 */
export const ICON = {
	postgres: "logos:postgresql",
	mysql: "logos:mysql",
	redis: "logos:redis",
	mongo: "logos:mongodb",
	elastic: "logos:elasticsearch",
	sqlite: "logos:sqlite",

	kafka: "logos:apache-kafka",
	rabbitmq: "logos:rabbitmq-icon",
	natsio: "logos:nats-icon",

	nginx: "logos:nginx",
	haproxy: "logos:haproxy-icon",
	envoy: "logos:envoy",
	traefik: "logos:traefik-proxy",

	aws: "logos:aws",
	awsS3: "logos:aws-s3",
	awsRds: "logos:aws-rds",
	awsEc2: "logos:aws-ec2",
	gcp: "logos:google-cloud",
	azure: "logos:microsoft-azure",
	k8s: "logos:kubernetes",
	docker: "logos:docker-icon",

	go: "logos:go",
	node: "logos:nodejs-icon",
	python: "logos:python",
	rust: "logos:rust",

	cloud: "mdi:cloud-outline",
	database: "mdi:database-outline",
	server: "mdi:server-outline",
	user: "mdi:account-outline",
	queue: "mdi:tray-full",
	bell: "mdi:bell-outline",
	lock: "mdi:lock-outline",
	globe: "mdi:earth",
} as const;

export type IconKey = keyof typeof ICON;

/* =============================================================
 * Component taxonomy — senior-grade replacement for Mermaid shapes
 *
 * Rationale: Mermaid's stock `[(cylinder)]` and `([stadium])` shapes use
 * fixed-ratio ellipses and hemispheres that swell the bounding box off
 * the editorial grid — the exact "hình tròn chưa đạt tỉ lệ vàng" failure.
 * In BBG-style reference architecture, role is communicated by COLOR and
 * ICON, not by shape: every node is a rectangle, role signature is a
 * colored border + vendor icon.
 *
 * This is a classic "components, not primitives" refactor:
 *  • authors stop reaching for shape syntax (`[(...)]`, `([...])`)
 *  • start reaching for semantic tokens (`:::database`, `:::cache`)
 *  • the diagram renders consistently regardless of label length
 *
 * Zero author burden: when a fence has `look="bbg"` meta and references
 * any of these class names, `remarkAutoClassDefs` injects the matching
 * classDef lines at build time. Authors only write the semantic token.
 *
 * Usage (inside a mermaid fence with look="bbg"):
 *
 *     db["Primary DB<br/><span class='sub'>ex. Aurora</span>"]:::database
 *     cache["Cache<br/><span class='sub'>ex. Redis</span>"]:::cache
 *     queue["Event Bus<br/><span class='sub'>ex. Kafka</span>"]:::queue
 * ============================================================= */

/**
 * Semantic roles available in BBG diagrams. Each role renders as a flat
 * white rectangle with a colored border; CSS in `styles.css` supplies the
 * final visual signature so authors only need the class name.
 */
export const COMPONENTS = {
	client:        { stroke: "#64748b" },
	edge:          { stroke: "#3b82f6" },
	compute:       { stroke: "#7c3aed" },
	database:      { stroke: "#f97316" },
	cache:         { stroke: "#10b981" },
	queue:         { stroke: "#a855f7" },
	storage:       { stroke: "#f59e0b" },
	search:        { stroke: "#0ea5e9" },
	observability: { stroke: "#94a3b8" },
	external:      { stroke: "#64748b" },
} as const;

export type ComponentKey = keyof typeof COMPONENTS;

/**
 * Mermaid classDef string for a single component role. Stroke only —
 * fill is left to the BBG look pack (white) or the diagram's own theme.
 */
export const componentClassDef = (key: ComponentKey): string =>
	`classDef ${key} stroke:${COMPONENTS[key].stroke},stroke-width:1.75px;`;

/** All component classDefs, newline-joined. Rarely injected wholesale —
 *  `remarkAutoClassDefs` ships only the classes actually referenced. */
export const COMPONENT_CLASSDEFS = (Object.keys(COMPONENTS) as ComponentKey[])
	.map(componentClassDef)
	.join("\n");
