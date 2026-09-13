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

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
