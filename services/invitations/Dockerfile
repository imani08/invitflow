ARG NODE_IMAGE=node:24.21.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends chromium qrencode && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@12.8.0
COPY . .
RUN pnpm install --frozen-lockfile --filter @invitaflow/invitations...
WORKDIR /app/services/invitations
RUN DATABASE_URL=postgresql://generate:generate@localhost:5432/invitations pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app
USER app
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV QR_ENCODE_PATH=/usr/bin/qrencode
EXPOSE 3013
CMD ["pnpm", "start"]
