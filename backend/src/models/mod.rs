//! Domain models for the four core resources.
//!
//! Each submodule owns:
//! 1. The "row" struct (matches the DB schema 1:1, derives `sqlx::FromRow`).
//! 2. Create/Update DTO structs (decoupled from the row so internal
//!    fields like `id`/`created_at` can't be smuggled in from JSON).

pub mod asset;
pub mod client;
pub mod communication;
pub mod person;
pub mod phase;
pub mod project;
pub mod project_file;
pub mod task;

pub use client::{Client, CreateClient, UpdateClient};
pub use communication::{
    Communication, CommunicationWithProject, CreateCommunication, UpdateCommunication,
};
pub use project::{CreateProject, Project, ProjectStatus, TechApprovalStatus, UpdateProject};
pub use task::{CreateTask, Task, TaskStatus, UpdateTask};
pub use asset::{Asset, CreateAsset, UpdateAsset};
pub use project_file::{CreateLink, FileMeta, FileWithProject, ProjectFile, UpdateFile};
pub use phase::{CreatePhase, Phase, UpdatePhase};
pub use person::{CreatePerson, Person, PersonSide, UpdatePerson};

// `#[ts(export)]` on every annotated struct auto-generates a
// `#[test] fn export_bindings_<typename>()` that calls `Self::export_all()`.
// Running `cargo test` (or any subset including those tests) writes the
// TypeScript bindings into `frontend/src/types/generated/` per the
// per-struct `export_to` paths.
