# sec-tracker 一键命令
# 首次使用：brew install just

default:
    @just --list

# === 开发 ===

# 启动开发模式（后端 + Vite dev server 分别跑）
dev:
    @echo "🚀 启动开发模式..."
    @echo "后端: cargo run --manifest-path backend/Cargo.toml &"
    @echo "前端: cd frontend && npm run dev"
    @echo "提示：开发时不需 static 目录，Vite proxy 处理 /api 转发"

# === 生产 ===

# 生产模式：构建前端 → 部署 static → 启动后端（单进程）
prod: build-frontend deploy-static
    @echo "🚀 启动生产模式..."
    cd backend && cargo run --release

# === 停止 ===

# 停止占用 3000 端口的进程
stop:
    @lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "✅ 已停止端口 3000" || echo "ℹ️  端口 3000 未被占用"

# 重启
restart: stop prod

# === 构建 ===

# 构建后端 release
build-backend:
    cargo build --release --manifest-path backend/Cargo.toml

# 构建前端
build-frontend:
    cd frontend && npm run build

# 构建前后端
build: build-backend build-frontend

# 将前端构建产物部署到 backend/static/
deploy-static: build-frontend
    @mkdir -p backend/static
    @rm -rf backend/static/*
    @cp -r frontend/dist/* backend/static/
    @echo "✅ 前端已部署到 backend/static/ (`find backend/static -type f | wc -l | tr -d ' '` 个文件)"

# === 数据库 ===

# 运行冒烟测试（完整模块 CRUD + CRM 字段校验）
smoke:
    @echo "🧪 运行冒烟测试..."
    cd backend && cargo test --test smoke -- --nocapture

# 运行待应用的迁移
db-migrate:
    @echo "📋 运行数据库迁移..."
    cd backend && cargo run --release 2>&1 | head -5 &
    @sleep 2
    @lsof -ti:3000 | xargs kill -9 2>/dev/null

# === 检查 ===

# 全量检查（clippy + tsc + test）
check:
    @echo "=== 后端 clippy ==="
    cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings
    @echo "=== 后端测试 ==="
    cargo test --manifest-path backend/Cargo.toml
    @echo "=== 前端 tsc ==="
    cd frontend && npx tsc --noEmit
    @echo "✅ 全量检查通过"

# === 状态 ===

# 查看服务状态
status:
    @if lsof -ti:3000 >/dev/null 2>&1; then \
        echo "✅ 后端运行中 (端口 3000)"; \
        curl -s http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || echo "  (health check 失败)"; \
    else \
        echo "⏸️  后端未运行"; \
    fi

# === 格式化 ===

# 格式化后端 (rustfmt) + 前端 (prettier)。代码已采纳格式化器；CI 强制 fmt-check。
fmt:
    cargo fmt --manifest-path backend/Cargo.toml
    cd frontend && npm run format
    @echo "✅ 格式化完成"

# === 清理 ===

# 清理构建产物
clean:
    cargo clean --manifest-path backend/Cargo.toml
    rm -rf frontend/dist frontend/node_modules/.vite
    @echo "✅ 已清理"