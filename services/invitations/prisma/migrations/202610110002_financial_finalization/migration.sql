ALTER TYPE "BatchStatus" ADD VALUE IF NOT EXISTS 'FINALIZING';
ALTER TABLE invitation_batches
  ADD COLUMN request_hash varchar(64),
  ADD COLUMN retry_of_batch_id uuid,
  ADD COLUMN settlement_credits integer,
  ADD COLUMN settled_at timestamptz(3);
CREATE UNIQUE INDEX invitation_batches_retry_of_batch_id_key ON invitation_batches(retry_of_batch_id);
ALTER TABLE invitation_batch_items ADD COLUMN invitation_version_id uuid;
UPDATE invitation_batch_items i SET invitation_version_id = v.id
FROM invitation_versions v
WHERE v.invitation_id = i.invitation_id AND v.snapshot->>'jobId' = i.batch_id::text;
-- Historical COMPLETED is written only after both settlement calls acknowledge success.
-- CANCELLED/FAILED are deliberately not inferred as funded.
UPDATE invitation_batches SET settled_at = updated_at, settlement_credits = completed_items WHERE status = 'COMPLETED';
UPDATE invitations i SET current_version_id = funded.version_id, status = 'GENERATED'
FROM (
  SELECT DISTINCT ON (bi.invitation_id) bi.invitation_id, v.id AS version_id
  FROM invitation_batch_items bi
  JOIN invitation_batches b ON b.id = bi.batch_id
  JOIN invitation_versions v ON v.id = bi.invitation_version_id
  WHERE bi.status = 'GENERATED' AND b.status = 'COMPLETED' AND b.settled_at IS NOT NULL
  ORDER BY bi.invitation_id, v.version DESC
) funded
WHERE i.id = funded.invitation_id AND i.status <> 'REVOKED';
