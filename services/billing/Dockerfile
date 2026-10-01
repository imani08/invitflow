ARG NODE_IMAGE=node:24.21.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
RUN npm install --global pnpm@12.8.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/billing/package.json services/billing/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/billing...
COPY services/billing services/billing
WORKDIR /app/services/billing
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app
USER app
EXPOSE 3010
CMD ["pnpm", "start"]
