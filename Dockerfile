# =============================================================================
# project-manage — multi-stage build
# 1. frontend-builder : build the React SPA to static files
# 2. backend-builder  : compile the Rust/Axum binary (SQLX offline)
# 3. runtime          : slim image serving API + static frontend
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — frontend
# ---------------------------------------------------------------------------
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Install deps first for layer caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Build the SPA
COPY frontend/ ./
RUN npm run build
# Output → /app/frontend/dist

# ---------------------------------------------------------------------------
# Stage 2 — backend
# ---------------------------------------------------------------------------
FROM rust:1.97-slim AS backend-builder
WORKDIR /app/backend

# The backend verifies `sqlx::query!` macros against a live DB at compile time.
# `cargo sqlx prepare` generated `backend/.sqlx/` offline query metadata, so we
# build with SQLX_OFFLINE=true and no database is needed during the image build.
ENV SQLX_OFFLINE=true

# Cache deps: copy manifests + offline query data first
COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/.sqlx ./.sqlx

# Pre-fetch dependencies (cached across source changes)
RUN mkdir -p src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src target/release/deps/project_manage_backend* \
       target/release/project-manage-backend

# Build the real source
COPY backend/src ./src
COPY backend/migrations ./migrations
RUN cargo build --release

# ---------------------------------------------------------------------------
# Stage 3 — runtime
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime
WORKDIR /app

# ca-certificates for rustls (HTTPS-capable HTTP client for the readiness check)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Binary + runtime-resolved migrations + built frontend static
COPY --from=backend-builder /app/backend/target/release/project-manage-backend ./
COPY --from=backend-builder /app/backend/migrations ./migrations
COPY --from=frontend-builder /app/frontend/dist ./static

# The app loads migrations from ./migrations and serves ./static relative to cwd
ENV STATIC_DIR=/app/static
EXPOSE 3000

CMD ["./project-manage-backend"]
