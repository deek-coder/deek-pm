#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
if [ -e .env ]; then
  echo '.env already exists; refusing to overwrite production secrets.' >&2
  exit 1
fi

secret() {
  openssl rand -base64 "${1:-48}" | tr '+/' '-_' | tr -d '=\n'
}

cat > .env <<EOF
INSTANCE_NAME=Deek PM Self-hosted
API_PORT=3100
CORS_ORIGIN=*

POSTGRES_PASSWORD=$(secret 32)
JWT_SECRET=$(secret 48)
DATA_ENCRYPTION_KEY=$(secret 48)
SETUP_TOKEN=$(secret 48)

RUSTFS_ACCESS_KEY=deek$(secret 12)
RUSTFS_SECRET_KEY=$(secret 48)
RUSTFS_CONSOLE_PORT=9001
EOF

chmod 600 .env
echo 'Generated deploy/docker/.env. Back it up; SETUP_TOKEN is required by the first-run wizard.'
