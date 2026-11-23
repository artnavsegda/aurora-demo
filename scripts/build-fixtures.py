#!/usr/bin/env python3
"""Собирает fixtures.json для демо из слепка прод-horizont (R50).

Источник: irz-artifacts/snapshots/r50-irzos-0.1.283/horizont/*.json.
Слепок содержит @get и status каждой схемы, снятые с реального R50.
Перед публикацией данные нужно чистить: серийники, IMEI, Wi-Fi ключи и т.п.

Использование:
  scripts/build-fixtures.py <snapshot-dir> [output]
"""
import json
import os
import re
import sys

SNAPSHOT = sys.argv[1] if len(sys.argv) > 1 else \
    "/Users/artnavsegda/Documents/GitHub/irz-artifacts/snapshots/r50-irzos-0.1.283/horizont"
OUT = sys.argv[2] if len(sys.argv) > 2 else \
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "fixtures.json")

MAC_RE = re.compile(r"^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$", re.I)
SECRET_KEYS = {"key", "password", "passwd", "priv-key", "psk", "wpa-psk"}


def sanitize(value, key=None):
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            out[k] = sanitize(v, k)
        return out
    if isinstance(value, list):
        return [sanitize(v, key) for v in value]
    if isinstance(value, str):
        if key == "serial":
            return "RAD-DEMO-0001"
        if key == "imei":
            return "000000000000000"
        if key in SECRET_KEYS and value:
            return "demo-secret"
        if MAC_RE.match(value):
            # локально администрируемый MAC: не выдаём реальный
            parts = value.lower().split(":")
            return "02:00:00:00:" + parts[-2] + ":" + parts[-1]
    return value


def load_index():
    with open(os.path.join(SNAPSHOT, "_schemas.json")) as f:
        return json.load(f)


def seed(data):
    """Немного примеров для разделов, которые на слепке пустые."""
    def put(path, value):
        if path in data:
            data[path]["get"] = sanitize(value)

    put("/ip/arp", {
        "cfg01": {"_index": 0, "ip-address": "192.168.1.42", "interface": "bridge0",
                  "macaddr": "02:00:00:00:aa:42", "age": "00:01:12", "type": "reachable"},
        "cfg02": {"_index": 1, "ip-address": "192.168.1.43", "interface": "bridge0",
                  "macaddr": "02:00:00:00:aa:43", "age": "00:04:44", "type": "stale"},
        "cfg03": {"_index": 2, "ip-address": "192.168.1.254", "interface": "bridge0",
                  "macaddr": "02:00:00:00:aa:fe", "age": "00:00:07", "type": "reachable"},
    })

    put("/ip/route/list", {
        "cfg01": {"_index": 0, "_name": "default", "dst-addr": "0.0.0.0/0",
                  "gateway": "192.168.1.254", "interface": "bridge0", "metric": "0",
                  "table": "main", "type": "unicast"},
        "cfg02": {"_index": 1, "_name": "office", "dst-addr": "10.10.0.0/16",
                  "gateway": "192.168.1.1", "interface": "bridge0", "metric": "10",
                  "table": "main", "type": "unicast"},
    })

    put("/service/dhcp/lease", {
        "192.168.1.42": {"interface": "bridge0", "ip": "192.168.1.42",
                         "mac": "02:00:00:00:aa:42", "dns": True,
                         "host": "phone-demo", "fqdn": "phone-demo",
                         "expires": "23:59:00", "leasetime": "12h"},
        "192.168.1.43": {"interface": "bridge0", "ip": "192.168.1.43",
                         "mac": "02:00:00:00:aa:43", "dns": False,
                         "host": "laptop-demo", "fqdn": "laptop-demo",
                         "expires": "11:58:00", "leasetime": "12h"},
    })

    put("/mobile/sms", {
        "cfg01": {"_index": 0, "from": "+7 900 000-00-01", "sent": "2026-11-23 09:14:02",
                  "received": "2026-11-23 09:14:05",
                  "text": "Demo: modem online, signal is good."},
        "cfg02": {"_index": 1, "from": "+7 900 000-00-02", "sent": "2026-11-23 08:02:11",
                  "received": "2026-11-23 08:02:15",
                  "text": "Demo: daily traffic report is ready."},
    })

    put("/storage/file", {
        "demo-export.conf": {"file-name": "/storage/demo-export.conf",
                             "file-type": "text/plain", "file-size": "2.4KB",
                             "last-change": "2026-11-23 09:00:00",
                             "last-access": "2026-11-23 09:00:05"},
        "firmware-backup.tar.gz": {"file-name": "/storage/firmware-backup.tar.gz",
                                   "file-type": "application/gzip", "file-size": "18.7MB",
                                   "last-change": "2026-11-22 23:10:00",
                                   "last-access": "2026-11-23 08:00:00"},
    })

    put("/event", {
        "cfg01": {"_index": 0, "owner": "demo", "description": "SMS -> notification",
                  "trigger": "sms", "target": "demo", "value": "online",
                  "action": "/system notification demo-sms", "disabled": "0"},
        "cfg02": {"_index": 1, "owner": "demo", "description": "Daily backup",
                  "trigger": "scheduler", "target": "03:00", "value": "",
                  "action": "/system config export", "disabled": "0"},
    })

    put("/network/device", {
        "bridge0": {"name": "bridge0", "type": "br", "macaddr": "02:00:00:00:77:7c",
                    "mtu": "1500", "disabled": "0"},
        "eth0": {"name": "eth0", "type": "ethernet", "macaddr": "02:00:00:00:77:7b",
                 "mtu": "1500", "disabled": "0"},
        "wlan0": {"name": "wlan0", "type": "wireless", "macaddr": "02:00:00:00:77:7d",
                  "mtu": "1500", "disabled": "0"},
    })

    put("/routing/bgp", {
        "demo-peer": {"name": "demo-peer", "disabled": "0", "router-id": "192.168.1.1",
                      "local-as": "64512", "neighbor-as": "64513",
                      "neighbor-addr": "192.168.1.254", "multihop": "0",
                      "hold-time": "240", "keepalive-time": "80"},
    })

    put("/tunnel/wireguard/interface", {
        "proto": "wireguard", "disabled": "1", "tunnel-ip": ["10.99.0.1/24"],
        "port": "51820", "mtu": "1420", "fw-mark": "0x1",
    })


def main():
    index = load_index()
    hidden = set(index.get("hidden", []))
    data = {}

    for name in sorted(os.listdir(SNAPSHOT)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        raw = json.load(open(os.path.join(SNAPSHOT, name)))
        path = raw.get("path")
        if not path:
            continue

        get = raw.get("get")
        if not isinstance(get, dict) or get.get("error"):
            get = {}

        status = None
        if isinstance(raw.get("status"), dict):
            status = raw["status"].get("result")

        records = {}
        for key, rec in (raw.get("records") or {}).items():
            if isinstance(rec, dict):
                records[key] = rec.get("result")

        data[path] = {
            "get": sanitize(get),
            "status": sanitize(status),
            "records": sanitize(records),
        }

    # список схем, для которых реально есть файл
    schema_root = os.path.join(os.path.dirname(__file__), "..", "schemas")
    available = set()
    for root, _, files in os.walk(schema_root):
        for f in files:
            if f.endswith(".json"):
                rel = os.path.relpath(os.path.join(root, f), schema_root)
                available.add("/" + rel[:-5])

    paths = sorted(p for p in data if p in available)
    data = {p: data[p] for p in paths}

    if "/defaults" in data:
        data["/defaults"]["get"]["serial"] = "RAD-DEMO-0001"
        data["/defaults"]["get"]["schemas"] = sorted(available)

    seed(data)

    fixture = {
        "source": "irz-artifacts/snapshots/r50-irzos-0.1.283",
        "hostname": "R50-DEMO",
        "model": "R50-L4.WAn",
        "serial": "RAD-DEMO-0001",
        "list": [p for p in paths if p not in hidden],
        "hidden": [p for p in paths if p in hidden],
        "data": data,
    }

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(fixture, f, ensure_ascii=False, separators=(",", ":"))

    print(f"fixtures: {len(data)} paths, {len(fixture['list'])} visible, "
          f"{len(fixture['hidden'])} hidden -> {OUT}")


if __name__ == "__main__":
    main()
