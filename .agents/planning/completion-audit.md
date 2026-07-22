# 统一资产重构完成审计

## 要求与证据

| 要求 | 证据 | 结论 |
| --- | --- | --- |
| 正文图片/附件统一资产 | 本地 `assets/asset_references`、服务端迁移 006、Repository `ManagedAsset` | 完成 |
| Electron filesystem/S3 | `asset-storage.cjs`、设置 IPC/UI、伪 S3 合约与跨驱动迁移测试 | 完成 |
| 服务端 filesystem/S3 | `storage.ts`、同契约 S3 测试、存储设置 API | 完成 |
| 大附件安全恢复 | 合并恢复算法及保留 omitted 文件测试 | 完成 |
| 消除提交后假失败 | 本地安全自动备份；本地/服务端引用释放与清理任务同事务 | 完成 |
| 跨项目/循环约束 | SQLite 触发器、PostgreSQL 复合外键、应用服务和测试 | 完成 |
| 最终一致性/并发去重 | 清理 worker、陈旧上传恢复、advisory locks、部分唯一索引 | 完成 |
| 模块职责拆分 | storage/assetService/assetCleanup/hierarchyService、路由懒加载、可选备份能力 | 完成 |
| Node 技术决策 | ADR-0001、Node 22 Docker/engine、Node 24 测试 | 完成 |
| 自动化与文档 | App 全套检查、Server 13 测试、PGlite 迁移测试、README/.agents | 完成 |

## 外部运维建议

- 上线前仍应使用实际 PostgreSQL、目标 S3/RustFS 和反向代理执行一次部署演练；这属于环境验收，不是代码实现缺口。
