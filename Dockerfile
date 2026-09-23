FROM node:22-bookworm-slim AS build
WORKDIR /repo
ARG VITE_TIANDITU_TOKEN
ENV VITE_TIANDITU_TOKEN=${VITE_TIANDITU_TOKEN}
COPY . .
RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    LIVESTOCK_DB_FILE=/app/services/api/data/tiansun.sqlite \
    LIVESTOCK_SEED_FILE=/app/seed/livestock.seed.json
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/pasture-3d/package.json apps/pasture-3d/package.json
COPY apps/pasture-web/package.json apps/pasture-web/package.json
COPY services/api/package.json services/api/package.json
RUN npm ci --omit=dev
COPY --from=build /repo/services/api ./services/api
COPY --from=build /repo/apps/pasture-3d/dist ./apps/pasture-3d/dist
COPY --from=build /repo/apps/pasture-web/dist ./apps/pasture-web/dist
RUN mkdir -p /app/services/api/data /app/seed \
    && cp /app/services/api/data/livestock.seed.json /app/seed/livestock.seed.json \
    && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", "services/api/server.js"]
