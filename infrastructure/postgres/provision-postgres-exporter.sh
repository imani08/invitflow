#!/bin/sh
set -eu

: "${POSTGRES_HOST:=postgres}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_EXPORTER_PASSWORD:?POSTGRES_EXPORTER_PASSWORD is required}"

export PGPASSWORD="$POSTGRES_PASSWORD"
psql --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=role=postgres_exporter --set=password="$POSTGRES_EXPORTER_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password')
\gexec
SELECT format('GRANT pg_monitor TO %I', :'role')
\gexec
SELECT format('GRANT CONNECT ON DATABASE postgres TO %I', :'role')
\gexec
SQL
