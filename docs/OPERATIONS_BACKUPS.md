# Backups and recovery

## PostgreSQL cluster backup

Run from the repository root while the local Compose PostgreSQL service is healthy:

```powershell
pnpm db:backup
pnpm db:backup -- backups/manual-cluster.sql
```

The script streams `pg_dumpall` output to a new file and refuses to overwrite an existing file. The output contains every database, role definitions, and sensitive business data. Keep it outside source control, restrict access, and encrypt it before copying it away from the development machine. The default `backups/` directory is git-ignored.

## PostgreSQL restore drill

Prepare a **separate, isolated PostgreSQL cluster** reachable from the Compose `postgres` container. It must be empty and the supplied PostgreSQL URL must identify a superuser connection. Do not point the restore at a production or active application database. Set `RESTORE_TARGET_URL` in the current PowerShell session without putting it in shell history, then run:

```powershell
$env:RESTORE_TARGET_URL = '<isolated-superuser-postgresql-url>'
pnpm db:restore -- backups/postgres-<timestamp>.sql
Remove-Item Env:RESTORE_TARGET_URL
```

The script accepts only a `postgres://` or `postgresql://` URL with an explicit database, and rejects the active Compose hostname `postgres`, loopback hosts, and query parameters that override the host, user, or database. It displays the target host/database and requires the exact phrase `RESTORE TO ISOLATED TARGET`. The SQL dump recreates roles and databases; test this only against a disposable isolated cluster. The operator must still ensure the remote hostname refers to a separate empty cluster; the script cannot identify whether an arbitrary remote host is production.

After restore, compare the source and restored cluster database lists, migration tables, and representative row counts for each service. Then start the application against the restored cluster and verify login, event/guest reads, wallet ledger reads, and invitation batch reads. Record the dump timestamp, restore duration, verification results, and any data-loss window. A successful script exit alone does not establish a successful recovery.

## MinIO / S3 objects

PostgreSQL backups do not contain object data. Mirror each configured bucket to a separately secured destination with the MinIO Client (`mc mirror --overwrite <source-alias>/<bucket> <destination-alias>/<bucket>`), using dedicated least-privilege credentials. Keep the destination outside the MinIO host or volume, enable encryption at rest and in transit, and align object versioning/retention with the approved policy. Do not set retention periods until the legal retention requirements are validated.

For recovery, restore the database and object buckets to isolated targets from the same recovery point. Verify object counts and sample checksums before directing application services to the recovered endpoints.

## Validation status

The scripts are present, but a real backup and restore drill remains `BLOCKED_ENVIRONMENT:DOCKER_RUNTIME` until Docker is available. No recovery point objective, recovery time objective, or backup-retention duration is claimed yet.
