FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/guests/package.json services/guests/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/guests...
COPY services/guests services/guests
WORKDIR /app/services/guests
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3005
CMD ["pnpm", "start"]
