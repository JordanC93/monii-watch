# Cashbook self-hosted sync server.
# Tiny image: just node + the y-websocket runtime.
FROM node:20-alpine

WORKDIR /app

# Install deps. We don't COPY package-lock.json on purpose — the dep set
# is small and stable; this lets the image rebuild against minor patches
# of y-websocket without lockfile churn in this repo.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && \
    # Optional disk persistence — install y-leveldb so PERSIST_DIR works.
    npm install --no-audit --no-fund y-leveldb

COPY server.js ./

ENV PORT=1234
ENV HOST=0.0.0.0
EXPOSE 1234

# Health check — server's HTTP root returns 200.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/ >/dev/null || exit 1

CMD ["node", "server.js"]
