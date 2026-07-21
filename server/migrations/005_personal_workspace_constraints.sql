ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_status_check;
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_status_check CHECK (status = 'joined');
