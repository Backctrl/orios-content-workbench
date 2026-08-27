import type { CreatorRepositoryMode } from './types.js'

export type ProviderId = 'image' | 'speech' | 'remotion' | 'wechat' | 'xhs' | 'douyin' | 'channels'
export type ProviderStatusCode = 'configured' | 'missing' | 'invalid' | 'disabled'

export interface ProviderSettings {
  enabled: boolean
  endpoint: string
  model: string
  credentialEnvs: string[]
  command: string
  profilePath: string
}

export interface CreatorSettings {
  schemaVersion: 1
  providers: Record<ProviderId, ProviderSettings>
}

export interface ProviderDefinition {
  id: ProviderId
  label: string
  group: 'provider' | 'platform'
  description: string
  credentialHint: string
  defaultEndpoint: string
  defaultModel: string
  defaultCredentialEnvs: string[]
  defaultCommand: string
  requiresCommand: boolean
}

export interface ProviderStatus {
  id: ProviderId
  label: string
  group: ProviderDefinition['group']
  enabled: boolean
  status: ProviderStatusCode
  detail: string
  checkedAt: string
  endpoint: string
  model: string
  credentialEnvs: string[]
}

export interface CreatorSettingsSnapshot {
  settings: CreatorSettings
  statuses: ProviderStatus[]
  storage: 'file' | 'memory'
  contentRootConfigured: boolean
  updatedAt: string
}

export const PROVIDER_DEFINITIONS: readonly ProviderDefinition[] = [
  {
    id: 'image',
    label: '图像生成',
    group: 'provider',
    description: '文章插图、封面和小红书图卡，可接 Baoyu image adapter。',
    credentialHint: '密钥环境变量名',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-image-1',
    defaultCredentialEnvs: ['OPENAI_API_KEY'],
    defaultCommand: '',
    requiresCommand: false,
  },
  {
    id: 'speech',
    label: '标准中文配音',
    group: 'provider',
    description: '视频旁白和替换音频，默认保留 OpenAI TTS 兼容配置。',
    credentialHint: '密钥环境变量名',
    defaultEndpoint: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini-tts',
    defaultCredentialEnvs: ['OPENAI_API_KEY'],
    defaultCommand: '',
    requiresCommand: false,
  },
  {
    id: 'remotion',
    label: 'Remotion 渲染',
    group: 'provider',
    description: '本地生成 1080×1920、30fps 的视频预览和字幕合成。',
    credentialHint: '本地命令或绝对路径',
    defaultEndpoint: '',
    defaultModel: '',
    defaultCredentialEnvs: [],
    defaultCommand: 'npx remotion',
    requiresCommand: true,
  },
  {
    id: 'wechat',
    label: '微信公众号草稿',
    group: 'platform',
    description: '使用官方接口写入草稿箱，最终发布仍由用户确认。',
    credentialHint: 'AppID 与 AppSecret 的环境变量名',
    defaultEndpoint: 'https://api.weixin.qq.com',
    defaultModel: '',
    defaultCredentialEnvs: ['WECHAT_APP_ID', 'WECHAT_APP_SECRET'],
    defaultCommand: '',
    requiresCommand: false,
  },
  {
    id: 'xhs',
    label: '小红书发布器',
    group: 'platform',
    description: '默认输出人工上传包；可配置受控浏览器/发布器会话路径。',
    credentialHint: '会话文件或发布器环境变量名',
    defaultEndpoint: '',
    defaultModel: '',
    defaultCredentialEnvs: ['XHS_SESSION_PATH'],
    defaultCommand: '',
    requiresCommand: false,
  },
  {
    id: 'douyin',
    label: '抖音视频发布器',
    group: 'platform',
    description: '可选视频发布器；未配置时只生成视频发布包。',
    credentialHint: '会话文件或发布器环境变量名',
    defaultEndpoint: '',
    defaultModel: '',
    defaultCredentialEnvs: ['DOUYIN_SESSION_PATH'],
    defaultCommand: '',
    requiresCommand: false,
  },
  {
    id: 'channels',
    label: '视频号发布器',
    group: 'platform',
    description: '可选视频号发布器；未配置时只生成视频发布包。',
    credentialHint: '会话文件或发布器环境变量名',
    defaultEndpoint: '',
    defaultModel: '',
    defaultCredentialEnvs: ['WECHAT_CHANNELS_SESSION_PATH'],
    defaultCommand: '',
    requiresCommand: false,
  },
]

const definitions = new Map(PROVIDER_DEFINITIONS.map((definition) => [definition.id, definition]))

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function stringArray(value: unknown, fallback: string[]): string[] {
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  if (!Array.isArray(value)) return [...fallback]
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function providerSettings(definition: ProviderDefinition, value?: unknown): ProviderSettings {
  const input = isRecord(value) ? value : {}
  return {
    enabled: input.enabled !== false,
    endpoint: stringValue(input.endpoint, definition.defaultEndpoint),
    model: stringValue(input.model, definition.defaultModel),
    credentialEnvs: stringArray(input.credentialEnvs, definition.defaultCredentialEnvs),
    command: stringValue(input.command, definition.defaultCommand),
    profilePath: stringValue(input.profilePath, ''),
  }
}

export function defaultSettings(): CreatorSettings {
  return {
    schemaVersion: 1,
    providers: Object.fromEntries(PROVIDER_DEFINITIONS.map((definition) => [definition.id, providerSettings(definition)])) as Record<ProviderId, ProviderSettings>,
  }
}

export function normalizeSettings(value: unknown): CreatorSettings {
  const input = isRecord(value) ? value : {}
  const providers = isRecord(input.providers) ? input.providers : {}
  return {
    schemaVersion: 1,
    providers: Object.fromEntries(PROVIDER_DEFINITIONS.map((definition) => [definition.id, providerSettings(definition, providers[definition.id])])) as Record<ProviderId, ProviderSettings>,
  }
}

function endpointValid(endpoint: string): boolean {
  if (!endpoint) return true
  try {
    const value = new URL(endpoint)
    return value.protocol === 'http:' || value.protocol === 'https:'
  } catch {
    return false
  }
}

export function detectProviderStatuses(settings: CreatorSettings, environment: Record<string, string | undefined> = {}, checkedAt = new Date().toISOString()): ProviderStatus[] {
  return PROVIDER_DEFINITIONS.map((definition) => {
    const config = settings.providers[definition.id]
    if (!config.enabled) return { id: definition.id, label: definition.label, group: definition.group, enabled: false, status: 'disabled', detail: '已停用，不参与任务', checkedAt, endpoint: config.endpoint, model: config.model, credentialEnvs: [...config.credentialEnvs] }
    if (!endpointValid(config.endpoint)) return { id: definition.id, label: definition.label, group: definition.group, enabled: true, status: 'invalid', detail: 'Endpoint 不是有效的 HTTP(S) 地址', checkedAt, endpoint: config.endpoint, model: config.model, credentialEnvs: [...config.credentialEnvs] }
    if (definition.requiresCommand && !config.command) return { id: definition.id, label: definition.label, group: definition.group, enabled: true, status: 'missing', detail: '尚未填写本地渲染命令', checkedAt, endpoint: config.endpoint, model: config.model, credentialEnvs: [...config.credentialEnvs] }
    const missing = config.credentialEnvs.filter((name) => !environment[name])
    if (missing.length > 0) return { id: definition.id, label: definition.label, group: definition.group, enabled: true, status: 'missing', detail: `缺少环境变量：${missing.join('、')}`, checkedAt, endpoint: config.endpoint, model: config.model, credentialEnvs: [...config.credentialEnvs] }
    const detail = definition.requiresCommand ? '命令已配置；首次运行时仍会执行实际渲染探测' : '配置项已具备；检测未调用外部 API'
    return { id: definition.id, label: definition.label, group: definition.group, enabled: true, status: 'configured', detail, checkedAt, endpoint: config.endpoint, model: config.model, credentialEnvs: [...config.credentialEnvs] }
  })
}

export function settingsSnapshot(settings: CreatorSettings, storage: 'file' | 'memory', contentRootConfigured: boolean, environment: Record<string, string | undefined> = {}, updatedAt = new Date().toISOString()): CreatorSettingsSnapshot {
  return { settings: normalizeSettings(settings), statuses: detectProviderStatuses(normalizeSettings(settings), environment, updatedAt), storage, contentRootConfigured, updatedAt }
}

export function providerDefinition(id: ProviderId): ProviderDefinition {
  return definitions.get(id) as ProviderDefinition
}

export function environmentFromProcess(): Record<string, string | undefined> {
  return { ...process.env }
}

