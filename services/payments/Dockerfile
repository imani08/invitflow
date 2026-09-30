FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/payments/package.json services/payments/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/payments...
COPY services/payments services/payments
WORKDIR /app/services/payments
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3011
CMD ["pnpm", "start"]
