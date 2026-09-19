# Hosting the Sutra engine

By default the engine runs on **your machine** — the web IDE connects to a local
`sutra serve` and your code never leaves the box. That's the recommended model.

You can also **host** the engine so the web IDE runs loops against a server
instead of a laptop. This page is how, and — just as important — where it does
and doesn't make sense.

## What hosting actually gives you

A hosted engine is a single long-running `sutra serve` reachable over HTTPS. The
web IDE points at its URL and drives it exactly like a local one. Good for:

- **Self-hosting for yourself / a team** — one engine, on infra you control,
  operating on a repo you mount into it.
- A **shared demo** environment.

It is **single-tenant by design**: one engine, one loop at a time (the same
single-loop invariant the desktop has), operating on **that container's own
filesystem**. The web IDE's "folder" field is a path *inside the container*, so
you mount the repo you want it to work on.

## What it is NOT (yet)

Turning this into "anyone visits the site and runs loops on their own repo" is a
different, much larger product — a multi-tenant cloud. It needs, at least:

- **Per-user isolation** — a fresh, sandboxed engine + workspace per session
  (ephemeral microVMs / gVisor), because a loop runs the model's edits *and your
  test command* as real processes. You do not want that shared.
- **Repo connect** — GitHub OAuth to clone the user's repo into their sandbox.
- **Resource limits, egress control, billing, abuse handling.**

Those aren't a hosting toggle; they're the roadmap for "Sutra Cloud." This page
covers the honest first step: **you** host **one** engine.

## Two hard requirements the engine enforces

1. **A token gates everything.** On a non-loopback bind the engine *refuses to
   start* without `SUTRA_TOKEN`. Use a long random secret; set it as a platform
   secret, never in the image or argv.
2. **HTTPS.** The token travels in a header; terminate TLS at the platform
   (Fly/Cloud Run/CF all do). The CORS allow-list already permits the official
   web origin and localhost; add your own with `SUTRA_ALLOWED_ORIGINS`.

## Provider & verify caveats

- **Use an API-key provider** (`anthropic` or `openai-compat`), not
  `claude-code` — the container has no local Claude Code sign-in. The web sends
  the key in the request body over HTTPS; the engine sets it as an env var for
  the run and never logs or persists it.
- **Verify runs in-container** (`verifyMode: local`). The container *is* the
  isolation boundary; don't nest Docker. The image ships Node, so **Node
  projects verify out of the box** — for Rust/Go/Python, add that toolchain to
  `engine/Dockerfile`.

## Configuration

All via env (flags win when both are set):

| Env | Meaning | Default |
|-----|---------|---------|
| `SUTRA_HOST` | Interface to bind (`0.0.0.0` to expose) | `127.0.0.1` |
| `PORT` | Port to listen on | `4317` |
| `SUTRA_TOKEN` | Required for any non-loopback bind | — |
| `SUTRA_ALLOWED_ORIGINS` | Extra web origins (comma-separated, exact) | — |

## Deploy

### Any Docker host

```bash
# from the repo root (the build context is the root)
docker build -f engine/Dockerfile -t sutra-engine .
docker run -p 4317:4317 \
  -e SUTRA_TOKEN="$(openssl rand -base64 24)" \
  -v /path/to/your/repo:/workspace/repo \
  sutra-engine
```

### Fly.io (fastest)

A ready [`fly.toml`](../fly.toml) is in the repo root:

```bash
fly launch --no-deploy --copy-config
fly secrets set SUTRA_TOKEN=$(openssl rand -base64 24)
fly deploy
```

Then point the web IDE at `https://<app>.fly.dev` with that token.

### Cloudflare

The static web front-end already lives on **Cloudflare Pages**. The engine,
though, **cannot run on Workers** — Workers are V8 isolates with no filesystem
and no process spawning, and the engine shells out to `git`, your test command,
and (optionally) the model. The Cloudflare-native path for the engine is
**Cloudflare Containers**, which runs this same image; any container/VM host
(Fly, Cloud Run, Fargate, Render, a plain VPS) works identically.
