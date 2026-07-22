# 技术决策摘要

- 服务端继续使用 Node.js + TypeScript + Fastify。当前负载以 HTTP、数据库和对象存储 I/O 为主，现有技术栈满足需求；当前缺陷属于架构边界问题，换语言不会自动解决。
- 资产存储采用 Port/Adapter，不在业务代码中判断文件系统或 S3。
- PostgreSQL/SQLite 是业务状态权威源，物理存储采用最终一致性和可重试清理任务。
- 备份采用 manifest 驱动的合并恢复；破坏性全量替换必须是显式选项。
- 当未来出现独立的 CPU 密集型媒体处理需求时，可以把转码/扫描拆为 Go 或 Rust worker，不重写主 API。
