FROM node:24.21.0-alpine
WORKDIR /app
RUN corepack enable && apk add --no-cache chromium qrencode
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/invitations/package.json services/invitations/package.json
RUN pnpm install --frozen-lockfile --filter @invitaflow/invitations...
COPY services/invitations services/invitations
WORKDIR /app/services/invitations
RUN DATABASE_URL=postgresql://generate:generate@localhost:5432/invitations pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV QR_ENCODE_PATH=/usr/bin/qrencode
EXPOSE 3013
CMD ["pnpm", "start"]
