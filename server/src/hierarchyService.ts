import type { PoolClient } from 'pg'

export async function validateEntryParent(
  client: PoolClient,
  projectId: string,
  groupId: string,
  parentEntryId: string | null | undefined,
  entryId?: string,
) {
  if (!parentEntryId) return
  const parent = (await client.query<{ project_id: string; group_id: string }>(
    'SELECT project_id, group_id FROM knowledge_entries WHERE id = $1',
    [parentEntryId],
  )).rows[0]
  if (!parent || parent.project_id !== projectId || parent.group_id !== groupId) {
    throw Object.assign(new Error('父条目必须与当前条目属于同一项目和分组'), { statusCode: 409 })
  }
  if (!entryId) return
  const cycle = await client.query<{ found: boolean }>(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM knowledge_entries WHERE id = $1
       UNION ALL
       SELECT child.id FROM knowledge_entries child JOIN descendants parent ON child.parent_entry_id = parent.id
     )
     SELECT EXISTS(SELECT 1 FROM descendants WHERE id = $2) AS found`,
    [entryId, parentEntryId],
  )
  if (cycle.rows[0]?.found) throw Object.assign(new Error('条目层级不能形成循环'), { statusCode: 409 })
}
