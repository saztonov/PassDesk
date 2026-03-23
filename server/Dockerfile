FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

EXPOSE 5000

CMD ["sh", "-c", "npm run db:migrate && npm run dev"]
