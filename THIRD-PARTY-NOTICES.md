# Third-party notices

Sutra is distributed under the Apache License 2.0. It bundles the following
third-party components, each under its own license. All are permissive and
compatible with redistribution; their notices are retained here as required.

## Runtime dependencies

| Component | License | Notes |
| --- | --- | --- |
| React, React-DOM | MIT | © Meta Platforms, Inc. |
| lucide-react | ISC | Icon components |
| quickjs-emscripten, `@jitl/quickjs-*` | MIT | QuickJS (Bellard/Gallagher) compiled to WebAssembly |
| `public/quickjs.wasm` | MIT | Prebuilt QuickJS binary from `@jitl/quickjs-wasmfile-release-sync`, redistributed for offline use |

## Fonts (SIL Open Font License 1.1)

The following variable fonts are bundled via `@fontsource-variable/*` and are
licensed under the SIL Open Font License, Version 1.1. The OFL permits bundling
within software; the fonts may not be sold on their own and the OFL notice must
be retained.

| Font | Designer / Foundry |
| --- | --- |
| Fraunces | Undercase Type |
| Inter | Rasmus Andersson |
| Space Grotesk | Florian Karsten |
| JetBrains Mono | JetBrains |

## Build tooling

Vite, TypeScript, Tailwind CSS, and related plugins are used for development and
build only and are not redistributed as part of the application bundle. They are
licensed under MIT (Apache-2.0 for TypeScript).

---

Full license texts for all dependencies are available in their respective
`node_modules/<package>/LICENSE` files after installation, and via each project's
homepage. If you believe an attribution is missing or incorrect, please open an
issue.
