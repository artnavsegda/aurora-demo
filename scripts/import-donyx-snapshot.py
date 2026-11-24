#!/usr/bin/env python3
"""Собирает демо-фикстуры и схемы из слепка Donyx iRM.

Слепок снимается с реального роутера (см. scripts/capture-router.py):
  <snapshot>/_schemas.json      — list/hidden из @schemas
  <snapshot>/paths/<path>.json  — { get, status, records }
  <snapshot>/schemas/<path>.json — статические схемы /schema/<path>.json
  <snapshot>/dashboard.json     — /script/dashboard

Скрипт чистит серийники, IMEI/IMSI/ICCID, Wi-Fi-ключи и MAC-адреса, чтобы
демо-образ не содержал идентификаторов реального устройства.

Использование:
  scripts/import-donyx-snapshot.py <snapshot-dir> [--keep-identifiers]
"""
import argparse
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAC_RE = re.compile(r"^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$", re.I)
SECRET_KEYS = {
    "key", "password", "passwd", "psk", "wpa-psk", "secret", "token",
    "auth-passphrase", "priv-passphrase",
}
IDENT_KEYS = {"imei", "imsi", "iccid"}
DEMO_SERIAL = "DONYX-DEMO-0001"


class Sanitizer:
    def __init__(self, keep_identifiers=False):
        self.keep = keep_identifiers
        self.macs = {}
        self.next_mac = 0x10

    def mac(self, value):
        if self.keep:
            return value
        low = value.lower()
        if low not in self.macs:
            # локально администрируемый диапазон, уникальный для каждого исходного MAC
            n = self.next_mac
            self.next_mac += 1
            self.macs[low] = f"02:00:00:{(n >> 16) & 0xff:02x}:{(n >> 8) & 0xff:02x}:{n & 0xff:02x}"
        return self.macs[low]

    def value(self, value, key=None):
        if isinstance(value, dict):
            # сводка устроена как { label, value }: для value контекстом служит label
            label = value.get("label")
            return {
                k: self.value(v, label if k == "value" and isinstance(label, str) else k)
                for k, v in value.items()
            }
        if isinstance(value, list):
            return [self.value(v, key) for v in value]
        if isinstance(value, str):
            if not self.keep:
                if key == "serial":
                    return DEMO_SERIAL
                if key == "imei":
                    return "000000000000000"
                if key == "imsi":
                    return "000000000000000"
                if key == "iccid":
                    return "0000000000000000000"
                if key in SECRET_KEYS and value:
                    return "demo-secret"
                if key == "ssid" and value:
                    return "DONYX-DEMO"
                if MAC_RE.match(value):
                    return self.mac(value)
            return value
        return value


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def valid_json(value):
    if isinstance(value, dict):
        return "__http_error__" not in value and "error" not in value
    return isinstance(value, (list, int, float, bool))


def nested_value(sections, section_label, name):
    for section in sections:
        if not isinstance(section, dict) or section.get("label") != section_label:
            continue

        def walk(items):
            for item in items or []:
                if not isinstance(item, dict):
                    continue
                if item.get("label") == name and "value" in item:
                    return item["value"]
                found = walk(item.get("items"))
                if found is not None:
                    return found
            return None

        return walk(section.get("items"))
    return None


def snapshot_path(snapshot, path):
    return os.path.join(snapshot, "paths", path.lstrip("/") + ".json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshot")
    ap.add_argument("--keep-identifiers", action="store_true",
                    help="не заменять serial/IMEI/IMSI/ICCID/MAC/ключи")
    args = ap.parse_args()

    snapshot = os.path.abspath(args.snapshot)
    index = load_json(os.path.join(snapshot, "_schemas.json"))
    visible = index.get("list", [])
    hidden = index.get("hidden", [])
    paths = visible + hidden
    sanitize = Sanitizer(args.keep_identifiers)

    data = {}
    missing = []
    for path in paths:
        src = snapshot_path(snapshot, path)
        if not os.path.exists(src):
            missing.append(path)
            continue
        raw = load_json(src)

        get = raw.get("get")
        if not valid_json(get):
            get = {}

        status = raw.get("status")
        if not valid_json(status):
            status = None

        records = {}
        for key, value in (raw.get("records") or {}).items():
            if valid_json(value):
                records[key] = value

        data[path] = {
            "get": sanitize.value(get),
            "status": sanitize.value(status),
            "records": sanitize.value(records),
        }

    # схемы: заменяем каталог целиком, чтобы не осталось старых путей
    schema_src = os.path.join(snapshot, "schemas")
    schema_dst = os.path.join(ROOT, "schemas")
    if os.path.isdir(schema_dst):
        shutil.rmtree(schema_dst)
    shutil.copytree(schema_src, schema_dst)

    dashboard_path = os.path.join(snapshot, "dashboard.json")
    dashboard = load_json(dashboard_path) if os.path.exists(dashboard_path) else []
    dashboard = sanitize.value(dashboard)

    # значения device-time/uptime на образе обновляются в src/dashboard.mjs
    fixture = {
        "source": "donyx-irm snapshot " + os.path.basename(snapshot),
        "hostname": nested_value(dashboard, "device", "hostname") or "Router",
        "model": nested_value(dashboard, "device", "model") or "Donyx iRM",
        "serial": DEMO_SERIAL,
        "list": visible,
        "hidden": hidden,
        "data": data,
    }

    fixtures_dir = os.path.join(ROOT, "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)
    with open(os.path.join(fixtures_dir, "fixtures.json"), "w", encoding="utf-8") as f:
        json.dump(fixture, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(fixtures_dir, "dashboard.json"), "w", encoding="utf-8") as f:
        json.dump(dashboard, f, ensure_ascii=False, separators=(",", ":"))

    print(f"fixtures: {len(data)} paths, {len(visible)} visible, "
          f"{len(hidden)} hidden, dashboard sections: {len(dashboard)}")
    if missing:
        print("missing paths:", ", ".join(missing))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
