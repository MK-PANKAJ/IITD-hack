FROM node:20-alpine
WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=8789
ENV GRAPHQL_PORT=4000

# Expose HTTP and GraphQL ports
EXPOSE 8789 4000

CMD ["node", "index.js"]
