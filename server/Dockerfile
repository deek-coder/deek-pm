FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
USER root
RUN mkdir -p /data/deek-pm/assets && chown -R node:node /data/deek-pm
USER node
EXPOSE 3100
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/index.js"]
