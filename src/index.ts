/**
 * Public entry — barrel exports for consumers who want everything at once.
 * Prefer the subpath imports for tree-shaking / build-time separation:
 *   • @viethx/diagram-toolkit/presets  — pure data, safe in build configs
 *   • @viethx/diagram-toolkit/remark   — remark plugin (build-time)
 *   • @viethx/diagram-toolkit/runtime  — browser-only (imports CSS)
 *   • @viethx/diagram-toolkit/styles.css — standalone stylesheet
 */

export * from "./presets.ts";
export { parseFenceMeta, remarkDiagramFigure } from "./remark/figure.ts";
export type { FenceMeta } from "./remark/figure.ts";
export { remarkInlineIcons } from "./remark/inline-icons.ts";
export type { InlineIconsOptions } from "./remark/inline-icons.ts";
export { remarkAutoClassDefs } from "./remark/auto-classdefs.ts";
export { remarkDiagramValidator } from "./remark/validator.ts";
export type { ValidatorOptions } from "./remark/validator.ts";
export { initDiagramRuntime } from "./runtime/index.ts";
export { overlayFlowDots } from "./runtime/flow-dots.ts";
export { initLightbox } from "./runtime/lightbox.ts";
