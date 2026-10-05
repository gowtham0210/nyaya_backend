# Nyaya API. Production deps only - dev tooling (nodemon, pino-pretty, sharp)
# stays out of the image, so the container must run with NODE_ENV=production
# (see src/utils/logger.js: non-production loads the pino-pretty transport).
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public

# User uploads land here; mount a volume over it to keep them across restarts.
RUN mkdir -p uploads && chown node:node uploads
USER node

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
