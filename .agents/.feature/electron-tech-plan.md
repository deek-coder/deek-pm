# Electron 技术方案草案

状态：本地个人库数据层、安全链路、TipTap 富文本和核心测试第一版已落地，服务端暂缓。

## 推荐技术栈

- Electron
- Vite + React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI
- lucide-react
- TanStack Query
- TanStack Router
- TanStack Table
- react-hook-form
- zod
- TipTap，富文本编辑器
- Zustand，轻量状态管理
- SQLite，本地数据库
- Node crypto 或 WebCrypto，用于加密备份
- HTTP Client，用于服务端 API

## UI 技术栈决策

Deek PM 不建议以 Ant Design 作为主 UI 框架。Ant Design 适合传统企业后台，但默认视觉识别度较强，容易变成通用后台系统质感。

Deek PM 更适合使用 `Tailwind CSS + shadcn/ui + Radix UI`：

- Tailwind CSS：用于构建自有设计系统和桌面端工具型布局。
- shadcn/ui：作为可复制、可修改的组件基础，不把 UI 锁死在第三方主题里。
- Radix UI：提供可访问、行为稳定的底层组件能力。
- lucide-react：统一图标体系。
- TanStack Table：处理项目列表、成员列表、审计列表等表格。
- TanStack Query：处理服务端空间的 API 请求、缓存、刷新。
- TanStack Router：处理桌面端多页面和项目内路由。
- react-hook-form + zod：处理登录、工作空间配置、条目编辑、成员邀请等表单。
- TipTap：处理文本型智库条目的富文本编辑。

UI 风格目标：

- 像桌面生产力工具，而不是传统后台管理系统。
- 信息密度适中，适合长期使用。
- 多标签、侧边栏、列表、详情面板保持稳定布局。
- 组件样式可以沉淀为 Deek PM 自己的视觉系统。

## 进程划分

```txt
Renderer
  React UI
  调用 preload 暴露的安全 API

Preload
  暴露有限桥接能力
  window.deek.openFile
  window.deek.selectBackupDir
  window.deek.repository

Main
  本地文件能力
  SQLite 访问
  备份与恢复
  系统打开文件/文件夹
  自动更新，后续补
```

## Repository 抽象

```ts
interface ProjectRepository {
  listProjects(workspaceId: string): Promise<Project[]>
  createProject(input: CreateProjectInput): Promise<Project>
  updateProject(id: string, input: UpdateProjectInput): Promise<Project>
}

interface KnowledgeEntryRepository {
  listEntries(projectId: string): Promise<KnowledgeEntry[]>
  getEntry(id: string): Promise<KnowledgeEntryDetail>
  createEntry(input: CreateEntryInput): Promise<KnowledgeEntryDetail>
  updateEntry(id: string, input: UpdateEntryInput): Promise<KnowledgeEntryDetail>
}
```

实现：

- LocalRepository：SQLite + 本机文件能力。
- ServerRepository：HTTP API。

官方云和自部署都使用 ServerRepository。

## 已确认技术决策

- 正式工程直接使用 TypeScript。
- 路由使用 TanStack Router。
- 本地数据库使用 SQLite。
- SQLite 整库加密使用 SQLCipher。
- 富文本编辑器使用 TipTap。
- 本地库默认整库加密。
- 服务端接口第一阶段先使用 mock API，让前端和 Repository 流程跑通。
- 服务端 Token 第一版使用 Electron safeStorage。
- 自部署第一版暂不做许可证/激活机制。
- 第一版只做检查更新提示，不做静默自动更新。
- 附件第一版只保存文件路径、文件夹路径或 URL，不复制附件本体。
- 服务端审计日志预留模型，第一版暂不展开 UI。
- SQLCipher 集成优先调研 `better-sqlite3-multiple-ciphers`，备选 `@journeyapps/sqlcipher`。
- 更新提示优先使用 electron-updater，但只做检查更新和提示，不做静默更新。
- Mock 第一阶段使用本地内存 mock Repository。
- 文本内容主存储格式使用 TipTap JSON，导入导出时支持 Markdown。
- 密码字段在 SQLCipher 整库加密外再做应用层字段加密。
- 本地库需要主密码，允许用户选择记住本机解锁。
- 第一版项目列表不做层级，智库内部支持目录树。
- 权限第一版做到工作空间角色 + 项目成员可见性，密码条目查看权限先预留。

## 本地数据库

当前实现：

- 已安装并验证 `better-sqlite3-multiple-ciphers`。
- Electron 41.7.1 运行时已重新编译原生 binding。
- 本地数据库文件位于 Electron `userData` 目录：`deek-local-v1.db`。
- 数据库密钥位于 Electron `userData` 目录：`deek-local-key.json`。
- 密钥支持两种保存形态：
  - 未设置主密码时，优先通过 Electron `safeStorage` 加密保存；如果系统不可用，则降级为本机密钥文件。
  - 设置主密码后，使用 scrypt 派生 AES-256-GCM 密钥包裹数据库密钥；用户可选择用 Electron `safeStorage` 记住本机解锁。
- 使用 `PRAGMA user_version = 1` 管理 schema 版本。
- Renderer 不直接访问 SQLite，通过 preload 暴露的 `window.deek.localRepository` 受控 IPC 调用主进程仓储。
- Renderer 通过 preload 暴露的本地安全 IPC 设置主密码、解锁、锁定、关闭主密码，不直接接触数据库密钥。

设计约束：

- SQLite 作为本地数据库。
- 使用 SQLCipher 做整库加密。
- 本地文件路径只保存引用，不复制文件本体。
- 附件第一版只保存路径或 URL，后续如果支持附件托管，再设计附件目录。
- 密码型内容当前受 SQLCipher 整库加密保护，并且 `password_entry_items.value_preview` 会在写入前使用 AES-256-GCM 字段级加密。
- 字段级加密密钥由本地数据库密钥派生，主进程负责加解密，Renderer 只接收解密后的业务值。
- 存量明文字段会在本地库打开时迁移为 `deek-field:v1:` 加密 envelope。
- 新本地库只初始化固定的本地工作空间，不再创建示例项目或示例智库数据。
- 已存在的内置示例项目 `local-admin`、`local-notes` 会在打开本地库时自动清理。
- 本地库默认整库加密。

## 本地备份

当前实现：

- 手动导出的 `.deekbak` 使用 v2 加密备份 envelope。
- 备份内容先导出 Repository `BackupPayload` JSON。
- JSON 使用 gzip 压缩。
- 备份密码通过 scrypt 派生 32 字节密钥。
- 压缩内容使用 AES-256-GCM 加密。
- 恢复加密备份时必须输入备份密码。
- 恢复流程兼容旧 JSON 备份。
- 自动备份当前仍使用无交互 JSON 快照，避免后台任务需要密码。
- 恢复前会展示备份文件、加密状态、导出时间、项目数、智库条目数、附件索引数，用户确认后才覆盖当前本地库。

正式流程：

```txt
暂停写入或创建一致性快照
  -> 导出 SQLite 快照
  -> 收集附件索引和元数据
  -> 压缩
  -> 使用备份密码派生密钥
  -> AES-GCM 加密
  -> 输出 .deekbak
```

恢复流程：

```txt
选择 .deekbak
  -> 输入备份密码
  -> 解密校验
  -> 预览备份信息
  -> 覆盖恢复或导入为新库
```

## 服务端接口

服务端空间统一通过 HTTP API。

第一阶段先使用 mock API：

- 前端先接本地内存 mock ServerRepository 实现。
- mock 数据需要覆盖官方云和自部署两种服务端空间。
- mock API 的响应结构尽量贴近未来真实服务端。
- 正式服务端接入时只替换 ServerRepository 的实现。

官方云：

- Base URL 固定为官方服务。
- 使用官方账号体系。

自部署：

- Base URL 由用户配置。
- 使用该服务端的账号体系。
- 可增加测试连接、版本检测、证书提示。

## 安全边界

- Renderer 不直接访问文件系统和 SQLite。
- 密码型内容不在日志中输出。
- 备份密码不持久化。
- 服务端 Token 第一版使用 Electron safeStorage 存储。

## 开发模式

按成熟团队的工程方式推进：

- 类型优先：领域模型、Repository 输入输出、API 响应都使用 TypeScript 类型约束。
- 分层清晰：UI、应用服务、Repository、平台能力分层，不在组件里直接访问 SQLite、文件系统或 HTTP。
- Mock 先行：服务端未完成前，用 mock ServerRepository 跑通前端流程。
- 组件沉淀：基于 Tailwind + shadcn/ui + Radix 形成 Deek PM 自己的组件风格。
- 测试分层：核心 Repository、加密备份、数据转换优先补单元测试。
- 安全默认：本地库默认加密，敏感信息不进日志，Token 不进普通配置文件。
- 渐进交付：先本地个人库和 mock 服务端，再接真实服务端和自部署。
- 文档同步：产品规则、需求、数据模型、技术方案同步更新 `.agents` 文档。

## 待确认问题

暂无阻塞开发的待确认问题。

后续开发中需要实际验证：

1. `better-sqlite3-multiple-ciphers` 在 Electron 打包和跨平台环境下的稳定性。
2. electron-updater 的发布渠道和签名配置。
3. TipTap JSON 到 Markdown 的导入导出质量。
