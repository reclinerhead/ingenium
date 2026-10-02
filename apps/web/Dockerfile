# syntax=docker/dockerfile:1

# The Ingenia web shell as it runs on orchid. Build from the REPO ROOT so the
# workspace (lockfile, packages/ingenium) is in the context:
#
#   docker build -f apps/web/Dockerfile --build-arg BUILD_SHA=$(git rev-parse HEAD) -t ingenium-web .
#
# Multi-stage: install and build with the full workspace, ship only Next's
# standalone output, run as the image's unprivileged `node` user. Alpine so
# the compose healthcheck has wget.

FROM node:24-alpine AS build
RUN npm install -g pnpm@11.1.1
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

# Manifests first, so the dependency layer caches across source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ingenium/package.json packages/ingenium/
RUN pnpm install --frozen-lockfile --filter web...

COPY tsconfig.base.json ./
COPY packages/ingenium packages/ingenium
COPY apps/web apps/web
RUN pnpm --filter web build

FROM node:24-alpine
ARG BUILD_SHA=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    INGENIUM_BUILD_SHA=$BUILD_SHA
WORKDIR /app
# The standalone tree mirrors the workspace (outputFileTracingRoot is the repo
# root), so server.js lands at apps/web/server.js. Static assets are not part
# of it and are copied beside it. There is no public/ dir yet; add a COPY for
# it when one exists.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
