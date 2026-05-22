# Prisma Migrations

從 2026-05-18 起，博弈論壇導入正規 Prisma migration 流程（之前是 `db push`）。

## 開發者日常工作流

```bash
# 改完 schema.prisma 之後
cd packages/database
pnpm db:migrate --name <descriptive_name>   # 自動產生 migration + 套用到本地 DB
```

⚠️ **不要再用 `pnpm db:push`**（會繞過 migration 歷史）。

---

## 生產部署（Zeabur）

生產 API 容器 `Dockerfile.api` 啟動時，會自動跑 `apps/api/scripts/entrypoint.sh`：

1. 嘗試把 baseline `0_init` 標記為已執行（已標記則忽略 P3008 錯誤）
2. 跑 `prisma migrate deploy` 套用所有 pending migration
3. 啟動 NestJS API

也就是說，**一般部署不需要任何手動動作**，推 git 上去就會自動 migrate。

### 第一次切到 migration 流程（一次性）

如果生產 DB 已存在（從前 `db push` 過的狀態），第一次部署時：

- 生產 DB 沒有 `_prisma_migrations` 表 → entrypoint 第一行的 `resolve --applied 0_init` 會建表並記錄 baseline
- entrypoint 第二行的 `migrate deploy` 會套用：
  - `20260522062255_add_post_status_and_fix_drift` — 加 `PostStatus` enum + `posts.status` + index
  - `20260522141443_add_user_nickname_changed_at` — 補 `users.nickname_changed_at`（之前 schema 加了但沒 push 到生產 DB 的舊債）

這兩個 migration 都是**加欄位 + 有 default 值**的非破壞性變更，現有資料不受影響。

---

## Baseline 是什麼？為什麼存在？

`0_init/migration.sql` 是「**反映真實 DB 當前狀態**」的 SQL（用 `prisma migrate diff --from-empty --to-schema-datasource <real DB>` 反推產出）。

它的存在只是為了：
1. 讓 fresh setup（全新 DB）能跑出跟生產一致的 schema
2. 提供 prisma migration 系統的「起點」

**生產跟現有開發環境不會跑這個 baseline**——只會用 `migrate resolve --applied 0_init` 標記為「已執行」，跳過實際 SQL 執行。

---

## 已知的 schema 漂移（暫時擱置）

`schema.prisma` 內有幾個欄位被註解掉，原因是 schema 加了但本地/生產 DB 沒有同步，造成 drift。為了不擴大本次「加 draft 機制」的範圍，先註解，等對應 feature 動工時再恢復：

| Model | 欄位 | 對應 feature |
|---|---|---|
| WorldCupTeam | `apiTeamId`、`logoUrl` | World Cup api-sports 整合（`seed-world-cup-from-apisports.ts`） |
| WorldCupMatch | `venueCity`、`apiFixtureId` | 同上 |

恢復步驟：
1. 取消 schema.prisma 內的註解
2. `pnpm db:migrate --name restore_worldcup_api_columns`
3. 跑 `seed-world-cup-from-apisports.ts` 填資料

---

## 排錯指引

### `Error: P3018 — Migration failed to apply`

- 看錯誤訊息找出哪一行 SQL 失敗
- 如果是「資料衝突」，要先清資料或調整 SQL
- **千萬不要在生產跑 `prisma migrate reset`**（會清空所有資料）

### `Error: P3008 — Migration is already recorded as applied`

正常現象，entrypoint 已用 `|| true` 吞掉。如果手動跑遇到，代表那個 migration 已執行過，跳過即可。

### Drift detected

代表本地 DB 跟 migration 期望狀態不一致。處理：
1. `prisma migrate diff --from-schema-datasource <schema> --to-schema-datamodel <schema>` 看差異
2. 評估是「schema 該配合 DB」還是「DB 該配合 schema」
3. 對應建 migration 或調整 schema
