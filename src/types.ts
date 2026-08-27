import type { CreatorSettings, CreatorSettingsSnapshot } from './settings.js'

export const CREATOR_PACKAGE_NAME = '@orios/dsh-creator'
export const SUPPORTED_DSH_VERSION = '0.1.1-rc.2'

export type CreatorView = 'studio' | 'calendar' | 'board'
export type CreatorTab = 'overview' | 'brief' | 'wechat' | 'xhs' | 'video' | 'publish'
export type CreatorStage = 'brief' | 'article' | 'variants' | 'video' | 'publish'
export type CreatorTarget = 'wechat_article' | 'xhs_graphic' | 'douyin_video' | 'wechat_channels_video'
export type ApprovalGate = 'brief_sources' | 'approved_article' | 'platform_variants' | 'publish_package'
export type CreatorRepositoryMode = 'mock' | 'file'
export type { CreatorSettings, CreatorSettingsSnapshot, ProviderDefinition, ProviderId, ProviderSettings, ProviderStatus, ProviderStatusCode } from './settings.js'

export interface ArtifactRef {
  path: string
  kind: 'markdown' | 'source' | 'image' | 'audio' | 'video' | 'json'
  label: string
  ready: boolean
  hash: string
  updatedAt: string
}

export interface ApprovalRecord {
  gate: ApprovalGate
  approved: boolean
  approvedAt?: string
  artifactHash: string
}

export interface CreatorProject {
  id: string
  title: string
  slug: string
  month: string
  plannedAt: string
  stage: CreatorStage
  status: 'ready' | 'running' | 'blocked'
  progress: number
  nextAction: string
  blockedReason?: string
  targets: CreatorTarget[]
  approvals: ApprovalRecord[]
  artifacts: ArtifactRef[]
  brief: string
  article: string
  xhsCopy: string
  videoScript: string
}

export interface CreatorProjectDraft {
  title: string
  slug: string
  plannedAt: string
  targets?: CreatorTarget[]
}

export type ProviderRuntimeState = 'mock' | 'configured' | 'missing' | 'disabled'

export interface CreatorCapabilities {
  dshVersion: string
  repositoryMode: CreatorRepositoryMode
  contentRootConfigured: boolean
  /** 文件模式下的内容根目录绝对路径；mock 模式为空字符串。仅用于本地 UI 与交接提示。 */
  contentRoot?: string
  imageProvider: ProviderRuntimeState
  speechProvider: ProviderRuntimeState
  remotion: ProviderRuntimeState
  wechatDraft: ProviderRuntimeState
  browserDraft: 'unavailable' | 'optional'
  settingsStorage?: 'file' | 'memory'
}

export interface CreatorRepository {
  listProjects(query?: string): Promise<CreatorProject[]>
  createProject(draft: CreatorProjectDraft): Promise<CreatorProject>
  getProject(id: string): Promise<CreatorProject | null>
  updateArtifact(id: string, artifact: Pick<CreatorProject, 'brief' | 'article' | 'xhsCopy' | 'videoScript'>): Promise<CreatorProject>
  approveGate(id: string, gate: ApprovalGate): Promise<CreatorProject>
  runStage(id: string, stage: CreatorStage): Promise<CreatorProject>
  getCapabilities(): Promise<CreatorCapabilities>
  getSettings(): Promise<CreatorSettingsSnapshot>
  saveSettings(settings: CreatorSettings): Promise<CreatorSettingsSnapshot>
  checkSettings(): Promise<CreatorSettingsSnapshot>
  /** 库变化指纹：client 轮询此值以实时刷新片库/检查器。 */
  getRevision(): Promise<string>
}
