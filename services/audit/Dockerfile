ARG NODE_IMAGE=node:24.21.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
RUN npm install --global pnpm@12.8.0
COPY . .
RUN pnpm install --frozen-lockfile --filter @invitaflow/audit...
WORKDIR /app/services/audit
RUN DATABASE_URL=postgresql://generate:generate@localhost:5432/audit pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app
USER app
EXPOSE 3015
CMD ["pnpm", "start"]
