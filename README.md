# @viethx/diagram-toolkit

Opinionated Mermaid upgrade for [blog.viethx.com](https://blog.viethx.com).
Wraps `astro-mermaid` with a figure/caption wrapper, a component taxonomy
(BBG-style colored role borders), build-time icon inlining, a semantic
motion system, a click-to-expand lightbox with zoom/pan and an
auto-generated legend, and a build-time validator that enforces the
12-rule [layout protocol](./DIAGRAM_LAYOUT.md).

The toolkit is published **public** so anyone can consume it, but it's
built first to serve one blog — expect opinionated defaults, not a
neutral library.

## What you get

- **Figure + caption + title** — fence meta `{title="…", caption="…"}`
  wraps the diagram in an `<figure>` with a proper `<figcaption>`.
- **Component tokens** — write `db["…"]:::database`, `cache["…"]:::cache`,
  etc.; a remark plugin binds each token to a colored border at build
  time. No `classDef` boilerplate in your markdown.
- **BBG look pack** — fence meta `{look="bbg"}` switches to flat white
  nodes, dashed cluster pills, thin neutral edges — the editorial style
  most readers associate with ByteByteGo.
- **Icon inlining** — write `{iconify:logos:postgresql}` inside a label;
  the plugin extracts the SVG to `public/icons/…svg` at build and emits
  an `<img>` with pinned dimensions so Mermaid measures labels
  correctly before the file loads.
- **Semantic motion** — solid edges get a traveling bead, dashed edges
  shimmer, thick edges bead faster (hot path), `:::highlight` gets a
  breathing focal glow. Every motion carries information.
- **Click-to-expand lightbox** — native `<dialog>` with ESC/focus-trap,
  wheel-zoom + drag-pan, keyboard shortcuts (`+` / `−` / `0`), and a
  sidebar legend auto-built from the diagram's actual vocabulary.
- **Dark-mode pass** — every surface has a paired dark rule (Tailwind
  `.dark` convention). Role colors stay; fills flip.
- **Sequence-diagram BBG styling** — same editorial signature for
  `sequenceDiagram` (actors, lifelines, messages, notes, loops).
- **Build-time validator** — `remarkDiagramValidator` lints each fence
  against R4 / R6.1 / R9 / R11 / R13 and reports via `VFile.message()`
  so Astro surfaces violations with file + line context.

## Install

```bash
pnpm add -D github:vietgs03/diagram-toolkit
```

The toolkit ships TypeScript sources; Astro / Vite transpile on build.
No prebuilt dist is published.

## Wire it up

```js
// astro.config.mjs
import mermaid from "astro-mermaid";
import { MERMAID_THEME_VARS } from "@viethx/diagram-toolkit/presets";
import { remarkDiagramFigure }    from "@viethx/diagram-toolkit/remark";
import { remarkInlineIcons }      from "@viethx/diagram-toolkit/remark/inline-icons";
import { remarkAutoClassDefs }    from "@viethx/diagram-toolkit/remark/auto-classdefs";
import { remarkDiagramValidator } from "@viethx/diagram-toolkit/remark/validator";

export default defineConfig({
  integrations: [
    mermaid({
      theme: "base",
      autoTheme: true,
      iconPacks: [
        { name: "logos", url: "/iconify/logos.json" },
        { name: "mdi",   url: "/iconify/mdi.json" },
      ],
      mermaidConfig: {
        securityLevel: "loose", // required for inline <img> icons
        themeVariables: MERMAID_THEME_VARS,
        flowchart: { htmlLabels: true, padding: 8, nodeSpacing: 56, rankSpacing: 72 },
      },
    }),
    // …your other integrations
  ],
  markdown: {
    remarkPlugins: [
      [remarkDiagramValidator, { strict: false }],
      remarkInlineIcons,
      remarkAutoClassDefs,
      remarkDiagramFigure,
    ],
  },
});
```

```astro
---
// Any component that renders markdown — wire the browser runtime.
import "@viethx/diagram-toolkit/styles.css";
---
<script>
  import { initDiagramRuntime } from "@viethx/diagram-toolkit/runtime";
  initDiagramRuntime();
</script>
```

## Author syntax

````md
```mermaid {title="System Design: URL Shortener", caption="Read path with CDN, cache, and read-replica fan-out.", look="bbg"}
flowchart LR
    user["{iconify:mdi:cellphone} Mobile App<br/><span class='sub'>ex. iOS</span>"]:::client
    api["{iconify:mdi:server} API × N<br/><span class='sub'>stateless</span>"]:::highlight
    db["{iconify:logos:postgresql} Primary DB<br/><span class='sub'>ex. Aurora</span>"]:::database
    cache["{iconify:logos:redis} Cache<br/><span class='sub'>ex. Redis</span>"]:::cache

    user ==> api
    api ==> db
    api -.-> cache
```
````

Rules live in [DIAGRAM_LAYOUT.md](./DIAGRAM_LAYOUT.md). The validator
enforces the ones that can be checked from source.

## Exports

| Subpath | What |
|---|---|
| `@viethx/diagram-toolkit/presets` | Palette, theme vars, component taxonomy |
| `@viethx/diagram-toolkit/remark` | `remarkDiagramFigure` |
| `@viethx/diagram-toolkit/remark/inline-icons` | `remarkInlineIcons` |
| `@viethx/diagram-toolkit/remark/auto-classdefs` | `remarkAutoClassDefs` |
| `@viethx/diagram-toolkit/remark/validator` | `remarkDiagramValidator` |
| `@viethx/diagram-toolkit/runtime` | `initDiagramRuntime`, `initLightbox` |
| `@viethx/diagram-toolkit/styles.css` | Stylesheet (auto-imported by the runtime) |

## License

MIT — see [LICENSE](./LICENSE).
