# Deek PM Server

Deek PM 的官方云服务和自部署服务共用这一套 API。两种部署只通过 `DEPLOYMENT_MODE=cloud|selfhost` 区分，客户端协议和数据库结构完全一致。

## 能力范围

- 邮箱密码登录与 JWT 鉴权
- 每个账号独立的个人资料库与所有权鉴权
- 项目、智库分组与条目、附件索引、快捷入口 API
- PostgreSQL 持久化和版本化迁移
- 密码类条目使用 AES-256-GCM 应用层加密后入库
- 健康检查、Docker 镜像和 Docker Compose 自部署

本目录暂不包含后台管理页面。实例级用户、审计、套餐等管理功能留给后续后台；项目不提供成员邀请或多人协作接口。

## 本地启动

要求 Node.js 20+ 和 PostgreSQL 14+。

当前开发方式是：API 服务运行在本机 `127.0.0.1:3100`，PostgreSQL 可以是本机数据库，也可以通过 `DATABASE_URL` 连接远程数据库。数据库地址不等于 API 服务地址。

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

需要在 `.env` 中至少设置：

- `DATABASE_URL`：PostgreSQL 连接串
- `JWT_SECRET`：至少 32 字符，仅用于签发登录令牌
- `DATA_ENCRYPTION_KEY`：另一个至少 32 字符的随机密钥，用于加密敏感条目；部署后必须备份，丢失将无法解密已有数据
- `BOOTSTRAP_EMAIL` / `BOOTSTRAP_PASSWORD`：首次运行 `db:seed` 时创建的所有者账号

可使用以下命令生成随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

默认监听 `http://0.0.0.0:3100`。验证：

```bash
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:3100/api/v1/instance
```

自部署实例登录后，可在客户端“设置 → 服务端物理存储”中选择服务器目录，或填写 RustFS/S3 的 Endpoint、Bucket 和密钥。完整配置保存在 PostgreSQL 的 `storage_settings` 表；S3 Access Key/Secret Key 使用 `DATA_ENCRYPTION_KEY` 加密后入库，不写入客户端配置文件。

`.env` 只保留数据库连接、JWT 签名密钥、数据加密主密钥等服务启动前必须存在的引导参数。数据库中的加密主密钥不能再存回同一个数据库，否则无法建立可信的解密边界。

## 自部署

复制 `.env.example` 为 `.env`，至少设置 `POSTGRES_PASSWORD`、`JWT_SECRET` 和 `DATA_ENCRYPTION_KEY`，然后执行：

```bash
docker compose up -d --build
docker compose exec api node dist/scripts/seed.js
```

Compose 同时启动 RustFS，S3 API 为 `http://rustfs:9000`，控制台默认映射到宿主机 `9001` 端口。首次使用时仍需在客户端存储设置页保存 RustFS Endpoint、Bucket 与凭据，API 不会在本机开发环境里硬编码对象存储。

生产环境应在 API 前放置 Nginx、Caddy 或云负载均衡并启用 HTTPS。客户端填写反向代理后的根地址，例如 `https://pm.example.com`，不要填写 `/api/v1` 后缀。

如使用已有 PostgreSQL，可以只部署 `api` 容器并通过 `DATABASE_URL` 指向外部数据库。迁移具有幂等性，API 容器启动时会自动执行尚未应用的迁移。

## 部署模式

| 场景 | DEPLOYMENT_MODE | INSTANCE_NAME | 客户端选择 |
| --- | --- | --- | --- |
| Deek PM 官方服务 | `cloud` | 官方实例名称 | 官方云服务 |
| 用户私有部署 | `selfhost` | 企业或团队名称 | 自部署服务 |

官方服务地址在客户端构建时通过 `VITE_OFFICIAL_SERVICE_URL` 注入。自部署地址由用户在客户端界面填写。

## 主要接口

公开接口：

- `GET /health`
- `GET /api/v1/instance`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`（仅 `ALLOW_REGISTRATION=true`）

其余 `/api/v1` 接口均需要 `Authorization: Bearer <token>`，覆盖 workspaces、projects、groups、entries、assets、attachments 和 quick-entries。错误统一返回 `{ "error": "..." }`，参数校验失败还包含 `details`。

## 安全注意事项

- 不要提交 `.env`，本目录已将它加入 `.gitignore`。
- 官方部署应把 `CORS_ORIGIN` 设置为明确的 Web 来源；桌面客户端场景可以保留 `*`。
- `DATABASE_SSL=true` 用于要求 TLS 的外部数据库。
- PostgreSQL 账号应只拥有当前数据库所需权限，不要使用超级管理员账号作为长期生产凭据。
- 生产环境应在数据库层另外开启自动备份和恢复演练。
