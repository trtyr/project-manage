//! Smoke tests — full module CRUD + CRM field verification.
//!
//! Each test:
//! 1. Opens its own `PgPool` from `DATABASE_URL`.
//! 2. Starts an Axum test server on a random loopback port via
//!    `sec_tracker_backend::app::build_app`.
//! 3. Performs CREATE → READ → UPDATE → DELETE over HTTP and asserts
//!    each response status + body shape.
//! 4. Cleans up rows at the end (idempotent with the CRUD DELETE step).
//!
//! Tests are independent — they bind to `127.0.0.1:0` (random port) and
//! use unique UUID suffixes in test resource names so they can run in
//! parallel without `#[serial]`.
//!
//! Run with:
//!   export DATABASE_URL=postgres://localhost:5432/sec_tracker
//!   cargo test --test smoke -- --nocapture
//!
//! Or via the `just smoke` recipe (sets up env via `.cargo/config.toml`).

use reqwest::StatusCode;
use serde_json::{json, Value};
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

use sec_tracker_backend::app::build_app;

/// Per-request timeout for the test server. Matches production's
/// `REQUEST_TIMEOUT_SECS` constant in `main.rs`.
const TEST_TIMEOUT_SECS: u64 = 30;
/// 100 MiB body cap. Plenty of room for any test JSON payload.
const TEST_BODY_LIMIT_BYTES: usize = 100 * 1024 * 1024;

/// Start an Axum test server on a random loopback port. Returns the
/// base URL (e.g. `http://127.0.0.1:34567`). Polls `/api/health` until
/// it returns 200 — gives the listening socket time to actually accept
/// before the first real test request fires.
async fn start_test_server(pool: PgPool) -> String {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = build_app(
        pool,
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

/// Open a fresh pool from `DATABASE_URL`. `cargo test` propagates the
/// `[env]` section from `.cargo/config.toml` to the test process, so
/// the variable is normally set without an explicit `export`.
async fn connect_pool() -> PgPool {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set for smoke tests");
    PgPool::connect(&url)
        .await
        .expect("connect to PostgreSQL")
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
// 2. clients_crud — also exercises products[], security_concerns[], background_info
// =========================================================================

#[tokio::test]
async fn test_clients_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();
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
            "security_concerns": ["数据泄露", "合规审计"],
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
    assert_eq!(created["security_concerns"][0], "数据泄露");
    assert_eq!(created["security_concerns"][1], "合规审计");
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
    assert_eq!(fetched["security_concerns"][1], "合规审计");

    // 3. UPDATE — patch notes, products[], security_concerns[] simultaneously.
    let resp = http
        .put(format!("{base_url}/api/clients/{client_id}"))
        .json(&json!({
            "notes": "smoke test note",
            "products": ["网关", "日志系统", "监控系统"],
            "security_concerns": ["合规审计"],
        }))
        .send()
        .await
        .expect("PUT /api/clients/{id}");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["notes"], "smoke test note");
    assert_eq!(updated["products"].as_array().unwrap().len(), 3);
    assert_eq!(updated["security_concerns"].as_array().unwrap().len(), 1);
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
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

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
            "competitors": "示例厂商、示例厂商",
        }))
        .send()
        .await
        .expect("PUT /api/projects/{id}");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["tech_approval"], "已认可");
    assert_eq!(updated["competitors"], "示例厂商、示例厂商");

    // 4. Read back to confirm persistence.
    let resp = http
        .get(format!("{base_url}/api/projects/{project_id}"))
        .send()
        .await
        .expect("GET after update");
    assert_eq!(resp.status(), StatusCode::OK);
    let final_read: Value = resp.json().await.expect("final read JSON");
    assert_eq!(final_read["tech_approval"], "已认可");
    assert_eq!(final_read["competitors"], "示例厂商、示例厂商");

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
// 4. project_contacts_crud — also exercises CRM field role_type
// =========================================================================

#[tokio::test]
async fn test_project_contacts_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE contact with role_type.
    let resp = http
        .post(format!(
            "{base_url}/api/projects/{project_id}/contacts"
        ))
        .json(&json!({
            "name": "张总",
            "role_type": "决策者",
            "notes": "CTO, 决策链顶端",
        }))
        .send()
        .await
        .expect("POST contacts");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let contact_id = json_id(&created);

    // CRM field round-trips in the response.
    assert_eq!(created["role_type"], "决策者");
    assert_eq!(created["name"], "张总");

    // 2. READ contact via flat endpoint.
    let resp = http
        .get(format!("{base_url}/api/contacts/{contact_id}"))
        .send()
        .await
        .expect("GET contact");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["role_type"], "决策者");
    assert_eq!(fetched["project_id"], project_id.to_string());

    // 3. UPDATE role_type to a different decision-chain value.
    let resp = http
        .put(format!("{base_url}/api/contacts/{contact_id}"))
        .json(&json!({ "role_type": "技术评估人" }))
        .send()
        .await
        .expect("PUT contact");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["role_type"], "技术评估人");

    // 4. DELETE contact.
    let resp = http
        .delete(format!("{base_url}/api/contacts/{contact_id}"))
        .send()
        .await
        .expect("DELETE contact");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 5. CLEANUP: project cascade-removes any surviving contacts, then client.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 5. communications_crud — exercises content, occurred_at, conclusion
// =========================================================================

#[tokio::test]
async fn test_communications_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

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
    assert_eq!(
        created["content"],
        "首次技术交流：客户对 POC 流程感兴趣"
    );
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
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

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
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

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
// 8. project_members_crud — exercises name + role
// =========================================================================

#[tokio::test]
async fn test_project_members_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

    let client = create_test_client(&http, &base_url, &suffix).await;
    let client_id = json_id(&client);
    let project = create_test_project(&http, &base_url, &client_id.to_string(), &suffix).await;
    let project_id = json_id(&project);

    // 1. CREATE member.
    let resp = http
        .post(format!("{base_url}/api/projects/{project_id}/members"))
        .json(&json!({
            "name": "王工",
            "role": "售前工程师",
            "notes": "负责 POC 演示",
        }))
        .send()
        .await
        .expect("POST member");
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Value = resp.json().await.expect("create JSON");
    let member_id = json_id(&created);
    assert_eq!(created["name"], "王工");
    assert_eq!(created["role"], "售前工程师");

    // 2. READ via flat endpoint.
    let resp = http
        .get(format!("{base_url}/api/members/{member_id}"))
        .send()
        .await
        .expect("GET member");
    assert_eq!(resp.status(), StatusCode::OK);
    let fetched: Value = resp.json().await.expect("read JSON");
    assert_eq!(fetched["project_id"], project_id.to_string());

    // 3. UPDATE role.
    let resp = http
        .put(format!("{base_url}/api/members/{member_id}"))
        .json(&json!({ "role": "项目负责人" }))
        .send()
        .await
        .expect("PUT member");
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Value = resp.json().await.expect("update JSON");
    assert_eq!(updated["role"], "项目负责人");

    // 4. DELETE member.
    let resp = http
        .delete(format!("{base_url}/api/members/{member_id}"))
        .send()
        .await
        .expect("DELETE member");
    assert_eq!(resp.status(), StatusCode::NO_CONTENT);

    // 5. CLEANUP.
    cleanup_project_and_client(&pool, project_id, client_id).await;
}

// =========================================================================
// 9. project_assets_crud — exercises type + value
// =========================================================================

#[tokio::test]
async fn test_project_assets_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

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
// 10. project_files_crud — LINK type only (avoids multipart upload complexity)
//      exercises source_type="link", url, phase_id linking
// =========================================================================

#[tokio::test]
async fn test_project_files_crud() {
    let pool = connect_pool().await;
    let base_url = start_test_server(pool.clone()).await;
    let http = reqwest::Client::new();
    let suffix = Uuid::new_v4();

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