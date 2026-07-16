# Progress

## 后端错误处理优化（2026-07-15）

- [x] 将 `ensure_project_exists` 提取到
  `backend/src/db/helpers.rs`，并由七个项目级 handler 复用。
- [x] 上传数据库写入失败时清理已落盘文件，并记录文件删除失败日志。
- [x] 删除项目时查询文件路径、清理 `./uploads/{project_id}/` 目录，目录清理失败仅告警。
- [x] 将唯一约束和外键约束错误映射为不泄露数据库结构的友好提示。
- [x] 清理后端剩余的 `let _ =` 静默错误处理。

## 验证

- `cargo build --manifest-path backend/Cargo.toml`：通过，0 warnings。
- `cargo test --manifest-path backend/Cargo.toml`：通过，0 tests failed。
- `cargo clippy --manifest-path backend/Cargo.toml --all-targets -- -D warnings`：通过。
