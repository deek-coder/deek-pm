import type {
  EntryType,
  KnowledgeEntryDetail,
  KnowledgeGroup,
  LinkEntryItem,
  PasswordEntryItem,
  ProjectAttachment,
  Project,
  ProjectTone,
  QuickEntry,
  QuickEntryTargetType,
  Workspace,
} from '../domain/types'

export type RepositorySourceKind = 'mock' | 'local' | 'server'

export interface RepositorySource {
  kind: RepositorySourceKind
  label: string
  description: string
  encrypted: boolean
  supportsBackup: boolean
  serviceUrl?: string
}

export interface WorkspaceRepository {
  listWorkspaces(): Promise<Workspace[]>
  getWorkspace(id: string): Promise<Workspace | undefined>
}

export interface CreateProjectInput {
  workspaceId: string
  name: string
  description: string
  tag: string
  tone?: ProjectTone
}

export interface UpdateProjectInput {
  id: string
  name?: string
  description?: string
  tag?: string
  tone?: ProjectTone
}

export interface ProjectRepository {
  listProjects(workspaceId: string): Promise<Project[]>
  getProject(id: string): Promise<Project | undefined>
  createProject(input: CreateProjectInput): Promise<Project>
  updateProject(input: UpdateProjectInput): Promise<Project | undefined>
  deleteProject(id: string): Promise<void>
}

export interface CreateKnowledgeEntryInput {
  projectId: string
  groupId: string
  parentEntryId?: string
  type: EntryType
  title: string
  icon?: string
  remark?: string
}

export interface CreateKnowledgeGroupInput {
  projectId: string
  name: string
  parentGroupId?: string
}

export interface UpdateKnowledgeEntryInput {
  id: string
  parentEntryId?: string | null
  title?: string
  icon?: string | null
  remark?: string
  tags?: string[]
  textContent?: string
  passwordItems?: PasswordEntryItem[]
  linkItems?: LinkEntryItem[]
}

export interface KnowledgeRepository {
  listGroups(projectId: string): Promise<KnowledgeGroup[]>
  searchEntryIds(projectId: string, query: string): Promise<string[]>
  createGroup(input: CreateKnowledgeGroupInput): Promise<KnowledgeGroup>
  updateGroup(id: string, name: string): Promise<KnowledgeGroup | undefined>
  deleteGroup(id: string): Promise<void>
  moveEntry(entryId: string, targetGroupId: string): Promise<void>
  reorderEntry(entryId: string, direction: 'up' | 'down'): Promise<void>
  getEntry(id: string): Promise<KnowledgeEntryDetail | undefined>
  createEntry(input: CreateKnowledgeEntryInput): Promise<KnowledgeEntryDetail>
  updateEntry(input: UpdateKnowledgeEntryInput): Promise<KnowledgeEntryDetail | undefined>
  deleteEntry(id: string): Promise<void>
}

export interface AttachmentRepository {
  listAttachments(projectId: string): Promise<ProjectAttachment[]>
  addAttachment(input: {
    projectId: string
    name: string
    targetType: ProjectAttachment['targetType']
    target: string
    assetId?: string
  }): Promise<ProjectAttachment>
  removeAttachment(id: string): Promise<void>
}

export interface CreateQuickEntryInput {
  workspaceId: string
  name: string
  targetType: QuickEntryTargetType
  target: string
  published?: boolean
}

export interface UpdateQuickEntryInput {
  id: string
  name?: string
  targetType?: QuickEntryTargetType
  target?: string
  published?: boolean
  sortOrder?: number
}

export interface QuickEntryRepository {
  listQuickEntries(workspaceId: string): Promise<QuickEntry[]>
  createQuickEntry(input: CreateQuickEntryInput): Promise<QuickEntry>
  updateQuickEntry(input: UpdateQuickEntryInput): Promise<QuickEntry | undefined>
  deleteQuickEntry(id: string): Promise<void>
}

export interface BackupPayload {
  version: 1
  exportedAt: string
  workspaces: Workspace[]
  projects: Project[]
  knowledgeGroups: KnowledgeGroup[]
  entries: Record<string, KnowledgeEntryDetail>
  attachments: ProjectAttachment[]
  quickEntries?: QuickEntry[]
  managedAssets?: LocalBackupAsset[]
  managedAssetRecords?: LocalManagedAssetRecord[]
  omittedManagedAssets?: Array<{ relativePath: string; sizeBytes: number }>
}

export interface LocalBackupAsset {
  relativePath: string
  contentBase64: string
}

export interface LocalManagedAssetRecord extends ManagedAsset {
  sha256: string
  objectKey: string
  status: 'pending' | 'ready' | 'deleting' | 'deleted' | 'error'
  updatedAt: string
}

export interface BackupRepository {
  exportBackup(): Promise<BackupPayload>
  importBackup(payload: BackupPayload): Promise<void>
}

export interface ManagedAsset {
  id: string
  workspaceId: string
  kind: 'image' | 'attachment'
  originalName: string
  mimeType: string
  sizeBytes: number
  storedUrl: string
  createdAt: string
}

export interface AssetRepository {
  uploadAsset(input: { workspaceId: string; kind: ManagedAsset['kind']; file: File }): Promise<ManagedAsset>
  uploadAssetPath?(input: { workspaceId: string; kind: ManagedAsset['kind']; filePath: string }): Promise<ManagedAsset>
  resolveAssetUrl(storedUrl: string): Promise<string>
  deleteAsset(id: string): Promise<void>
}

export interface Repositories {
  source: RepositorySource
  workspace: WorkspaceRepository
  project: ProjectRepository
  knowledge: KnowledgeRepository
  attachment: AttachmentRepository
  quickEntry: QuickEntryRepository
  backup?: BackupRepository
  asset: AssetRepository
}
