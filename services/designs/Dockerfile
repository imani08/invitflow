FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/designs/package.json services/designs/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/designs...
COPY services/designs services/designs
WORKDIR /app/services/designs
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3007
CMD ["pnpm", "start"]
