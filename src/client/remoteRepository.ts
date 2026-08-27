import { createMockRepository } from '../mockRepository.js'
import type {
  ApprovalGate,
  CreatorCapabilities,
  CreatorProject,
  CreatorProjectDraft,
  CreatorRepository,
  CreatorStage,
  CreatorSettings,
  CreatorSettingsSnapshot,
} from '../types.js'

interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: { message?: string }
}

class RemoteUnavailable extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/creator/api/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  } catch (error) {
    throw new RemoteUnavailable(error instanceof Error ? error.message : String(error))
  }
  let payload: ApiResponse<T> | null = null
  try {
    payload = await response.json() as ApiResponse<T>
  } catch {
    throw new Error(`内容工作台返回了无效响应（${response.status}）`)
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? `内容工作台请求失败（${response.status}）`)
  return payload.data as T
}

export { request as creatorRequest }

function jsonBody(value: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(value) }
}

export class RemoteCreatorRepository implements CreatorRepository {
  listProjects(query = ''): Promise<CreatorProject[]> {
    const suffix = query ? `?q=${encodeURIComponent(query)}` : ''
    return request<CreatorProject[]>(`projects${suffix}`)
  }

  createProject(draft: CreatorProjectDraft): Promise<CreatorProject> {
    return request<CreatorProject>('projects', jsonBody(draft))
  }

  getProject(id: string): Promise<CreatorProject | null> {
    return request<CreatorProject | null>(`projects/${encodeURIComponent(id)}`)
  }

  updateArtifact(id: string, artifact: Pick<CreatorProject, 'brief' | 'article' | 'xhsCopy' | 'videoScript'>): Promise<CreatorProject> {
    return request<CreatorProject>(`projects/${encodeURIComponent(id)}/artifacts`, jsonBody(artifact))
  }

  approveGate(id: string, gate: ApprovalGate): Promise<CreatorProject> {
    return request<CreatorProject>(`projects/${encodeURIComponent(id)}/approve`, jsonBody({ gate }))
  }

  runStage(id: string, stage: CreatorStage): Promise<CreatorProject> {
    return request<CreatorProject>(`projects/${encodeURIComponent(id)}/stage`, jsonBody({ stage }))
  }

  getRevision(): Promise<string> {
    return request<{ revision: string }>('revision').then((data) => data.revision)
  }

  getCapabilities(): Promise<CreatorCapabilities> {
    return request<CreatorCapabilities>('capabilities')
  }

  getSettings(): Promise<CreatorSettingsSnapshot> {
    return request<CreatorSettingsSnapshot>('settings')
  }

  saveSettings(settings: CreatorSettings): Promise<CreatorSettingsSnapshot> {
    return request<CreatorSettingsSnapshot>('settings', jsonBody({ settings }))
  }

  checkSettings(): Promise<CreatorSettingsSnapshot> {
    return request<CreatorSettingsSnapshot>('settings/check', jsonBody({}))
  }
}

export class ResilientCreatorRepository implements CreatorRepository {
  private readonly remote = new RemoteCreatorRepository()
  private readonly mock = createMockRepository()
  private useMock = false

  private async call<T>(remote: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.useMock) return fallback()
    try {
      return await remote()
    } catch (error) {
      if (!(error instanceof RemoteUnavailable)) throw error
      this.useMock = true
      return fallback()
    }
  }

  listProjects(query = ''): Promise<CreatorProject[]> {
    return this.call(() => this.remote.listProjects(query), () => this.mock.listProjects(query))
  }

  createProject(draft: CreatorProjectDraft): Promise<CreatorProject> {
    return this.call(() => this.remote.createProject(draft), () => this.mock.createProject(draft))
  }

  getProject(id: string): Promise<CreatorProject | null> {
    return this.call(() => this.remote.getProject(id), () => this.mock.getProject(id))
  }

  updateArtifact(id: string, artifact: Pick<CreatorProject, 'brief' | 'article' | 'xhsCopy' | 'videoScript'>): Promise<CreatorProject> {
    return this.call(() => this.remote.updateArtifact(id, artifact), () => this.mock.updateArtifact(id, artifact))
  }

  approveGate(id: string, gate: ApprovalGate): Promise<CreatorProject> {
    return this.call(() => this.remote.approveGate(id, gate), () => this.mock.approveGate(id, gate))
  }

  runStage(id: string, stage: CreatorStage): Promise<CreatorProject> {
    return this.call(() => this.remote.runStage(id, stage), () => this.mock.runStage(id, stage))
  }

  getRevision(): Promise<string> {
    return this.call(() => this.remote.getRevision(), () => this.mock.getRevision())
  }

  getCapabilities(): Promise<CreatorCapabilities> {
    return this.call(() => this.remote.getCapabilities(), () => this.mock.getCapabilities())
  }

  getSettings(): Promise<CreatorSettingsSnapshot> {
    return this.call(() => this.remote.getSettings(), () => this.mock.getSettings())
  }

  saveSettings(settings: CreatorSettings): Promise<CreatorSettingsSnapshot> {
    return this.call(() => this.remote.saveSettings(settings), () => this.mock.saveSettings(settings))
  }

  checkSettings(): Promise<CreatorSettingsSnapshot> {
    return this.call(() => this.remote.checkSettings(), () => this.mock.checkSettings())
  }
}

export function createBrowserRepository(): CreatorRepository {
  return new ResilientCreatorRepository()
}
