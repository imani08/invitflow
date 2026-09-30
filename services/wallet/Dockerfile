FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/wallet/package.json services/wallet/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/wallet...
COPY services/wallet services/wallet
WORKDIR /app/services/wallet
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3009
CMD ["pnpm", "start"]
