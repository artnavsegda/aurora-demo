FROM node:22-alpine

LABEL org.opencontainers.image.title="aurora-demo-backend" \
      org.opencontainers.image.description="Demo backend for Aurora with Aurora Vue 2 frontend" \
      org.opencontainers.image.source="https://github.com/artnavsegda/aurora-demo"

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    FRONTEND_DIST=/app/frontend/aurora

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY src ./src
COPY schemas ./schemas
COPY shared ./shared
COPY fixtures ./fixtures
COPY public ./public

# сюда кладётся собранный фронтенд Aurora Vue 2: frontend/aurora
COPY frontend ./frontend

RUN chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["node", "src/server.mjs"]
