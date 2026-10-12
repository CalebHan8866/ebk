FROM node:20-slim AS base

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npx next build
RUN npx tsc --project tsconfig.server.json

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && (npm run scrape &) && node dist/server.js"]
