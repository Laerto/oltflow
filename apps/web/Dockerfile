FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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
EXPOSE 3000
CMD ["npm", "run", "dev", "-w", "apps/web"]
