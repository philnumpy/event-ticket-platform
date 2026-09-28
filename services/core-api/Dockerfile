# Built from the monorepo root: `docker build -f services/core-api/Dockerfile .`
# (docker-compose.yml sets this context/dockerfile pair already).
FROM node:22-alpine
WORKDIR /app

COPY . .
RUN npm install

# Explicit, ordered builds -- not `npm run build --workspaces`, because
# @etp/persistence, @etp/messaging and @etp/core-api all resolve @etp/domain
# from its dist/ output via the workspace symlink; building out of order
# would fail type resolution against a domain package that hasn't emitted
# .d.ts files yet.
RUN npm run build --workspace packages/domain
RUN npm run build --workspace packages/persistence
RUN npm run build --workspace packages/messaging
RUN npm run build --workspace services/core-api

WORKDIR /app/services/core-api
EXPOSE 3000

# No versioned Prisma migrations exist yet (this project only ever ran
# `prisma db push` against a live database -- see README); `db push`
# applies the current schema directly. A production setup would replace
# this with `prisma migrate deploy` against committed migration files.
CMD sh -c "npx prisma db push --schema=/app/packages/persistence/prisma/schema.prisma --skip-generate --accept-data-loss && node dist/main.js"
