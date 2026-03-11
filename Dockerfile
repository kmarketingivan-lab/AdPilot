# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Stage 2: Build the application
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client for the target platform
RUN npx prisma generate

# Dummy env vars for build (Next.js collects page data at build time)
ENV CSRF_SECRET="build-placeholder"
ENV STRIPE_SECRET_KEY="sk_build_placeholder"
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV REDIS_URL=""

ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Stage 3: Production runner
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
