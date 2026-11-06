# seed-fenbi.sql —— 粉笔练习数据播种

## 这是什么

`seed-fenbi.sql` 是从粉笔练习记录导出的 D1 播种脚本：

| 表 | 本文件条数 | 远程 D1 实测 | 内容 |
|---|---:|---:|---|
| `trainings` | 208 | **228** | 165 套整卷（trainingType=exam）+ 43 个二级考点汇总（trainingType=topic） |
| `gaps` | 40 | 40 | 按二级考点聚合的能力缺口（errorCategory / severity / occurrenceCount） |
| `abilities` | 43 | 43 | 能力快照（score / level / confidence / sampleTotal） |

数据区间 **2021-02-23 → 2026-11-05**，逐题 3700 道（归模块 3611 道）。

> **为什么 D1 比本文件多 20 行**：LWW upsert 只做「同 id 覆盖」，
> **不会删除本文件里已不存在的旧 id**。2026-11-04 那版 seed 有 47 条 trainings，
> 其中 20 条的 id 在新版里不再出现，于是留在 D1 里成了孤儿行。
> 这不影响正确性（旧行的 updated_at 更旧，不会覆盖新数据），但**行数不等于本文件条数**。
> 若要彻底对齐，需手工删除 D1 中不在本文件里的 id。

## 数据从哪来

```bash
# personal-assistant-agent 仓库
python3 scripts/export_fenbi_for_ability.py
# → data/study/ability-growth-导入-粉笔.json
```

再由 `personal-assistant-agent/scripts/build_ability_seed_sql.py` 转成本文件
（2026-11-06 起由脚本生成，此前是手工产出）。

数据源是 `mcp/fenbi`（本人真实账号），**必须走实时接口重建**——
本地的 `data/fenbi/*.csv` 是手工导出，会停留在导出当天的状态。

## 为什么走 CI 而不直接推

本机对 `*.workers.dev` 存在 DNS 污染（解析到非 Cloudflare 段，2026-11-06 实测
`ability-growth-sync.how2usepython.workers.dev` → `103.226.246.99`＝Meta 段），
浏览器与命令行都连不通，但 GitHub runner 能正常访问 Cloudflare API。所以 `deploy-worker.yml` 里加了：

1. **Seed fenbi practice data** —— `wrangler d1 execute ability_growth --remote --file=./seed-fenbi.sql`
2. **Verify seed** —— 查询各表行数并输出
3. **Commit verification report** —— 把校验结果写入 `reports/seed-verify.md` 并提交回仓库
   （`api.github.com` 在部分网络不可达，但 git over https 可用，用 git 取回报告是唯一稳定的验证通道；
   报告写在 `reports/` 而非 `worker/`，避免再次触发本 workflow）

## 幂等性

所有 INSERT 用 LWW upsert：

```sql
ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, data=excluded.data
WHERE excluded.updated_at > <table>.updated_at
```

即：**只有本地记录比远端新时才覆盖**。所以重复执行安全，也不会覆盖你在应用里做的新修改。

## 想更新数据时

1. 重新跑 `export_fenbi_for_ability.py` 生成新 JSON（**前置：先用 MCP 实时接口重建
   `%TEMP%/fenbi_out` 下的四个 JSON**，否则数据会停在旧导出那天）
2. `python3 scripts/build_ability_seed_sql.py` 生成 SQL 覆盖本文件
3. push（会触发 workflow 自动播种）
4. 看 `reports/seed-verify.md` 的行数确认

## 踩过的坑（2026-11-06）

| # | 现象 | 真因 | 修法 |
|---|---|---|---|
| 1 | 明明练了，导出却停在几天前 | 本地 CSV 是手工导出 | 用 MCP 实时接口重建 |
| 2 | 出现「未标注/未标注」的 2749 题巨型记录 | `normalize` 的模块只来自 `static_meta`，传 `{}` 就全空 | 照 `mcp/fenbi/server.py` 的 `_static_meta()` 取 |
| 3 | 逐题匹配后「归模块 0」、用时全 0 | `normalize` 返回的键是 **`question_id`**（不是 `questionId`）；对错与用时取自 **`solution.userAnswers`**（不是 `report.answers`，后者没有 time） | 先 dump 一行确认键名再写映射 |
| 4 | 报告回写那一步失败，报 `fatal error in commit_refs_rules` | **不是分支保护**——runner 里裸 `git push` 没有凭据，错误码有误导性 | 推送前 `git remote set-url origin "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git"` |
| 5 | 改了 workflow 却没触发 CI | 触发路径是 `worker/**`，改 `.github/workflows/` 不触发 | 用 `workflow_dispatch` 手动触发（body 必须无 BOM） |
| 6 | `git push` 偶发被拒 | 瞬时问题，**重试一次即成功** | 直接重试，不要据此判断有分支保护 |

> 完整台账见 personal-assistant-agent 仓库的 `docs/踩坑台账-数据采集与发布.md`。
