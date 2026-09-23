#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未找到 Docker，请先安装并启动 Docker Engine。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "错误：当前 Docker 未提供 Compose 插件（docker compose）。" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  docker compose -f compose.yaml up -d --build
  port=${PORT:-3000}
  printf '\nTianSun-cup 已启动：\n'
  printf '  管理后台： http://localhost:%s/\n' "$port"
  printf '  管理后台： http://localhost:%s/admin/\n' "$port"
  printf '  三维展示： http://localhost:%s/3d/\n' "$port"
  printf '  Vue 界面： http://localhost:%s/app/\n' "$port"
  printf '  健康检查： http://localhost:%s/api/health\n' "$port"
else
  docker compose -f compose.yaml "$@"
fi
