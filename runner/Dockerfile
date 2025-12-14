# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Install only Chromium (smaller footprint)
RUN npx playwright install chromium --with-deps

# Create non-root user
RUN groupadd -r runner && useradd -r -g runner runner
RUN chown -R runner:runner /app

USER runner

# Environment variables (can be overridden)
ENV API_BASE_URL=""
ENV RUNNER_ID=""
ENV POLL_INTERVAL_MS="5000"
ENV MAX_CONCURRENCY="3"
ENV HEADLESS="true"
ENV LOG_LEVEL="info"
ENV HTTP_API_PORT="3001"

# Expose HTTP API port
EXPOSE 3001

# Health check via HTTP API
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
