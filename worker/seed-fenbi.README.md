# seed-fenbi.sql —— 粉笔练习数据播种

## 这是什么

`seed-fenbi.sql` 是从粉笔练习记录导出的 D1 播种脚本，包含 100 条 INSERT：

| 表 | 条数 | 内容 |
|---|---:|---|
| `trainings` | 47 | 20 套整卷（trainingType=exam）+ 27 个二级考点汇总（trainingType=topic） |
| `gaps` | 26 | 按二级考点聚合的能力缺口（errorCategory / severity / occurrenceCount） |
| `abilities` | 27 | 能力快照（score / level / confidence / sampleTotal） |

## 数据从哪来

```bash
# personal-assistant-agent 仓库
python3 scripts/export_fenbi_for_ability.py
# → data/study/ability-growth-导入-粉笔.json
```

再由 `personal-assistant-agent/scripts/push_to_ability_worker.py` 转成本文件。
数据源是 `mcp/fenbi`（本人真实账号），窗口 400 天，1167 道题、20 套整卷、337 道错题。

## 为什么走 CI 而不直接推

本机对 `*.workers.dev` 存在 DNS 污染（解析到非 Cloudflare 段），浏览器与命令行都连不通，
但 GitHub runner 能正常访问 Cloudflare API。所以 `deploy-worker.yml` 里加了：

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

1. 重新跑 `export_fenbi_for_ability.py` 生成新 JSON
2. 转成 SQL 覆盖本文件
3. push（会触发 workflow 自动播种）
4. 看 `reports/seed-verify.md` 的行数确认
