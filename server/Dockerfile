FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY data ./data

ENV PORT=4010
EXPOSE 4010

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4010/api/health >/dev/null || exit 1

# Not root: the app only writes to the uploads volume (owned by uid 1000).
USER node

# Migrations run before this in the lms-migrate service (docker-compose on
# srv3); node is the main process and receives the stop signal itself.
CMD ["node", "src/index.js"]
