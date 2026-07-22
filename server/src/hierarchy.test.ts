import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolClient } from 'pg'
import { validateEntryParent } from './hierarchyService.js'

function clientWith(parent: { project_id: string; group_id: string } | undefined, cycle = false) {
  return {
    query: async (sql: string) => sql.includes('WITH RECURSIVE descendants')
      ? { rows: [{ found: cycle }] }
      : { rows: parent ? [parent] : [] },
  } as unknown as PoolClient
}

test('entry parent must belong to the same project and group', async () => {
  await assert.rejects(
    validateEntryParent(clientWith({ project_id: 'project-b', group_id: 'group-b' }), 'project-a', 'group-a', 'parent-id'),
    /同一项目和分组/,
  )
})

test('entry parent update rejects hierarchy cycles', async () => {
  await assert.rejects(
    validateEntryParent(clientWith({ project_id: 'project-a', group_id: 'group-a' }, true), 'project-a', 'group-a', 'child-id', 'parent-id'),
    /不能形成循环/,
  )
})

test('entry parent accepts a valid relation', async () => {
  await validateEntryParent(clientWith({ project_id: 'project-a', group_id: 'group-a' }), 'project-a', 'group-a', 'parent-id', 'child-id')
})
