# 模块边界

## 客户端

- `repositories/repository.ts`：业务端口和显式能力；服务端 Repository 不再伪实现本地备份。
- `electron/asset-storage.cjs`：filesystem/S3 物理存储适配器。
- `electron/local-asset-files.cjs`：本地目录迁移、备份和合并恢复算法。
- `electron/local-database.cjs`：SQLCipher 元数据、引用、清理任务和本地完整性触发器。
- `features/settings/LocalStorageSettingsCard.tsx`：存储驱动配置 UI，不接触凭据明文读取。
- 路由组件通过 `lazyRouteComponent` 加载，启动主包不再静态包含整个工作空间和编辑器页面。

## 服务端

- `assetService.ts`：资产引用、上传最终化、去重锁和清理任务入队。
- `assetCleanup.ts`：可重试物理删除 worker 和陈旧上传恢复。
- `hierarchyService.ts`：条目父子关系和循环校验。
- `storage.ts`：filesystem/S3 适配器。
- `routes.ts`：认证、输入验证和 HTTP 编排，不实现底层存储驱动。

## 依赖方向

```text
route / IPC -> application service -> metadata repository + storage port
storage adapter -X-> UI / route
domain validation -X-> Electron / Fastify
```
