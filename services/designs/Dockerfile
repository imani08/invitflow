ARG NODE_IMAGE=node:24.21.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
RUN npm install --global pnpm@12.8.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/designs/package.json services/designs/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/designs...
COPY services/designs services/designs
WORKDIR /app/services/designs
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app
USER app
EXPOSE 3007
CMD ["pnpm", "start"]
