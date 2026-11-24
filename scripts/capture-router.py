#!/usr/bin/env python3
"""Снимает слепок реального Aurora/Halo-роутера для демо-бэкенда.

Сохраняет:
  <out>/_schemas.json          — ответ @schemas (list/hidden)
  <out>/schemas/<path>.json    — статические схемы /schema/<path>.json
  <out>/paths/<path>.json      — { get, status, records } для каждого пути
  <out>/dashboard.json         — ответ /script/dashboard
  <out>/_errors.json           — ошибки, если что-то не отдалось

Логин и пароль не хранятся в репозитории: передавайте их аргументами или
через ROUTER_USER / ROUTER_PASSWORD.

Пример:
  scripts/capture-router.py https://192.168.3.1 admin \
    --out /Users/artnavsegda/Documents/irz/donyx-snapshot-2026-11-24
"""
import argparse
import base64
import json
import os
import ssl
import sys
import urllib.error
import urllib.request


def make_client(base, user, password, verify):
    auth = base64.b64encode(f"{user}:{password}".encode()).decode()
    ctx = ssl.create_default_context()
    if not verify:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    token = None

    def request(path, data=None, method="GET"):
        headers = {"Authorization": "Basic " + auth}
        body = None
        if data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        if token:
            headers["Token"] = token
        req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                raw = resp.read()
                return resp.status, raw
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def json_request(path, data=None, method="GET"):
        status, raw = request(path, data, method)
        try:
            return status, json.loads(raw)
        except Exception:
            return status, raw.decode("utf-8", "replace")

    status, login = json_request("/script/auth", {"username": user, "password": password}, "POST")
    if status != 200 or not isinstance(login, dict) or not login.get("token"):
        raise SystemExit(f"login failed: HTTP {status}: {login!r}")
    token = login["token"]
    return request, json_request


def wrapper(json_request, path, typ, data=None):
    body = {"type": typ, "path": path}
    if data is not None:
        body["data"] = data
    status, value = json_request("/script/wrapper?" + typ + "," + path + "=", body, "POST")
    if status == 200:
        return value
    return {"__http_error__": status, "body": value}


def write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("user", nargs="?", default=os.environ.get("ROUTER_USER", "admin"))
    ap.add_argument("--password", default=os.environ.get("ROUTER_PASSWORD"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--verify", action="store_true", help="проверять TLS-сертификат")
    args = ap.parse_args()

    if not args.password:
        raise SystemExit("password: --password or ROUTER_PASSWORD")
    base = args.base.rstrip("/")
    out = os.path.abspath(args.out)
    request, json_request = make_client(base, args.user, args.password, args.verify)

    _, schemas = json_request("/script/wrapper?schemas", {"type": "@schemas", "path": "/"}, "POST")
    if not isinstance(schemas, dict):
        raise SystemExit(f"@schemas failed: {schemas!r}")
    write_json(os.path.join(out, "_schemas.json"), schemas)

    paths = schemas.get("list", []) + schemas.get("hidden", [])
    errors = []
    for i, path in enumerate(paths, 1):
        print(f"[{i}/{len(paths)}] {path}", flush=True)
        status, schema = json_request("/schema" + path + ".json")
        if status == 200:
            write_json(os.path.join(out, "schemas", path.lstrip("/") + ".json"), schema)
        else:
            errors.append([path, "schema", f"HTTP {status}"])

        get = wrapper(json_request, path, "@get")
        status = wrapper(json_request, path, "status", {})
        records = {}
        if isinstance(get, dict) and not get.get("__http_error__") and not get.get("error"):
            for key in get:
                if str(key).startswith("."):
                    continue
                rec = wrapper(json_request, path, "status", {"_section": key})
                if isinstance(rec, (dict, list)) and not (isinstance(rec, dict) and rec.get("__http_error__")):
                    records[str(key)] = rec

        write_json(os.path.join(out, "paths", path.lstrip("/") + ".json"), {
            "path": path,
            "get": get,
            "status": status,
            "records": records,
        })

    status, dashboard = json_request("/script/dashboard", {}, "POST")
    if status == 200:
        write_json(os.path.join(out, "dashboard.json"), dashboard)
    else:
        errors.append(["dashboard", "dashboard", f"HTTP {status}"])

    write_json(os.path.join(out, "_errors.json"), errors)
    print(f"done: {len(paths)} paths, {len(errors)} errors -> {out}")


if __name__ == "__main__":
    main()
