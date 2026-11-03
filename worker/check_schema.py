"""校验 schema.sql 的表名与前端 SYNCED_STORES 是否一一对应"""
import io
import re
import sys

schema = io.open("schema.sql", encoding="utf-8").read()
tables = set(re.findall(r"^CREATE TABLE IF NOT EXISTS (\w+)", schema, re.M))

front = io.open("../src/services/localDB.ts", encoding="utf-8").read()
m = re.search(r"const SYNCED_STORES[^=]*=\s*\[(.*?)\];", front, re.S)
stores = set(re.findall(r"'([A-Za-z]+)'", m.group(1)))

# 非业务表
extra = {"tombstones", "sync_backups"}
biz = tables - extra

print("schema 业务表:", len(biz))
print("前端 SYNCED_STORES:", len(stores))
print("仅 schema 有:", sorted(biz - stores))
print("仅前端有:", sorted(stores - biz))

ok = biz == stores
print("一致:" , ok)
sys.exit(0 if ok else 1)
