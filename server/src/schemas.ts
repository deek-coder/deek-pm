import { z } from 'zod'

export const idParamsSchema = z.object({ id: z.uuid() })
export const workspaceParamsSchema = z.object({ workspaceId: z.uuid() })
export const projectParamsSchema = z.object({ projectId: z.uuid() })

export const credentialsSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(200),
})

export const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(100),
  workspaceName: z.string().trim().min(1).max(100).default('My Workspace'),
})

export const createProjectSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(''),
  tag: z.string().trim().max(100).default(''),
  tone: z.enum(['blue', 'green', 'violet', 'slate']).default('blue'),
})

export const updateProjectSchema = createProjectSchema.omit({ workspaceId: true }).partial()

export const createGroupSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  parentGroupId: z.uuid().optional(),
})

export const updateGroupSchema = z.object({ name: z.string().trim().min(1).max(160) })

export const passwordItemSchema = z.object({ id: z.string().min(1), name: z.string(), valuePreview: z.string() })
export const linkItemSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  targetType: z.enum(['file', 'folder', 'url']),
  target: z.string(),
})

export const createEntrySchema = z.object({
  projectId: z.uuid(),
  groupId: z.uuid(),
  parentEntryId: z.uuid().optional(),
  type: z.enum(['text', 'password', 'link']),
  title: z.string().trim().min(1).max(300),
  icon: z.string().max(100).optional(),
  remark: z.string().max(4000).default(''),
})

export const updateEntrySchema = z.object({
  parentEntryId: z.uuid().nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  icon: z.string().max(100).nullable().optional(),
  remark: z.string().max(4000).optional(),
  tags: z.array(z.string().max(100)).max(100).optional(),
  textContent: z.string().optional(),
  passwordItems: z.array(passwordItemSchema).optional(),
  linkItems: z.array(linkItemSchema).optional(),
})

export const moveEntrySchema = z.object({ targetGroupId: z.uuid() })
export const reorderEntrySchema = z.object({ direction: z.enum(['up', 'down']) })

export const createAttachmentSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(300),
  targetType: z.enum(['file', 'folder', 'asset']),
  target: z.string().min(1).max(8000),
  assetId: z.uuid().optional(),
})

export const createQuickEntrySchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(1).max(300),
  targetType: z.enum(['file', 'directory', 'shortcut', 'url', 'other']),
  target: z.string().min(1).max(8000),
  published: z.boolean().default(false),
})

export const updateQuickEntrySchema = createQuickEntrySchema.omit({ workspaceId: true }).partial().extend({
  sortOrder: z.number().int().optional(),
})

export const storageSettingsSchema = z.discriminatedUnion('driver', [
  z.object({
    driver: z.literal('filesystem'),
    filesystemPath: z.string().trim().min(1).max(2000),
  }),
  z.object({
    driver: z.literal('s3'),
    endpoint: z.url(),
    region: z.string().trim().min(1).max(100).default('us-east-1'),
    bucket: z.string().trim().min(3).max(63).regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/),
    forcePathStyle: z.boolean().default(true),
    accessKey: z.string().max(500).optional(),
    secretKey: z.string().max(1000).optional(),
  }),
])

export const assetUploadQuerySchema = z.object({
  workspaceId: z.uuid(),
  kind: z.enum(['image', 'attachment']),
})

export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(200) })

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(10).max(200),
})
