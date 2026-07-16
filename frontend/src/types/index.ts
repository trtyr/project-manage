// Type definitions — mirrors backend models (backend/src/models/)

export type UUID = string

export type ISODateTime = string
export type ISODate = string

// --- Client ---

export interface Client {
  id: UUID
  name: string
  contact_person: string | null
  contact_info: string | null
  notes: string | null
  products: string[]
  security_concerns: string[]
  background_info: string | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface CreateClient {
  name: string
  contact_person?: string
  contact_info?: string
  notes?: string
  products?: string[]
  security_concerns?: string[]
  background_info?: string
}

export interface UpdateClient {
  name?: string
  contact_person?: string
  contact_info?: string
  notes?: string
  products?: string[]
  security_concerns?: string[]
  background_info?: string
}

// --- Project ---

export type ProjectStatus = 'in_progress' | 'completed' | 'paused'

export interface Project {
  id: UUID
  client_id: UUID
  name: string
  status: ProjectStatus
  phase: string | null
  goals: string[]
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface CreateProject {
  client_id: UUID
  name: string
  status?: ProjectStatus
  phase?: string
  goals?: string[]
}

export interface UpdateProject {
  client_id?: UUID
  name?: string
  status?: ProjectStatus
  phase?: string
  goals?: string[]
}

// --- Communication ---

export interface Communication {
  id: UUID
  project_id: UUID
  content: string
  occurred_at: ISODateTime
  participants: string | null
  conclusion: string | null
  created_at: ISODateTime
}

export interface CreateCommunication {
  content: string
  occurred_at: ISODateTime
  participants?: string
  conclusion?: string
}

export interface UpdateCommunication {
  content?: string
  occurred_at?: ISODateTime
  participants?: string
  conclusion?: string
}

export interface CommunicationWithProject extends Communication {
  project_name: string
}

// --- Task ---

export type TaskStatus = 'current' | 'next' | 'todo'

export interface Task {
  id: UUID
  project_id: UUID
  title: string
  status: TaskStatus
  planned_date: ISODate | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface CreateTask {
  title: string
  status?: TaskStatus
  planned_date?: ISODate
}

export interface UpdateTask {
  title?: string
  status?: TaskStatus
  planned_date?: ISODate
}

// --- Asset ---

export interface Asset {
  id: UUID
  project_id: UUID
  name: string
  asset_type: string
  value: string | null
  description: string | null
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface CreateAsset {
  name: string
  asset_type?: string
  value?: string
  description?: string
}

export interface UpdateAsset {
  name?: string
  asset_type?: string
  value?: string
  description?: string
}

// --- ProjectFile ---

export interface ProjectFile {
  id: UUID
  project_id: UUID
  communication_id: UUID | null
  phase_id: UUID | null
  source_type: 'file' | 'link'
  url: string | null
  original_name: string
  mime_type: string
  file_size: number
  description: string | null
  tags: string[]
  created_at: ISODateTime
}

export interface UpdateFile {
  description?: string
  tags?: string[]
}

export interface FileWithProject extends ProjectFile {
  project_name: string
}

// --- Phase ---

export interface Phase {
  id: UUID
  project_id: UUID
  parent_id: UUID | null
  name: string
  description: string | null
  sort_order: number
  planned_start: ISODateTime | null
  planned_end: ISODateTime | null
  actual_start: ISODateTime | null
  actual_end: ISODateTime | null
  status: string
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface CreatePhase {
  name: string
  parent_id?: string
  description?: string
  sort_order?: number
  planned_start?: string
  planned_end?: string
  status?: string
}

export interface UpdatePhase {
  name?: string
  description?: string
  sort_order?: number
  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string
  status?: string
}

// --- Member ---

export interface Member {
  id: UUID
  project_id: UUID
  role: string | null
  name: string
  notes: string | null
  created_at: ISODateTime
}

export interface CreateMember {
  name: string
  role?: string
  notes?: string
}

export interface UpdateMember {
  name?: string
  role?: string
  notes?: string
}

// --- ClientContact ---

export interface ClientContact {
  id: UUID
  project_id: UUID
  name: string
  notes: string | null
  created_at: ISODateTime
}

export interface CreateClientContact {
  name: string
  notes?: string
}

export interface UpdateClientContact {
  name?: string
  notes?: string
}

// --- API helpers ---

export interface ApiError {
  error: string
  message: string
}
