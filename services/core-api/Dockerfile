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

# Schema sync runs as its own one-shot `migrate` service in
# docker-compose.yml, not here: two app replicas both running `prisma db
# push` against the same database on startup would race each other. No
# versioned Prisma migrations exist yet -- `db push` applies the current
# schema directly; a production setup would replace this with
# `prisma migrate deploy` against committed migration files.
CMD ["node", "dist/main.js"]
