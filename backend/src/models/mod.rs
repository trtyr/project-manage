//! Domain models for the four core resources.
//!
//! Each submodule owns:
//! 1. The "row" struct (matches the DB schema 1:1, derives `sqlx::FromRow`).
//! 2. Create/Update DTO structs (decoupled from the row so internal
//!    fields like `id`/`created_at` can't be smuggled in from JSON).

pub mod client;
pub mod communication;
pub mod project;
pub mod task;
pub mod asset;
pub mod project_file;
pub mod phase;
pub mod member;
pub mod client_contact;

pub use client::{Client, CreateClient, UpdateClient};
pub use communication::{Communication, CommunicationWithProject, CreateCommunication, UpdateCommunication};
pub use project::{
    CreateProject, Project, ProjectStatus, TechApprovalStatus, UpdateProject,
};
pub use task::{CreateTask, Task, TaskStatus, UpdateTask};
pub use asset::{Asset, CreateAsset, UpdateAsset};
pub use project_file::{CreateLink, FileMeta, FileWithProject, ProjectFile, UpdateFile};
pub use phase::{CreatePhase, Phase, UpdatePhase};
pub use member::{CreateMember, Member, UpdateMember};
pub use client_contact::{ClientContact, CreateClientContact, UpdateClientContact};

// `#[ts(export)]` on every annotated struct auto-generates a
// `#[test] fn export_bindings_<typename>()` that calls `Self::export_all()`.
// Running `cargo test` (or any subset including those tests) writes the
// TypeScript bindings into `frontend/src/types/generated/` per the
// per-struct `export_to` paths.
