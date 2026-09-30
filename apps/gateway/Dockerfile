FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc .npmrc
COPY apps/gateway/package.json apps/gateway/package.json
RUN pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/apps/gateway
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3002
CMD ["pnpm", "dev"]
