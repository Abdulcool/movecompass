FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY . .
RUN npm ci
RUN if [ -f app/package.json ]; then cd app && npx expo export --platform web; fi
RUN npm run build -w server
RUN mkdir -p app/dist

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 DATA_DIR=/var/data WEB_DIST=/workspace/app/dist
WORKDIR /workspace
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/server ./server
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/app/dist ./app/dist
RUN mkdir -p app/dist /var/data && chown -R node:node /var/data
USER node
WORKDIR /workspace/server
EXPOSE 8080
CMD ["node", "dist/index.cjs"]
