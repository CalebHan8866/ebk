FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npx next build
RUN npx tsc --project tsconfig.server.json

EXPOSE 3000

CMD ["node", "dist/server.js"]
