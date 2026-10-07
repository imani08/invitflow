# syntax=docker/dockerfile:1.7
ARG NODE_IMAGE=node:24.21.0-slim
FROM ${NODE_IMAGE}
WORKDIR /app
RUN npm install --global pnpm@12.8.0
RUN groupadd --system app && useradd --system --gid app app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/gateway/package.json ./apps/gateway/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY services/access/package.json ./services/access/package.json
COPY services/ai-design/package.json ./services/ai-design/package.json
COPY services/analytics/package.json ./services/analytics/package.json
COPY services/audit/package.json ./services/audit/package.json
COPY services/billing/package.json ./services/billing/package.json
COPY services/designs/package.json ./services/designs/package.json
COPY services/events/package.json ./services/events/package.json
COPY services/guests/package.json ./services/guests/package.json
COPY services/invitations/package.json ./services/invitations/package.json
COPY services/media/package.json ./services/media/package.json
COPY services/notifications/package.json ./services/notifications/package.json
COPY services/payments/package.json ./services/payments/package.json
COPY services/profile/package.json ./services/profile/package.json
COPY services/seating/package.json ./services/seating/package.json
COPY services/wallet/package.json ./services/wallet/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/design-document/package.json ./packages/design-document/package.json
COPY packages/legal-contract/package.json ./packages/legal-contract/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/ui/package.json ./packages/ui/package.json
RUN --mount=type=cache,id=invitaflow-pnpm-store,target=/pnpm/store,sharing=locked pnpm install --store-dir=/pnpm/store --frozen-lockfile --filter @invitaflow/designs...
COPY . .
WORKDIR /app/services/designs
RUN pnpm prisma:generate && pnpm exec tsc -p tsconfig.json
EXPOSE 3007
USER app
CMD ["pnpm", "start"]
