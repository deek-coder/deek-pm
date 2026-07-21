export type WorkspaceType = 'local' | 'service'
export type Deployment = 'local' | 'cloud' | 'selfhost'
export type EntryType = 'text' | 'password' | 'link'
export type ProjectTone = 'blue' | 'green' | 'violet' | 'slate'
export type LinkTargetType = 'file' | 'folder' | 'url'
export type QuickEntryTargetType = 'file' | 'directory' | 'shortcut' | 'url' | 'other'

export interface Workspace {
  id: string
  type: WorkspaceType
  deployment: Deployment
  name: string
  description: string
  status: string
  serviceUrl?: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description: string
  tag: string
  entryCount: number
  updatedAtText: string
  tone: ProjectTone
}

export interface KnowledgeGroup {
  id: string
  projectId: string
  name: string
  parentGroupId?: string
  entries: KnowledgeEntrySummary[]
}

export interface KnowledgeEntrySummary {
  id: string
  title: string
  type: EntryType
  icon?: string
  parentEntryId?: string
}

export interface KnowledgeEntryDetail extends KnowledgeEntrySummary {
  projectId: string
  remark: string
  tags: string[]
  createdAt: string
  updatedAt: string
  textContent?: string
  passwordItems?: PasswordEntryItem[]
  linkItems?: LinkEntryItem[]
}

export interface PasswordEntryItem {
  id: string
  name: string
  valuePreview: string
}

export interface LinkEntryItem {
  id: string
  name: string
  targetType: LinkTargetType
  target: string
}

export interface ProjectAttachment {
  id: string
  projectId: string
  name: string
  targetType: Extract<LinkTargetType, 'file' | 'folder'> | 'asset'
  target: string
  assetId?: string
  createdAt: string
}

export interface QuickEntry {
  id: string
  workspaceId: string
  name: string
  targetType: QuickEntryTargetType
  target: string
  published: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}
