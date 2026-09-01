#!/bin/sh

set -eu

APP_ROOT=/home/site/wwwroot
RUNTIME_NODE_MODULES=/node_modules

rm -rf "$RUNTIME_NODE_MODULES"
mkdir -p "$RUNTIME_NODE_MODULES"
tar -xzf "$APP_ROOT/node_modules.tar.gz" -C "$RUNTIME_NODE_MODULES"

rm -rf "$APP_ROOT/node_modules"
ln -s "$RUNTIME_NODE_MODULES" "$APP_ROOT/node_modules"
test "$(readlink -f "$APP_ROOT/node_modules")" = "$RUNTIME_NODE_MODULES"

exec node "$APP_ROOT/apps/api/dist/server.js"
