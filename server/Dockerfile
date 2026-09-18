FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY data ./data

EXPOSE 4010

# exec: node becomes the main process and receives the stop signal itself.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
