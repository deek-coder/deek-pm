DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM knowledge_groups child
    JOIN knowledge_groups parent ON parent.id = child.parent_group_id
    WHERE child.project_id <> parent.project_id
  ) THEN
    RAISE EXCEPTION 'Cannot apply hierarchy constraints: cross-project group parent detected';
  END IF;
  IF EXISTS (
    SELECT 1 FROM knowledge_entries entry
    JOIN knowledge_groups group_row ON group_row.id = entry.group_id
    WHERE entry.project_id <> group_row.project_id
  ) THEN
    RAISE EXCEPTION 'Cannot apply hierarchy constraints: entry group belongs to another project';
  END IF;
  IF EXISTS (
    SELECT 1 FROM knowledge_entries child
    JOIN knowledge_entries parent ON parent.id = child.parent_entry_id
    WHERE child.project_id <> parent.project_id OR child.group_id <> parent.group_id
  ) THEN
    RAISE EXCEPTION 'Cannot apply hierarchy constraints: invalid entry parent detected';
  END IF;
END $$;

ALTER TABLE knowledge_groups ADD CONSTRAINT knowledge_groups_id_project_unique UNIQUE (id, project_id);
ALTER TABLE knowledge_entries ADD CONSTRAINT knowledge_entries_id_project_unique UNIQUE (id, project_id);

ALTER TABLE knowledge_groups DROP CONSTRAINT knowledge_groups_parent_group_id_fkey;
ALTER TABLE knowledge_groups
  ADD CONSTRAINT knowledge_groups_parent_same_project_fkey
  FOREIGN KEY (parent_group_id, project_id) REFERENCES knowledge_groups(id, project_id) ON DELETE CASCADE;

ALTER TABLE knowledge_entries DROP CONSTRAINT knowledge_entries_group_id_fkey;
ALTER TABLE knowledge_entries
  ADD CONSTRAINT knowledge_entries_group_same_project_fkey
  FOREIGN KEY (group_id, project_id) REFERENCES knowledge_groups(id, project_id) ON DELETE CASCADE;

ALTER TABLE knowledge_entries DROP CONSTRAINT knowledge_entries_parent_entry_id_fkey;
ALTER TABLE knowledge_entries
  ADD CONSTRAINT knowledge_entries_parent_same_project_fkey
  FOREIGN KEY (parent_entry_id, project_id) REFERENCES knowledge_entries(id, project_id) ON DELETE CASCADE;
