ALTER TABLE users ADD COLUMN IF NOT EXISTS is_instance_admin boolean NOT NULL DEFAULT false;

UPDATE users
SET is_instance_admin = true
WHERE id = (
  SELECT user_id FROM workspace_members
  WHERE role = 'owner' AND user_id IS NOT NULL
  ORDER BY created_at LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM users WHERE is_instance_admin = true);

CREATE TABLE IF NOT EXISTS storage_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  driver text NOT NULL CHECK (driver IN ('filesystem', 's3')),
  filesystem_path text,
  s3_endpoint text,
  s3_region text,
  s3_bucket text,
  s3_force_path_style boolean NOT NULL DEFAULT true,
  credentials_encrypted text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image', 'attachment')),
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  sha256 text NOT NULL,
  object_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS assets_workspace_idx ON assets (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assets_dedup_idx ON assets (workspace_id, sha256) WHERE status = 'ready';
