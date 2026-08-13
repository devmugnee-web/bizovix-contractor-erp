# Turborepo-recommended multi-stage build: prune the monorepo down to only
# what @bizovix/api needs, then install and build in an isolated layer.
# https://turborepo.com/docs/guides/tools/docker

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
RUN npm install -g pnpm@11.21.0 turbo

FROM base AS pruner
COPY . .
RUN turbo prune @bizovix/api --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @bizovix/database generate
RUN pnpm turbo run build --filter=@bizovix/api...

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 bizovix && adduser --system --uid 1001 bizovix
COPY --from=installer /app .
USER bizovix
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
