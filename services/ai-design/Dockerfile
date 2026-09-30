FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/ai-design/package.json services/ai-design/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/ai-design...
COPY services/ai-design services/ai-design
WORKDIR /app/services/ai-design
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
EXPOSE 3008
CMD ["pnpm", "start"]
