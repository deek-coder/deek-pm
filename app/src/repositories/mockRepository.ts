import { entries, knowledgeGroups, projects, workspaces } from './mockData'
import type { KnowledgeEntryDetail } from '../domain/types'
import type { CreateKnowledgeEntryInput, CreateKnowledgeGroupInput, Repositories, RepositorySource, UpdateKnowledgeEntryInput } from './repository'

const delay = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

const mockSource: RepositorySource = {
  kind: 'mock',
  label: 'Mock 数据源',
  description: '开发阶段使用的内存数据源，接口形状对齐本地库和服务端仓储。',
  encrypted: false,
  supportsBackup: true,
}

interface MockRepositoryOptions {
  source?: RepositorySource
  workspaceIds?: string[]
}

export function createMockRepositories(options: MockRepositoryOptions = {}): Repositories {
  const source = options.source ?? mockSource
  const workspaceIds = new Set(options.workspaceIds)
  const hasWorkspaceScope = workspaceIds.size > 0
  const workspaceStore = [...workspaces]
  const projectStore = [...projects]
  const knowledgeGroupStore = knowledgeGroups.map((group) => ({
    ...group,
    entries: [...group.entries],
  }))
  const entryStore = { ...entries }
  const attachmentStore: Awaited<ReturnType<Repositories['attachment']['listAttachments']>> = []
  const quickEntryStore: Awaited<ReturnType<Repositories['quickEntry']['listQuickEntries']>> = []

  return {
    source,
    workspace: {
      async listWorkspaces() {
        await delay()
        return hasWorkspaceScope ? workspaceStore.filter((workspace) => workspaceIds.has(workspace.id)) : workspaceStore
      },
      async getWorkspace(id) {
        await delay()
        const workspace = workspaceStore.find((item) => item.id === id)
        if (!workspace) return undefined
        return !hasWorkspaceScope || workspaceIds.has(workspace.id) ? workspace : undefined
      },
    },
    project: {
      async listProjects(workspaceId) {
        await delay()
        if (hasWorkspaceScope && !workspaceIds.has(workspaceId)) return []
        return projectStore.filter((project) => project.workspaceId === workspaceId)
      },
      async getProject(id) {
        await delay()
        const project = projectStore.find((item) => item.id === id)
        if (!project) return undefined
        return !hasWorkspaceScope || workspaceIds.has(project.workspaceId) ? project : undefined
      },
      async createProject(input) {
        await delay()
        const project = {
          id: `project-${crypto.randomUUID()}`,
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
          tag: input.tag,
          entryCount: 0,
          updatedAtText: '刚刚',
          tone: input.tone ?? 'blue',
        }
        projectStore.unshift(project)
        return project
      },
      async updateProject(input) {
        await delay()
        const project = projectStore.find((item) => item.id === input.id)
        if (!project) return undefined
        Object.assign(project, {
          ...input,
          updatedAtText: '刚刚',
        })
        return project
      },
      async deleteProject(id) {
        await delay()
        const index = projectStore.findIndex((project) => project.id === id)
        if (index >= 0) projectStore.splice(index, 1)
        for (let i = knowledgeGroupStore.length - 1; i >= 0; i -= 1) {
          if (knowledgeGroupStore[i].projectId === id) knowledgeGroupStore.splice(i, 1)
        }
        for (const key of Object.keys(entryStore)) {
          if (entryStore[key].projectId === id) delete entryStore[key]
        }
        for (let i = attachmentStore.length - 1; i >= 0; i -= 1) {
          if (attachmentStore[i].projectId === id) attachmentStore.splice(i, 1)
        }
      },
    },
    knowledge: {
      async listGroups(projectId) {
        await delay()
        return knowledgeGroupStore.filter((group) => group.projectId === projectId)
      },
      async searchEntryIds(projectId, query) {
        const normalized = query.trim().toLocaleLowerCase()
        if (!normalized) return []
        return Object.values(entryStore)
          .filter((entry) => entry.projectId === projectId)
          .filter((entry) => [
            entry.title,
            entry.remark,
            entry.tags.join(' '),
            entry.textContent ?? '',
            entry.linkItems?.map((item) => `${item.name} ${item.target}`).join(' ') ?? '',
            entry.passwordItems?.map((item) => item.name).join(' ') ?? '',
          ].join(' ').toLocaleLowerCase().includes(normalized))
          .map((entry) => entry.id)
      },
      async createGroup(input) {
        await delay()
        const group = createGroup(input)
        knowledgeGroupStore.push(group)
        touchProject(projectStore, input.projectId)
        return group
      },
      async updateGroup(id, name) {
        await delay()
        const group = knowledgeGroupStore.find((item) => item.id === id)
        if (!group) return undefined
        group.name = name
        touchProject(projectStore, group.projectId)
        return group
      },
      async deleteGroup(id) {
        await delay()
        const group = knowledgeGroupStore.find((item) => item.id === id)
        if (!group) return
        const groupIds = collectGroupDescendantIds(knowledgeGroupStore, id)
        const deletedGroups = knowledgeGroupStore.filter((item) => groupIds.has(item.id))
        const entryIds = new Set(deletedGroups.flatMap((item) => item.entries.map((entry) => entry.id)))
        for (const entryId of entryIds) delete entryStore[entryId]
        for (let index = knowledgeGroupStore.length - 1; index >= 0; index -= 1) {
          if (groupIds.has(knowledgeGroupStore[index].id)) knowledgeGroupStore.splice(index, 1)
        }
        const project = projectStore.find((item) => item.id === group.projectId)
        if (project) {
          project.entryCount = Math.max(0, project.entryCount - entryIds.size)
          project.updatedAtText = '刚刚'
        }
      },
      async moveEntry(entryId, targetGroupId) {
        await delay()
        const targetGroup = knowledgeGroupStore.find((group) => group.id === targetGroupId)
        const sourceGroup = knowledgeGroupStore.find((group) => group.entries.some((entry) => entry.id === entryId))
        const entry = sourceGroup?.entries.find((item) => item.id === entryId)
        if (!targetGroup || !sourceGroup || !entry || sourceGroup.id === targetGroup.id) return
        sourceGroup.entries = sourceGroup.entries.filter((item) => item.id !== entryId)
        targetGroup.entries.unshift(entry)
        touchProject(projectStore, targetGroup.projectId)
      },
      async reorderEntry(entryId, direction) {
        await delay()
        const group = knowledgeGroupStore.find((item) => item.entries.some((entry) => entry.id === entryId))
        if (!group) return
        const index = group.entries.findIndex((entry) => entry.id === entryId)
        const nextIndex = direction === 'up' ? index - 1 : index + 1
        if (index < 0 || nextIndex < 0 || nextIndex >= group.entries.length) return
        const [entry] = group.entries.splice(index, 1)
        group.entries.splice(nextIndex, 0, entry)
        touchProject(projectStore, group.projectId)
      },
      async getEntry(id) {
        await delay()
        const entry = entryStore[id]
        if (!entry) return undefined
        const project = projectStore.find((item) => item.id === entry.projectId)
        if (!project) return undefined
        return !hasWorkspaceScope || workspaceIds.has(project.workspaceId) ? entry : undefined
      },
      async createEntry(input) {
        await delay()
        const entry = createEntry(input, knowledgeGroupStore, entryStore)
        const project = projectStore.find((item) => item.id === input.projectId)
        if (project) {
          project.entryCount += 1
          project.updatedAtText = '刚刚'
        }
        return entry
      },
      async updateEntry(input) {
        await delay()
        const entry = updateEntry(input, knowledgeGroupStore, entryStore)
        if (entry) {
          const project = projectStore.find((item) => item.id === entry.projectId)
          if (project) project.updatedAtText = '刚刚'
        }
        return entry
      },
      async deleteEntry(id) {
        await delay()
        const entry = entryStore[id]
        if (!entry) return
        const entryIds = collectEntryDescendantIds(entryStore, id)
        for (const entryId of entryIds) delete entryStore[entryId]
        for (const group of knowledgeGroupStore) {
          group.entries = group.entries.filter((item) => !entryIds.has(item.id))
        }
        const project = projectStore.find((item) => item.id === entry.projectId)
        if (project) {
          project.entryCount = Math.max(0, project.entryCount - entryIds.size)
          project.updatedAtText = '刚刚'
        }
      },
    },
    attachment: {
      async listAttachments(projectId) {
        await delay()
        return attachmentStore.filter((attachment) => attachment.projectId === projectId)
      },
      async addAttachment(input) {
        await delay()
        const attachment = {
          id: `attachment-${crypto.randomUUID()}`,
          projectId: input.projectId,
          name: input.name,
          targetType: input.targetType,
          target: input.target,
          createdAt: formatDateTime(new Date()),
        }
        attachmentStore.unshift(attachment)
        const project = projectStore.find((item) => item.id === input.projectId)
        if (project) project.updatedAtText = '刚刚'
        return attachment
      },
      async removeAttachment(id) {
        await delay()
        const index = attachmentStore.findIndex((attachment) => attachment.id === id)
        if (index >= 0) attachmentStore.splice(index, 1)
      },
    },
    quickEntry: {
      async listQuickEntries(workspaceId) {
        await delay()
        if (hasWorkspaceScope && !workspaceIds.has(workspaceId)) return []
        return quickEntryStore.filter((entry) => entry.workspaceId === workspaceId).sort((a, b) => a.sortOrder - b.sortOrder)
      },
      async createQuickEntry(input) {
        await delay()
        const now = formatDateTime(new Date())
        const quickEntry = {
          id: `quick-entry-${crypto.randomUUID()}`,
          workspaceId: input.workspaceId,
          name: input.name,
          targetType: input.targetType,
          target: input.target,
          published: Boolean(input.published),
          sortOrder: nextQuickEntrySortOrder(quickEntryStore, input.workspaceId),
          createdAt: now,
          updatedAt: now,
        }
        quickEntryStore.push(quickEntry)
        return quickEntry
      },
      async updateQuickEntry(input) {
        await delay()
        const quickEntry = quickEntryStore.find((entry) => entry.id === input.id)
        if (!quickEntry) return undefined
        Object.assign(quickEntry, {
          ...input,
          updatedAt: formatDateTime(new Date()),
        })
        return quickEntry
      },
      async deleteQuickEntry(id) {
        await delay()
        const index = quickEntryStore.findIndex((entry) => entry.id === id)
        if (index >= 0) quickEntryStore.splice(index, 1)
      },
    },
    backup: {
      async exportBackup() {
        await delay()
        const scopedWorkspaceIds = hasWorkspaceScope ? workspaceIds : new Set(workspaceStore.map((workspace) => workspace.id))
        const scopedProjects = projectStore.filter((project) => scopedWorkspaceIds.has(project.workspaceId))
        const scopedProjectIds = new Set(scopedProjects.map((project) => project.id))
        const scopedEntries = Object.fromEntries(
          Object.entries(entryStore).filter(([, entry]) => scopedProjectIds.has(entry.projectId)),
        )

        return {
          version: 1,
          exportedAt: formatDateTime(new Date()),
          workspaces: workspaceStore.filter((workspace) => scopedWorkspaceIds.has(workspace.id)),
          projects: scopedProjects,
          knowledgeGroups: knowledgeGroupStore.filter((group) => scopedProjectIds.has(group.projectId)),
          entries: scopedEntries,
          attachments: attachmentStore.filter((attachment) => scopedProjectIds.has(attachment.projectId)),
          quickEntries: quickEntryStore.filter((entry) => scopedWorkspaceIds.has(entry.workspaceId)),
        }
      },
      async importBackup(payload) {
        await delay()
        replaceScoped(workspaceStore, payload.workspaces)
        replaceScoped(projectStore, payload.projects)
        replaceScoped(knowledgeGroupStore, payload.knowledgeGroups.map((group) => ({ ...group, entries: [...group.entries] })))
        for (const key of Object.keys(entryStore)) delete entryStore[key]
        Object.assign(entryStore, payload.entries)
        replaceScoped(attachmentStore, payload.attachments ?? [])
        replaceScoped(quickEntryStore, payload.quickEntries ?? [])
      },
    },
    asset: {
      async uploadAsset({ workspaceId, kind, file }) {
        return {
          id: `asset-${crypto.randomUUID()}`,
          workspaceId,
          kind,
          originalName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          storedUrl: URL.createObjectURL(file),
          createdAt: new Date().toISOString(),
        }
      },
      async resolveAssetUrl(storedUrl) {
        return storedUrl
      },
      async deleteAsset() {},
    },
  }
}

export const mockRepositories = createMockRepositories()

function createEntry(
  input: CreateKnowledgeEntryInput,
  groupStore: typeof knowledgeGroups,
  entryStore: Record<string, (typeof entries)[string]>,
) {
  const now = formatDateTime(new Date())
  const entry = {
    id: `entry-${crypto.randomUUID()}`,
    projectId: input.projectId,
    title: input.title,
    type: input.type,
    icon: input.icon,
    remark: input.remark ?? '',
    parentEntryId: input.parentEntryId,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...(input.type === 'text' ? { textContent: '' } : {}),
    ...(input.type === 'password' ? { passwordItems: [] } : {}),
    ...(input.type === 'link' ? { linkItems: [] } : {}),
  }

  entryStore[entry.id] = entry
  const group = groupStore.find((item) => item.id === input.groupId)
  group?.entries.unshift({ id: entry.id, title: entry.title, type: entry.type, icon: entry.icon, parentEntryId: entry.parentEntryId })

  return entry
}

function createGroup(input: CreateKnowledgeGroupInput) {
  return {
    id: `group-${crypto.randomUUID()}`,
    projectId: input.projectId,
    name: input.name,
    parentGroupId: input.parentGroupId,
    entries: [],
  }
}

function collectGroupDescendantIds(groupStore: typeof knowledgeGroups, rootGroupId: string) {
  const result = new Set<string>()
  const visit = (groupId: string) => {
    result.add(groupId)
    for (const child of groupStore.filter((group) => group.parentGroupId === groupId)) visit(child.id)
  }
  visit(rootGroupId)
  return result
}

function updateEntry(
  input: UpdateKnowledgeEntryInput,
  groupStore: typeof knowledgeGroups,
  entryStore: Record<string, (typeof entries)[string]>,
) {
  const current = entryStore[input.id]
  if (!current) return undefined

  const updated: KnowledgeEntryDetail = {
    ...current,
    ...input,
    parentEntryId: input.parentEntryId === null ? undefined : input.parentEntryId ?? current.parentEntryId,
    icon: input.icon === null ? undefined : input.icon ?? current.icon,
    updatedAt: formatDateTime(new Date()),
  }
  entryStore[input.id] = updated
  for (const group of groupStore) {
    const summary = group.entries.find((item) => item.id === input.id)
    if (summary) {
      if (input.title) summary.title = input.title
      if (input.icon !== undefined) summary.icon = updated.icon ?? undefined
      summary.parentEntryId = updated.parentEntryId
    }
  }
  return updated
}

function collectEntryDescendantIds(
  entryStore: Record<string, (typeof entries)[string]>,
  rootEntryId: string,
) {
  const result = new Set<string>()
  const visit = (entryId: string) => {
    result.add(entryId)
    for (const entry of Object.values(entryStore)) {
      if (entry.parentEntryId === entryId) visit(entry.id)
    }
  }
  visit(rootEntryId)
  return result
}

function formatDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function touchProject(projectStore: Array<{ id: string; updatedAtText: string }>, projectId: string) {
  const project = projectStore.find((item) => item.id === projectId)
  if (project) project.updatedAtText = '刚刚'
}

function nextQuickEntrySortOrder(store: Array<{ workspaceId: string; sortOrder: number }>, workspaceId: string) {
  return store.filter((entry) => entry.workspaceId === workspaceId).reduce((max, entry) => Math.max(max, entry.sortOrder), -1) + 1
}

function replaceScoped<T extends { id: string }>(store: T[], nextItems: T[]) {
  store.splice(0, store.length, ...nextItems)
}
