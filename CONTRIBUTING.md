# 贡献指南

感谢你参与 Deek PM。提交代码前请先搜索已有 Issue，较大的功能建议先创建讨论或功能请求，明确数据兼容和交互边界后再实现。

## 开发环境

- Node.js 22.12+
- npm
- PostgreSQL 14+（仅服务端开发需要）
- Windows 桌面打包需要 Windows 环境

分别在 `app` 和 `server` 目录执行 `npm ci` 安装依赖。

## 分支

- `main`：始终保持可构建、可发布。
- `feature/<name>`：新功能。
- `fix/<name>`：缺陷修复。
- `docs/<name>`：仅文档修改。
- `release/<version>`：发布准备。

请从最新 `main` 创建分支，不要向他人的功能分支强制推送。

## 提交信息

采用 Conventional Commits，类型和 scope 使用英文，说明可以使用简体中文：

```text
feat(app): 增加 Markdown 资源包导出
fix(server): 修复并发上传去重
docs: 更新 Docker 部署说明
test(storage): 覆盖 S3 删除重试
```

常用类型：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`build`、`ci`、`chore`。

## 验证

客户端：

```bash
cd app
npm run lint
npm run test:local
npm run test:migration
npm run build
```

服务端：

```bash
cd server
npm test
npm run build
```

修改数据库结构必须新增迁移文件，不允许改写已经发布的迁移。修改资产生命周期必须覆盖失败重试、引用释放和跨工作空间校验。

## Pull Request

- 一个 PR 聚焦一个主题。
- 描述动机、实现、测试和数据迁移影响。
- UI 修改附截图或录屏。
- 不提交 `.env`、数据库、访问令牌、真实备份或构建产物。
- 用户可见变化更新 `CHANGELOG.md`。
