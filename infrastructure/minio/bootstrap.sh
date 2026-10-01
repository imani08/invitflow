#!/bin/sh
set -eu

until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  sleep 2
done

for bucket in media media-quarantine previews generated temporary invitations; do
  mc mb --ignore-existing "local/$bucket"
done

if ! mc admin user info local "$MINIO_AI_ACCESS_KEY" >/dev/null 2>&1; then
  mc admin user add local "$MINIO_AI_ACCESS_KEY" "$MINIO_AI_SECRET_KEY"
fi
if ! mc admin policy info local ai-design-preview-access >/dev/null 2>&1; then
  mc admin policy create local ai-design-preview-access /ai-design-policy.json
fi
mc admin policy attach local ai-design-preview-access --user "$MINIO_AI_ACCESS_KEY"

if ! mc admin user info local "$MINIO_INVITATION_ACCESS_KEY" >/dev/null 2>&1; then
  mc admin user add local "$MINIO_INVITATION_ACCESS_KEY" "$MINIO_INVITATION_SECRET_KEY"
fi
if ! mc admin policy info local invitation-render-access >/dev/null 2>&1; then
  mc admin policy create local invitation-render-access /invitation-policy.json
fi
mc admin policy attach local invitation-render-access --user "$MINIO_INVITATION_ACCESS_KEY"

if ! mc admin user info local "$MINIO_MEDIA_ACCESS_KEY" >/dev/null 2>&1; then
  mc admin user add local "$MINIO_MEDIA_ACCESS_KEY" "$MINIO_MEDIA_SECRET_KEY"
fi
if ! mc admin policy info local media-service-access >/dev/null 2>&1; then
  mc admin policy create local media-service-access /media-policy.json
fi
mc admin policy attach local media-service-access --user "$MINIO_MEDIA_ACCESS_KEY"
mc cors set local/media-quarantine /media-cors.xml
