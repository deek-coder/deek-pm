# 统一资产数据库迁移计划

## 本地 SQLite/SQLCipher

1. 新增 `assets`，记录内容哈希、驱动、对象键和状态。
2. 新增 `asset_references`，统一记录正文图片和项目附件引用。
3. 新增 `asset_cleanup_jobs`，记录待删除对象、重试次数和错误。
4. 将现有 `project_attachments.asset_id` 和正文中的 `deek-asset://managed-assets/...` 回填为引用。
5. 保留旧 URL 解析兼容，完成迁移后只写新格式。

## PostgreSQL

1. 扩展现有 `assets` 状态机并增加幂等键/去重约束。
2. 新增统一引用表和清理任务表。
3. 在事务中释放引用并创建清理任务。
4. 后台 worker 使用 `FOR UPDATE SKIP LOCKED` 领取任务。

## 约束补强

- 分组父节点必须与子分组属于同一项目。
- 条目所属分组、父条目必须与条目属于同一项目。
- 应用服务拒绝自引用和循环引用。
- 排序写入使用事务和确定性冲突处理。
