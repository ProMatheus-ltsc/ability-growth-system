"""校验 Worker 白名单 STORES 与前端 SYNCED_STORES 是否一致"""
import io
import re
import sys

worker = io.open("src/index.ts", encoding="utf-8").read()
m = re.search(r"const STORES = \[(.*?)\] as const", worker, re.S)
stores = re.findall(r"'([A-Za-z]+)'", m.group(1))

front = io.open("../src/services/localDB.ts", encoding="utf-8").read()
fm = re.search(r"const SYNCED_STORES[^=]*=\s*\[(.*?)\];", front, re.S)
fs = re.findall(r"'([A-Za-z]+)'", fm.group(1))

print("worker STORES:", len(stores))
print("front SYNCED_STORES:", len(fs))
print("仅 worker 有:", sorted(set(stores) - set(fs)))
print("仅前端有:", sorted(set(fs) - set(stores)))
ok = stores == fs
print("顺序与内容一致:", ok)
sys.exit(0 if ok else 1)
