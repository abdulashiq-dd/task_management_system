FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && mkdir -p /app/exports && chown -R node:node /app/exports
COPY --chown=node:node server.js ./
COPY --chown=node:node src ./src
ENV NODE_ENV=production PORT=5000
USER node
EXPOSE 5000
CMD ["node", "server.js"]
