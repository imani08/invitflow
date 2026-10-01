ARG NODE_IMAGE=node:24.21.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
RUN npm install --global pnpm@12.8.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/analytics/package.json services/analytics/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/analytics...
COPY services/analytics services/analytics
WORKDIR /app/services/analytics
RUN DATABASE_URL=postgresql://generate:generate@localhost:5432/analytics pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app
USER app
EXPOSE 3016
CMD ["pnpm", "start"]
