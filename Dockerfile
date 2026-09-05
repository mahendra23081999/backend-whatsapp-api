FROM node:22-bookworm-slim

# Install system dependencies needed by native/media packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY . .

# Cloud Run provides the PORT environment variable
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Run Node directly in production, not nodemon
CMD ["node", "server.js"]
