//! Client (客户) HTTP handlers.
//!
//! Routes:
//! - `GET    /api/clients`              → list all
//! - `POST   /api/clients`              → create
//! - `GET    /api/clients/:id`          → read one
//! - `PUT    /api/clients/:id`          → partial update
//! - `DELETE /api/clients/:id`          → remove

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{Client, CreateClient, UpdateClient};
use crate::state::AppState;

pub fn clients_router() -> Router<AppState> {
    Router::new()
        .route("/clients", get(list).post(create))
        .route("/clients/{id}", get(get_one).put(update).delete(remove))
}

/// `GET /api/clients`
async fn list(State(pool): State<PgPool>) -> AppResult<Json<Vec<Client>>> {
    let rows = sqlx::query_as!(
        Client,
        r#"SELECT id,
                  name,
                  contact_person,
                  contact_info,
                  notes,
                  products       AS "products!: Vec<String>",
                  security_concerns AS "security_concerns!: Vec<String>",
                  background_info,
                  created_at,
                  updated_at
           FROM clients
           ORDER BY created_at DESC"#
    )
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

/// `POST /api/clients`
async fn create(
    State(pool): State<PgPool>,
    Json(input): Json<CreateClient>,
) -> AppResult<impl IntoResponse> {
    if input.name.trim().is_empty() {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }

    let row = sqlx::query_as!(
        Client,
        r#"INSERT INTO clients (
               name, contact_person, contact_info, notes,
               products, security_concerns, background_info
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id,
                     name,
                     contact_person,
                     contact_info,
                     notes,
                     products       AS "products!: Vec<String>",
                     security_concerns AS "security_concerns!: Vec<String>",
                     background_info,
                     created_at,
                     updated_at"#,
        input.name,
        input.contact_person,
        input.contact_info,
        input.notes,
        input.products.as_slice(),
        input.security_concerns.as_slice(),
        input.background_info,
    )
    .fetch_one(&pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

/// `GET /api/clients/:id`
async fn get_one(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<Json<Client>> {
    let row = sqlx::query_as!(
        Client,
        r#"SELECT id,
                  name,
                  contact_person,
                  contact_info,
                  notes,
                  products       AS "products!: Vec<String>",
                  security_concerns AS "security_concerns!: Vec<String>",
                  background_info,
                  created_at,
                  updated_at
           FROM clients
           WHERE id = $1"#,
        id
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("client {id} not found")))?;

    Ok(Json(row))
}

/// `PUT /api/clients/:id` — every column is optional; missing = unchanged.
async fn update(
    State(pool): State<PgPool>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateClient>,
) -> AppResult<Json<Client>> {
    if let Some(name) = &input.name
        && name.trim().is_empty()
    {
        return Err(AppError::BadRequest("name must not be empty".into()));
    }

    // COALESCE pattern: if the optional is None, the SQL keeps the
    // existing column value; if Some(v), it sets v.
    let row = sqlx::query_as!(
        Client,
        r#"UPDATE clients
           SET name             = COALESCE($2, name),
               contact_person   = COALESCE($3, contact_person),
               contact_info     = COALESCE($4, contact_info),
               notes            = COALESCE($5, notes),
               products         = COALESCE($6, products),
               security_concerns = COALESCE($7, security_concerns),
               background_info  = COALESCE($8, background_info)
           WHERE id = $1
           RETURNING id,
                     name,
                     contact_person,
                     contact_info,
                     notes,
                     products       AS "products!: Vec<String>",
                     security_concerns AS "security_concerns!: Vec<String>",
                     background_info,
                     created_at,
                     updated_at"#,
        id,
        input.name,
        input.contact_person,
        input.contact_info,
        input.notes,
        input.products.as_deref(),
        input.security_concerns.as_deref(),
        input.background_info,
    )
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("client {id} not found")))?;

    Ok(Json(row))
}

/// `DELETE /api/clients/:id`
async fn remove(State(pool): State<PgPool>, Path(id): Path<Uuid>) -> AppResult<StatusCode> {
    let res = sqlx::query!("DELETE FROM clients WHERE id = $1", id)
        .execute(&pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("client {id} not found")));
    }
    Ok(StatusCode::NO_CONTENT)
}
