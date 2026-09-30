FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/seating/package.json services/seating/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/seating...
COPY services/seating services/seating
WORKDIR /app/services/seating
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3006
CMD ["pnpm", "start"]
