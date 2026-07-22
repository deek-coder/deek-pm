CREATE TABLE IF NOT EXISTS instance_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  initialized_at timestamptz,
  initialized_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO instance_settings (id, initialized_at, initialized_by)
SELECT 1, now(), id
FROM users
ORDER BY is_instance_admin DESC, created_at, id
LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO instance_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
