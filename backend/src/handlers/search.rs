//! Global search — cross-resource keyword query.

use axum::{
    extract::{Query, State},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::state::AppState;

pub fn search_router() -> Router<AppState> {
    Router::new().route("/search", axum::routing::get(search))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub resource: String,
    pub id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub project_id: Option<String>,
}

async fn search(
    State(pool): State<PgPool>,
    Query(params): Query<SearchQuery>,
) -> Json<Vec<SearchHit>> {
    let q = format!("%{}%", params.q.trim());
    let mut hits = Vec::new();

    // Projects
    let rows = sqlx::query!(
        r#"SELECT id, name, phase FROM projects
           WHERE name ILIKE $1 OR phase ILIKE $1 OR competitors ILIKE $1
           LIMIT 10"#,
        q
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    for r in rows {
        hits.push(SearchHit {
            resource: "project".into(),
            id: r.id.to_string(),
            title: r.name,
            subtitle: r.phase,
            project_id: None,
        });
    }

    // Clients
    let rows = sqlx::query!(
        r#"SELECT id, name, contact_person FROM clients
           WHERE name ILIKE $1 OR contact_person ILIKE $1
           LIMIT 10"#,
        q
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    for r in rows {
        hits.push(SearchHit {
            resource: "client".into(),
            id: r.id.to_string(),
            title: r.name,
            subtitle: r.contact_person,
            project_id: None,
        });
    }

    // Communications
    let rows = sqlx::query!(
        r#"SELECT id, project_id, left(content, 80) AS preview FROM communications
           WHERE content ILIKE $1 OR participants ILIKE $1
           LIMIT 10"#,
        q
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    for r in rows {
        hits.push(SearchHit {
            resource: "communication".into(),
            id: r.id.to_string(),
            title: r.preview.unwrap_or_default(),
            subtitle: None,
            project_id: Some(r.project_id.to_string()),
        });
    }

    // Tasks
    let rows = sqlx::query!(
        r#"SELECT id, project_id, title FROM tasks
           WHERE title ILIKE $1
           LIMIT 10"#,
        q
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    for r in rows {
        hits.push(SearchHit {
            resource: "task".into(),
            id: r.id.to_string(),
            title: r.title,
            subtitle: None,
            project_id: Some(r.project_id.to_string()),
        });
    }

    // People
    let rows = sqlx::query!(
        r#"SELECT id, project_id, name, role FROM people
           WHERE name ILIKE $1 OR role ILIKE $1
           LIMIT 10"#,
        q
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    for r in rows {
        hits.push(SearchHit {
            resource: "person".into(),
            id: r.id.to_string(),
            title: r.name,
            subtitle: r.role,
            project_id: Some(r.project_id.to_string()),
        });
    }

    Json(hits)
}
