#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="yulu-sim"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_PID=""

cleanup() {
    if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo ""
        echo "[停止] 正在关闭后端服务..."
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

echo "========================================"
echo "  YULU ETC 交通仿真系统 - 一键启动"
echo "========================================"
echo ""

if ! command -v conda >/dev/null 2>&1; then
    echo "[错误] 未检测到 Conda，请先安装 Miniconda 或 Anaconda。"
    exit 1
fi

if ! conda run -n "$ENV_NAME" python --version >/dev/null 2>&1; then
    echo "[初始化] 正在创建 Conda 环境：$ENV_NAME"
    cd "$SCRIPT_DIR"
    conda env create -f environment.yml
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    echo "[初始化] 正在安装前端依赖..."
    cd "$FRONTEND_DIR"
    if [[ -f package-lock.json ]]; then
        conda run --no-capture-output -n "$ENV_NAME" npm ci
    else
        conda run --no-capture-output -n "$ENV_NAME" npm install
    fi
fi

echo "[启动] 后端：http://127.0.0.1:8000"
cd "$REPO_ROOT"
conda run --no-capture-output -n "$ENV_NAME" \
    python -m uvicorn etc_sim.backend.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

BACKEND_READY=0
for _ in $(seq 1 30); do
    if conda run -n "$ENV_NAME" python -c \
        'import urllib.request; urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=1)' \
        >/dev/null 2>&1; then
        BACKEND_READY=1
        break
    fi

    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "[错误] 后端进程已提前退出。"
        wait "$BACKEND_PID"
        exit 1
    fi
    sleep 1
done

if [[ "$BACKEND_READY" -ne 1 ]]; then
    echo "[错误] 后端在 30 秒内未通过健康检查。"
    exit 1
fi

echo "[启动] 前端：http://localhost:3000"
cd "$FRONTEND_DIR"
conda run --no-capture-output -n "$ENV_NAME" npm run dev
