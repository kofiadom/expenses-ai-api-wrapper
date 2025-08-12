# Multi-stage Docker build for NestJS Medical Processing Service
# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nestjs -u 1001

RUN apk add --no-cache curl

# Install runtime dependencies only
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy configuration files and data
COPY --from=builder /app/expense_file_schema.json ./expense_file_schema.json
COPY --from=builder /app/data ./data

# Create necessary directories with proper permissions
RUN mkdir -p /app/uploads /app/results /app/logs /app/markdown_extractions && \
  chmod 755 /app/uploads /app/results /app/logs /app/markdown_extractions && \
  chown -R nestjs:nodejs /app

# Copy health check script
COPY --chown=nestjs:nodejs <<EOF /app/healthcheck.js
const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  timeout: 2000,
  method: 'GET'
};

const request = http.request(options, (res) => {
  console.log(\`Health check status: \${res.statusCode}\`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.log('Health check failed:', err.message);
  process.exit(1);
});

request.on('timeout', () => {
  console.log('Health check timeout');
  request.destroy();
  process.exit(1);
});

request.end();
EOF

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/api/v1/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]
