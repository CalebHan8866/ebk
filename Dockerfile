FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

RUN npx prisma generate
RUN npx next build

EXPOSE 3000

CMD ["npx", "ts-node", "--project", "tsconfig.server.json", "server.ts"]
