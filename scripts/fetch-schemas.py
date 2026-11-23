#!/usr/bin/env python3
"""Снимает прод-схемы Aurora с роутера/демо-стенда.

Схемы отдаются статикой без авторизации: GET /schema/<path>.json.
Список путей берётся из слепка _schemas.json (list + hidden) или из файла.

Пример:
  scripts/fetch-schemas.py https://irzos.demo.radiofid.ru \
    /Users/artnavsegda/Documents/GitHub/irz-artifacts/snapshots/r50-irzos-0.1.283/horizont/_schemas.json
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://irzos.demo.radiofid.ru").rstrip("/")
INDEX = sys.argv[2] if len(sys.argv) > 2 else \
    "/Users/artnavsegda/Documents/GitHub/irz-artifacts/snapshots/r50-irzos-0.1.283/horizont/_schemas.json"
OUT = os.path.join(os.path.dirname(__file__), "..", "schemas")

with open(INDEX) as f:
    idx = json.load(f)

paths = idx.get("list", []) + idx.get("hidden", [])
ok, missing = [], []

for path in paths:
    url = BASE + "/schema" + path + ".json"
    dest = os.path.join(OUT, path.lstrip("/") + ".json")
    try:
        with urllib.request.urlopen(url, timeout=20) as r:
            data = r.read()
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(data)
        ok.append(path)
    except urllib.error.HTTPError as e:
        missing.append((path, e.code))
    except Exception as e:
        missing.append((path, str(e)))

print(f"fetched: {len(ok)}, missing: {len(missing)}")
for path, err in missing:
    print(f"  {path}: {err}")
