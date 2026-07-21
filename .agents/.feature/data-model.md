# 数据模型草案

状态：本地 SQLite/SQLCipher 第一版已按该模型落地，服务端模型仍待真实 API 对齐。

## 设计原则

- 本地和服务端尽量共用领域模型。
- 本地使用 LocalRepository。
- 官方云和自部署使用 ServerRepository。
- 服务端空间只通过 Base URL 和认证配置区分官方云或自部署。
- 密码型内容需要加密存储，备份包也需要加密。
- 本地库默认整库加密。
- SQLite 整库加密使用 SQLCipher。
- 服务端接口第一阶段先使用 mock API。
- 附件第一版只保存文件路径、文件夹路径或 URL。
- 服务端审计日志预留模型，第一版暂不展开 UI。
- 文本内容主存储格式使用 TipTap JSON。
- 密码字段在整库加密之外再做字段级加密。
- 本地库需要主密码，允许用户选择记住本机解锁。
- 第一版项目不做层级；智库内部支持目录树。
- 权限第一版做到工作空间角色 + 项目成员可见性。

## 核心实体

## 当前本地库表结构

本地个人库第一版已在 Electron 主进程中落地以下 SQLite/SQLCipher 表：

- `workspaces`
- `projects`
- `knowledge_groups`
- `knowledge_entries`
- `text_entry_contents`
- `password_entry_items`
- `link_entry_items`
- `project_attachments`
- `backup_records`

当前 schema 版本：`PRAGMA user_version = 1`。

说明：

- `projects.workspace_id` 外键关联 `workspaces.id`。
- 智库分组、条目、正文、密码项、链接项、附件索引均通过外键级联删除。
- 分组和条目使用 `sort_order` 支持排序。
- 项目更新时间由 Repository 写操作统一刷新。
- 密码项存储在 SQLCipher 整库加密内；本地数据库密钥支持主密码包裹和本机记住解锁；`password_entry_items.value_preview` 当前使用 `deek-field:v1:` envelope 做字段级 AES-256-GCM 加密。
- 手动 `.deekbak` 备份当前使用 v2 envelope：`format=deekbak`、`version=2`、`compression=gzip`、`kdf=scrypt`、`cipher=aes-256-gcm`，数据字段保存加密后的备份 payload。
- 本地库初始化只创建固定工作空间；项目、智库条目和附件由用户创建，不再预置测试数据。
- 文本型条目内容当前以 TipTap JSON 字符串保存；旧纯文本/HTML 内容在展示或编辑时会转换为 TipTap doc。

### Workspace

工作空间实例。

字段草案：

- id
- type: local | service
- deployment: local | cloud | selfhost
- name
- description
- serviceUrl
- createdAt
- updatedAt

约束：

- local 类型通常只有一个。
- service 类型可以多个。
- serviceUrl 仅服务端空间需要。

### User

服务端用户。

字段草案：

- id
- name
- email
- avatar
- createdAt

本地个人库可不需要 User。

### WorkspaceMember

服务端空间成员。

字段草案：

- id
- workspaceId
- userId
- role: owner | admin | editor | viewer
- status: active | invited | disabled
- invitedAt
- joinedAt

### Project

项目。

字段草案：

- id
- workspaceId
- name
- description
- tags
- createdAt
- updatedAt
- archivedAt

### KnowledgeEntry

智库条目。

字段草案：

- id
- workspaceId
- projectId
- type: text | password | link
- title
- remark
- tags
- createdAt
- updatedAt

### TextEntryContent

文本型内容。

字段草案：

- entryId
- contentFormat: tiptap-json
- content

### PasswordEntryItem

密码型内容项。

字段草案：

- id
- entryId
- name
- encryptedValue
- sortOrder
- createdAt
- updatedAt

### LinkEntryItem

链接型内容项。

字段草案：

- id
- entryId
- name
- targetType: file | folder | url
- target
- sortOrder

约束：

- 第一版只保存引用路径或 URL。
- 第一版不复制文件本体，不做附件托管。

### BackupRecord

本地备份记录。

字段草案：

- id
- filePath
- encrypted
- algorithm
- createdAt
- size
- note

### AuditLog

服务端审计日志。

字段草案：

- id
- workspaceId
- actorId
- action
- targetType
- targetId
- createdAt
- metadata

第一版预留 action：

- entry.view
- entry.create
- entry.update
- entry.delete
- password.reveal
- password.copy
- backup.create
- export.create
- member.invite
- member.role.update

## 待确认问题

暂无阻塞开发的待确认问题。

后续开发中需要实际验证：

1. TipTap JSON 的版本兼容策略。
2. 字段级加密的密钥派生和轮换策略。
3. 项目成员可见性的查询性能和索引设计。
