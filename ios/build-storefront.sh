#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
backend_url=${NUKKAD_API_URL:-https://nukkad-backend-qeof.onrender.com}
case "$backend_url" in
  https://*) ;;
  *) echo "NUKKAD_API_URL must use HTTPS." >&2; exit 1 ;;
esac

cd "$project_root/frontend"
VITE_API_BASE_URL="${backend_url%/}" VITE_ENABLE_DEMO_ACCOUNTS=false \
  npm run build -- --outDir "$project_root/ios/Nukkad/Web" --emptyOutDir
