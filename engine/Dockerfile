# syntax=docker/dockerfile:1
#
# Host the Sutra engine as a container so the web IDE can run REAL loops without
# a local install. Build context is the REPO ROOT (the bundle imports contracts
# from src/): from the repo root, `docker build -f engine/Dockerfile .`.
#
# Single-tenant by design: one engine, one loop at a time, operating on THIS
# container's filesystem. Mount the repo you want it to work on. See HOSTING.md
# for the threat model and the multi-user caveats — do not expose it untrusted.

# --- stage 1: build the self-contained CJS bundle (no node_modules at runtime) ---
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:engine-npm

# --- stage 2: slim runtime — node + git + the one bundled file ---
FROM node:20-slim
# The engine shells out to `git` for shadow branches, commits and merges.
# ca-certificates lets it reach an LLM API over HTTPS.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/engine-npm/dist/sutra-engine.cjs /app/sutra-engine.cjs

# Hosting defaults: reachable in-container, port from the platform. No token is
# baked in — the engine REFUSES a public bind without SUTRA_TOKEN, so set it as
# a secret at deploy time (never in the image).
ENV SUTRA_HOST=0.0.0.0 \
    PORT=4317 \
    NODE_ENV=production
EXPOSE 4317

# Mount the repo to operate on here (the web's "folder" is a path in this fs).
RUN mkdir -p /workspace
WORKDIR /workspace

CMD ["node", "/app/sutra-engine.cjs", "serve"]
