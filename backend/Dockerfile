# --- Build stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma's engine binaries are dynamically linked against OpenSSL
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run build
RUN npx prisma generate

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

# Prisma's engine binaries are dynamically linked against OpenSSL
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and Prisma artifacts from builder. The `prisma` CLI is a
# devDependency, so it isn't installed by --omit=dev — copy it from the builder
# so `prisma db push` is available at startup.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY prisma ./prisma

# Sync the schema to the database, then start the server. `db push` is used
# instead of `migrate deploy` because this project ships no migration files.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
