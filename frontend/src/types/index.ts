// Type definitions — mirrors backend models (backend/src/models/)
//
// Auto-generated types live in `./generated/` — run
//   cargo test --manifest-path backend/Cargo.toml
// to regenerate after changing a Rust model.
//
// Most types are direct re-exports of the generated bindings. A few
// shapes are normalised here so the wire JSON contract (e.g. serde's
// `#[serde(default)]` defaults) matches what the frontend already uses:
//   - `Vec<String>` fields with `#[serde(default)]` are mapped to
//     optional `string[]` instead of ts-rs's required `Array<string>`.
//   - `String` status fields get narrowed to the status union (the DB
//     stores them as free-form text; the API contract restricts values).
//   - `ProjectFile` is the frontend-facing name for `FileMeta` (the Rust
//     `ProjectFile` row carries internal `stored_name`/`file_path` and
//     is intentionally not exported).

import type { Asset as GeneratedAsset } from './generated/Asset'
import type { Client as GeneratedClient } from './generated/Client'
import type {
  ClientContact as GeneratedClientContact,
} from './generated/ClientContact'
import type {
  Communication as GeneratedCommunication,
} from './generated/Communication'
import type {
  CommunicationWithProject as GeneratedCommunicationWithProject,
} from './generated/CommunicationWithProject'
import type { CreateAsset } from './generated/CreateAsset'
import type {
  CreateClient as GeneratedCreateClient,
} from './generated/CreateClient'
import type {
  CreateClientContact,
} from './generated/CreateClientContact'
import type { CreateCommunication } from './generated/CreateCommunication'
import type { CreateLink as GeneratedCreateLink } from './generated/CreateLink'
import type { CreateMember } from './generated/CreateMember'
import type { CreatePhase } from './generated/CreatePhase'
import type {
  CreateProject as GeneratedCreateProject,
} from './generated/CreateProject'
import type { CreateTask as GeneratedCreateTask } from './generated/CreateTask'
import type { FileMeta } from './generated/FileMeta'
import type { FileWithProject } from './generated/FileWithProject'
import type { Member as GeneratedMember } from './generated/Member'
import type { Phase as GeneratedPhase } from './generated/Phase'
import type { Project as GeneratedProject } from './generated/Project'
import type { Task as GeneratedTask } from './generated/Task'
import type {
  UpdateProject as GeneratedUpdateProject,
} from './generated/UpdateProject'
import type { UpdateAsset } from './generated/UpdateAsset'
import type { UpdateClient } from './generated/UpdateClient'
import type { UpdateClientContact } from './generated/UpdateClientContact'
import type { UpdateCommunication } from './generated/UpdateCommunication'
import type { UpdateFile } from './generated/UpdateFile'
import type { UpdateMember } from './generated/UpdateMember'
import type { UpdatePhase } from './generated/UpdatePhase'
import type { UpdateTask as GeneratedUpdateTask } from './generated/UpdateTask'

// --- Primitive aliases (kept manual — ts-rs emits `string` for all) ---

export type UUID = string

export type ISODateTime = string
export type ISODate = string

// --- Status unions (Rust keeps these as `String` + `*Status::ALL`) ---

export type ProjectStatus = 'in_progress' | 'completed' | 'paused'

export type TechApprovalStatus = '未接触' | 'POC中' | '已认可' | '技术否决'

export type RoleType = string

export type TaskStatus = 'current' | 'next' | 'todo'

// `source_type` is a `String` in Rust; keep the narrow union here so call
// sites that construct a `ProjectFile` get autocomplete and typo detection.
// Reads (e.g. `r.source_type === 'link'`) keep working because `'link'`
// remains assignable to the wider generated `string` field.
export type ProjectFileSourceType = 'file' | 'link'

// --- Row types (direct re-exports) ---

export type Client = GeneratedClient
export type Communication = GeneratedCommunication
export type CommunicationWithProject = GeneratedCommunicationWithProject
export type Project = GeneratedProject
export type Task = GeneratedTask
export type Asset = GeneratedAsset
export type Phase = GeneratedPhase
export type Member = GeneratedMember
export type ClientContact = GeneratedClientContact

// `ProjectFile` was the frontend-facing name for `FileMeta` (the Rust DB
// row carries `stored_name`/`file_path` and is intentionally not exported).
export type ProjectFile = FileMeta

// --- Create DTOs (override Vec<String> + status fields) ---

// `products` / `security_concerns` are `Vec<String>` with `#[serde(default)]`
// in Rust, so they may be omitted in JSON. ts-rs would emit them as a
// required `Array<string>`; flatten that back to optional `string[]`.
export type CreateClient = Omit<
  GeneratedCreateClient,
  'products' | 'security_concerns'
> & {
  products?: string[]
  security_concerns?: string[]
}

// `goals` is `Vec<String>` with `#[serde(default)]`; status fields are
// wide `string` values from ts-rs but the API contract narrows them to
// their validated unions.
export type CreateProject = Omit<
  GeneratedCreateProject,
  'goals' | 'status' | 'tech_approval'
> & {
  goals?: string[]
  status?: ProjectStatus
  tech_approval?: TechApprovalStatus
}

// Same shape fix for tasks: optional `status` narrowed to `TaskStatus`.
export type CreateTask = Omit<GeneratedCreateTask, 'status'> & {
  status?: TaskStatus
}

// `tags` is `Vec<String>` with `#[serde(default)]`.
export type CreateLink = Omit<GeneratedCreateLink, 'tags'> & {
  tags?: string[]
}

// --- Update DTOs (optional Vec + narrowed status fields) ---

export type UpdateProject = Omit<
  GeneratedUpdateProject,
  'goals' | 'status' | 'tech_approval'
> & {
  goals?: string[]
  status?: ProjectStatus
  tech_approval?: TechApprovalStatus
}

export type UpdateTask = Omit<GeneratedUpdateTask, 'status'> & {
  status?: TaskStatus
}

// --- Direct re-exports for the rest ---

export type {
  CreateAsset,
  CreateClientContact,
  CreateCommunication,
  CreateMember,
  CreatePhase,
  FileMeta,
  FileWithProject,
  UpdateAsset,
  UpdateClient,
  UpdateClientContact,
  UpdateCommunication,
  UpdateFile,
  UpdateMember,
  UpdatePhase,
}

// --- API helpers ---

export interface ApiError {
  error: string
  message: string
}