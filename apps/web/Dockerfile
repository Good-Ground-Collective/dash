ARG NODE_IMAGE=node:24.22.1-trixie-slim@sha256:89c5244bc22a9bc3287d89ebc7e49b9cb5bb84cd40e6175ac3421d5a9f68b95a

FROM ${NODE_IMAGE} AS build
ENV CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN,required=true \
    echo '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' > "$HOME/.npmrc" \
    && pnpm fetch \
    && rm "$HOME/.npmrc"
COPY . .
RUN --mount=type=secret,id=NODE_AUTH_TOKEN,env=NODE_AUTH_TOKEN,required=true \
    echo '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' > "$HOME/.npmrc" \
    && pnpm install --frozen-lockfile --prefer-offline --filter '@dash/web...' \
    && pnpm --filter @dash/web build \
    && pnpm --filter @dash/web deploy --prod --legacy --prefer-offline /srv/web \
    && rm "$HOME/.npmrc"

FROM ${NODE_IMAGE}
LABEL service="dash-web" \
      org.opencontainers.image.source="https://github.com/Good-Ground-Collective/dash" \
      org.opencontainers.image.description="Dash web app" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build /srv/web/package.json ./package.json
COPY --from=build /srv/web/node_modules ./node_modules
COPY --from=build /repo/apps/web/build ./build
ARG APP_VERSION=dev
ARG APP_COMMIT=
ENV APP_VERSION=${APP_VERSION} APP_COMMIT=${APP_COMMIT}
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "build"]
