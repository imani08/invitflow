FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/profile/package.json services/profile/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/profile...
COPY services/profile services/profile
WORKDIR /app/services/profile
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3003
CMD ["pnpm", "start"]
