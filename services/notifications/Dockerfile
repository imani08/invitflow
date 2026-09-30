FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/notifications/package.json services/notifications/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/notifications...
COPY services/notifications services/notifications
WORKDIR /app/services/notifications
RUN DATABASE_URL=postgresql://generate:generate@localhost:5432/notifications pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3012
CMD ["pnpm", "start"]
