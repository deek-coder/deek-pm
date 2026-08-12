# 变更日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 和 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.2] - 2026-08-12

### 修复

- 修复“关于与更新”弹窗在窄窗口及 macOS 主题下宽度受限、内容被压成逐字换行并出现横向滚动的问题。
- 更新弹窗在窄窗口使用单栏布局，宽窗口保持双栏展示。

## [0.1.1] - 2026-08-12

### 新增

- 设置页与启动页新增“关于与更新”，无需进入资料库即可检查新版本。
- Windows 安装版支持通过 GitHub Releases 手动检查、下载并重启安装更新。
- Tag 发布流水线自动生成并上传 NSIS 安装包、便携版、blockmap 与 `latest.yml`。

### 修复

- 修复 Windows 打包时实时扫描导致 `rcedit` 无法提交资源修改的问题。
- 修复 Electron CSP 阻止连接 HTTP 自部署服务的问题。
- 修复文档子树首次点击无法展开的问题。
- 修复文本页面“源码”和“代码”模式内容对比度过低的问题。

## [0.1.0] - 2026-07-22

### 新增

- Electron + React 个人资料库桌面客户端。
- SQLCipher 本地加密库和主密码保护。
- 项目、分组、层级页面、富文本、密码、链接、附件和快捷入口。
- 正文图片与附件统一 Asset 模型，支持本地目录和 S3。
- PostgreSQL/Fastify 自部署服务和事务化资产生命周期。
- Docker Compose 部署 PostgreSQL、API 和 RustFS。
- 一次性首次安装向导，初始化管理员、工作空间和存储。
- 本地备份恢复、旧 Base64 图片迁移和本地资料迁往服务端。

### 安全

- S3 凭据与密码类条目使用应用层加密。
- Setup Token、数据库事务锁和初始化后关闭机制防止首个管理员被抢占。

[0.1.2]: https://github.com/deek-coder/deek-pm/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/deek-coder/deek-pm/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/deek-coder/deek-pm/releases/tag/v0.1.0
