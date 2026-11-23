FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json build.mjs ./
COPY src ./src
RUN npm run check && npm run build

FROM node:22-alpine
COPY --from=build /app/dist/index.js /app/dist/index.js
COPY --from=build /app/NOTICE /app/NOTICE
# Exports are written relative to /work: mount your project there (see README).
RUN mkdir /work && chown node:node /work
WORKDIR /work
USER node
ENTRYPOINT ["node", "/app/dist/index.js", "mcp"]
