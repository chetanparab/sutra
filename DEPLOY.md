# Deploying Sutra

Sutra is a **static site** (Vite multi-page build, no server, no database). It ships
two HTML entry points from one build:

| Path         | What it is            | Source                |
| ------------ | --------------------- | --------------------- |
| `/`          | Marketing / landing   | `index.html`, `src/site/` |
| `/app.html`  | The loop-engineering IDE | `app.html`, `src/`  |

Everything runs in the browser — the loop engine and the WebAssembly verifier are
client-side — so any static host works.

> **Independent by design.** Sutra lives in its own repository
> (`github.com/chetanparab/sutra`) and deploys on its own. Nothing here depends on,
> or triggers a deploy of, any other project. Point a host at this repo and ship.

## Build

```bash
npm ci
npm run build     # → dist/
```

The output in `dist/` is everything the host needs.

## One-time setup on a host

Config files for the three common hosts are committed, so a deploy is just
"connect the repo":

- **Vercel** — [`vercel.json`](vercel.json). Import the repo; framework auto-detects
  as Vite, output `dist/`.
- **Netlify** — [`netlify.toml`](netlify.toml). New site from Git; build/publish are
  read from the file.
- **Cloudflare Pages** — two ways:
  - **GitHub Actions (committed):** [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
    builds and runs `wrangler pages deploy dist` on every push to `main`. Add two
    repo secrets and it's live — no dashboard wiring:
    `CLOUDFLARE_API_TOKEN` (scoped to *Cloudflare Pages: Edit*) and
    `CLOUDFLARE_ACCOUNT_ID`. Until they're set, the job builds and skips the deploy.
  - **Dashboard:** Connect to Git → build command `npm run build`, output `dist/`.

  Either way, WASM headers come from [`public/_headers`](public/_headers).

### The one thing that matters: `.wasm` MIME type

The Verify phase compiles QuickJS to WebAssembly and fetches a `.wasm` file at
runtime. It **must** be served as `Content-Type: application/wasm`, or the browser
refuses to compile it (`expected magic word …`). All three configs above set this
explicitly; if you deploy somewhere else, replicate that one header.

No cross-origin isolation (COOP/COEP) is required — the sandbox uses the synchronous
single-file QuickJS variant, not threads or `SharedArrayBuffer`.

### GitHub Pages caveat

Pages serves project sites from a subpath (`/<repo>/`). If you deploy there, set
Vite's `base` to `'/sutra/'` at build time; on Vercel/Netlify/Cloudflare (root
domain) the default `base: '/'` is correct and nothing changes.

## Theme carry-over

Launch links from the site pass the visitor's current theme to the IDE via
`/app.html?theme=<id>`, and both HTML entry points read it before first paint. This
is pure query-string state — no host configuration needed.

## Desktop builds

Native installers are produced by CI on tag (see [`.github/workflows/release.yml`](.github/workflows/release.yml))
and published to GitHub Releases — a separate track from the web deploy above.
