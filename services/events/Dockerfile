FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/events/package.json services/events/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/events...
COPY services/events services/events
WORKDIR /app/services/events
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3004
CMD ["pnpm", "start"]
