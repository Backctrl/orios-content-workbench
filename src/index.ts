import type { IncomingMessage, ServerResponse } from 'node:http'
import { FileCreatorRepository } from './fileRepository.js'
import { createMockRepository } from './mockRepository.js'
import { buildWorkflowPrompt } from './workflowPrompt.js'
import { registerCreatorTools } from './creatorTools.js'
import { registerCreatorWorkflowSkill } from './creatorSkill.js'
import { createWorkspaceStore } from './workspace.js'
import { checkVariantSimilarity, reviewArticleScore } from './reviewService.js'
import { generateTopicImage } from './imageService.js'
import { resolveWorkbenchFolder, scaffoldWorkbench, WORKBENCH_PROJECT_ID } from './workbench.js'
import type { ApprovalGate, CreatorProjectDraft, CreatorRepository, CreatorSettings, CreatorStage, CreatorRepositoryMode } from './types.js'
import { CREATOR_PACKAGE_NAME, SUPPORTED_DSH_VERSION } from './types.js'

export const name = 'orios-creator'
export const inject = ['systemPrompt', 'webServer']
export { SUPPORTED_DSH_VERSION }
export { MockCreatorRepository, createMockRepository } from './mockRepository.js'
export { FileCreatorRepository } from './fileRepository.js'
export { CREATOR_WORKFLOW_PROMPT, buildHandoffPrompt, buildWorkflowPrompt } from './workflowPrompt.js'
export { registerCreatorTools } from './creatorTools.js'
export { registerCreatorWorkflowSkill } from './creatorSkill.js'
export { FileWorkspaceStore, MockWorkspaceStore, createWorkspaceStore } from './workspace.js'
export { PROVIDER_DEFINITIONS, defaultSettings, detectProviderStatuses, normalizeSettings, settingsSnapshot } from './settings.js'
export { WORKBENCH_PROJECT_ID, resolveWorkbenchFolder, scaffoldWorkbench } from './workbench.js'

export interface Config {
  enabled?: boolean
  announceToAgent?: boolean
  hostVersion?: string
  contentRoot?: string
  /** worktable 项目文件夹（缺省 $DSH_HOME/projects/orios-content-workbench） */
  workbenchFolder?: string
  mode?: 'auto' | CreatorRepositoryMode
}

function createRepository(config: Config): { repository: CreatorRepository; mode: CreatorRepositoryMode; contentRoot: string } {
  const contentRoot = config.contentRoot?.trim() || process.env.ORIOS_CREATOR_CONTENT_ROOT?.trim() || ''
  const requested = config.mode ?? 'auto'
  if (requested === 'mock' || (requested === 'auto' && !contentRoot)) return { repository: createMockRepository(), mode: 'mock', contentRoot }
  return { repository: new FileCreatorRepository(contentRoot), mode: 'file', contentRoot }
}

function loopback(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')) return false
  const host = request.headers.host
  if (!host) return false
  try {
    const hostname = new URL(`http://${host}`).hostname
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) return false
    if (request.headers['sec-fetch-site'] === 'cross-site') return false
    const origin = request.headers.origin
    return !origin || new URL(origin).host === new URL(`http://${host}`).host
  } catch {
    return false
  }
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > 1024 * 1024) return null
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function send(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

export function apply(ctx: any, config: Config = {}): void {
  if (config.enabled === false) return
  const detected = config.hostVersion || process.env.DSH_VERSION || ''
  if (detected && detected !== SUPPORTED_DSH_VERSION) {
    ctx.logger?.warn?.(`dsh-creator: 宿主 ${detected} 不在支持矩阵，请先确认工作台兼容性`)
  }
  const selected = createRepository(config)
  const repository = selected.repository
  const workspace = createWorkspaceStore(selected.mode, selected.contentRoot)
  const workbenchFolder = resolveWorkbenchFolder(config.workbenchFolder)
  const workflowFacts = {
    repositoryMode: selected.mode,
    contentRootConfigured: selected.mode === 'file',
    contentRoot: selected.contentRoot,
    settingsStorage: selected.mode === 'file' ? 'file' : 'memory',
  }
  const stopTools = ctx.inject?.(['tools'], (toolsCtx: any) => registerCreatorTools(toolsCtx, repository, workspace)) ?? (() => undefined)
  const stopSkill = ctx.inject?.(['skills'], (skillsCtx: any) => registerCreatorWorkflowSkill(skillsCtx)) ?? (() => undefined)
  ctx.effect(() => () => { stopTools(); stopSkill() }, 'dsh-creator: tools & skill')
  const handler = async (request: IncomingMessage, response: ServerResponse) => {
    if (!loopback(request)) return send(response, { ok: false, error: { code: 'forbidden', message: '仅允许 loopback 请求' } }, 403)
    const url = new URL(request.url ?? '/', 'http://localhost')
    const parts = url.pathname.replace(/^\/creator\/?/, '').split('/').filter(Boolean)
    try {
      if (request.method === 'GET' && parts.join('/') === 'api/info') {
        const capabilities = await repository.getCapabilities()
        return send(response, { ok: true, data: { package: CREATOR_PACKAGE_NAME, dshVersion: SUPPORTED_DSH_VERSION, prototype: selected.mode === 'mock', repositoryMode: selected.mode, contentRootConfigured: capabilities.contentRootConfigured, settingsStorage: capabilities.settingsStorage ?? (selected.mode === 'file' ? 'file' : 'memory') } })
      }
      if (request.method === 'GET' && parts.join('/') === 'api/capabilities') return send(response, { ok: true, data: await repository.getCapabilities() })
      if (request.method === 'GET' && parts.join('/') === 'api/revision') return send(response, { ok: true, data: { revision: await repository.getRevision() } })
      if (request.method === 'GET' && parts.join('/') === 'api/candidates') {
        const status = url.searchParams.get('status') ?? ''
        const items = await workspace.list()
        const filtered = ['pending', 'selected', 'converted'].includes(status) ? items.filter((item) => item.status === status) : items
        return send(response, { ok: true, data: { items: filtered } })
      }
      if (request.method === 'GET' && parts.join('/') === 'api/profile') {
        const profile = await workspace.get()
        return send(response, { ok: true, data: { profile, configured: Object.keys(profile).length > 0 } })
      }
      if (request.method === 'GET' && parts.join('/') === 'api/settings') return send(response, { ok: true, data: await repository.getSettings() })
      if (request.method === 'GET' && parts.join('/') === 'api/workbench') {
        // 工作台项目信息 + 脚手架（幂等）：客户端注册 worktable 项目时调用
        const info = await scaffoldWorkbench(workbenchFolder, selected.contentRoot)
        return send(response, { ok: true, data: info })
      }
      if (request.method === 'GET' && parts.join('/') === 'api/projects') return send(response, { ok: true, data: await repository.listProjects(url.searchParams.get('q') ?? '') })
      if (request.method === 'GET' && parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
        return send(response, { ok: true, data: await repository.getProject(decodeURIComponent(parts[2])) })
      }
      if (request.method !== 'POST') return send(response, { ok: false, error: { code: 'not_found', message: '路由不存在' } }, 404)
      const value = await readBody(request)
      if (value === null) return send(response, { ok: false, error: { code: 'bad_request', message: '请求体必须是小于 1 MiB 的 JSON 对象' } }, 400)
      if (parts.join('/') === 'api/settings/check') return send(response, { ok: true, data: await repository.checkSettings() })
      if (parts.join('/') === 'api/settings') {
        if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) return send(response, { ok: false, error: { code: 'bad_request', message: 'settings 必须是对象' } }, 400)
        return send(response, { ok: true, data: await repository.saveSettings(value.settings as CreatorSettings) })
      }
      if (parts[0] === 'api' && parts[1] === 'projects' && parts.length === 2) {
        if (typeof value.title !== 'string' || typeof value.slug !== 'string' || typeof value.plannedAt !== 'string') return send(response, { ok: false, error: { code: 'bad_request', message: '新主题需要 title、slug 和 plannedAt' } }, 400)
        const targets = Array.isArray(value.targets) ? value.targets.filter((target): target is string => typeof target === 'string') : undefined
        return send(response, { ok: true, data: await repository.createProject({ title: value.title, slug: value.slug, plannedAt: value.plannedAt, targets } as CreatorProjectDraft) })
      }
      const id = parts[2] ? decodeURIComponent(parts[2]) : ''
      if (parts[0] === 'api' && parts[1] === 'projects' && parts[3] === 'artifacts') {
        const fields = ['brief', 'article', 'xhsCopy', 'videoScript'] as const
        if (!fields.every((field) => typeof value[field] === 'string')) return send(response, { ok: false, error: { code: 'bad_request', message: '产物字段必须是字符串' } }, 400)
        return send(response, { ok: true, data: await repository.updateArtifact(id, { brief: value.brief as string, article: value.article as string, xhsCopy: value.xhsCopy as string, videoScript: value.videoScript as string }) })
      }
      if (parts[0] === 'api' && parts[1] === 'projects' && parts[3] === 'approve') {
        return send(response, { ok: true, data: await repository.approveGate(id, String(value.gate ?? '') as ApprovalGate) })
      }
      if (parts[0] === 'api' && parts[1] === 'projects' && parts[3] === 'stage') {
        return send(response, { ok: true, data: await repository.runStage(id, String(value.stage ?? 'brief') as CreatorStage) })
      }
      if (parts.join('/') === 'api/candidates') {
        if (typeof value.title !== 'string' || typeof value.claim !== 'string' || typeof value.sourceRef !== 'string') {
          return send(response, { ok: false, error: { code: 'bad_request', message: '新增候选需要 title、claim 和 sourceRef' } }, 400)
        }
        const item = await workspace.add({
          title: value.title,
          claim: value.claim,
          source: { kind: typeof value.sourceKind === 'string' && value.sourceKind !== '' ? value.sourceKind : 'file', ref: value.sourceRef },
          tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
        })
        return send(response, { ok: true, data: { item } })
      }
      if (parts.join('/') === 'api/candidates/select') {
        const ids = Array.isArray(value.ids) ? value.ids.filter((id): id is string => typeof id === 'string') : []
        const items = await workspace.select(ids)
        return send(response, { ok: true, data: { items } })
      }
      if (parts.join('/') === 'api/candidates/convert') {
        if (typeof value.id !== 'string' || value.id === '') return send(response, { ok: false, error: { code: 'bad_request', message: 'convert 需要候选 id' } }, 400)
        const candidates = await workspace.list()
        const candidate = candidates.find((item) => item.id === value.id)
        if (candidate === undefined) return send(response, { ok: false, error: { code: 'not_found', message: `候选选题不存在：${value.id}` } }, 404)
        if (candidate.status === 'converted') return send(response, { ok: false, error: { code: 'bad_request', message: `候选选题已转正：${candidate.convertedTopic ?? candidate.id}` } }, 400)
        const title = candidate.title
        const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'new-topic'
        const plannedAt = new Date().toISOString().slice(0, 10)
        const created = await repository.createProject({ title, slug, plannedAt })
        const next = await workspace.convert(candidate.id, created.id)
        return send(response, { ok: true, data: { topic: created, candidate: next.find((item) => item.id === candidate.id) } })
      }
      if (parts.join('/') === 'api/profile') {
        const patch: Record<string, unknown> = {}
        if (typeof value.positioning === 'string' && value.positioning.trim() !== '') patch.positioning = value.positioning.trim()
        if (typeof value.targetAudience === 'string' && value.targetAudience.trim() !== '') patch.targetAudience = value.targetAudience.trim()
        if (typeof value.tone === 'string' && value.tone.trim() !== '') patch.tone = value.tone.trim()
        if (Array.isArray(value.directions)) patch.directions = value.directions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
        if (typeof value.selectionCriteria === 'string' && value.selectionCriteria.trim() !== '') patch.selectionCriteria = value.selectionCriteria.trim()
        const profile = await workspace.save(patch as never)
        return send(response, { ok: true, data: { profile, configured: Object.keys(profile).length > 0 } })
      }
      if (parts.join('/') === 'api/review-score') {
        if (typeof value.id !== 'string' || value.id === '') return send(response, { ok: false, error: { code: 'bad_request', message: 'review-score 需要主题 id' } }, 400)
        return send(response, { ok: true, data: await reviewArticleScore(repository, value.id) })
      }
      if (parts.join('/') === 'api/similarity-check') {
        if (typeof value.id !== 'string' || value.id === '') return send(response, { ok: false, error: { code: 'bad_request', message: 'similarity-check 需要主题 id' } }, 400)
        const target = value.target === 'xhs' || value.target === 'video' ? value.target as 'xhs' | 'video' : 'both'
        return send(response, { ok: true, data: await checkVariantSimilarity(repository, value.id, target) })
      }
      if (parts.join('/') === 'api/generate-image') {
        if (typeof value.id !== 'string' || value.id === '' || typeof value.prompt !== 'string' || value.prompt === '') {
          return send(response, { ok: false, error: { code: 'bad_request', message: 'generate-image 需要主题 id 和 prompt' } }, 400)
        }
        return send(response, { ok: true, data: await generateTopicImage(repository, {
          id: value.id,
          prompt: value.prompt,
          ...(value.target === 'article' ? { target: 'article' as const } : {}),
          ...(typeof value.filename === 'string' && value.filename !== '' ? { filename: value.filename } : {}),
          ...(typeof value.count === 'number' ? { count: value.count } : {}),
        }) })
      }
      return send(response, { ok: false, error: { code: 'not_found', message: '路由不存在' } }, 404)
    } catch (error) {
      return send(response, { ok: false, error: { code: 'creator_error', message: error instanceof Error ? error.message : String(error) } }, 400)
    }
  }
  const disposeRoutes = ctx.webServer.register({ kind: 'prefix', path: '/creator', handler })
  if (config.announceToAgent !== false) {
    const disposePrompt = ctx.systemPrompt.section({
      name: 'plugin:orios-creator',
      order: 155,
      text: () => buildWorkflowPrompt(workflowFacts),
    })
    ctx.effect(() => () => disposePrompt?.(), 'dsh-creator: prompt')
  }
  ctx.effect(() => () => disposeRoutes?.(), 'dsh-creator: routes')
}
