FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/billing/package.json services/billing/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/billing...
COPY services/billing services/billing
WORKDIR /app/services/billing
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3010
CMD ["pnpm", "start"]
