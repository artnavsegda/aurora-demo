#!/bin/sh
# Кладёт собранный фронтенд в frontend/aurora для Docker-образа.
# Использование: scripts/prepare-frontend.sh [путь-к-dist]
set -eu

SRC="${1:-/Users/artnavsegda/Desktop/aurora/dist}"
DST="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)/frontend/aurora"

if [ ! -f "$SRC/index.html" ]; then
    echo "no index.html in $SRC" >&2
    echo "usage: $0 /path/to/aurora/dist" >&2
    exit 1
fi

rm -rf "$DST"
mkdir -p "$DST"
cp -R "$SRC"/. "$DST"/
echo "frontend: $SRC -> $DST"
