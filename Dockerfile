# Build stage
FROM node:20-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create temp upload directory (gitignored, so not in repo)
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/auctions?limit=1 || exit 1

# Start application
CMD ["node", "src/index.js"]
