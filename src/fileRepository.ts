import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parse, stringify } from 'yaml'
import type {
  ApprovalGate,
  ApprovalRecord,
  ArtifactRef,
  CreatorCapabilities,
  CreatorProject,
  CreatorProjectDraft,
  CreatorRepository,
  CreatorStage,
  CreatorTarget,
  CreatorSettings,
  CreatorSettingsSnapshot,
  ProviderId,
  ProviderRuntimeState,
  ProviderStatus,
} from './types.js'
import { defaultSettings, normalizeSettings, settingsSnapshot } from './settings.js'
import { environmentWithUserVars } from './env.js'

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MONTH_PATTERN = /^\d{4}-\d{2}$/
const PROJECT_PATTERN = /^(\d{4}-\d{2}-\d{2})_(.+)$/
const STAGES: CreatorStage[] = ['brief', 'article', 'variants', 'video', 'publish']
const TARGETS: CreatorTarget[] = ['wechat_article', 'xhs_graphic', 'douyin_video', 'wechat_channels_video']
const GATES: ApprovalGate[] = ['brief_sources', 'approved_article', 'platform_variants', 'publish_package']

type Manifest = Record<string, unknown>

interface ProjectLocation {
  month: string
  folder: string
  directory: string
}

interface ProjectRead {
  location: ProjectLocation
  manifest: Manifest
  manifestError?: string
  project: CreatorProject
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function hashFor(value: string): string {
  return `sha256-${createHash('sha256').update(value).digest('hex').slice(0, 16)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isMissing(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

function isValidStage(value: unknown): value is CreatorStage {
  return typeof value === 'string' && STAGES.includes(value as CreatorStage)
}

function isValidTarget(value: unknown): value is CreatorTarget {
  return typeof value === 'string' && TARGETS.includes(value as CreatorTarget)
}

function isValidGate(value: unknown): value is ApprovalGate {
  return typeof value === 'string' && GATES.includes(value as ApprovalGate)
}

function defaultApprovals(): ApprovalRecord[] {
  return GATES.map((gate) => ({ gate, approved: false, artifactHash: '' }))
}

function defaultTargets(value: unknown): CreatorTarget[] {
  if (!Array.isArray(value)) return [...TARGETS]
  const targets = value.filter(isValidTarget)
  return targets.length > 0 ? targets : [...TARGETS]
}

function defaultDate(month: string, folder: string): string {
  const match = PROJECT_PATTERN.exec(folder)
  return match?.[1] ?? `${month}-01`
}

function validateProjectDraft(draft: CreatorProjectDraft): void {
  if (!draft.title.trim() || draft.title.trim().length > 120) throw new Error('主题标题不能为空且不能超过 120 个字符')
  if (!/^[\p{L}\p{N}][\p{L}\p{N}_-]{1,80}$/u.test(draft.slug)) throw new Error('slug 只能包含中文、字母、数字、下划线或连字符')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.plannedAt)) throw new Error('plannedAt 必须是 YYYY-MM-DD')
  const timestamp = Date.parse(`${draft.plannedAt}T00:00:00Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== draft.plannedAt) throw new Error('plannedAt 不是有效日期')
}

function titleFromSlug(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').trim() || '未命名主题'
}

function safeResolve(root: string, candidate: string): string {
  const rootPath = resolve(root)
  const target = resolve(candidate)
  if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) throw new Error('文件路径越过内容根目录')
  return target
}

async function readText(path: string): Promise<string> {
  const buffer = await readFile(path)
  if (buffer.byteLength > MAX_TEXT_BYTES) throw new Error(`文件过大（上限 ${MAX_TEXT_BYTES} 字节）：${path}`)
  return buffer.toString('utf8')
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readText(path)
  } catch (error) {
    if (isMissing(error)) return ''
    throw error
  }
}

async function readOptionalManifest(path: string): Promise<{ manifest: Manifest; error?: string }> {
  try {
    const value = parse(await readText(path))
    return isRecord(value) ? { manifest: value } : { manifest: {}, error: 'project.yaml 必须是对象' }
  } catch (error) {
    if (isMissing(error)) return { manifest: {} }
    return { manifest: {}, error: error instanceof Error ? error.message : String(error) }
  }
}

async function readOptionalJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readText(path))
  } catch (error) {
    if (isMissing(error)) return undefined
    throw new Error(`JSON 文件无效：${path}`)
  }
}

async function assertNoSymlinkPath(base: string, candidate: string): Promise<void> {
  const basePath = resolve(base)
  const targetPath = safeResolve(basePath, candidate)
  const suffix = relative(basePath, targetPath)
  let current = basePath
  for (const part of suffix.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error(`拒绝读取符号链接路径：${current}`)
    } catch (error) {
      if (isMissing(error)) return
      throw error
    }
  }
}

async function ensureDirectoryChain(base: string, target: string): Promise<void> {
  const basePath = resolve(base)
  const targetPath = safeResolve(basePath, target)
  const suffix = relative(basePath, targetPath)
  let current = basePath
  if (!suffix) return
  for (const part of suffix.split(sep).filter(Boolean)) {
    current = join(current, part)
    try {
      const info = await lstat(current)
      if (info.isSymbolicLink()) throw new Error(`拒绝写入符号链接目录：${current}`)
      if (!info.isDirectory()) throw new Error(`写入目标不是目录：${current}`)
    } catch (error) {
      if (!isMissing(error)) throw error
      await mkdir(current)
    }
  }
}

async function atomicWriteText(base: string, target: string, value: string): Promise<void> {
  const targetPath = safeResolve(base, join(base, target))
  const parent = dirname(targetPath)
  await ensureDirectoryChain(base, parent)
  const temporary = join(parent, `.${targetPath.split(sep).pop() ?? 'content'}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, value, { encoding: 'utf8', flag: 'wx' })
  try {
    await rename(temporary, targetPath)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function directoryFileCount(path: string): Promise<number> {
  try {
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isDirectory()) return 0
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter((entry) => !entry.isSymbolicLink() && (entry.isFile() || entry.isDirectory()) && entry.name !== 'PENDING.md').length
  } catch (error) {
    if (isMissing(error)) return 0
    throw error
  }
}

function artifactReady(project: CreatorProject, path: string): boolean {
  return project.artifacts.some((artifact) => artifact.path === path && artifact.ready)
}

interface TimelineLine {
  startSeconds: number
  endSeconds: number
  startLabel: string
  endLabel: string
  text: string
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function parseScriptTimeline(script: string): TimelineLine[] {
  const pattern = /^(\d{1,2}):(\d{2})(?::(\d{2}))?[\s:：]+(.+)$/
  const timed: Array<{ seconds: number; text: string }> = []
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const match = pattern.exec(line)
    if (!match) continue
    const hours = match[3] ? Number(match[1]) : 0
    const minutes = match[3] ? Number(match[2]) : Number(match[1])
    const seconds = match[3] ? Number(match[3]) : Number(match[2])
    timed.push({ seconds: hours * 3600 + minutes * 60 + seconds, text: match[4].trim() })
  }
  if (timed.length === 0) {
    const text = script.trim()
    if (!text) return []
    return [{ startSeconds: 0, endSeconds: 60, startLabel: '00:00', endLabel: '01:00', text }]
  }
  return timed.map((item, index) => {
    const next = timed[index + 1]
    const end = next ? Math.max(next.seconds, item.seconds + 1) : item.seconds + 5
    return { startSeconds: item.seconds, endSeconds: end, startLabel: formatTime(item.seconds), endLabel: formatTime(end), text: item.text }
  })
}

function pendingActionsForPlatform(key: string, ready: boolean, provider?: ProviderStatus): string[] {
  if (key === 'wechat_article') {
    const actions: string[] = []
    if (!ready) actions.push('先完成公众号长文（wechat/article.md）')
    actions.push(provider?.status === 'configured' ? '调用微信草稿 API 写入草稿箱（发布前需人工确认）' : '配置 WECHAT_APP_ID / WECHAT_APP_SECRET 后写入草稿箱')
    return actions
  }
  if (key === 'xhs_graphic') {
    const actions: string[] = []
    if (!ready) actions.push('先完成小红书文案（xhs/post.md）')
    actions.push('按 xhs/cards/PENDING.md 生成 6–8 张图卡（图像 Provider）')
    actions.push('人工上传 xhs/post.md 与 xhs/cards/ 至小红书')
    return actions
  }
  const actions: string[] = []
  if (!ready) actions.push('先渲染 video/final.mp4（Remotion，见 video/narration/PENDING.md）')
  actions.push(provider?.status === 'configured' ? '使用已配置的发布器准备草稿（最终发布需人工确认）' : '未配置视频发布器：仅生成发布包，人工上传')
  return actions
}

async function fileArtifact(projectDirectory: string, path: string, kind: ArtifactRef['kind'], label: string): Promise<ArtifactRef> {
  const absolute = safeResolve(projectDirectory, join(projectDirectory, path))
  await assertNoSymlinkPath(projectDirectory, absolute)
  try {
    const info = await lstat(absolute)
    if (info.isSymbolicLink()) throw new Error(`拒绝读取符号链接：${path}`)
    const isDirectory = info.isDirectory()
    const count = isDirectory ? await directoryFileCount(absolute) : 0
    const ready = isDirectory ? count > 0 : info.isFile() && info.size > 0
    const finalLabel = path === 'xhs/cards/' ? `小红书图卡 ${count} 张` : label
    return {
      path,
      kind,
      label: finalLabel,
      ready,
      hash: ready ? hashFor(`${path}:${info.size}:${info.mtimeMs}:${count}`) : '',
      updatedAt: info.mtime.toISOString(),
    }
  } catch (error) {
    if (!isMissing(error)) throw error
    return { path, kind, label, ready: false, hash: '', updatedAt: '' }
  }
}

function approvalsFrom(value: unknown): ApprovalRecord[] {
  if (!Array.isArray(value)) return defaultApprovals()
  const records = defaultApprovals()
  for (const item of value) {
    if (!isRecord(item) || !isValidGate(item.gate)) continue
    const target = records.find((record) => record.gate === item.gate)
    if (!target) continue
    target.approved = item.approved === true
    target.approvedAt = typeof item.approvedAt === 'string' ? item.approvedAt : undefined
    target.artifactHash = textValue(item.artifactHash)
  }
  return records
}

function deriveStage(approvals: ApprovalRecord[], manifest: Manifest): CreatorStage {
  if (isValidStage(manifest.stage)) return manifest.stage
  if (approvals.find((item) => item.gate === 'publish_package')?.approved) return 'publish'
  if (approvals.find((item) => item.gate === 'platform_variants')?.approved) return 'video'
  if (approvals.find((item) => item.gate === 'approved_article')?.approved) return 'variants'
  if (approvals.find((item) => item.gate === 'brief_sources')?.approved) return 'article'
  return 'brief'
}

function deriveNextAction(stage: CreatorStage, approvals: ApprovalRecord[]): string {
  const pending = approvals.find((item) => !item.approved)
  if (!pending) return '检查草稿并人工点击最终发布'
  if (pending.gate === 'brief_sources') return '补充 Brief、事实和可核验来源'
  if (pending.gate === 'approved_article') return '审阅公众号长文并批准表达锚点'
  if (pending.gate === 'platform_variants') return '检查小红书图卡与视频脚本'
  return stage === 'publish' ? '生成发布包并人工确认平台草稿' : '准备发布包并等待人工确认'
}

function gateHash(project: CreatorProject, gate: ApprovalGate): string {
  if (gate === 'brief_sources') return hashFor(`${project.brief}\n${project.artifacts.find((item) => item.path === 'claims.yaml')?.hash ?? ''}`)
  if (gate === 'approved_article') return hashFor(project.article)
  if (gate === 'platform_variants') return hashFor(`${project.article}\n${project.xhsCopy}\n${project.videoScript}`)
  return hashFor(project.artifacts.find((item) => item.path === 'publish/package.json')?.hash ?? '')
}

function invalidateFrom(records: ApprovalRecord[], gate: ApprovalGate): void {
  const index = GATES.indexOf(gate)
  for (const record of records) {
    if (GATES.indexOf(record.gate) >= index) {
      record.approved = false
      record.approvedAt = undefined
    }
  }
}

export class FileCreatorRepository implements CreatorRepository {
  readonly root: string

  constructor(contentRoot: string) {
    if (!contentRoot.trim()) throw new Error('未配置 contentRoot，无法使用文件内容仓库')
    this.root = resolve(contentRoot)
  }

  private settingsRelativePath(): string {
    return join('_工作台', 'creator-settings.json')
  }

  private async readSettingsFile(): Promise<{ settings: CreatorSettings; updatedAt: string }> {
    await this.ensureRoot()
    const absolute = safeResolve(this.root, join(this.root, this.settingsRelativePath()))
    await assertNoSymlinkPath(this.root, absolute)
    try {
      const parsed = JSON.parse(await readText(absolute))
      const info = await lstat(absolute)
      return { settings: normalizeSettings(parsed), updatedAt: info.mtime.toISOString() }
    } catch (error) {
      if (!isMissing(error)) throw error
      return { settings: defaultSettings(), updatedAt: new Date().toISOString() }
    }
  }

  private async ensureRoot(): Promise<void> {
    let info
    try {
      info = await lstat(this.root)
    } catch (error) {
      if (isMissing(error)) throw new Error(`内容根目录不存在：${this.root}`)
      throw error
    }
    if (info.isSymbolicLink()) throw new Error('contentRoot 不能是符号链接')
    if (!info.isDirectory()) throw new Error(`contentRoot 不是目录：${this.root}`)
  }

  private async locations(): Promise<ProjectLocation[]> {
    await this.ensureRoot()
    const result: ProjectLocation[] = []
    const months = await readdir(this.root, { withFileTypes: true })
    for (const month of months) {
      if (!month.isDirectory() || month.isSymbolicLink() || !MONTH_PATTERN.test(month.name)) continue
      const monthDirectory = safeResolve(this.root, join(this.root, month.name))
      const projects = await readdir(monthDirectory, { withFileTypes: true })
      for (const project of projects) {
        if (!project.isDirectory() || project.isSymbolicLink()) continue
        const directory = safeResolve(this.root, join(monthDirectory, project.name))
        const checked = await lstat(directory)
        if (checked.isSymbolicLink()) continue
        result.push({ month: month.name, folder: project.name, directory })
      }
    }
    return result
  }

  private async readLocation(location: ProjectLocation): Promise<ProjectRead> {
    const manifestPath = safeResolve(location.directory, join(location.directory, 'project.yaml'))
    await assertNoSymlinkPath(location.directory, manifestPath)
    const parsed = await readOptionalManifest(manifestPath)
    const manifest = parsed.manifest
    const slug = textValue(manifest.slug, location.folder.replace(PROJECT_PATTERN, '$2')) || location.folder
    const id = textValue(manifest.id, `${location.month}-${slug}`)
    const title = textValue(manifest.title, titleFromSlug(slug))
    const plannedAt = textValue(manifest.plannedAt, defaultDate(location.month, location.folder))
    const briefPath = safeResolve(location.directory, join(location.directory, 'brief.md'))
    const articlePath = safeResolve(location.directory, join(location.directory, 'wechat/article.md'))
    const xhsCopyPath = safeResolve(location.directory, join(location.directory, 'xhs/post.md'))
    const videoScriptPath = safeResolve(location.directory, join(location.directory, 'video/script.md'))
    await Promise.all([
      assertNoSymlinkPath(location.directory, briefPath),
      assertNoSymlinkPath(location.directory, articlePath),
      assertNoSymlinkPath(location.directory, xhsCopyPath),
      assertNoSymlinkPath(location.directory, videoScriptPath),
    ])
    const brief = await readOptionalText(briefPath)
    const article = await readOptionalText(articlePath)
    const xhsCopy = await readOptionalText(xhsCopyPath)
    const videoScript = await readOptionalText(videoScriptPath)
    const sourceCount = await directoryFileCount(safeResolve(location.directory, join(location.directory, 'sources')))
    const claimsPath = safeResolve(location.directory, join(location.directory, 'claims.yaml'))
    await assertNoSymlinkPath(location.directory, claimsPath)
    const claimsText = await readOptionalText(claimsPath)
    let claimsHasItems = false
    try {
      const parsedClaims = parse(claimsText)
      claimsHasItems = isRecord(parsedClaims) && Array.isArray(parsedClaims.claims) && parsedClaims.claims.length > 0
    } catch {
      claimsHasItems = false
    }
    const claims = await fileArtifact(location.directory, 'claims.yaml', 'source', 'Claims 与来源')
    if (!claimsHasItems) claims.ready = false
    const artifacts = await Promise.all([
      fileArtifact(location.directory, 'brief.md', 'markdown', 'Brief'),
      claims,
      fileArtifact(location.directory, 'sources/', 'source', `来源目录${sourceCount ? ` ${sourceCount} 项` : ''}`),
      fileArtifact(location.directory, 'wechat/article.md', 'markdown', '公众号长文'),
      fileArtifact(location.directory, 'xhs/post.md', 'markdown', '小红书文案'),
      fileArtifact(location.directory, 'xhs/cards/', 'image', '小红书图卡'),
      fileArtifact(location.directory, 'video/script.md', 'markdown', '视频脚本'),
      fileArtifact(location.directory, 'video/scenes.json', 'json', '视频场景'),
      fileArtifact(location.directory, 'video/captions.json', 'json', '视频字幕'),
      fileArtifact(location.directory, 'video/narration/', 'audio', '视频配音'),
      fileArtifact(location.directory, 'video/final.mp4', 'video', '视频预览'),
      fileArtifact(location.directory, 'publish/package.json', 'json', '发布包'),
      fileArtifact(location.directory, 'publish/preview.html', 'json', '微信排版预览'),
    ])
    const approvalsPath = safeResolve(location.directory, join(location.directory, 'approvals.json'))
    await assertNoSymlinkPath(location.directory, approvalsPath)
    const rawApprovals = await readOptionalJson(approvalsPath)
    const raw = approvalsFrom(rawApprovals ?? manifest.approvals)
    const hasSources = claimsHasItems || sourceCount > 0
    const blockedReason = textValue(manifest.blockedReason) || parsed.error || (!brief.trim() ? 'Brief 尚未填写' : !hasSources ? '来源尚未准备' : undefined)
    const status = blockedReason ? 'blocked' : manifest.status === 'running' ? 'running' : 'ready'
    const project: CreatorProject = {
      id,
      title,
      slug,
      month: location.month,
      plannedAt,
      stage: 'brief',
      status,
      progress: 0,
      nextAction: '',
      blockedReason,
      targets: defaultTargets(manifest.targets),
      approvals: raw,
      artifacts,
      brief,
      article,
      xhsCopy,
      videoScript,
    }
    // 读取时按内容哈希失效联动：外部（Agent/文件工具）直接修改产物后，
    // 受影响的下游闸门自动回到未批准，与 updateArtifact 的显式失效保持一致。
    const effective = raw.map((record) => {
      if (!record.approved || record.artifactHash === '') return record
      return gateHash(project, record.gate) === record.artifactHash
        ? record
        : { ...record, approved: false, approvedAt: undefined }
    })
    project.approvals = effective
    project.stage = deriveStage(effective, manifest)
    project.progress = Math.min(100, effective.filter((item) => item.approved).length * 25)
    project.nextAction = textValue(manifest.nextAction, deriveNextAction(project.stage, effective))
    return { location, manifest, manifestError: parsed.error, project }
  }

  private async find(id: string): Promise<ProjectRead> {
    for (const location of await this.locations()) {
      const item = await this.readLocation(location)
      if (item.project.id === id) return item
    }
    throw new Error(`主题不存在：${id}`)
  }

  async listProjects(query = ''): Promise<CreatorProject[]> {
    const needle = query.trim().toLowerCase()
    const projects = await Promise.all((await this.locations()).map((location) => this.readLocation(location)))
    return projects
      .map((item) => item.project)
      .filter((project) => needle === '' || `${project.title} ${project.slug}`.toLowerCase().includes(needle))
      .sort((a, b) => b.plannedAt.localeCompare(a.plannedAt))
      .map(clone)
  }

  async createProject(draft: CreatorProjectDraft): Promise<CreatorProject> {
    validateProjectDraft(draft)
    await this.ensureRoot()
    const month = draft.plannedAt.slice(0, 7)
    const folder = `${draft.plannedAt}_${draft.slug}`
    const monthDirectory = safeResolve(this.root, join(this.root, month))
    await ensureDirectoryChain(this.root, monthDirectory)
    const projectDirectory = safeResolve(this.root, join(monthDirectory, folder))
    try {
      const existing = await lstat(projectDirectory)
      if (existing.isSymbolicLink()) throw new Error('拒绝覆盖符号链接主题目录')
      throw new Error('同一日期和 slug 的主题已存在')
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    await mkdir(projectDirectory)
    const id = `${month}-${draft.slug}`
    const targets = draft.targets?.filter(isValidTarget)
    const manifest: Manifest = {
      schemaVersion: 1,
      id,
      title: draft.title.trim(),
      slug: draft.slug,
      plannedAt: draft.plannedAt,
      stage: 'brief',
      status: 'blocked',
      nextAction: '填写 Brief 并补充可核验来源',
      targets: targets && targets.length > 0 ? targets : [...TARGETS],
    }
    await atomicWriteText(projectDirectory, 'project.yaml', stringify(manifest))
    await atomicWriteText(projectDirectory, 'brief.md', `# ${draft.title.trim()}\n\n> 选题卡：本主题从哪个选题转正而来，服务谁、解决什么问题。\n\n- 目标读者：\n- 核心问题：\n- 边界：\n- 待验证问题：\n- 来源：\n  - \n`)
    await atomicWriteText(projectDirectory, 'claims.yaml', '# 待补充主张与来源\nclaims: []\n')
    await atomicWriteText(projectDirectory, 'wechat/article.md', '')
    await atomicWriteText(projectDirectory, 'xhs/post.md', '')
    await atomicWriteText(projectDirectory, 'video/script.md', '')
    await atomicWriteText(projectDirectory, 'approvals.json', `${JSON.stringify(defaultApprovals(), null, 2)}\n`)
    await ensureDirectoryChain(projectDirectory, join(projectDirectory, 'sources'))
    await ensureDirectoryChain(projectDirectory, join(projectDirectory, 'wechat'))
    await ensureDirectoryChain(projectDirectory, join(projectDirectory, 'xhs', 'cards'))
    await ensureDirectoryChain(projectDirectory, join(projectDirectory, 'video'))
    return clone((await this.find(id)).project)
  }

  async getProject(id: string): Promise<CreatorProject | null> {
    try {
      return clone((await this.find(id)).project)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('主题不存在：')) return null
      throw error
    }
  }

  async updateArtifact(id: string, content: Pick<CreatorProject, 'brief' | 'article' | 'xhsCopy' | 'videoScript'>): Promise<CreatorProject> {
    const item = await this.find(id)
    const files: Array<[keyof typeof content, string]> = [
      ['brief', 'brief.md'],
      ['article', 'wechat/article.md'],
      ['xhsCopy', 'xhs/post.md'],
      ['videoScript', 'video/script.md'],
    ]
    let changed = false
    for (const [field, path] of files) {
      const value = content[field]
      if (value === item.project[field]) continue
      if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) throw new Error(`${path} 超过 2 MiB 上限`)
      await atomicWriteText(item.location.directory, path, value)
      changed = true
    }
    if (changed) {
      const approvals = approvalsFrom(item.project.approvals)
      if (content.brief !== item.project.brief) invalidateFrom(approvals, 'brief_sources')
      else if (content.article !== item.project.article) invalidateFrom(approvals, 'approved_article')
      else if (content.xhsCopy !== item.project.xhsCopy || content.videoScript !== item.project.videoScript) invalidateFrom(approvals, 'platform_variants')
      await atomicWriteText(item.location.directory, 'approvals.json', `${JSON.stringify(approvals, null, 2)}\n`)
    }
    return clone((await this.find(id)).project)
  }

  async approveGate(id: string, gate: ApprovalGate): Promise<CreatorProject> {
    if (!isValidGate(gate)) throw new Error('审批闸门不存在')
    const item = await this.find(id)
    const { project } = item
    const ready = (path: string): boolean => project.artifacts.some((artifact) => artifact.path === path && artifact.ready)
    if (gate === 'brief_sources' && (!project.brief.trim() || (!ready('claims.yaml') && !ready('sources/')))) throw new Error('Brief 与来源未准备完整')
    if (gate === 'approved_article' && (!project.approvals.find((record) => record.gate === 'brief_sources')?.approved || !project.article.trim())) throw new Error('请先批准 Brief 与来源，并完成公众号长文')
    if (gate === 'platform_variants' && (!project.approvals.find((record) => record.gate === 'approved_article')?.approved || !project.xhsCopy.trim() || !project.videoScript.trim())) throw new Error('请先批准公众号长文，并完成平台变体')
    if (gate === 'publish_package' && (!project.approvals.find((record) => record.gate === 'platform_variants')?.approved || !ready('publish/package.json'))) throw new Error('请先批准平台变体，并生成发布包')
    const approvals = approvalsFrom(project.approvals)
    const record = approvals.find((entry) => entry.gate === gate)
    if (!record) throw new Error('审批闸门不存在')
    record.approved = true
    record.approvedAt = new Date().toISOString()
    record.artifactHash = gateHash(project, gate)
    await atomicWriteText(item.location.directory, 'approvals.json', `${JSON.stringify(approvals, null, 2)}\n`)
    return clone((await this.find(id)).project)
  }

  async runStage(id: string, stage: CreatorStage): Promise<CreatorProject> {
    if (!isValidStage(stage)) throw new Error('创作阶段不存在')
    const item = await this.find(id)
    const { project } = item
    const settings = await this.getSettings()
    let approvalsChanged = false
    const approvals = approvalsFrom(project.approvals)

    if (stage === 'article') {
      if (!project.brief.trim() || (!artifactReady(project, 'claims.yaml') && !artifactReady(project, 'sources/'))) {
        throw new Error('请先完成 Brief 与可核验来源（brief.md、claims.yaml 或 sources/）')
      }
    }

    if (stage === 'variants') {
      if (!project.xhsCopy.trim()) throw new Error('请先完成小红书文案（xhs/post.md）')
      const pending = [
        '# 小红书图卡待执行清单',
        '',
        `> 生成时间：${new Date().toISOString()} · 状态：pending（尚未生成任何图卡）`,
        '',
        '依据已批准公众号长文与 xhs/post.md 生成 6–8 张 3:4 图卡：',
        '',
        '1. 封面：主题一句话 + 平台名',
        '2. 事实卡：每个核心主张一张，文字可读、可追溯到 claims.yaml',
        '3. 结构卡：长文结构拆解（背景 → 事实 → 结论）',
        '4. 结尾卡：行动建议或关注引导',
        '',
        '每张卡保存可复现提示词到本目录（如 card-01.prompt.md），生成的图片以 card-01.png 命名。',
        '图像 Provider 可用之前，不要伪造 PNG 已生成。',
        '',
      ].join('\n')
      await atomicWriteText(item.location.directory, join('xhs', 'cards', 'PENDING.md'), pending)
    }

    if (stage === 'video') {
      if (!project.videoScript.trim()) throw new Error('请先完成视频脚本（video/script.md）')
      const timeline = parseScriptTimeline(project.videoScript)
      const generatedAt = new Date().toISOString()
      const scenes = timeline.map((line, index) => ({
        index: index + 1,
        start: line.startLabel,
        end: line.endLabel,
        durationSec: Math.round(line.endSeconds - line.startSeconds),
        text: line.text,
        visual: '',
      }))
      const captions = timeline.map((line, index) => ({ index: index + 1, start: line.startLabel, end: line.endLabel, text: line.text }))
      await atomicWriteText(item.location.directory, 'video/scenes.json', `${JSON.stringify({ schemaVersion: 1, source: 'video/script.md', generatedAt, sceneCount: scenes.length, scenes }, null, 2)}\n`)
      await atomicWriteText(item.location.directory, 'video/captions.json', `${JSON.stringify({ schemaVersion: 1, source: 'video/script.md', generatedAt, captionCount: captions.length, captions }, null, 2)}\n`)
      const speechStatus = settings.statuses.find((status) => status.id === 'speech')
      const remotionStatus = settings.statuses.find((status) => status.id === 'remotion')
      const pending = [
        '# 视频成片待执行清单',
        '',
        `> 生成时间：${generatedAt} · scenes.json / captions.json 已由 script.md 派生`,
        '',
        '- [ ] 配音：使用 speech Provider 为每个场景生成旁白（video/narration/）。',
        `      当前状态：${speechStatus?.status === 'configured' ? 'speech Provider 已配置' : 'speech Provider 未配置（pending）'}`,
        '- [ ] 渲染：使用 remotion Provider 合成 1080×1920、30fps 成片（video/final.mp4）。',
        `      当前状态：${remotionStatus?.status === 'configured' ? 'remotion 已配置' : 'remotion 未配置（pending）'}`,
        '- [ ] 视觉：为每个场景补充视觉提示词（scenes.json 的 visual 字段）。',
        '',
        'Provider 可用之前，不伪造 narration 音频或 final.mp4 已生成。',
        '',
      ].join('\n')
      await atomicWriteText(item.location.directory, join('video', 'narration', 'PENDING.md'), pending)
    }

    if (stage === 'publish') {
      if (!approvals.find((record) => record.gate === 'platform_variants')?.approved) {
        throw new Error('请先批准平台变体（platform_variants）再生成发布包')
      }
      const statusOf = (id: ProviderId): ProviderStatus | undefined => settings.statuses.find((status) => status.id === id)
      const rows: Array<{ key: string; label: string; providerId: ProviderId; source: string }> = [
        { key: 'wechat_article', label: '公众号', providerId: 'wechat', source: 'wechat/article.md' },
        { key: 'xhs_graphic', label: '小红书', providerId: 'xhs', source: 'xhs/post.md' },
        { key: 'douyin_video', label: '抖音', providerId: 'douyin', source: 'video/final.mp4' },
        { key: 'wechat_channels_video', label: '视频号', providerId: 'channels', source: 'video/final.mp4' },
      ]
      const platforms = rows.map((row) => {
        const provider = statusOf(row.providerId)
        const ready = row.key === 'wechat_article' ? project.article.trim().length > 0
          : row.key === 'xhs_graphic' ? project.xhsCopy.trim().length > 0
          : artifactReady(project, 'video/final.mp4')
        return {
          key: row.key,
          label: row.label,
          source: row.source,
          assets: row.key === 'xhs_graphic' ? 'xhs/cards/' : undefined,
          provider: { id: row.providerId, status: provider?.status ?? 'missing', detail: provider?.detail ?? '' },
          ready,
          status: 'pending',
          pendingActions: pendingActionsForPlatform(row.key, ready, provider),
        }
      })
      const packageData = {
        schemaVersion: 1,
        projectId: project.id,
        title: project.title,
        generatedAt: new Date().toISOString(),
        requiresHumanConfirmation: true,
        platforms,
      }
      await atomicWriteText(item.location.directory, 'publish/package.json', `${JSON.stringify(packageData, null, 2)}\n`)
      const pending = [
        '# 发布待执行清单',
        '',
        `> 生成时间：${new Date().toISOString()} · 发布包不代表已发布`,
        '',
        ...platforms.flatMap((row) => [`- ${row.label}（${row.key}）：${row.ready ? '素材就绪' : '素材缺失'}`, ...row.pendingActions.map((action) => `    - ${action}`)]),
        '',
        '所有平台草稿写入与最终发布都必须由用户明确批准后执行。',
        '',
      ].join('\n')
      await atomicWriteText(item.location.directory, 'publish/PENDING.md', pending)
      invalidateFrom(approvals, 'publish_package')
      approvalsChanged = true
    }

    if (approvalsChanged) {
      await atomicWriteText(item.location.directory, 'approvals.json', `${JSON.stringify(approvals, null, 2)}\n`)
    }
    const manifest: Manifest = { ...item.manifest, stage, status: project.blockedReason ? 'blocked' : 'ready', nextAction: project.blockedReason ? project.nextAction : deriveNextAction(stage, approvals) }
    await atomicWriteText(item.location.directory, 'project.yaml', stringify(manifest))
    return clone((await this.find(id)).project)
  }

  async getCapabilities(): Promise<CreatorCapabilities> {
    let configured = false
    try {
      const info = await lstat(this.root)
      configured = info.isDirectory() && !info.isSymbolicLink()
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    const settings = await this.getSettings()
    const stateOf = (id: ProviderId): ProviderRuntimeState => {
      const status = settings.statuses.find((item) => item.id === id)
      if (status === undefined) return 'missing'
      if (status.status === 'configured') return 'configured'
      if (status.status === 'disabled') return 'disabled'
      return 'missing'
    }
    return {
      dshVersion: '0.1.1-rc.2',
      repositoryMode: 'file',
      contentRootConfigured: configured,
      contentRoot: configured ? this.root : '',
      imageProvider: stateOf('image'),
      speechProvider: stateOf('speech'),
      remotion: stateOf('remotion'),
      wechatDraft: stateOf('wechat'),
      browserDraft: 'unavailable',
      settingsStorage: 'file',
    }
  }

  async getRevision(): Promise<string> {
    await this.ensureRoot()
    const fingerprint: string[] = []
    for (const location of await this.locations()) {
      fingerprint.push(`${location.folder}:${(await lstat(location.directory)).mtimeMs}`)
      try {
        const entries = await readdir(location.directory, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue
          const path = join(location.directory, entry.name)
          if (entry.isFile()) {
            const info = await lstat(path)
            fingerprint.push(`${entry.name}:${info.size}:${info.mtimeMs}`)
          } else if (entry.isDirectory()) {
            try {
              const nested = await readdir(path, { withFileTypes: true })
              for (const file of nested) {
                if (!file.isFile() || file.isSymbolicLink()) continue
                const info = await lstat(join(path, file.name))
                fingerprint.push(`${entry.name}/${file.name}:${info.size}:${info.mtimeMs}`)
              }
            } catch {
              // 忽略子目录读取失败
            }
          }
        }
      } catch {
        // 忽略目录读取失败
      }
    }
    return `rev-${createHash('sha256').update(fingerprint.join('\n')).digest('hex').slice(0, 16)}`
  }

  async getSettings(): Promise<CreatorSettingsSnapshot> {
    const stored = await this.readSettingsFile()
    return settingsSnapshot(stored.settings, 'file', true, environmentWithUserVars(), stored.updatedAt)
  }

  async saveSettings(settings: CreatorSettings): Promise<CreatorSettingsSnapshot> {
    await this.ensureRoot()
    const normalized = normalizeSettings(settings)
    await atomicWriteText(this.root, this.settingsRelativePath(), `${JSON.stringify(normalized, null, 2)}\n`)
    return this.getSettings()
  }

  async checkSettings(): Promise<CreatorSettingsSnapshot> {
    return this.getSettings()
  }
}
