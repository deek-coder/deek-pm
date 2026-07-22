# 变更日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 和 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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

[0.1.0]: https://github.com/deek-coder/deek-pm/releases/tag/v0.1.0
