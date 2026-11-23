#!/bin/sh
# Кладёт собранные Vue 2 и Vue 3 в frontend/vue2 и frontend/vue3 для e2e.
# Использование: scripts/prepare-e2e-frontends.sh <vue2-dist> <vue3-dist>
set -eu

VUE2="${1:-}"
VUE3="${2:-}"
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

if [ -z "$VUE2" ] || [ -z "$VUE3" ]; then
    echo "usage: $0 /path/to/vue2/dist /path/to/vue3/dist" >&2
    exit 1
fi

for src in "$VUE2" "$VUE3"; do
    if [ ! -f "$src/index.html" ]; then
        echo "no index.html in $src" >&2
        exit 1
    fi
done

rm -rf "$ROOT/frontend/vue2" "$ROOT/frontend/vue3"
mkdir -p "$ROOT/frontend/vue2" "$ROOT/frontend/vue3"
cp -R "$VUE2"/. "$ROOT/frontend/vue2"/
cp -R "$VUE3"/. "$ROOT/frontend/vue3"/
echo "frontend/vue2 <- $VUE2"
echo "frontend/vue3 <- $VUE3"
