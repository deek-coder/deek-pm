# 资产 API 契约方向

## 稳定业务契约

- `POST /api/v1/assets/upload`：上传并返回 `Asset`。
- `GET /api/v1/assets/:id/content`：按权限读取内容。
- `DELETE /api/v1/assets/:id`：释放无引用资产；接口成功不依赖物理清理同步完成。
- 正文和附件 API 使用 `assetId`，展示 URL 由 Repository/Asset resolver 临时解析。

## 错误语义

- 业务事务已提交后，不因备份或物理清理失败返回业务失败。
- 存储暂不可用但业务尚未提交时返回 503。
- 跨项目、跨工作空间引用返回 403 或 409。
- 文件本体缺失返回明确的资产缺失错误，不返回泛化 500。
