FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/audit/package.json services/audit/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/audit...
COPY services/audit services/audit
WORKDIR /app/services/audit
RUN DATABASE_URL=postgresql://generate:generate@localhost:5432/audit pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3015
CMD ["pnpm", "start"]
