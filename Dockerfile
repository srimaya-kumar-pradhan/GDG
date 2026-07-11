FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package configs
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code and data folders
COPY src ./src
COPY data ./data

# Expose server port
EXPOSE 3000

# Start Express server
CMD ["node", "src/server.js"]
