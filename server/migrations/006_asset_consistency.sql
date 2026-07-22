CREATE TABLE IF NOT EXISTS asset_references (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('entry', 'attachment')),
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, owner_type, owner_id)
);

CREATE INDEX IF NOT EXISTS asset_references_owner_idx ON asset_references (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS asset_references_workspace_idx ON asset_references (workspace_id, asset_id);

CREATE TABLE IF NOT EXISTS asset_cleanup_jobs (
  id uuid PRIMARY KEY,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  object_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asset_cleanup_jobs_status_idx ON asset_cleanup_jobs (status, updated_at);

INSERT INTO asset_references (id, asset_id, workspace_id, owner_type, owner_id)
SELECT gen_random_uuid(), a.id, a.workspace_id, 'attachment', pa.id
FROM project_attachments pa
JOIN assets a ON a.id = pa.asset_id
ON CONFLICT (asset_id, owner_type, owner_id) DO NOTHING;

INSERT INTO asset_references (id, asset_id, workspace_id, owner_type, owner_id)
SELECT gen_random_uuid(), a.id, a.workspace_id, 'entry', e.id
FROM knowledge_entries e
JOIN projects p ON p.id = e.project_id
JOIN assets a ON a.workspace_id = p.workspace_id
WHERE position('deek-asset://service/' || a.id::text in coalesce(e.text_content, '')) > 0
ON CONFLICT (asset_id, owner_type, owner_id) DO NOTHING;

DO $$
DECLARE
  duplicate record;
BEGIN
  FOR duplicate IN
    SELECT id, object_key, canonical_id
    FROM (
      SELECT id, object_key,
             first_value(id) OVER (PARTITION BY workspace_id, sha256 ORDER BY created_at, id) AS canonical_id,
             row_number() OVER (PARTITION BY workspace_id, sha256 ORDER BY created_at, id) AS duplicate_number
      FROM assets WHERE status = 'ready'
    ) ranked
    WHERE duplicate_number > 1
  LOOP
    UPDATE project_attachments SET asset_id = duplicate.canonical_id WHERE asset_id = duplicate.id;
    UPDATE knowledge_entries
       SET text_content = replace(text_content, 'deek-asset://service/' || duplicate.id::text, 'deek-asset://service/' || duplicate.canonical_id::text)
     WHERE position('deek-asset://service/' || duplicate.id::text in coalesce(text_content, '')) > 0;
    DELETE FROM asset_references WHERE asset_id = duplicate.id;
    INSERT INTO asset_cleanup_jobs (id, asset_id, object_key, status)
    VALUES (gen_random_uuid(), duplicate.id, duplicate.object_key, 'pending');
    UPDATE assets SET status = 'deleting', updated_at = now() WHERE id = duplicate.id;
  END LOOP;
END $$;

INSERT INTO asset_references (id, asset_id, workspace_id, owner_type, owner_id)
SELECT gen_random_uuid(), a.id, a.workspace_id, 'attachment', pa.id
FROM project_attachments pa
JOIN assets a ON a.id = pa.asset_id
ON CONFLICT (asset_id, owner_type, owner_id) DO NOTHING;

INSERT INTO asset_references (id, asset_id, workspace_id, owner_type, owner_id)
SELECT gen_random_uuid(), a.id, a.workspace_id, 'entry', e.id
FROM knowledge_entries e
JOIN projects p ON p.id = e.project_id
JOIN assets a ON a.workspace_id = p.workspace_id
WHERE position('deek-asset://service/' || a.id::text in coalesce(e.text_content, '')) > 0
ON CONFLICT (asset_id, owner_type, owner_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS assets_workspace_sha_ready_unique
  ON assets (workspace_id, sha256) WHERE status = 'ready';
