#!/usr/bin/env bash
# Cloudflare Pages 构建脚本
#
# 背景：@shared/core 以 file:../shared-core 方式引入（与 root-cause-analysis 一致），
# Cloudflare Pages 的构建环境是全新容器，没有该父目录，必须先从 GitHub 克隆到项目父目录再构建。
# 用法：Cloudflare Pages → Settings → Builds & deployments → Build command 填：
#   bash scripts/cf-pages-build.sh
# 环境变量：NODE_VERSION=22（Vite 8 要求 ^20.19.0 || >=22.12.0，Pages 默认版本可能过低）
set -euo pipefail

if [ ! -e ../shared-core/package.json ]; then
  echo "==> Cloning shared-core to parent directory..."
  git clone --depth 1 https://github.com/ProMatheus-ltsc/shared-core.git ../shared-core
  echo "==> Installing shared-core dependencies..."
  (cd ../shared-core && npm install --no-audit --no-fund)
else
  echo "==> shared-core already present at ../shared-core"
fi

echo "==> Installing app dependencies..."
npm ci

echo "==> Building..."
npm run build
