# Deek PM Docker 自部署

这个目录用于从源码仓库直接启动 PostgreSQL、Deek PM API 和 RustFS。API 容器会自动执行数据库迁移；首次管理员、工作空间和文件存储通过桌面客户端的安装向导创建，不再需要运行 `db:seed`。

## 1. 生成部署密钥

Windows PowerShell：

```powershell
cd deploy/docker
.\init.ps1
```

Linux/macOS：

```bash
cd deploy/docker
chmod +x init.sh
./init.sh
```

脚本只在 `.env` 不存在时运行，不会覆盖已经投入使用的密钥。必须备份 `.env`；丢失 `DATA_ENCRYPTION_KEY` 将无法解密敏感数据。

## 2. 启动服务

```bash
docker compose up -d --build
docker compose ps
```

API 默认地址为 `http://127.0.0.1:3100`。验证：

```bash
curl http://127.0.0.1:3100/health
curl http://127.0.0.1:3100/api/v1/setup/status
```

## 3. 完成首次安装

1. 打开 Deek PM 桌面客户端，选择“自部署服务”。
2. 输入 API 地址并点击“检测并登录”。
3. 新实例会自动进入初始化向导。
4. 从 `.env` 复制 `SETUP_TOKEN`。
5. 设置管理员、工作空间与文件存储。
6. 使用内置 RustFS 时，Endpoint 保持 `http://rustfs:9000`，Access Key 与 Secret Key 分别取自 `.env` 的 `RUSTFS_ACCESS_KEY` 和 `RUSTFS_SECRET_KEY`。

初始化采用数据库事务和全局锁；成功后 Setup 接口永久拒绝再次初始化。

## 运维

查看日志：

```bash
docker compose logs -f api
```

停止服务：

```bash
docker compose down
```

不要使用 `docker compose down -v`，它会删除 PostgreSQL、RustFS 和托管文件卷。

公网部署必须在 API 前配置 Caddy、Nginx 或云负载均衡并启用 HTTPS。生产备份至少应覆盖 `.env`、`postgres-data` 与所选资产存储；使用 RustFS 时应备份四个 `rustfs-data-*` 卷。
