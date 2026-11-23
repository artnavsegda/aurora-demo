FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY schemas ./schemas
COPY fixtures ./fixtures
COPY public ./public

# сюда кладутся собранные фронтенды: frontend/aurora и frontend/halo
COPY frontend ./frontend

RUN chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["node", "src/server.mjs"]
