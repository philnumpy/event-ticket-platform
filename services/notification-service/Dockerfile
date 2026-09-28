# Built from the monorepo root: `docker build -f services/notification-service/Dockerfile .`
FROM node:22-alpine
WORKDIR /app

COPY . .
RUN npm install

RUN npm run build --workspace packages/domain
RUN npm run build --workspace packages/messaging
RUN npm run build --workspace services/notification-service

WORKDIR /app/services/notification-service
CMD ["node", "dist/main.js"]
