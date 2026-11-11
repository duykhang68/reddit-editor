#!/bin/bash
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null 2>&1; then
  echo "Chua tim thay Node.js/npm. Hay cai Node.js 22.12+ tu https://nodejs.org"
  read -r -p "Nhan Enter de dong..."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci || { read -r -p "Cai dependencies that bai. Nhan Enter..."; exit 1; }
fi
npm run dev -- --open
read -r -p "Editor da dung. Nhan Enter de dong..."
