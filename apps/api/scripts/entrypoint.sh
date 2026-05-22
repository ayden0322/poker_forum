#!/bin/sh
# API 容器啟動腳本
# 1. 若是「首次導入 migration」的環境（生產 DB 已存在但無 _prisma_migrations 表），
#    嘗試把 baseline（0_init）標記為已執行 — idempotent，已標記則忽略錯誤
# 2. 跑所有 pending migration
# 3. 啟動 API
set -e

SCHEMA_PATH="packages/database/prisma/schema.prisma"

echo "[entrypoint] 嘗試標記 baseline 0_init（若已標記則忽略）..."
node node_modules/.bin/prisma migrate resolve \
  --applied 0_init \
  --schema="${SCHEMA_PATH}" 2>&1 | grep -v "P3008" || true

echo "[entrypoint] 跑 prisma migrate deploy..."
node node_modules/.bin/prisma migrate deploy --schema="${SCHEMA_PATH}"

echo "[entrypoint] 啟動 API..."
exec node dist/main.js
