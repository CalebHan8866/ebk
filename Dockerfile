# ── Stage 1: deps ────────────────────────────────────────────────────────────
# Install all dependencies (dev + prod) needed to build.
FROM node:20-slim AS deps

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# ── Stage 2: builder ──────────────────────────────────────────────────────────
# Compile Next.js, Prisma client, and the custom server.
FROM deps AS builder

WORKDIR /app

COPY . .

RUN npx prisma generate
RUN npx next build
RUN npx tsc --project tsconfig.server.json

# ── Stage 3: runner ───────────────────────────────────────────────────────────
# Lean production image — no dev dependencies, no source files.
FROM node:20-slim AS runner

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Run as a non-root user for security.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Copy only what the runtime needs.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && (npm run scrape &) && node dist/server.js"]
