import assert from 'node:assert/strict'
import { File as NodeFile } from 'node:buffer'
import { migrateLocalBackupToService } from '../src/features/workspace/migrateLocalBackup'
import type { BackupPayload, Repositories } from '../src/repositories/repository'

Object.assign(globalThis, {
  File: NodeFile,
  window: { atob: (value: string) => Buffer.from(value, 'base64').toString('binary') },
})

const hash = 'a'.repeat(64)
const relativePath = `aa/${hash}.png`
const updates: Array<{ id: string; textContent?: string }> = []
const attachments: Array<{ target: string; assetId?: string }> = []
let groupSequence = 0
let entrySequence = 0

const target = {
  workspace: { listWorkspaces: async () => [{ id: 'target-workspace', type: 'service', deployment: 'selfhost', name: 'Target', description: '', status: 'online' }] },
  project: {
    createProject: async (input: { name: string }) => ({ id: 'target-project', workspaceId: 'target-workspace', name: input.name, description: '', tag: '', tone: 'blue', entryCount: 0, updatedAtText: '刚刚' }),
    deleteProject: async () => undefined,
  },
  knowledge: {
    createGroup: async (input: { projectId: string; name: string; parentGroupId?: string }) => ({ id: `target-group-${++groupSequence}`, projectId: input.projectId, name: input.name, parentGroupId: input.parentGroupId, entries: [] }),
    createEntry: async (input: { projectId: string; groupId: string; title: string; type: 'text' | 'password' | 'link'; parentEntryId?: string }) => ({ id: `target-entry-${++entrySequence}`, projectId: input.projectId, groupId: input.groupId, title: input.title, type: input.type, parentEntryId: input.parentEntryId, remark: '', tags: [], createdAt: '', updatedAt: '' }),
    updateEntry: async (input: { id: string; textContent?: string }) => { updates.push(input); return undefined },
  },
  attachment: {
    addAttachment: async (input: { target: string; assetId?: string }) => { attachments.push(input); return { id: 'target-attachment', projectId: 'target-project', name: 'image.png', targetType: 'asset', target: input.target, assetId: input.assetId, createdAt: '' } },
  },
  quickEntry: {
    createQuickEntry: async (input: { name: string }) => ({ id: 'target-quick', workspaceId: 'target-workspace', name: input.name, targetType: 'url', target: 'https://example.com', published: false, sortOrder: 0, createdAt: '', updatedAt: '' }),
    deleteQuickEntry: async () => undefined,
  },
  asset: {
    uploadAsset: async () => ({ id: 'target-asset', workspaceId: 'target-workspace', kind: 'image', originalName: 'image.png', mimeType: 'image/png', sizeBytes: 3, storedUrl: 'deek-asset://service/00000000-0000-4000-8000-000000000001', createdAt: '' }),
    deleteAsset: async () => undefined,
  },
} as unknown as Repositories

const payload: BackupPayload = {
  version: 1,
  exportedAt: new Date().toISOString(),
  workspaces: [{ id: 'local-personal', type: 'local', deployment: 'local', name: 'Local', description: '', status: 'offline' }],
  projects: [{ id: 'project-1', workspaceId: 'local-personal', name: 'Project', description: '', tag: '', tone: 'blue', entryCount: 2, updatedAtText: '刚刚' }],
  knowledgeGroups: [
    { id: 'group-child', projectId: 'project-1', name: 'Child group', parentGroupId: 'group-parent', entries: [{ id: 'entry-child', title: 'Child', type: 'text', parentEntryId: 'entry-parent' }] },
    { id: 'group-parent', projectId: 'project-1', name: 'Parent group', entries: [{ id: 'entry-parent', title: 'Parent', type: 'text' }] },
  ],
  entries: {
    'entry-parent': { id: 'entry-parent', projectId: 'project-1', groupId: 'group-parent', title: 'Parent', type: 'text', remark: '', tags: [], textContent: `<img src="deek-asset://managed-assets/${relativePath}">`, createdAt: '', updatedAt: '' },
    'entry-child': { id: 'entry-child', projectId: 'project-1', groupId: 'group-child', parentEntryId: 'entry-parent', title: 'Child', type: 'text', remark: '', tags: [], textContent: '', createdAt: '', updatedAt: '' },
  },
  attachments: [{ id: 'attachment-1', projectId: 'project-1', name: 'image.png', targetType: 'asset', target: `deek-asset://managed-assets/${relativePath}`, assetId: `local-${hash}`, createdAt: '' }],
  quickEntries: [{ id: 'quick-1', workspaceId: 'local-personal', name: 'Website', targetType: 'url', target: 'https://example.com', published: false, sortOrder: 0, createdAt: '', updatedAt: '' }],
  managedAssets: [{ relativePath, contentBase64: Buffer.from('png').toString('base64') }],
}

const result = await migrateLocalBackupToService(payload, target)
assert.deepEqual(result, { projects: 1, entries: 2, assets: 1, attachments: 1, quickEntries: 1, skippedPathAttachments: 0 })
assert.equal(groupSequence, 2)
assert.equal(entrySequence, 2)
assert.match(updates[0]?.textContent ?? '', /deek-asset:\/\/service\//)
assert.equal(attachments[0]?.assetId, 'target-asset')
console.log('migration tests passed')
