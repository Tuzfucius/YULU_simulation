#!/bin/bash
# ============================================
# ETC 交通仿真系统 - 一键启动脚本 (Linux/Mac)
# ============================================

echo "========================================"
echo "  ETC 交通仿真系统 - 一键启动"
echo "========================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装 Node.js"
    exit 1
fi

# 获取脚本目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/frontend"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "[提示] 首次运行，正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi

echo ""
echo "[启动] 前端开发服务器"
echo "[访问] http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

npm run dev
