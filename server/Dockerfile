# Monii Watch self-hosted server.
# Two services on one image: y-websocket sync hub + the web UI.
#
# Build context is the REPO ROOT, not server/, so the multi-stage
# build can pull in the SPA source and produce a fresh dist/ baked
# into the runtime image. See ../server/docker-compose.yml for the
# `context: ..` setting that wires this up.

# ---- Stage 1: build the web UI from source ----
FROM node:20-alpine AS web-builder
WORKDIR /repo

# Copy only what's needed for the Vite build, in cache-friendly order.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts tailwind.config.js postcss.config.js ./
COPY src ./src
COPY public ./public

RUN npm run build
# Output: /repo/dist/  (the SPA bundle)

# ---- Stage 2: server runtime ----
FROM node:20-alpine
WORKDIR /app

# Tiny: just the y-websocket runtime + optional persistence.
COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && \
    # Optional disk persistence — installed unconditionally because
    # docker-compose enables PERSIST_DIR by default.
    npm install --no-audit --no-fund y-leveldb

COPY server/server.js ./

# Bake the SPA into the image at /app/public — server.js auto-detects
# this directory and serves it at HTTP root.
COPY --from=web-builder /repo/dist ./public

ENV PORT=1234
ENV HOST=0.0.0.0
EXPOSE 1234

# Health check — server's HTTP root returns 200 (web UI or hint page).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/ >/dev/null || exit 1

CMD ["node", "server.js"]
