//! Smoke tests — full module CRUD + CRM field verification.
//!
//! Each test:
//! 1. Opens its own `PgPool` against the dedicated `<db>_smoke` database
//!    (B1: isolated from the dev database).
//! 2. Starts an Axum test server on a random loopback port via
//!    `project_manage_backend::app::build_app`.
//! 3. Performs CREATE → READ → UPDATE → DELETE over HTTP and asserts
//!    each response status + body shape.
//! 4. Cleans up rows at the end (idempotent with the CRUD DELETE step).
//!
//! Tests are independent — they bind to `127.0.0.1:0` (random port) and
//! use unique UUID suffixes in test resource names so they can run in
//! parallel without `#[serial]`.
//!
//! Run with:
//!   export DATABASE_URL=postgres://localhost:5432/project_manage
//!   cargo test --test smoke -- --nocapture
//!
//! Or via the `just smoke` recipe (sets up env via `.cargo/config.toml`).

use std::str::FromStr;

use reqwest::StatusCode;
use serde_json::{json, Value};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::PgPool;
use tokio::sync::OnceCell;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

use project_manage_backend::app::build_app;

/// Per-request timeout for the test server. Matches production's
/// `REQUEST_TIMEOUT_SECS` constant in `main.rs`.
const TEST_TIMEOUT_SECS: u64 = 30;
/// 100 MiB body cap. Plenty of room for any test JSON payload.
const TEST_BODY_LIMIT_BYTES: usize = 100 * 1024 * 1024;

/// Shared smoke-test account. Tests run in parallel against one server
/// process; `auth_login` is idempotent (setup races resolve via 409→login).
const SMOKE_USER: &str = "smoke@test.local";
const SMOKE_PASS: &str = "smoke-test-password";

/// Build a reqwest client with a cookie jar so Set-Cookie from
/// login/setup persists across requests (session auth round-trips).
fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .cookie_store(true)
        .build()
        .expect("reqwest client")
}

/// Start an Axum test server on a random loopback port. Returns the
/// base URL (e.g. `http://127.0.0.1:34567`). Polls `/api/health` until
/// it returns 200 — gives the listening socket time to actually accept
/// before the first real test request fires.
async fn start_test_server(pool: PgPool) -> String {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Point the official store at the public.session table created by
    // migration 00022 (its default is a private tower_sessions schema).
    let mut session_store = tower_sessions_sqlx_store::PostgresStore::new(pool.clone());
    session_store = session_store
        .with_schema_name("public")
        .expect("static schema name is valid");
    let session_layer = tower_sessions::SessionManagerLayer::new(session_store)
        .with_same_site(tower_sessions::cookie::SameSite::Lax)
        .with_expiry(tower_sessions::Expiry::OnSessionEnd);

    let app = build_app(
        pool,
        session_layer,
        cors,
        "./static",
        TEST_TIMEOUT_SECS,
        TEST_BODY_LIMIT_BYTES,
    );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind 127.0.0.1:0");
    let port = listener.local_addr().expect("local_addr").port();
    let base_url = format!("http://127.0.0.1:{port}");

    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    let client = reqwest::Client::new();
    for _ in 0..50 {
        if let Ok(resp) = client.get(format!("{base_url}/api/health")).send().await
            && resp.status().is_success()
        {
            return base_url;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    panic!("server did not become ready within 5 seconds");
}

/// Ensure a logged-in session on `http`. Idempotent under parallel tests:
/// first caller sets the shared account up (setup 409 → fall through to
/// login), everyone else just logs in. The reqwest client stores the
/// Set-Cookie automatically, so subsequent calls carry the session.
async fn auth_login(http: &reqwest::Client, base_url: &str) {
    let login = http
        .post(format!("{base_url}/api/auth/login"))
        .json(&json!({ "username": SMOKE_USER, "password": SMOKE_PASS }))
        .send()
        .await
        .expect("POST login");
    if login.status().is_success() {
        return;
    }
    // 401 → account may not exist yet; try setup (races with other tests
    // resolve via 409, after which login succeeds).
    let setup = http
        .post(format!("{base_url}/api/auth/setup"))
        .json(&json!({ "username": SMOKE_USER, "password": SMOKE_PASS }))
        .send()
        .await
        .expect("POST setup");
    if setup.status().is_success() {
        return;
    }
    // Lost the setup race or already logged in — a fresh login must work.
    let retry = http
        .post(format!("{base_url}/api/auth/login"))
        .json(&json!({ "username": SMOKE_USER, "password": SMOKE_PASS }))
        .send()
        .await
        .expect("POST login retry");
    assert!(
        retry.status().is_success(),
        "auth_login failed: setup={}, retry={}",
        setup.status(),
        retry.status()
    );
}

/// B1 fix: the smoke suite used to connect straight to the dev database,
/// which is how the shared `smoke@test.local` account leaked into real
/// `users` tables. All smoke pools now point at a dedicated
/// `<db>_smoke` database, created + migrated on first use per process.
fn smoke_db_name(url: &str) -> String {
    let opts = PgConnectOptions::from_str(url).expect("parse DATABASE_URL");
    format!("{}_smoke", opts.get_database().unwrap_or("project_manage"))
}

/// Create the smoke database if missing and apply migrations. Runs once
/// per test process (`SMOKE_DB_INIT` guards against the parallel tests
/// racing each other into a duplicate CREATE DATABASE).
async fn ensure_smoke_database(url: &str) {
    let name = smoke_db_name(url);
    let admin_opts = PgConnectOptions::from_str(url)
        .expect("parse DATABASE_URL")
        .database("postgres");
    let admin = PgPoolOptions::new()
        .max_connections(2)
        .connect_with(admin_opts)
        .await
        .expect("connect to the 'postgres' maintenance database");
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1)")
            .bind(&name)
            .fetch_one(&admin)
            .await
            .expect("check pg_database");
    if !exists {
        sqlx::query(&format!("CREATE DATABASE \"{name}\""))
            .execute(&admin)
            .await
            .unwrap_or_else(|e| panic!("create {name}: {e}"));
    }
    admin.close().await;

    let pool = PgPool::connect_with(
        PgConnectOptions::from_str(url)
            .expect("parse DATABASE_URL")
            .database(&name),
    )
    .await
    .expect("connect to the smoke database");
    let migrator = sqlx::migrate::Migrator::new(std::path::Path::new("./migrations"))
        .await
        .expect("load migrations for the smoke database");
    migrator
        .run(&pool)
        .await
        .expect("migrate the smoke database");
    pool.close().await;
}

static SMOKE_DB_INIT: OnceCell<()> = OnceCell::const_new();

/// Open a fresh pool against the dedicated smoke database (`<db>_smoke`),
/// derived from `DATABASE_URL`. `cargo test` propagates the `[env]`
/// section from `.cargo/config.toml` to the test process, so the variable
/// is normally set without an explicit `export`.
async fn connect_pool() -> PgPool {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for smoke tests");
    SMOKE_DB_INIT
        .get_or_init(|| ensure_smoke_database(&url))
        .await;
    let opts = PgConnectOptions::from_str(&url)
        .expect("parse DATABASE_URL")
        .database(&smoke_db_name(&url));
    PgPoolOptions::new()
        .connect_with(opts)
        .await
        .expect("connect to the smoke database")
}

/// Create a parent client for tests that exercise project-scoped
/// resources. The returned JSON row contains the new `id`.
async fn create_test_client(http: &reqwest::Client, base_url: &str, suffix: &Uuid) -> Value {
    let name = format!("__SMOKE_CLIENT__{suffix}");
    let resp = http
        .post(format!("{base_url}/api/clients"))
        .json(&json!({
            "name": name,
            "contact_person": "smoke contact",
            "contact_info": "smoke@example.com",
            "notes": "smoke test parent client",
        }))
        .send()
        .await
        .expect("POST /api/clients");
    assert_eq!(
        resp.status(),
        StatusCode::CREATED,
        "create parent client should return 201"
    );
    resp.json().await.expect("parse client JSON")
}

/// Create a project under the given client. Returns the JSON row.
async fn create_test_project(
    http: &reqwest::Client,
    base_url: &str,
    client_id: &str,
    suffix: &Uuid,
) -> Value {
    let name = format!("__SMOKE_PROJECT__{suffix}");
    let resp = http
        .post(format!("{base_url}/api/projects"))
        .json(&json!({
            "client_id": client_id,
            "name": name,
            "status": "in_progress",
        }))
        .send()
        .await
        .expect("POST /api/projects");
    assert_eq!(
        resp.status(),
        StatusCode::CREATED,
        "create project should return 201"
    );
    resp.json().await.expect("parse project JSON")
}

/// Drop a project + its parent client in dependency order. Project
/// deletion cascades to every project-scoped child, so children do not
/// need their own DELETE.
async fn cleanup_project_and_client(pool: &PgPool, project_id: Uuid, client_id: Uuid) {
    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project_id)
        .execute(pool)
        .await
        .expect("delete project");
    sqlx::query("DELETE FROM clients WHERE id = $1")
        .bind(client_id)
        .execute(pool)
        .await
        .expect("delete client");
}

/// Extract a UUID-shaped string from a JSON row, panicking if missing.
fn json_id(row: &Value) -> Uuid {
    Uuid::parse_str(row["id"].as_str().expect("row has id string")).expect("id is a uuid")
}

// =========================================================================
// 1. health_check
// =========================================================================

#[tokio::test]
async fn test_health_check() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool).await;

    let resp = reqwest::Client::new()
        .get(format!("{base_url}/api/health"))
        .send()
        .await
        .expect("GET /api/health");

    assert_eq!(resp.status(), StatusCode::OK, "health check returns 200");
    let body: Value = resp.json().await.expect("health JSON");
    assert_eq!(body["status"], "ok", "status field");
    assert_eq!(body["version"], "0.1.0", "version field");
}

// =========================================================================
// 2. clients_crud — also exercises products[], background_info
// =========================================================================

#[tokio::test]
async fn test_clients_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;
    let name = format!("__SMOKE_CLIENT__{suffix}");

    // 1. CREATE — verify all CRM-shaped fields round-trip.
    let resp = http
        .post(format!("{base_url}/api/clients"))
        .json(&json!({
            "name": name,
            "contact_person": "张经理",
            "contact_info": "zhang@example.com",
            "notes": "initial notes",
            "products": ["网关", "日志系统"],
            "background_info": "重点行业客户",
        }))
        .send()
        .await
        .expect("POST /api/clients");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let client_id = json_id(&created);

    assert_eq!(created["name"], name);
    assert_eq!(created["contact_person"], "张经理");
    assert_eq!(created["products"][0], "网关");
    assert_eq!(created["products"][1], "日志系统");
    assert_eq!(created["background_info"], "重点行业客户");

    // 2. READ — verify all fields persist.
    let resp = http
        .get(format!("{base_url}/api/clients/{client_id}"))
        .send()
        .await
        .expect("GET /api/clients/{id}");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["id"], created["id"]);
    assert_eq!(fetched["products"][0], "网关");

    // 3. UPDATE — patch notes, products[] simultaneously.
    let resp = http
        .put(format!("{base_url}/api/clients/{client_id}"))
        .json(&json!({
            "notes": "smoke test note",
            "products": ["网关", "日志系统", "监控系统"],
        }))
        .send()
        .await
        .expect("PUT /api/clients/{id}");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["notes"], "smoke test note");
    assert_eq!(updated["products"].as_array().unwrap().len(), 3);
    // Untouched fields still round-trip
    assert_eq!(updated["background_info"], "重点行业客户");

    // 4. DELETE — also acts as the safety net for cleanup.
    let resp = http
        .delete(format!("{base_url}/api/clients/{client_id}"))
        .send()
        .await
        .expect("DELETE /api/clients/{id}");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 5. CLEANUP — read-back should now 404.
    let resp = http
        .get(format!("{base_url}/api/clients/{client_id}"))
        .send()
        .await
        .expect("GET after delete");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// =========================================================================
// 3. projects_crud — also exercises CRM fields tech_approval, competitors
// =========================================================================

#[tokio::test]
async fn test_projects_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    // Setup: a client is required for any project.
    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);

    // 1. CREATE with initial CRM fields.
    let resp = http
        .post(format!("{base_url}/api/projects"))
        .json(&json!({
            "client_id": client_id,
            "name": format!("__SMOKE_PROJECT__{suffix}"),
            "status": "in_progress",
            "tech_approval": "未接触",
            "competitors": "未知",
        }))
        .send()
        .await
        .expect("POST /api/projects");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let project_id = json_id(&created);

    // CRM fields appear in the response.
    assert!(
        created["tech_approval"].is_string(),
        "tech_approval field present in create response"
    );
    assert!(
        created["competitors"].is_string(),
        "competitors field present in create response"
    );
    assert_eq!(created["tech_approval"], "未接触");
    assert_eq!(created["competitors"], "未知");

    // 2. READ — round-trip.
    let resp = http
        .get(format!("{base_url}/api/projects/{project_id}"))
        .send()
        .await
        .expect("GET /api/projects/{id}");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["tech_approval"], "未接触");
    assert_eq!(fetched["competitors"], "未知");

    // 3. UPDATE CRM fields: 未接触 → 已认可 + competitors list.
    let resp = http
        .put(format!("{base_url}/api/projects/{project_id}"))
        .json(&json!({
            "tech_approval": "已认可",
            "competitors": "竞品 A、竞品 B",
        }))
        .send()
        .await
        .expect("PUT /api/projects/{id}");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["tech_approval"], "已认可");
    assert_eq!(updated["competitors"], "竞品 A、竞品 B");

    // 4. Read back to confirm persistence.
    let resp = http
        .get(format!("{base_url}/api/projects/{project_id}"))
        .send()
        .await
        .expect("GET after update");
    assert_eq!(resp.status(), StatusCode::OK);
    let final_read: Value = resp.json().await.expect("final read JSON");
    assert_eq!(final_read["tech_approval"], "已认可");
    assert_eq!(final_read["competitors"], "竞品 A、竞品 B");

    // 5. DELETE project + client.
    cleanup_project_and_client(&pool, project_id, client_id).await;

    let resp = http
        .get(format!("{base_url}/api/projects/{project_id}"))
        .send()
        .await
        .expect("GET project after delete");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

// =========================================================================
// 5. communications_crud — exercises content, occurred_at, conclusion
// =========================================================================

#[tokio::test]
async fn test_communications_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE communication.
    let resp = http
        .post(format!(
            "{base_url}/api/projects/{project_id}/communications"
        ))
        .json(&json!({
            "content": "首次技术交流：客户对 POC 流程感兴趣",
            "occurred_at": "2026-07-10T10:00:00Z",
            "participants": "张总, 李工",
            "conclusion": "下周安排 POC 环境",
        }))
        .send()
        .await
        .expect("POST communications");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let comm_id = json_id(&created);
    assert_eq!(created["content"], "首次技术交流：客户对 POC 流程感兴趣");
    assert_eq!(created["conclusion"], "下周安排 POC 环境");

    // 2. READ via flat endpoint.
    let resp = http
        .get(format!("{base_url}/api/communications/{comm_id}"))
        .send()
        .await
        .expect("GET communication");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["content"], created["content"]);
    assert_eq!(fetched["project_id"], project_id.to_string());

    // 3. UPDATE content + conclusion.
    let resp = http
        .put(format!("{base_url}/api/communications/{comm_id}"))
        .json(&json!({
            "content": "POC 环境已部署，进入测试阶段",
            "conclusion": "客户确认 POC 范围",
        }))
        .send()
        .await
        .expect("PUT communication");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["content"], "POC 环境已部署，进入测试阶段");

    // 4. DELETE communication.
    let resp = http
        .delete(format!("{base_url}/api/communications/{comm_id}"))
        .send()
        .await
        .expect("DELETE communication");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 5. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 6. tasks_crud — exercises status transitions (todo → current → next)
// =========================================================================

#[tokio::test]
async fn test_tasks_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE task with default status (todo per TaskStatus::ALL).
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/tasks"))
        .json(&json!({
            "title": "准备 POC 测试报告",
            "status": "todo",
            "planned_date": "2026-07-25",
        }))
        .send()
        .await
        .expect("POST task");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let task_id = json_id(&created);
    assert_eq!(created["status"], "todo");
    assert_eq!(created["title"], "准备 POC 测试报告");

    // 2. UPDATE status todo → current (active work).
    let resp = http
        .put(format!("{base_url}/api/tasks/{task_id}"))
        .json(&json!({ "status": "current" }))
        .send()
        .await
        .expect("PUT task → current");
    assert_eq!(resp.status(), StatusCode::OK);
    let current: Value = resp.json().await.expect("update JSON");
    assert_eq!(current["status"], "current");

    // 3. UPDATE status current → next (parked).
    let resp = http
        .put(format!("{base_url}/api/tasks/{task_id}"))
        .json(&json!({ "status": "next" }))
        .send()
        .await
        .expect("PUT task → next");
    assert_eq!(resp.status(), StatusCode::OK);
    let next: Value = resp.json().await.expect("update JSON");
    assert_eq!(next["status"], "next");

    // 4. Invalid status is rejected with 400.
    let resp = http
        .put(format!("{base_url}/api/tasks/{task_id}"))
        .json(&json!({ "status": "completed" }))
        .send()
        .await
        .expect("PUT invalid status");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 5. DELETE task.
    let resp = http
        .delete(format!("{base_url}/api/tasks/{task_id}"))
        .send()
        .await
        .expect("DELETE task");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 6. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 7. phases_crud — exercises tree structure + planned dates
// =========================================================================

#[tokio::test]
async fn test_phases_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE parent phase.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/phases"))
        .json(&json!({
            "name": "POC 阶段",
            "sort_order": 1,
            "planned_start": "2026-07-15T00:00:00Z",
            "planned_end": "2026-08-15T00:00:00Z",
            "status": "pending",
        }))
        .send()
        .await
        .expect("POST parent phase");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let parent: Value = resp.json().await.expect("create JSON");
    let parent_id = json_id(&parent);
    assert_eq!(parent["name"], "POC 阶段");
    assert_eq!(parent["parent_id"], Value::Null);
    assert!(parent["planned_start"].is_string(), "planned_start present");
    assert!(parent["planned_end"].is_string(), "planned_end present");

    // 2. CREATE child phase referencing the parent.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/phases"))
        .json(&json!({
            "name": "环境准备",
            "parent_id": parent_id,
            "sort_order": 1,
            "planned_start": "2026-07-15T00:00:00Z",
            "planned_end": "2026-07-25T00:00:00Z",
        }))
        .send()
        .await
        .expect("POST child phase");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let child: Value = resp.json().await.expect("create JSON");
    let child_id = json_id(&child);
    assert_eq!(child["parent_id"], parent_id.to_string());

    // 3. READ parent — verify the child's `parent_id` resolves correctly.
    let resp = http
        .get(format!("{base_url}/api/phases/{parent_id}"))
        .send()
        .await
        .expect("GET parent phase");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["id"], parent_id.to_string());

    // 4. UPDATE parent's planned dates and description.
    let resp = http
        .put(format!("{base_url}/api/phases/{parent_id}"))
        .json(&json!({
            "description": "客户 POC 全流程",
            "planned_end": "2026-08-30T00:00:00Z",
        }))
        .send()
        .await
        .expect("PUT phase");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["description"], "客户 POC 全流程");
    assert_eq!(updated["planned_end"], "2026-08-30T00:00:00Z");

    // 5. DELETE parent — cascades to child via FK ON DELETE CASCADE.
    let resp = http
        .delete(format!("{base_url}/api/phases/{parent_id}"))
        .send()
        .await
        .expect("DELETE parent phase");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // Child is gone too (cascade).
    let resp = http
        .get(format!("{base_url}/api/phases/{child_id}"))
        .send()
        .await
        .expect("GET child after parent delete");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // 6. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 9. project_assets_crud — exercises type + value
// =========================================================================

#[tokio::test]
async fn test_project_assets_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE asset.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/assets"))
        .json(&json!({
            "name": "Web 应用主站",
            "asset_type": "web_app",
            "value": "https://app.example.com",
            "description": "客户主要业务入口",
        }))
        .send()
        .await
        .expect("POST asset");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let asset_id = json_id(&created);
    assert_eq!(created["name"], "Web 应用主站");
    assert_eq!(created["asset_type"], "web_app");
    assert_eq!(created["value"], "https://app.example.com");

    // 2. READ via flat endpoint.
    let resp = http
        .get(format!("{base_url}/api/assets/{asset_id}"))
        .send()
        .await
        .expect("GET asset");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["asset_type"], "web_app");

    // 3. UPDATE value (e.g. URL changed).
    let resp = http
        .put(format!("{base_url}/api/assets/{asset_id}"))
        .json(&json!({ "value": "https://new-app.example.com" }))
        .send()
        .await
        .expect("PUT asset");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["value"], "https://new-app.example.com");
    // Unchanged fields still round-trip.
    assert_eq!(updated["asset_type"], "web_app");

    // 4. DELETE asset.
    let resp = http
        .delete(format!("{base_url}/api/assets/{asset_id}"))
        .send()
        .await
        .expect("DELETE asset");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 5. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 9b. asset_credentials_crud — multi-credential rows under an asset,
//      typed (password/api_key/...), individually updatable, cascade on
//      asset delete
// =========================================================================

#[tokio::test]
async fn test_asset_credentials_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // Parent asset.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/assets"))
        .json(&json!({ "name": "堡垒机", "asset_type": "server" }))
        .send()
        .await
        .expect("POST asset");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let asset: Value = resp.json().await.expect("asset JSON");
    let asset_id = json_id(&asset);

    // 1. CREATE password credential.
    let resp = http
        .post(format!(
            "{base_url}/api/projects/{project_id}/assets/{asset_id}/credentials"
        ))
        .json(&json!({
            "label": "SSH root",
            "cred_type": "password",
            "username": "root",
            "secret": "s3cret-pw",
        }))
        .send()
        .await
        .expect("POST credential");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let cred_id = json_id(&created);
    assert_eq!(created["label"], "SSH root");
    assert_eq!(created["cred_type"], "password");
    assert_eq!(created["username"], "root");
    assert_eq!(created["secret"], "s3cret-pw");
    assert_eq!(created["asset_id"], asset_id.to_string());

    // 2. LIST — one row so far.
    let list_url = format!("{base_url}/api/projects/{project_id}/assets/{asset_id}/credentials");
    let resp = http.get(&list_url).send().await.expect("GET credentials");
    assert_eq!(resp.status(), StatusCode::OK);
    let list: Vec<Value> = resp.json().await.expect("list JSON");
    assert_eq!(list.len(), 1);

    // 3. Second credential (api_key) appends after the first.
    let resp = http
        .post(&list_url)
        .json(&json!({
            "label": "监控 API Key",
            "cred_type": "api_key",
            "secret": "ak-live-123",
        }))
        .send()
        .await
        .expect("POST second credential");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let second: Value = resp.json().await.expect("second JSON");
    assert_eq!(second["cred_type"], "api_key");
    assert!(second["username"].is_null(), "username omitted → null");

    let resp = http.get(&list_url).send().await.expect("GET credentials");
    let list: Vec<Value> = resp.json().await.expect("list JSON");
    assert_eq!(list.len(), 2);
    assert_eq!(list[0]["label"], "SSH root");
    assert_eq!(list[1]["label"], "监控 API Key");

    // 4. UPDATE — change label + secret; username round-trips unchanged.
    let resp = http
        .put(format!("{base_url}/api/asset-credentials/{cred_id}"))
        .json(&json!({ "label": "SSH 管理", "secret": "rotated-pw" }))
        .send()
        .await
        .expect("PUT credential");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["label"], "SSH 管理");
    assert_eq!(updated["secret"], "rotated-pw");
    assert_eq!(updated["username"], "root");
    assert_eq!(updated["cred_type"], "password");

    // 5. Validation: empty label and unknown cred_type are 400s.
    let resp = http
        .post(&list_url)
        .json(&json!({ "label": "   " }))
        .send()
        .await
        .expect("POST empty label");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
    let resp = http
        .post(&list_url)
        .json(&json!({ "label": "x", "cred_type": "magic" }))
        .send()
        .await
        .expect("POST bad cred_type");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 6. Credentials under an unknown asset → 404.
    let bogus = Uuid::new_v4();
    let resp = http
        .get(format!(
            "{base_url}/api/projects/{project_id}/assets/{bogus}/credentials"
        ))
        .send()
        .await
        .expect("GET unknown asset credentials");
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // 7. DELETE one credential, then verify the asset delete cascades the rest.
    let resp = http
        .delete(format!("{base_url}/api/asset-credentials/{cred_id}"))
        .send()
        .await
        .expect("DELETE credential");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    let resp = http.get(&list_url).send().await.expect("GET credentials");
    let list: Vec<Value> = resp.json().await.expect("list JSON");
    assert_eq!(list.len(), 1);

    // The read-only asset credential_count tracks the remaining row.
    let resp = http
        .get(format!("{base_url}/api/assets/{asset_id}"))
        .send()
        .await
        .expect("GET asset for count");
    let asset_after: Value = resp.json().await.expect("asset JSON");
    assert_eq!(asset_after["credential_count"], 1, "count tracks deletes");

    let resp = http
        .delete(format!("{base_url}/api/assets/{asset_id}"))
        .send()
        .await
        .expect("DELETE asset");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);
    let remaining: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM asset_credentials WHERE asset_id = $1")
            .bind(asset_id)
            .fetch_one(&pool)
            .await
            .expect("count credentials");
    assert_eq!(remaining, 0, "asset delete cascades to credentials");

    // 8. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 10. project_files_crud — LINK type only (avoids multipart upload complexity)
//      exercises source_type="link", url, phase_id linking
// =========================================================================

#[tokio::test]
async fn test_project_files_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // Phase is needed for the phase_id linking check below.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/phases"))
        .json(&json!({
            "name": "POC 阶段",
            "sort_order": 1,
        }))
        .send()
        .await
        .expect("POST phase");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let phase: Value = resp.json().await.expect("phase JSON");
    let phase_id = json_id(&phase);

    // 1. CREATE link via the dedicated `/links` endpoint. The handler
    //    always sets `source_type='link'` and persists the URL verbatim.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/links"))
        .json(&json!({
            "name": "客户架构图",
            "url": "https://docs.example.com/architecture",
            "description": "客户提供的网络拓扑",
            "tags": ["architecture", "reference"],
        }))
        .send()
        .await
        .expect("POST link");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let file_id = json_id(&created);
    assert_eq!(created["source_type"], "link");
    assert_eq!(created["url"], "https://docs.example.com/architecture");
    // The link's display name lives in `original_name` (the field used
    // uniformly for files; links just reuse it instead of inventing a
    // separate `name` column).
    assert_eq!(created["original_name"], "客户架构图");
    assert_eq!(created["tags"][0], "architecture");
    assert_eq!(created["file_size"], 0);

    // 2. READ file — verify source_type + url persist.
    let resp = http
        .get(format!("{base_url}/api/files/{file_id}"))
        .send()
        .await
        .expect("GET file");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["source_type"], "link");
    assert_eq!(fetched["url"], "https://docs.example.com/architecture");
    assert_eq!(fetched["phase_id"], Value::Null);

    // 3. LINK the file to a phase via the dedicated endpoint.
    let resp = http
        .put(format!("{base_url}/api/files/{file_id}/link-phase"))
        .json(&json!({ "phase_id": phase_id }))
        .send()
        .await
        .expect("PUT link-phase");
    assert_eq!(resp.status(), StatusCode::OK);
    let linked: Value = resp.json().await.expect("link JSON");
    assert_eq!(linked["phase_id"], phase_id.to_string());

    // 4. UPDATE description + tags (the only mutable fields on a file).
    let resp = http
        .put(format!("{base_url}/api/files/{file_id}"))
        .json(&json!({
            "description": "客户最新架构图 v2",
            "tags": ["architecture", "latest"],
        }))
        .send()
        .await
        .expect("PUT file");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["description"], "客户最新架构图 v2");
    assert_eq!(updated["tags"][1], "latest");

    // 5. DELETE file.
    let resp = http
        .delete(format!("{base_url}/api/files/{file_id}"))
        .send()
        .await
        .expect("DELETE file");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 6. CLEANUP: project cascade-removes the phase; then delete client.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 11. people_crud — unified team/client people (side + shared role)
// =========================================================================

#[tokio::test]
async fn test_people_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE a team person — role is shared (no separate decision-role field).
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/people"))
        .json(&json!({
            "side": "team",
            "name": "王工",
            "role": "项目负责人",
            "notes": "负责 POC"
        }))
        .send()
        .await
        .expect("POST person");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let person_id = json_id(&created);
    assert_eq!(created["side"], "team");
    assert_eq!(created["name"], "王工");
    assert_eq!(created["role"], "项目负责人");

    // Invalid side is rejected.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/people"))
        .json(&json!({ "side": "wizard", "name": "x" }))
        .send()
        .await
        .expect("POST bad side");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 2. UPDATE role (shared field).
    let resp = http
        .put(format!("{base_url}/api/people/{person_id}"))
        .json(&json!({ "role": "项目负责人" }))
        .send()
        .await
        .expect("PUT person");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["role"], "项目负责人");

    // 3. DELETE.
    let resp = http
        .delete(format!("{base_url}/api/people/{person_id}"))
        .send()
        .await
        .expect("DELETE person");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 12. people_reorder — sort_order is scoped per (project, side)
// =========================================================================

#[tokio::test]
async fn test_people_reorder() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // Three team people append at sort_order 0,1,2 (甲,乙,丙).
    let mut team_ids: Vec<String> = Vec::new();
    for name in ["甲", "乙", "丙"] {
        let row: Value = http
            .post(format!("{base_url}/api/projects/{project_id}/people"))
            .json(&json!({ "side": "team", "name": name }))
            .send()
            .await
            .expect("POST")
            .json()
            .await
            .expect("json");
        team_ids.push(row["id"].as_str().expect("id").to_string());
    }
    // A client person shares the sort_order namespace per-side (independent).
    let _client_person: Value = http
        .post(format!("{base_url}/api/projects/{project_id}/people"))
        .json(&json!({ "side": "client", "name": "客户A" }))
        .send()
        .await
        .expect("POST client")
        .json()
        .await
        .expect("json");

    let names = |rows: &Value, side: &str| {
        rows.as_array()
            .expect("array")
            .iter()
            .filter(|p| p["side"] == side)
            .map(|p| p["name"].as_str().expect("name").to_string())
            .collect::<Vec<_>>()
    };
    let list: Value = http
        .get(format!("{base_url}/api/projects/{project_id}/people"))
        .send()
        .await
        .expect("GET")
        .json()
        .await
        .expect("json");
    assert_eq!(names(&list, "team"), vec!["甲", "乙", "丙"]);

    // Reorder team to reverse; client ordering is untouched.
    let reversed: Vec<&str> = team_ids.iter().rev().map(|s| s.as_str()).collect();
    let resp = http
        .put(format!(
            "{base_url}/api/projects/{project_id}/people/reorder"
        ))
        .json(&json!({ "side": "team", "ids": reversed }))
        .send()
        .await
        .expect("PUT reorder");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    let list: Value = http
        .get(format!("{base_url}/api/projects/{project_id}/people"))
        .send()
        .await
        .expect("GET")
        .json()
        .await
        .expect("json");
    assert_eq!(
        names(&list, "team"),
        vec!["丙", "乙", "甲"],
        "team reordered"
    );
    assert_eq!(names(&list, "client"), vec!["客户A"], "client untouched");

    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 13. people_flip_side — move team ↔ client, role preserved verbatim
// =========================================================================

#[tokio::test]
async fn test_people_flip_side() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // A team person entered by mistake.
    let created: Value = http
        .post(format!("{base_url}/api/projects/{project_id}/people"))
        .json(&json!({ "side": "team", "name": "赵总", "role": "技术总监" }))
        .send()
        .await
        .expect("POST")
        .json()
        .await
        .expect("json");
    let person_id = created["id"].as_str().expect("id").to_string();

    // Flip to client side.
    let resp = http
        .post(format!("{base_url}/api/people/{person_id}/flip-side"))
        .send()
        .await
        .expect("POST flip");
    assert_eq!(resp.status(), StatusCode::OK);
    let moved: Value = resp.json().await.expect("json");
    assert_eq!(moved["side"], "client", "now on client side");
    assert_eq!(
        moved["role"], "技术总监",
        "role carried verbatim — NO conversion"
    );
    assert_eq!(moved["id"], person_id, "same row, same id");

    // The person now appears under client, not team.
    let list: Value = http
        .get(format!("{base_url}/api/projects/{project_id}/people"))
        .send()
        .await
        .expect("GET")
        .json()
        .await
        .expect("json");
    let sides: Vec<&str> = list
        .as_array()
        .expect("array")
        .iter()
        .map(|p| p["side"].as_str().expect("side"))
        .collect();
    assert_eq!(sides, vec!["client"], "only client side now");

    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 14. issues_crud — customer concerns, three-state status
// =========================================================================

#[tokio::test]
async fn test_issues_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE issue with defaults (open / normal).
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/issues"))
        .json(&json!({
            "title": "客户担心数据安全",
            "description": "希望数据不出境",
        }))
        .send()
        .await
        .expect("POST issue");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let issue_id = json_id(&created);
    assert_eq!(created["status"], "open");
    assert_eq!(created["priority"], "normal");
    assert_eq!(created["title"], "客户担心数据安全");

    // 2. UPDATE status open → in_progress.
    let resp = http
        .put(format!("{base_url}/api/issues/{issue_id}"))
        .json(&json!({ "status": "in_progress" }))
        .send()
        .await
        .expect("PUT issue → in_progress");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["status"], "in_progress");

    // 3. UPDATE status → resolved + priority → urgent.
    let resp = http
        .put(format!("{base_url}/api/issues/{issue_id}"))
        .json(&json!({ "status": "resolved", "priority": "urgent" }))
        .send()
        .await
        .expect("PUT issue → resolved");
    assert_eq!(resp.status(), StatusCode::OK);
    let resolved: Value = resp.json().await.expect("update JSON");
    assert_eq!(resolved["status"], "resolved");
    assert_eq!(resolved["priority"], "urgent");

    // 4. Invalid status is rejected with 400.
    let resp = http
        .put(format!("{base_url}/api/issues/{issue_id}"))
        .json(&json!({ "status": "completed" }))
        .send()
        .await
        .expect("PUT invalid status");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 5. Invalid priority is rejected with 400.
    let resp = http
        .put(format!("{base_url}/api/issues/{issue_id}"))
        .json(&json!({ "priority": "critical" }))
        .send()
        .await
        .expect("PUT invalid priority");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 6. DELETE issue.
    let resp = http
        .delete(format!("{base_url}/api/issues/{issue_id}"))
        .send()
        .await
        .expect("DELETE issue");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 7. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 15. findings_crud — product findings, light feedback tracking
// =========================================================================

#[tokio::test]
async fn test_findings_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = http_client();
    let suffix = Uuid::new_v4();

    auth_login(&http, &base_url).await;

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE finding (third-party product, default unreported).
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/findings"))
        .json(&json!({
            "title": "对象存储偶发超时",
            "product": "对象存储 OSS",
            "product_source": "third_party",
            "vendor": "阿里云",
        }))
        .send()
        .await
        .expect("POST finding");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let finding_id = json_id(&created);
    assert_eq!(created["feedback_status"], "unreported");
    assert_eq!(created["product_source"], "third_party");
    assert_eq!(created["vendor"], "阿里云");

    // 2. UPDATE feedback_status unreported → reported.
    let resp = http
        .put(format!("{base_url}/api/findings/{finding_id}"))
        .json(&json!({ "feedback_status": "reported" }))
        .send()
        .await
        .expect("PUT finding → reported");
    assert_eq!(resp.status(), StatusCode::OK);
    let reported: Value = resp.json().await.expect("update JSON");
    assert_eq!(reported["feedback_status"], "reported");

    // 3. UPDATE product_source third_party → ours.
    let resp = http
        .put(format!("{base_url}/api/findings/{finding_id}"))
        .json(&json!({ "product_source": "ours" }))
        .send()
        .await
        .expect("PUT finding → ours");
    assert_eq!(resp.status(), StatusCode::OK);
    let ours: Value = resp.json().await.expect("update JSON");
    assert_eq!(ours["product_source"], "ours");

    // 4. CREATE with invalid product_source is rejected with 400.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/findings"))
        .json(&json!({
            "title": "bad source",
            "product_source": "competitor",
        }))
        .send()
        .await
        .expect("POST invalid product_source");
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 5. DELETE finding.
    let resp = http
        .delete(format!("{base_url}/api/findings/{finding_id}"))
        .send()
        .await
        .expect("DELETE finding");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 6. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 17. auth_password_change — dedicated user, password change revokes the
//      user's OTHER sessions but keeps the current one; old password dies
// =========================================================================

#[tokio::test]
async fn test_auth_password_change() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let suffix = Uuid::new_v4();

    // Dedicated user (setup only allows one account, so insert directly).
    // argon2id PHC via the same crate the backend uses.
    use argon2::{
        password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
        Argon2,
    };
    let username = format!("pw-change-{suffix}@test.local");
    let old_pass = "old-password-123";
    let hash = Argon2::default()
        .hash_password(old_pass.as_bytes(), &SaltString::generate(&mut OsRng))
        .expect("hash old password")
        .to_string();
    sqlx::query(
        "INSERT INTO users (username, password_hash, display_name) VALUES ($1, $2, 'pw test')",
    )
    .bind(&username)
    .bind(&hash)
    .execute(&pool)
    .await
    .expect("insert dedicated user");

    // Two independent sessions for the same user.
    let client1 = http_client();
    let client2 = http_client();
    let login = |client: &reqwest::Client, password: &str| {
        let client = client.clone();
        let username = username.clone();
        let password = password.to_string();
        let base_url = base_url.clone();
        async move {
            client
                .post(format!("{base_url}/api/auth/login"))
                .json(&json!({ "username": username, "password": password }))
                .send()
                .await
                .expect("POST login")
        }
    };
    let resp = login(&client1, old_pass).await;
    assert_eq!(resp.status(), StatusCode::OK, "session A login");
    let resp = login(&client2, old_pass).await;
    assert_eq!(resp.status(), StatusCode::OK, "session B login");

    // Both sessions make one authenticated call (the SPA's /me probe) —
    // this anchors their ownership rows in `user_sessions`, which is what
    // lets the password change revoke them precisely.
    for client in [&client1, &client2] {
        let resp = client
            .get(format!("{base_url}/api/auth/me"))
            .send()
            .await
            .expect("GET me");
        assert_eq!(resp.status(), StatusCode::OK, "me before change");
    }

    let change = |client: &reqwest::Client, current: &str, next: &str| {
        let client = client.clone();
        let current = current.to_string();
        let next = next.to_string();
        let base_url = base_url.clone();
        async move {
            client
                .post(format!("{base_url}/api/auth/password"))
                .json(&json!({
                    "current_password": current,
                    "new_password": next,
                }))
                .send()
                .await
                .expect("POST /api/auth/password")
        }
    };

    // 0. Unauthenticated call → 401 (route self-guards on the public router).
    let resp = reqwest::Client::new()
        .post(format!("{base_url}/api/auth/password"))
        .json(&json!({ "current_password": "x", "new_password": "y1234567" }))
        .send()
        .await
        .expect("POST password anonymous");
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "anon → 401");

    // 1. Wrong current password → 400.
    let resp = change(&client1, "not-the-password", "brand-new-pw-456").await;
    assert_eq!(
        resp.status(),
        StatusCode::BAD_REQUEST,
        "wrong current → 400"
    );

    // 2. Too-short new password → 400.
    let resp = change(&client1, old_pass, "short").await;
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST, "short new → 400");

    // 3. Correct change → 204.
    let new_pass = "brand-new-pw-456";
    let resp = change(&client1, old_pass, new_pass).await;
    assert_eq!(resp.status(), StatusCode::NO_CONTENT, "change → 204");

    // 4. The OTHER session is revoked; the current one survives.
    let resp = client2
        .get(format!("{base_url}/api/auth/me"))
        .send()
        .await
        .expect("GET me on session B");
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "session B revoked");
    let resp = client1
        .get(format!("{base_url}/api/auth/me"))
        .send()
        .await
        .expect("GET me on session A");
    assert_eq!(resp.status(), StatusCode::OK, "current session survives");

    // 5. Old password no longer logs in; the new one does.
    let resp = login(&client2, old_pass).await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "old password dead");
    let resp = login(&client2, new_pass).await;
    assert_eq!(resp.status(), StatusCode::OK, "new password works");

    // CLEANUP — dedicated user row only.
    sqlx::query("DELETE FROM users WHERE username = $1")
        .bind(&username)
        .execute(&pool)
        .await
        .expect("delete dedicated user");
}

// =========================================================================
// 18. login_rate_limit — 5 consecutive failures lock logins for a while,
//      even for correct credentials afterwards
// =========================================================================

#[tokio::test]
async fn test_login_rate_limit() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;

    // Warm the shared account (idempotent) so "correct credentials" below
    // genuinely are correct.
    let http = http_client();
    auth_login(&http, &base_url).await;

    // 1. Burn the failure budget: 5 × wrong password → 401 each. The fifth
    //    failure trips the lockout (it still answers 401 for that attempt).
    for i in 0..5 {
        let resp = http
            .post(format!("{base_url}/api/auth/login"))
            .json(&json!({ "username": SMOKE_USER, "password": format!("wrong-{i}") }))
            .send()
            .await
            .expect("POST login failure");
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "attempt {i}");
    }

    // 2. While locked, even CORRECT credentials are rejected with 429.
    let resp = http
        .post(format!("{base_url}/api/auth/login"))
        .json(&json!({ "username": SMOKE_USER, "password": SMOKE_PASS }))
        .send()
        .await
        .expect("POST login while locked");
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS, "locked → 429");
    let body: Value = resp.json().await.expect("429 body");
    assert_eq!(body["error"], "rate_limited", "rate_limited code");

    // 3. Even CORRECT credentials are rejected while locked.
    let resp = http
        .post(format!("{base_url}/api/auth/login"))
        .json(&json!({ "username": SMOKE_USER, "password": SMOKE_PASS }))
        .send()
        .await
        .expect("POST login while locked");
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS, "locked → 429");

    // 4. Anonymous business endpoint still fails closed with 401 (not 429):
    //    the throttle guards login only, never the authenticated surface.
    let resp = reqwest::Client::new()
        .get(format!("{base_url}/api/clients"))
        .send()
        .await
        .expect("GET clients during lockout");
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

// =========================================================================
// 16. auth_flow — setup/login/me/logout + fail-closed guard
// =========================================================================

#[tokio::test]
async fn test_auth_flow() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let anon = reqwest::Client::new(); // no session at all

    // 0. Fail-closed: anonymous access to a business endpoint → 401.
    let resp = anon
        .get(format!("{base_url}/api/clients"))
        .send()
        .await
        .expect("GET /api/clients unauthenticated");
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "fail-closed 401");
    let body: Value = resp.json().await.expect("401 body");
    assert_eq!(body["error"], "unauthorized", "error envelope code");

    // 0.1 Whitelist: health + auth status stay open.
    let resp = anon
        .get(format!("{base_url}/api/health"))
        .send()
        .await
        .expect("GET /api/health");
    assert_eq!(resp.status(), StatusCode::OK, "health whitelisted");
    let resp = anon
        .get(format!("{base_url}/api/auth/status"))
        .send()
        .await
        .expect("GET /api/auth/status");
    assert_eq!(resp.status(), StatusCode::OK, "status whitelisted");

    // 1. Setup the shared account (idempotent). On a fresh smoke DB the
    //    parallel tests race setup; the loser's INSERT hits a unique
    //    violation, which `AppError` maps to 400 `conflict` (distinct from
    //    the deterministic 409 when users is already non-empty) — accept it.
    let http = http_client();
    let resp = http
        .post(format!("{base_url}/api/auth/setup"))
        .json(&json!({ "username": SMOKE_USER, "password": SMOKE_PASS }))
        .send()
        .await
        .expect("POST setup");
    let setup_status = resp.status();
    let setup_body: Value = resp.json().await.unwrap_or(Value::Null);
    assert!(
        setup_status == StatusCode::CREATED
            || setup_status == StatusCode::CONFLICT
            || (setup_status == StatusCode::BAD_REQUEST && setup_body["error"] == "conflict"),
        "setup creates or conflicts, got {setup_status} {setup_body:?}"
    );

    // 2. Re-running setup after an account exists → 409.
    let resp = http
        .post(format!("{base_url}/api/auth/setup"))
        .json(&json!({ "username": "other@x.y", "password": "password123" }))
        .send()
        .await
        .expect("POST setup again");
    assert_eq!(resp.status(), StatusCode::CONFLICT, "second setup → 409");

    // 3. Wrong password → 401 with a generic message.
    let resp = http
        .post(format!("{base_url}/api/auth/login"))
        .json(&json!({ "username": SMOKE_USER, "password": "wrong-password" }))
        .send()
        .await
        .expect("POST login wrong password");
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED, "bad creds → 401");
    let body: Value = resp.json().await.expect("401 body");
    assert_eq!(body["error"], "unauthorized");
    assert_eq!(
        body["message"], "invalid username or password",
        "no enumeration"
    );

    // 4. Correct login → 200 + cookie; /me resolves the user.
    auth_login(&http, &base_url).await;
    let resp = http
        .get(format!("{base_url}/api/auth/me"))
        .send()
        .await
        .expect("GET /api/auth/me");
    assert_eq!(resp.status(), StatusCode::OK, "me after login");
    let me: Value = resp.json().await.expect("me JSON");
    assert_eq!(me["username"], SMOKE_USER);
    assert!(
        me.get("password_hash").is_none(),
        "no password material in /me"
    );

    // 5. Authenticated business access works.
    let resp = http
        .get(format!("{base_url}/api/clients"))
        .send()
        .await
        .expect("GET /api/clients authenticated");
    assert_eq!(
        resp.status(),
        StatusCode::OK,
        "business access with session"
    );

    // 6. Logout → 204, and the session is dead afterwards.
    let resp = http
        .post(format!("{base_url}/api/auth/logout"))
        .send()
        .await
        .expect("POST logout");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT, "logout 204");
    let resp = http
        .get(format!("{base_url}/api/auth/me"))
        .send()
        .await
        .expect("GET /api/auth/me after logout");
    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "me after logout → 401"
    );
    let resp = http
        .get(format!("{base_url}/api/clients"))
        .send()
        .await
        .expect("GET /api/clients after logout");
    assert_eq!(
        resp.status(),
        StatusCode::UNAUTHORIZED,
        "business after logout → 401"
    );
}
