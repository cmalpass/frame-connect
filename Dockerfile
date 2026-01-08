# Backend build stage
FROM node:22-alpine AS backend-builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Frontend build stage
FROM node:22-alpine AS frontend-builder

WORKDIR /app/web

# Copy frontend package files
COPY web/package*.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY web/ ./

# Build frontend
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    android-tools \
    libusb \
    vips

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built backend
COPY --from=backend-builder /app/dist ./dist
COPY src/database/schema.sql ./dist/database/

# Copy built frontend
COPY --from=frontend-builder /app/web/dist ./web/dist

# Create data directories
RUN mkdir -p /app/data /app/photos/temp

# Set environment
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/frameo.db
ENV PHOTOS_PATH=/app/photos

EXPOSE 3000

CMD ["node", "dist/index.js"]
