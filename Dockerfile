# ---- Build stage: compile the client and server ----
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage: only what is needed to run ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache python3 make g++ && \
    addgroup -S lar && adduser -S lar -G lar
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk del python3 make g++ && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /app/data && chown -R lar:lar /app
USER lar
ENV PORT=3000
ENV DATA_DIR=/app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1
CMD ["node", "dist/server/index.js"]
