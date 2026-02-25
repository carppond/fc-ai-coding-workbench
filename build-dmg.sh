#!/bin/bash
#
# 拾光 AI 编程平台 — DMG 打包脚本
#
# 用法:
#   ./build-dmg.sh              # 构建当前架构 (arm64 或 x86_64)
#   ./build-dmg.sh universal    # 构建 Universal (同时支持 M 芯片和 Intel)
#   ./build-dmg.sh x86_64       # 仅构建 Intel 架构
#

set -e

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  拾光 AI 编程平台 — DMG 打包${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ── 1. 环境检查 ──────────────────────────────────────

echo -e "${YELLOW}[1/4] 检查环境...${NC}"

if ! command -v node &>/dev/null; then
    echo -e "${RED}错误: 未找到 Node.js，请先安装 (https://nodejs.org)${NC}"
    exit 1
fi

if ! command -v cargo &>/dev/null; then
    if [ -f "$HOME/.cargo/env" ]; then
        source "$HOME/.cargo/env"
    fi
    if ! command -v cargo &>/dev/null; then
        echo -e "${RED}错误: 未找到 Rust/Cargo，请先安装 (https://rustup.rs)${NC}"
        exit 1
    fi
fi

NODE_VER=$(node -v)
RUST_VER=$(rustc --version | awk '{print $2}')
echo -e "  Node.js: ${GREEN}${NODE_VER}${NC}"
echo -e "  Rust:    ${GREEN}${RUST_VER}${NC}"

# ── 2. 确定目标架构 ──────────────────────────────────

TARGET_ARG="${1:-universal}"
BUILD_FLAGS=""
BUNDLE_DIR=""

case "$TARGET_ARG" in
    universal)
        echo -e "  目标:    ${GREEN}Universal (aarch64 + x86_64)${NC}"
        # 确保两个 target 都已安装
        for t in aarch64-apple-darwin x86_64-apple-darwin; do
            if ! rustup target list --installed | grep -q "$t"; then
                echo -e "  ${YELLOW}安装 Rust target: ${t}${NC}"
                rustup target add "$t"
            fi
        done
        BUILD_FLAGS="--target universal-apple-darwin"
        BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle/dmg"
        ;;
    x86_64|intel)
        echo -e "  目标:    ${GREEN}x86_64 (Intel)${NC}"
        if ! rustup target list --installed | grep -q "x86_64-apple-darwin"; then
            echo -e "  ${YELLOW}安装 Rust target: x86_64-apple-darwin${NC}"
            rustup target add x86_64-apple-darwin
        fi
        BUILD_FLAGS="--target x86_64-apple-darwin"
        BUNDLE_DIR="src-tauri/target/x86_64-apple-darwin/release/bundle/dmg"
        ;;
    native|arm64|aarch64)
        ARCH=$(uname -m)
        echo -e "  目标:    ${GREEN}${ARCH} (当前架构)${NC}"
        BUNDLE_DIR="src-tauri/target/release/bundle/dmg"
        ;;
    *)
        echo -e "${RED}未知参数: ${TARGET_ARG}${NC}"
        echo "用法: ./build-dmg.sh [native|universal|x86_64]"
        exit 1
        ;;
esac

echo ""

# ── 3. 安装依赖 ──────────────────────────────────────

echo -e "${YELLOW}[2/4] 安装前端依赖...${NC}"
npm install --prefer-offline --no-audit --no-fund 2>&1 | tail -1
echo ""

# ── 4. 构建 ──────────────────────────────────────────

echo -e "${YELLOW}[3/4] 构建中 (前端 + Rust + 打包)...${NC}"
echo -e "  ${CYAN}npm run tauri build -- ${BUILD_FLAGS} --bundles dmg${NC}"
echo ""

npm run tauri build -- ${BUILD_FLAGS} --bundles dmg

echo ""

# ── 5. 输出结果 ───────────────────────────────────────

echo -e "${YELLOW}[4/4] 构建完成${NC}"
echo ""

if [ -d "$BUNDLE_DIR" ]; then
    DMG_FILE=$(ls "$BUNDLE_DIR"/*.dmg 2>/dev/null | head -1)
    if [ -n "$DMG_FILE" ]; then
        DMG_SIZE=$(du -h "$DMG_FILE" | awk '{print $1}')
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  DMG 打包成功${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo -e "  文件: ${CYAN}${DMG_FILE}${NC}"
        echo -e "  大小: ${CYAN}${DMG_SIZE}${NC}"
        echo ""
        echo -e "  在 Finder 中打开:"
        echo -e "  ${CYAN}open \"$(dirname "$DMG_FILE")\"${NC}"
    else
        echo -e "${RED}未找到 DMG 文件，请检查构建日志${NC}"
        exit 1
    fi
else
    echo -e "${RED}构建产物目录不存在: ${BUNDLE_DIR}${NC}"
    exit 1
fi
