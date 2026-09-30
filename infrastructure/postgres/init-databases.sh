#!/bin/sh
set -eu

# Create the profile service's least-privilege login and database. Its URL-safe
# password is distinct from the postgres administrator password.
if [ -z "${PROFILE_DB_PASSWORD:-}" ]; then
  echo "PROFILE_DB_PASSWORD is required to provision the profile database role" >&2
  exit 1
fi
if [ -z "${EVENT_DB_PASSWORD:-}" ]; then
  echo "EVENT_DB_PASSWORD is required to provision the Events database role" >&2
  exit 1
fi
if [ -z "${GUEST_DB_PASSWORD:-}" ]; then
  echo "GUEST_DB_PASSWORD is required to provision the Guests database role" >&2
  exit 1
fi
if [ -z "${SEATING_DB_PASSWORD:-}" ]; then
  echo "SEATING_DB_PASSWORD is required to provision the Seating database role" >&2
  exit 1
fi
if [ -z "${DESIGNS_DB_PASSWORD:-}" ]; then
  echo "DESIGNS_DB_PASSWORD is required to provision the Designs database role" >&2
  exit 1
fi
if [ -z "${AI_DESIGN_DB_PASSWORD:-}" ]; then
  echo "AI_DESIGN_DB_PASSWORD is required to provision the AI Design database role" >&2
  exit 1
fi
if [ -z "${WALLET_DB_PASSWORD:-}" ]; then
  echo "WALLET_DB_PASSWORD is required to provision the Wallet database role" >&2
  exit 1
fi
if [ -z "${BILLING_DB_PASSWORD:-}" ]; then
  echo "BILLING_DB_PASSWORD is required to provision the Billing database role" >&2
  exit 1
fi
if [ -z "${PAYMENT_DB_PASSWORD:-}" ]; then
  echo "PAYMENT_DB_PASSWORD is required to provision the Payments database role" >&2
  exit 1
fi
if [ -z "${NOTIFICATIONS_DB_PASSWORD:-}" ]; then
  echo "NOTIFICATIONS_DB_PASSWORD is required to provision the Notifications database role" >&2
  exit 1
fi
if [ -z "${INVITATIONS_DB_PASSWORD:-}" ]; then
  echo "INVITATIONS_DB_PASSWORD is required to provision the Invitations database role" >&2
  exit 1
fi
if [ -z "${AUDIT_DB_PASSWORD:-}" ]; then
  echo "AUDIT_DB_PASSWORD is required to provision the audit database role" >&2
  exit 1
fi
if [ -z "${KEYCLOAK_DB_PASSWORD:-}" ]; then
  echo "KEYCLOAK_DB_PASSWORD is required to provision the Keycloak database role" >&2
  exit 1
fi
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=profile_db --set=role=profile_service --set=password="$PROFILE_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Keycloak owns identity data in a dedicated database and does not reuse a
# domain-service account. Keep this idempotent for a persistent Postgres volume.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=keycloak_db --set=role=keycloak_service --set=password="$KEYCLOAK_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

# Invitations owns immutable invitation versions, render batches and item snapshots.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=invitation_db --set=role=invitations_service --set=password="$INVITATIONS_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Notifications owns user-facing in-app notification records and preferences.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=notification_db --set=role=notifications_service --set=password="$NOTIFICATIONS_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Payments owns orders, provider transactions and payment confirmations.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=payment_db --set=role=payments_service --set=password="$PAYMENT_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Wallet owns credit balances, reservations and the immutable ledger.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=wallet_db --set=role=wallet_service --set=password="$WALLET_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Billing owns immutable price schedules, packs and credit rules.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=billing_db --set=role=billing_service --set=password="$BILLING_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# AI Design owns generation jobs and proposals in its isolated database.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=ai_design_db --set=role=ai_design_service --set=password="$AI_DESIGN_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Designs owns event templates and design documents in its isolated database.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=design_db --set=role=designs_service --set=password="$DESIGNS_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Seating owns ceremony plans, tables, zones and assignments in its isolated database.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=seating_db --set=role=seating_service --set=password="$SEATING_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Guests owns guest, access, group and import-job data in its isolated database.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=guest_db --set=role=guests_service --set=password="$GUEST_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Events owns event and ceremony data in its isolated database and login.
PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=event_db --set=role=events_service --set=password="$EVENT_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

# Reserve isolated empty logical databases for later services. Runtime credentials
# and grants for each are created with that service's own implementation phase.
for database in event_db guest_db seating_db design_db ai_design_db media_db invitation_db payment_db wallet_db billing_db notification_db analytics_db audit_db; do
  PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 --set=database="$database" <<'SQL'
SELECT format('CREATE DATABASE %I', :'database')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SQL

done

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=wallet_db --set=role=wallet_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=billing_db --set=role=billing_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=payment_db --set=role=payments_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=notification_db --set=role=notifications_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=invitation_db --set=role=invitations_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=ai_design_db --set=role=ai_design_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=design_db --set=role=designs_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=guest_db --set=role=guests_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL
 

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=profile_db --set=role=profile_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=event_db --set=role=events_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=seating_db --set=role=seating_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=audit_db --set=role=audit_service --set=password="$AUDIT_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')
\gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role', :'password')
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'database', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'database')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'database', :'role')
\gexec
SQL

PGPASSWORD="$POSTGRES_PASSWORD" psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
  --set=database=audit_db --set=role=audit_service <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'role')
\gexec
SQL
