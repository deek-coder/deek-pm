# 当前开发 Task 清单

生成/更新日期：2026-05-29

## 阶段状态

当前阶段：本地个人库 MVP 已完成，已接入富文本、加密本地库、备份恢复、核心测试、Windows 打包和品牌图标优化。

总体进度：约 97%

说明：
- 本地个人库已经可以作为第一版使用：项目、智库条目、分组、密码条目、链接条目、附件路径索引、备份恢复和主密码安全链路已打通。
- 服务端真实 API 和更新提示机制按当前决策暂不处理。
- 当前已生成 Windows 未安装版、安装包和便携版产物。

## 已完成

- [x] 建立 Electron + Vite + React + TypeScript 工程
  - 依据：`app/package.json` 已包含 Electron、Vite、React、TypeScript 构建脚本。

- [x] 接入桌面窗口与 preload 安全桥
  - 依据：`app/electron/main.cjs`、`app/electron/preload.cjs` 已实现窗口、IPC、文件选择、备份读写、safeStorage、窗口控制。

- [x] 建立基础路由结构
  - 依据：`app/src/router.tsx` 覆盖启动页、登录页、工作空间、项目、智库、备份、成员、设置。

- [x] 建立领域类型与 Repository 接口
  - 依据：`app/src/domain/types.ts`、`app/src/repositories/repository.ts`。

- [x] 实现工作空间、项目、智库、成员等主流程 UI
  - 覆盖：本地个人库、官方云服务空间、自部署服务空间入口；项目列表；智库分组和条目；成员 mock 流程。

- [x] 实现 SQLCipher 本地数据库
  - 依据：`app/electron/local-database.cjs`。
  - 覆盖：workspace、project、knowledge_group、knowledge_entry、text_entry_content、password_entry_item、link_entry_item、project_attachment、backup_record。

- [x] 实现 LocalRepository 数据库读写
  - 依据：`app/src/repositories/localRepository.ts` 通过 Electron IPC 调用主进程本地库。

- [x] 实现主密码与本机解锁流程
  - 覆盖：设置/修改主密码、记住本机解锁、锁定并取消记住、关闭主密码、启动页锁屏解锁。

- [x] 实现密码条目字段级加密
  - 覆盖：`password_entry_items.value_preview` 使用 `deek-field:v1:` AES-256-GCM envelope 落库。

- [x] 移除本地测试数据
  - 说明：新本地库只初始化本地工作空间，不再创建示例项目；旧内置示例项目会自动清理。

- [x] 实现正式 `.deekbak` 备份格式
  - 覆盖：gzip 压缩、scrypt 派生、AES-256-GCM 加密、旧 JSON 备份兼容。

- [x] 实现备份恢复预览与确认
  - 覆盖：恢复前展示文件、加密状态、导出时间、项目数、智库条目数、附件索引数，并要求确认覆盖。

- [x] 接入 TipTap 富文本编辑器
  - 覆盖：文本条目编辑/展示、TipTap JSON 保存、旧文本/HTML-ish 内容兼容转换。
  - 基础能力：加粗、斜体、项目列表、有序列表、引用、撤销、重做。

- [x] 修复长内容弹窗看不到按钮的问题
  - 说明：编辑弹窗限制最大视口高度，中间内容区滚动，底部操作按钮保持可见。

- [x] 完成本地 Repository 自动化测试
  - 命令：`npm run test:local`
  - 覆盖：空库初始化、CRUD、字段级加密、主密码锁定/解锁、加密备份 round-trip。

- [x] 完成常规构建验证
  - 命令：`npm run lint`、`npm run build`
  - 状态：通过。
  - 备注：Vite 仍有 TipTap 带来的 chunk size warning，不阻塞当前版本。

- [x] 接入 Windows 打包
  - 命令：`npm run pack`、`npm run dist:win`
  - 产物：
    - `app/release/win-unpacked/Deek PM.exe`
    - `app/release/Deek PM-0.1.0-win-x64-setup.exe`
    - `app/release/Deek PM-0.1.0-win-x64-portable.exe`
  - 说明：已修复安装包和便携包同名覆盖问题；SQLCipher native binding 已随包 asar unpack。

- [x] 打包后冒烟验证
  - 结果：`release/win-unpacked/Deek PM.exe` 可启动并正常退出。

- [x] 修复打包后空白窗体/Not Found 问题
  - 原因：Vite 生产资源路径使用 `/assets/...` 绝对路径，`file://` 下无法加载；TanStack Router 默认 browser history 会把本地文件路径误判成业务路由。
  - 修复：`app/vite.config.ts` 设置 `base: './'`；`app/src/router.tsx` 切换为 `createHashHistory()`。
  - 验证：重新打包后启动 `release/win-unpacked/Deek PM.exe`，窗口已显示真实应用界面。

- [x] 优化项目页与项目列表页质感
  - 范围：`app/src/features/knowledge/KnowledgePage.tsx`、`app/src/features/workspace/workspacePages.tsx`。
  - 调整：项目内保留项目级菜单，当前包含“智库”和“设置”；账号、链接、附件不再作为项目级菜单，而是归入智库内容类型/附件索引；智库分组改为树结构目录展示。
  - 调整：项目列表页增强为更稳的工作台样式，顶部信息、统计卡和项目卡片层级重新整理。
  - 交互增强：智库类型筛选支持全部/文本/账号/链接；分组树支持展开折叠，搜索时自动展开命中分组；详情头部粘性显示，项目卡片增强 hover/focus 反馈。
  - 验证：`npm run lint`、`npm run build`、`npm run test:local` 均通过。

- [x] 接入统一动效系统
  - 依赖：新增 `motion`。
  - 范围：智库页目录树、条目详情切换、附件索引增删、项目列表布局重排和项目卡片进入动效。
  - 说明：使用 `LazyMotion + domAnimation` 控制体积，只启用轻量 DOM 动效。
  - 验证：`npm run lint`、`npm run build`、`npm run test:local` 均通过。

- [x] 优化品牌 Logo 与应用图标
  - 范围：`app/src/assets/deek-logo-mark.png`、`app/src/assets/deek-logo.png`、`app/public/deek-logo-mark.png`、`app/public/deek-logo.png`、`app/public/favicon.svg`。
  - 调整：移除原白底贴片感，改为透明外缘的深色产品级几何图标；统一窗口图标、打包图标和页面 favicon 的视觉语言。
  - 验证：四个 PNG 角落 alpha 均为 0，确认不再带白色背景。

- [x] 修复分组创建与项目标签关闭交互
  - 范围：`app/src/features/knowledge/KnowledgePage.tsx`、`app/src/features/workspace/workspacePages.tsx`。
  - 修复：新建空分组后不再被智库树过滤隐藏；新建条目会优先进入当前选中的分组。
  - 修复：关闭当前项目标签时自动切换到剩余项目；若已无项目标签，则回到项目总览页，避免停留在空白详情页。
  - 验证：`npm run lint`、`npm run build`、`npm run test:local` 均通过。

- [x] 补齐条目所属分组选择
  - 范围：`app/src/features/knowledge/KnowledgePage.tsx`。
  - 修复：新建条目弹窗增加“所属分组”选择，不再只依赖当前选中分组的隐式状态；无分组时会提示自动创建默认分组。
  - 修复：编辑条目弹窗增加“所属分组”选择，可直接移动条目到其他分组。
  - 修复：新建条目成功后自动清空搜索、切回“全部”、展开目标分组并选中新条目，避免“创建成功但被筛选隐藏”的同类问题。
  - 验证：`npm run lint`、`npm run build`、`npm run test:local` 均通过。

## 暂不处理

- [ ] 服务端真实 API 接入
  - 状态：暂不处理。
  - 说明：当前仍使用本地库和服务端 mock 入口。

- [ ] 更新提示机制
  - 状态：暂不处理。
  - 说明：暂不接入 `electron-updater`。

## 后续增强

- [ ] TipTap Markdown 导入/导出
  - 优先级：中。
  - 说明：当前富文本编辑已可用，Markdown 互转属于增强项。

- [ ] 密码查看/复制审计
  - 优先级：中。
  - 说明：当前已完成加密存储，审计记录和查看/复制行为记录可后续补。

- [ ] 密钥轮换
  - 优先级：中。
  - 说明：当前主密码修改和字段加密可用，完整密钥轮换策略后续补强。

- [ ] 首包体积优化
  - 优先级：低。
  - 说明：TipTap 引入后 Vite 提示 chunk 超过 500 kB；当前不影响运行，可后续做路由/编辑器懒加载。

## 当前可用性结论

本地个人库第一版已经可以使用，也已经可以打包成 Windows 应用。当前未发现阻塞使用或打包的 bug；剩余事项主要是服务端、更新机制和增强体验。
