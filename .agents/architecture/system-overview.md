# 统一资产系统概览

## 逻辑结构

```text
React UI
  -> Asset use cases
    -> Asset metadata repository
    -> Asset reference repository
    -> Asset storage port
       -> Electron filesystem adapter
       -> Electron S3 adapter
       -> Server filesystem adapter
       -> Server S3 adapter
    -> Cleanup job / outbox
```

本地模式和服务端模式共享领域模型与行为契约，但不强行共享数据库实现。SQLite/SQLCipher 与 PostgreSQL 分别维护资产元数据、引用和清理任务。

## 事务边界

- 数据库事务只覆盖元数据与引用变化。
- 上传先写临时对象，再用数据库状态 `pending -> ready` 发布。
- 删除引用与创建清理任务必须处于同一数据库事务。
- 清理任务在事务提交后删除物理对象；失败保留任务并重试，不能把已经提交的业务操作伪装成失败。

## 模块边界

- `assets/domain`：状态、引用规则、内容哈希和对象键规则。
- `assets/application`：上传、读取、释放引用、恢复、清理等用例。
- `assets/adapters`：SQLite/PostgreSQL、文件系统/S3、Electron IPC/HTTP。
- `backup`：manifest、数据库快照和资产文件编排，不直接实现资产存储。
- `knowledge`：只维护正文中的资产引用，不直接删除物理文件。
