-- 2026-11-09 下线「今日复盘」模块：删除 reviews 表与索引
-- 执行：npx wrangler d1 migrations apply ability_growth --remote
--
-- 前置条件（务必全部满足后再执行本迁移）：
--   1. 云端 reviews 条数已确认：SELECT COUNT(*) FROM reviews; 结果须为 0；
--      若不为 0，禁止执行本迁移。
--   2. 若条数不为 0 且数据确需保留，先导出再评估：
--      npx wrangler d1 execute ability_growth --remote \
--        --command "SELECT * FROM reviews" --json > .wrangler/exports/reviews-YYYYMMDD.json
--      （.wrangler/ 已在 .gitignore，导出物不要落到 git 跟踪目录）
--   3. 应用侧代码已先发布（STORE_NAMES 已移除 reviews，不再读写该表）。
--
-- 注意：DROP TABLE 不可逆，D1 无回收站；本文件只记录变更，不要修改 0001_init.sql。

DROP INDEX IF EXISTS idx_reviews_workspace_updated;
DROP TABLE IF EXISTS reviews;
