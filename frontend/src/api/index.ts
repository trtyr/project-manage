import axios from 'axios'
import type {
  Client,
  CreateClient,
  UpdateClient,
  Project,
  CreateProject,
  UpdateProject,
  Communication,
  CommunicationWithProject,
  CreateCommunication,
  UpdateCommunication,
  Task,
  CreateTask,
  UpdateTask,
  Asset,
  CreateAsset,
  UpdateAsset,
  ProjectFile,
  UpdateFile,
  FileWithProject,
  Phase,
  CreatePhase,
  UpdatePhase,
  Member,
  CreateMember,
  UpdateMember,
  ClientContact,
  CreateClientContact,
  UpdateClientContact,
} from '../types'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// --- Clients ---

export const clientsApi = {
  list: () => http.get<Client[]>('/clients').then((r) => r.data),
  get: (id: string) => http.get<Client>(`/clients/${id}`).then((r) => r.data),
  create: (data: CreateClient) =>
    http.post<Client>('/clients', data).then((r) => r.data),
  update: (id: string, data: UpdateClient) =>
    http.put<Client>(`/clients/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/clients/${id}`).then((r) => r.data),
}

// --- Projects ---

export const projectsApi = {
  list: () => http.get<Project[]>('/projects').then((r) => r.data),
  get: (id: string) => http.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (data: CreateProject) =>
    http.post<Project>('/projects', data).then((r) => r.data),
  update: (id: string, data: UpdateProject) =>
    http.put<Project>(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/projects/${id}`).then((r) => r.data),
}

// --- Communications (nested under project) ---

export const communicationsApi = {
  listByProject: (projectId: string) =>
    http
      .get<Communication[]>(`/projects/${projectId}/communications`)
      .then((r) => r.data),
  create: (projectId: string, data: CreateCommunication) =>
    http
      .post<Communication>(`/projects/${projectId}/communications`, data)
      .then((r) => r.data),
  get: (id: string) =>
    http.get<Communication>(`/communications/${id}`).then((r) => r.data),
  update: (id: string, data: UpdateCommunication) =>
    http.put<Communication>(`/communications/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    http.delete(`/communications/${id}`).then((r) => r.data),
  listRecent: (limit = 10) =>
    http
      .get<CommunicationWithProject[]>(`/communications/recent?limit=${limit}`)
      .then((r) => r.data),
  search: (q: string) =>
    http
      .get<CommunicationWithProject[]>(
        `/communications/search?q=${encodeURIComponent(q)}`,
      )
      .then((r) => r.data),
}

// --- Tasks (nested under project) ---

export const tasksApi = {
  listByProject: (projectId: string) =>
    http.get<Task[]>(`/projects/${projectId}/tasks`).then((r) => r.data),
  create: (projectId: string, data: CreateTask) =>
    http.post<Task>(`/projects/${projectId}/tasks`, data).then((r) => r.data),
  get: (id: string) => http.get<Task>(`/tasks/${id}`).then((r) => r.data),
  update: (id: string, data: UpdateTask) =>
    http.put<Task>(`/tasks/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/tasks/${id}`).then((r) => r.data),
}

// --- Assets ---

export const assetsApi = {
  listByProject: (projectId: string) =>
    http.get<Asset[]>(`/projects/${projectId}/assets`).then((r) => r.data),
  create: (projectId: string, data: CreateAsset) =>
    http.post<Asset>(`/projects/${projectId}/assets`, data).then((r) => r.data),
  update: (id: string, data: UpdateAsset) =>
    http.put<Asset>(`/assets/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/assets/${id}`).then((r) => r.data),
}

// --- Files ---

export const filesApi = {
  listAll: () => http.get<FileWithProject[]>('/files').then((r) => r.data),
  listByProject: (projectId: string) =>
    http.get<ProjectFile[]>(`/projects/${projectId}/files`).then((r) => r.data),
  upload: (
    projectId: string,
    file: File,
    description?: string,
    tags?: string[],
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    if (description) formData.append('description', description)
    if (tags?.length) formData.append('tags', tags.join(','))
    return http
      .post<ProjectFile>(`/projects/${projectId}/files`, formData)
      .then((r) => r.data)
  },
  createLink: (
    projectId: string,
    data: { name: string; url: string; description?: string; tags?: string[] },
  ) =>
    http
      .post<ProjectFile>(`/projects/${projectId}/links`, data)
      .then((r) => r.data),
  previewUrl: (id: string) => `/api/files/${id}/preview`,
  download: (id: string) =>
    http
      .get(`/files/${id}/download`, { responseType: 'blob' })
      .then((r) => r.data),
  update: (id: string, data: UpdateFile) =>
    http.put<ProjectFile>(`/files/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/files/${id}`).then((r) => r.data),
  link: (id: string, communicationId: string | null) =>
    http.put<ProjectFile>(`/files/${id}/link`, { communication_id: communicationId }).then((r) => r.data),
  linkPhase: (id: string, phaseId: string | null) =>
    http.put<ProjectFile>(`/files/${id}/link-phase`, { phase_id: phaseId }).then((r) => r.data),
}

// --- Phases ---

export const phasesApi = {
  listByProject: (projectId: string) =>
    http.get<Phase[]>(`/projects/${projectId}/phases`).then((r) => r.data),
  create: (projectId: string, data: CreatePhase) =>
    http.post<Phase>(`/projects/${projectId}/phases`, data).then((r) => r.data),
  update: (id: string, data: UpdatePhase) =>
    http.put<Phase>(`/phases/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/phases/${id}`).then((r) => r.data),
}

// --- Members ---

export const membersApi = {
  listByProject: (projectId: string) =>
    http.get<Member[]>(`/projects/${projectId}/members`).then((r) => r.data),
  create: (projectId: string, data: CreateMember) =>
    http.post<Member>(`/projects/${projectId}/members`, data).then((r) => r.data),
  update: (id: string, data: UpdateMember) =>
    http.put<Member>(`/members/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/members/${id}`).then((r) => r.data),
}

// --- Client Contacts ---

export const contactsApi = {
  listByProject: (projectId: string) =>
    http.get<ClientContact[]>(`/projects/${projectId}/contacts`).then((r) => r.data),
  create: (projectId: string, data: CreateClientContact) =>
    http.post<ClientContact>(`/projects/${projectId}/contacts`, data).then((r) => r.data),
  update: (id: string, data: UpdateClientContact) =>
    http.put<ClientContact>(`/contacts/${id}`, data).then((r) => r.data),
  delete: (id: string) => http.delete(`/contacts/${id}`).then((r) => r.data),
}

// --- Health ---

export const healthApi = {
  check: () =>
    http
      .get<{ status: string; version: string }>('/health')
      .then((r) => r.data),
}

// --- Error classification ---

export type ApiErrorKind = 'offline' | 'server' | 'validation' | 'conflict' | 'unknown'

export interface ApiErrorInfo {
  kind: ApiErrorKind
  message: string
  status?: number
}

export function classifyApiError(err: unknown): ApiErrorInfo {
  const e = err as { response?: { status?: number }; message?: string } | undefined
  const message = e?.message ?? '未知错误'

  // No HTTP response means the request never reached the server
  // (network down, DNS failure, CORS preflight aborted, or timeout).
  if (!e?.response) {
    return { kind: 'offline', message }
  }

  const status = e.response.status

  if (status !== undefined && status >= 500 && status < 600) {
    return { kind: 'server', message, status }
  }
  if (status === 400 || status === 422) {
    return { kind: 'validation', message, status }
  }
  if (status === 409) {
    return { kind: 'conflict', message, status }
  }
  return { kind: 'unknown', message, status }
}
