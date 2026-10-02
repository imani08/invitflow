ARG NODE_IMAGE=node:24.21.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
RUN npm install --global pnpm@12.8.0
COPY . .
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/gateway
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app
USER app
EXPOSE 3002
CMD ["pnpm", "dev"]
