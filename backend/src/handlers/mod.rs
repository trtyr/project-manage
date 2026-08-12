//! HTTP handler modules, one per resource.
//!
//! Each handler is an `async fn` returning `AppResult<impl IntoResponse>`
//! so axum can turn the result into a proper status code + JSON body.

pub mod assets;
pub mod clients;
pub mod communications;
pub mod files;
pub mod people;
pub mod phases;
pub mod projects;
pub mod tasks;

pub use clients::clients_router;
pub use communications::{communications_router, project_communications_router};
pub use projects::projects_router;
pub use tasks::{project_tasks_router, tasks_router};
pub use assets::{assets_router, project_assets_router};
pub use files::{files_router, project_files_router};
pub use phases::{phases_router, project_phases_router};
pub use people::{people_router, project_people_router};
