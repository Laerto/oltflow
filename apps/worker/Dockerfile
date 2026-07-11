FROM node:22-slim AS base
WORKDIR /app
# openssl: crypto; postgresql-client-16: must match Postgres 16 server for pg_dump;
# openssh-client: SCP off-site copies; tar/gzip: backup archives
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates curl gnupg openssl openssh-client tar gzip \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/adapters/package.json packages/adapters/package.json
RUN npm install

COPY packages packages
COPY apps apps

RUN npm run db:generate && npm run build:packages

WORKDIR /app
CMD ["npm", "run", "dev", "-w", "apps/worker"]
