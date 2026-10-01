#!/bin/sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${ANALYTICS_DB_PASSWORD:?ANALYTICS_DB_PASSWORD is required}"

PGPASSWORD="$POSTGRES_PASSWORD" psql --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --dbname postgres \
  --set=ON_ERROR_STOP=1 --set=database=analytics_db --set=role=analytics_service --set=password="$ANALYTICS_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL
