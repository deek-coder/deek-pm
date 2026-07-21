ALTER TABLE project_attachments ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE project_attachments DROP CONSTRAINT IF EXISTS project_attachments_target_type_check;
ALTER TABLE project_attachments
  ADD CONSTRAINT project_attachments_target_type_check CHECK (target_type IN ('file', 'folder', 'asset'));
CREATE INDEX IF NOT EXISTS project_attachments_asset_idx ON project_attachments (asset_id);
