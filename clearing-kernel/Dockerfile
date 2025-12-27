# Primordia Clearing Kernel - Production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

# Build
RUN npm run build

# Production image
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files and migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Create non-root user
RUN addgroup -g 1001 -S primordia && \
    adduser -S -D -H -u 1001 -s /sbin/nologin -G primordia primordia && \
    chown -R primordia:primordia /app

USER primordia

# Environment defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV DATABASE_SSL=true

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

CMD ["node", "dist/server.js"]
