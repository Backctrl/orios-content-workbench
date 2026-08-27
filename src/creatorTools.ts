import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type {
  ApprovalGate,
  CreatorProject,
  CreatorRepository,
  CreatorStage,
  CreatorTarget,
  ProviderId,
  ProviderSettings,
} from './types.js'
import type { CandidateStore, ProfileStore } from './workspace.js'
import { checkVariantSimilarity, reviewArticleScore } from './reviewService.js'
import { generateTopicImage } from './imageService.js'

interface ToolsContext {
  tools: { register: (tool: ToolDefinition) => void }
}

const JSON_VALUE = { type: 'json' } as const

const GATES: ApprovalGate[] = ['brief_sources', 'approved_article', 'platform_variants', 'publish_package']
const STAGES: CreatorStage[] = ['brief', 'article', 'variants', 'video', 'publish']
const TARGETS: CreatorTarget[] = ['wechat_article', 'xhs_graphic', 'douyin_video', 'wechat_channels_video']
const PROVIDER_IDS: ProviderId[] = ['image', 'speech', 'remotion', 'wechat', 'xhs', 'douyin', 'channels']
const GATE_LABELS: Record<ApprovalGate, string> = {
  brief_sources: 'Brief 与来源',
  approved_article: '公众号长文',
  platform_variants: '平台变体',
  publish_package: '发布包',
}
const STAGE_LABELS: Record<CreatorStage, string> = {
  brief: 'Brief 与来源',
  article: '公众号长文',
  variants: '平台变体',
  video: '视频成片',
  publish: '发布准备',
}

const FIELD_TRUNCATE = 6000

function signalOf(exec: { signal: AbortSignal }): AbortSignal {
  return exec.signal
}

function compactText(title: string, detail: string): Array<{ type: 'text'; text: string }> {
  return [{ type: 'text', text: `${title}: ${detail}` }]
}

function asJson(value: unknown): never {
  return JSON.parse(JSON.stringify(value)) as never
}

function present(title: string, rawInput: unknown): { card: 'generic'; title: string; kind: 'other'; rawInput: unknown } {
  return { card: 'generic', title, kind: 'other', rawInput }
}

function truncate(value: string): { text: string; truncated: boolean } {
  if (value.length <= FIELD_TRUNCATE) return { text: value, truncated: false }
  return { text: `${value.slice(0, FIELD_TRUNCATE)}\n…（已截断，完整内容请在主题文件夹中读取）`, truncated: true }
}

function gatesOf(project: CreatorProject): Array<{ gate: ApprovalGate; label: string; approved: boolean; approvedAt?: string }> {
  return GATES.map((gate) => {
    const record = project.approvals.find((item) => item.gate === gate)
    return { gate, label: GATE_LABELS[gate], approved: record?.approved === true, approvedAt: record?.approvedAt }
  })
}

function summaryOf(project: CreatorProject): Record<string, unknown> {
  return {
    id: project.id,
    title: project.title,
    slug: project.slug,
    month: project.month,
    plannedAt: project.plannedAt,
    stage: project.stage,
    stageLabel: STAGE_LABELS[project.stage],
    status: project.status,
    progress: project.progress,
    nextAction: project.nextAction,
    ...(project.blockedReason === undefined ? {} : { blockedReason: project.blockedReason }),
    gates: gatesOf(project),
  }
}

async function folderPathOf(repository: CreatorRepository, project: CreatorProject): Promise<string | undefined> {
  try {
    const capabilities = await repository.getCapabilities()
    if (capabilities.repositoryMode !== 'file' || !capabilities.contentRoot) return undefined
    return `${capabilities.contentRoot}/${project.month}/${project.plannedAt}_${project.slug}`
  } catch {
    return undefined
  }
}

export function registerCreatorTools(ctx: ToolsContext, repository: CreatorRepository, workspace: CandidateStore & ProfileStore): () => void {
  const disposers: Array<() => void> = []
  const register = (tool: ToolDefinition): void => {
    const stop = ctx.tools.register(tool)
    if (typeof stop === 'function') disposers.push(stop)
  }
  register(defineTool({
    name: 'creator_workflow_guide',
    description:
      'OriOS 内容工作台自引导指南。用户问这个工作台能做什么、怎么用，或你不确定下一步时调用。'
      + '返回四级审批闸门工作流、主题目录契约与实时能力状态（内容根目录是否配置、Provider 状态）。',
    parameters: {},
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const status = (value as { status?: { contentRootConfigured?: boolean } }).status
        return compactText('Creator guide', status?.contentRootConfigured ? '内容根目录已配置' : '内容根目录未配置')
      },
    },
    presentCall: (args) => present('Creator guide', args),
    async execute(_args, exec) {
      const signal = signalOf(exec)
      const capabilities = await repository.getCapabilities()
      const settings = await repository.getSettings()
      const profile = await workspace.get()
      const candidates = await workspace.list()
      const profileConfigured = Object.keys(profile).length > 0
      const guide = [
        'OriOS 内容生产工作台：以主题目录为唯一真源，按四级人工审批闸门连续生产公众号、小红书、抖音与视频号内容。',
        '闸门顺序：brief_sources（Brief 与来源）→ approved_article（公众号长文）→ platform_variants（平台变体）→ publish_package（发布包）。',
        '选题流程：素材（飞书表格/OrbitOS 知识库/本地）→ 候选选题池 _工作台/candidates.yaml（creator_candidate_add 添加）→ 用户挑选（creator_candidate_select）→ 转正建主题（creator_candidate_convert）。',
        '目录契约：project.yaml（元数据）、brief.md（选题卡）、claims.yaml+sources/（主张与来源）、wechat/article.md（长文锚点）、xhs/post.md+xhs/cards/（小红书）、video/script.md+scenes.json+captions.json（视频）、publish/package.json（发布包）、approvals.json（闸门）。',
        '正文内容用系统文件工具读写；本工作台工具负责建主题、审批、运行阶段生成、Provider 设置、选题库与状态查询。',
        '纪律：一次只推进当前阶段；没有来源的事实不能写成确定结论；Provider 不可用时只写待执行清单，不伪造产物；平台草稿写入与最终发布必须用户明确批准。',
        ...(profileConfigured ? [] : ['首次部署：请先调用 creator_profile 填写账号定位（定位/目标读者/语气/常用方向），据此生成简易选题筛选标准。']),
      ].join('\n')
      return asJson({ guide, status: {
        repositoryMode: capabilities.repositoryMode,
        contentRootConfigured: capabilities.contentRootConfigured,
        contentRoot: capabilities.contentRoot ?? '',
        settingsStorage: capabilities.settingsStorage ?? 'memory',
        profileConfigured,
        candidateCount: candidates.length,
        providers: settings.statuses.map((status) => ({ id: status.id, label: status.label, status: status.status, detail: status.detail })),
      } })
    },
  }))

  register(defineTool({
    name: 'creator_setup',
    description:
      '只读检查内容工作台：内容根目录、仓库模式（file/mock）与 Provider 状态。'
      + 'contentRoot 来自插件配置（cordis.patch.yml 的 contentRoot 或 ORIOS_CREATOR_CONTENT_ROOT 环境变量），改配置后需重载宿主生效；'
      + 'Provider 设置可通过 creator_settings 更新。',
    parameters: {},
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const status = (value as { status?: { repositoryMode?: string } }).status
        return compactText('Creator setup', `mode=${status?.repositoryMode ?? 'unknown'}`)
      },
    },
    presentCall: (args) => present('Creator setup', args),
    async execute(_args, exec) {
      const signal = signalOf(exec)
      const capabilities = await repository.getCapabilities()
      const settings = await repository.getSettings()
      const profile = await workspace.get()
      const profileConfigured = Object.keys(profile).length > 0
      return asJson({
        status: {
          repositoryMode: capabilities.repositoryMode,
          contentRootConfigured: capabilities.contentRootConfigured,
          contentRoot: capabilities.contentRoot ?? '',
          settingsStorage: capabilities.settingsStorage ?? 'memory',
          profileConfigured,
          providers: settings.statuses.map((status) => ({ id: status.id, label: status.label, status: status.status, detail: status.detail })),
        },
        note: profileConfigured
          ? 'contentRoot 只能通过插件配置修改（cordis.patch.yml 或 ORIOS_CREATOR_CONTENT_ROOT），改后需重载宿主。Provider 设置用 creator_settings 更新。'
          : '账号画像尚未配置：请先用 creator_profile 填写账号定位/目标读者/语气，据此生成简易选题筛选标准。contentRoot 只能通过插件配置修改。',
      })
    },
  }))

  register(defineTool({
    name: 'creator_settings',
    description:
      '读取或更新工作台的 Provider 设置（图像/配音/Remotion/微信/小红书/抖音/视频号）。'
      + '省略 provider 时返回当前全部设置与状态；给出 provider 时仅合并传入的字段。密钥只存环境变量名，不存密钥值。',
    parameters: {
      provider: { type: 'string', enum: PROVIDER_IDS, description: '要更新的 Provider id。省略则只读。' },
      enabled: { type: 'boolean', description: '启用或停用该 Provider。' },
      endpoint: { type: 'string', description: 'HTTP(S) 接口地址。' },
      model: { type: 'string', description: '模型/版本。' },
      credentialEnvs: { type: 'array', items: { type: 'string' }, description: '密钥环境变量名列表。' },
      command: { type: 'string', description: '本地命令（Remotion 等）。' },
      profilePath: { type: 'string', description: '平台会话/Profile 路径。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { updated?: boolean }
        return compactText('Creator settings', record.updated === true ? 'updated' : 'read')
      },
    },
    presentCall: (args) => present('Creator settings', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      const current = await repository.getSettings()
      if (typeof args.provider !== 'string' || !PROVIDER_IDS.includes(args.provider as ProviderId)) {
        return asJson({ settings: current.settings, statuses: current.statuses, updated: false })
      }
      const id = args.provider as ProviderId
      const patch: Partial<ProviderSettings> = {}
      if (typeof args.enabled === 'boolean') patch.enabled = args.enabled
      if (typeof args.endpoint === 'string') patch.endpoint = args.endpoint
      if (typeof args.model === 'string') patch.model = args.model
      if (Array.isArray(args.credentialEnvs)) patch.credentialEnvs = args.credentialEnvs.filter((item): item is string => typeof item === 'string')
      if (typeof args.command === 'string') patch.command = args.command
      if (typeof args.profilePath === 'string') patch.profilePath = args.profilePath
      const next = {
        ...current.settings,
        providers: {
          ...current.settings.providers,
          [id]: { ...current.settings.providers[id], ...patch },
        },
      }
      const snapshot = await repository.saveSettings(next)
      return asJson({ settings: snapshot.settings, statuses: snapshot.statuses, updated: true })
    },
  }))

  register(defineTool({
    name: 'creator_list',
    description: '列出内容主题。可按标题/slug 关键词过滤；返回每个主题的阶段、状态、进度、下一动作与四个闸门状态。',
    parameters: {
      query: { type: 'string', description: '关键词过滤，省略返回全部。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const items = (value as { items?: unknown[] }).items
        return compactText('Creator list', `${items === undefined ? 0 : items.length} topics`)
      },
    },
    presentCall: (args) => present('Creator list', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      const projects = await repository.listProjects(typeof args.query === 'string' ? args.query : '')
      return asJson({ items: projects.map(summaryOf) })
    },
  }))

  register(defineTool({
    name: 'creator_get',
    description:
      '读取一个内容主题的详情：阶段、闸门、产物链与内容字段（超长字段截断）。'
      + '完整正文请用系统文件工具按返回的主题目录读取；mock 模式没有真实目录。',
    parameters: {
      id: { type: 'string', required: true, description: '主题 id（如 2026-08-ai-workflow）。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { title?: string; id?: string }
        return compactText('Creator topic', record.title || record.id || '')
      },
    },
    presentCall: (args) => present('Creator topic', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      if (args.id === '') throw new Error('id is required')
      const project = await repository.getProject(String(args.id))
      if (project === null) throw new Error(`content not found: ${args.id}`)
      const folderPath = await folderPathOf(repository, project)
      const brief = truncate(project.brief)
      const article = truncate(project.article)
      const xhsCopy = truncate(project.xhsCopy)
      const videoScript = truncate(project.videoScript)
      return asJson({
        ...summaryOf(project),
        ...(folderPath === undefined ? {} : { folderPath }),
        targets: project.targets,
        artifacts: project.artifacts.map((artifact) => ({ path: artifact.path, label: artifact.label, kind: artifact.kind, ready: artifact.ready })),
        content: {
          brief,
          article,
          xhsCopy,
          videoScript,
        },
      })
    },
  }))

  register(defineTool({
    name: 'creator_create',
    description: '创建新的内容主题文件夹（按 YYYY-MM/YYYY-MM-DD_slug 约定），返回主题 id。',
    parameters: {
      title: { type: 'string', required: true, description: '主题标题（≤120 字符）。' },
      slug: { type: 'string', description: 'slug（中文、字母、数字、下划线或连字符）。省略时由标题派生。' },
      plannedAt: { type: 'string', description: '计划日期 YYYY-MM-DD。省略用今天。' },
      targets: { type: 'array', items: { type: 'string', enum: TARGETS }, description: '目标平台。省略为全部四个平台。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { id?: string }
        return compactText('Created', record.id || '')
      },
    },
    presentCall: (args) => present('Create topic', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      if (typeof args.title !== 'string' || args.title.trim() === '') throw new Error('title is required')
      const title = args.title.trim()
      const slug = typeof args.slug === 'string' && args.slug.trim() !== ''
        ? args.slug.trim()
        : title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'new-topic'
      const plannedAt = typeof args.plannedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.plannedAt)
        ? args.plannedAt
        : new Date().toISOString().slice(0, 10)
      const targets = Array.isArray(args.targets)
        ? args.targets.filter((target): target is CreatorTarget => TARGETS.includes(target as CreatorTarget))
        : undefined
      const created = await repository.createProject({ title, slug, plannedAt, targets })
      const folderPath = await folderPathOf(repository, created)
      return asJson({ ...summaryOf(created), ...(folderPath === undefined ? {} : { folderPath }) })
    },
  }))

  register(defineTool({
    name: 'creator_update_artifact',
    description:
      '保存主题的一个或多个内容字段（brief/article/xhsCopy/videoScript）。'
      + '保存会按内容哈希使受影响的下游审批闸门自动失效。完整正文通常直接用系统文件工具写入，本工具用于与工作台 UI 一致的保存。',
    parameters: {
      id: { type: 'string', required: true, description: '主题 id。' },
      brief: { type: 'string', description: 'Brief 全文。' },
      article: { type: 'string', description: '公众号长文全文（wechat/article.md）。' },
      xhsCopy: { type: 'string', description: '小红书文案全文（xhs/post.md）。' },
      videoScript: { type: 'string', description: '视频脚本全文（video/script.md）。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { id?: string }
        return compactText('Saved', record.id || '')
      },
    },
    presentCall: (args) => present('Update artifact', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      if (args.id === '') throw new Error('id is required')
      const project = await repository.getProject(String(args.id))
      if (project === null) throw new Error(`content not found: ${args.id}`)
      const next = {
        brief: typeof args.brief === 'string' ? args.brief : project.brief,
        article: typeof args.article === 'string' ? args.article : project.article,
        xhsCopy: typeof args.xhsCopy === 'string' ? args.xhsCopy : project.xhsCopy,
        videoScript: typeof args.videoScript === 'string' ? args.videoScript : project.videoScript,
      }
      const updated = await repository.updateArtifact(project.id, next)
      const folderPath = await folderPathOf(repository, updated)
      return asJson({ ...summaryOf(updated), ...(folderPath === undefined ? {} : { folderPath }) })
    },
  }))

  register(defineTool({
    name: 'creator_approve',
    description:
      '批准一个审批闸门。必须按顺序推进：brief_sources → approved_article → platform_variants → publish_package；'
      + '前置闸门未批准或必备产物缺失时会报错。批准是人工动作，调用前应确认用户已审阅对应产物。',
    parameters: {
      id: { type: 'string', required: true, description: '主题 id。' },
      gate: { type: 'string', required: true, enum: GATES, description: '要批准的闸门。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { gate?: string }
        return compactText('Approved', record.gate || '')
      },
    },
    presentCall: (args) => present('Approve gate', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      if (args.id === '' || !GATES.includes(args.gate as ApprovalGate)) throw new Error('id and gate are required')
      const updated = await repository.approveGate(String(args.id), args.gate as ApprovalGate)
      return asJson({ ...summaryOf(updated), approved: true })
    },
  }))

  register(defineTool({
    name: 'creator_run_stage',
    description:
      '运行一个创作阶段并生成该阶段产物：video 由 script.md 派生 scenes.json/captions.json 并写待执行清单；'
      + 'publish 生成含 Provider 状态与待执行动作的发布包（需平台变体已批准）；variants 写图卡待执行清单。'
      + 'Provider 不可用时只写 PENDING 清单，不会伪造 PNG/音频/MP4。',
    parameters: {
      id: { type: 'string', required: true, description: '主题 id。' },
      stage: { type: 'string', required: true, enum: STAGES, description: '要运行的阶段。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { stage?: string; nextAction?: string }
        return compactText('Stage run', `${record.stage ?? ''} · ${record.nextAction ?? ''}`)
      },
    },
    presentCall: (args) => present('Run stage', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      if (args.id === '' || !STAGES.includes(args.stage as CreatorStage)) throw new Error('id and stage are required')
      const updated = await repository.runStage(String(args.id), args.stage as CreatorStage)
      return asJson({ ...summaryOf(updated), artifacts: updated.artifacts.map((artifact) => ({ path: artifact.path, ready: artifact.ready })) })
    },
  }))
  register(defineTool({
    name: 'creator_candidates',
    description:
      '列出候选选题池（_工作台/candidates.yaml）。可按状态过滤（pending/selected/converted）；'
      + '素材整理后先提取候选进选题库，用户挑选后再转正为主题。',
    parameters: {
      status: { type: 'string', enum: ['pending', 'selected', 'converted'], description: '按状态过滤，省略返回全部。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const items = (value as { items?: unknown[] }).items
        return compactText('Candidates', `${items === undefined ? 0 : items.length} items`)
      },
    },
    presentCall: (args) => present('List candidates', args),
    async execute(args, exec) {
      signalOf(exec)
      const items = await workspace.list()
      const filtered = typeof args.status === 'string' && ['pending', 'selected', 'converted'].includes(args.status)
        ? items.filter((item) => item.status === args.status)
        : items
      return asJson({ items: filtered.map((item) => ({ ...item })) })
    },
  }))

  register(defineTool({
    name: 'creator_candidate_add',
    description:
      '向候选选题池添加一条候选选题（title/claim/source）。素材整理后逐条或批量添加；'
      + '添加后向用户展示候选清单，等用户挑选（creator_candidate_select）再转正。',
    parameters: {
      title: { type: 'string', required: true, description: '候选选题标题。' },
      claim: { type: 'string', required: true, description: '一句话核心主张（可核验）。' },
      sourceKind: { type: 'string', enum: ['lark-base', 'orbitos', 'file', 'web'], description: '来源类型。' },
      sourceRef: { type: 'string', required: true, description: '来源引用（表格记录 id / 知识库页面 / 文件路径 / 链接）。' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { item?: { title?: string; id?: string } }
        return compactText('Candidate added', record.item?.title || record.item?.id || '')
      },
    },
    presentCall: (args) => present('Add candidate', args),
    async execute(args, exec) {
      signalOf(exec)
      const item = await workspace.add({
        title: String(args.title ?? ''),
        claim: String(args.claim ?? ''),
        source: {
          kind: typeof args.sourceKind === 'string' ? args.sourceKind : 'file',
          ref: String(args.sourceRef ?? ''),
        },
        tags: Array.isArray(args.tags) ? args.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
      })
      return asJson({ item })
    },
  }))

  register(defineTool({
    name: 'creator_candidate_select',
    description:
      '把候选选题标记为 selected（用户已挑选）。用户说「选 1、3」等之后调用；'
      + '之后用 creator_candidate_convert 逐条转正为主题。',
    parameters: {
      ids: { type: 'array', items: { type: 'string' }, required: true, description: '候选选题 id 列表。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { selected?: unknown[] }
        return compactText('Candidates selected', `${record.selected === undefined ? 0 : record.selected.length} items`)
      },
    },
    presentCall: (args) => present('Select candidates', args),
    async execute(args, exec) {
      signalOf(exec)
      const ids = Array.isArray(args.ids) ? args.ids.filter((id): id is string => typeof id === 'string') : []
      const items = await workspace.select(ids)
      return asJson({ items: items.map((item) => ({ ...item })), selected: ids })
    },
  }))

  register(defineTool({
    name: 'creator_candidate_convert',
    description:
      '把一条已挑选的候选选题转正为主题：创建主题文件夹并标记候选 converted（回填主题 id）。'
      + '转正后请用系统文件工具把候选的主张与来源写入 claims.yaml/sources/，并补全 brief 选题卡字段，再推进 brief_sources 闸门。',
    parameters: {
      id: { type: 'string', required: true, description: '候选选题 id（先 creator_candidates 查看）。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { topic?: { id?: string; title?: string } }
        return compactText('Topic created', record.topic?.title || record.topic?.id || '')
      },
    },
    presentCall: (args) => present('Convert candidate', args),
    async execute(args, exec) {
      const signal = signalOf(exec)
      if (args.id === '') throw new Error('id is required')
      const items = await workspace.list()
      const candidate = items.find((item) => item.id === args.id)
      if (candidate === undefined) throw new Error(`候选选题不存在：${args.id}`)
      if (candidate.status === 'converted') throw new Error(`候选选题已转正：${candidate.convertedTopic ?? candidate.id}`)
      const title = candidate.title
      const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'new-topic'
      const plannedAt = new Date().toISOString().slice(0, 10)
      const created = await repository.createProject({ title, slug, plannedAt })
      const next = await workspace.convert(candidate.id, created.id)
      const folderPath = await folderPathOf(repository, created)
      return asJson({
        topic: { ...summaryOf(created), ...(folderPath === undefined ? {} : { folderPath }) },
        candidate: next.find((item) => item.id === candidate.id),
        note: '主题已创建。请用文件工具把候选的主张与来源写入 claims.yaml/sources/，补全 brief 选题卡字段后再批准 brief_sources。',
      })
    },
  }))

  register(defineTool({
    name: 'creator_profile',
    description:
      '读取或更新账号创作画像（首次部署引导）：账号定位、目标读者、语气、常用选题方向与筛选标准模板。'
      + '省略全部字段时只读；给出字段时合并保存。首次部署先填写定位/读者/语气，再据其生成简易筛选标准（selectionCriteria）。',
    parameters: {
      positioning: { type: 'string', description: '账号定位一句话（做什么内容、给谁看）。' },
      targetAudience: { type: 'string', description: '目标读者画像。' },
      tone: { type: 'string', description: '语气/风格偏好。' },
      directions: { type: 'array', items: { type: 'string' }, description: '常用选题方向。' },
      selectionCriteria: { type: 'string', description: '选题筛选标准模板（依据定位生成）。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { profile?: { positioning?: string } }
        return compactText('Creator profile', record.profile?.positioning ? 'saved' : 'read')
      },
    },
    presentCall: (args) => present('Creator profile', args),
    async execute(args, exec) {
      signalOf(exec)
      const current = await workspace.get()
      const hasChanges = typeof args.positioning === 'string'
        || typeof args.targetAudience === 'string'
        || typeof args.tone === 'string'
        || Array.isArray(args.directions)
        || typeof args.selectionCriteria === 'string'
      if (!hasChanges) return asJson({ profile: current, configured: Object.keys(current).length > 0 })
      const next = {
        ...current,
        ...(typeof args.positioning === 'string' && args.positioning.trim() !== '' ? { positioning: args.positioning.trim() } : {}),
        ...(typeof args.targetAudience === 'string' && args.targetAudience.trim() !== '' ? { targetAudience: args.targetAudience.trim() } : {}),
        ...(typeof args.tone === 'string' && args.tone.trim() !== '' ? { tone: args.tone.trim() } : {}),
        ...(Array.isArray(args.directions) ? { directions: args.directions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) } : {}),
        ...(typeof args.selectionCriteria === 'string' && args.selectionCriteria.trim() !== '' ? { selectionCriteria: args.selectionCriteria.trim() } : {}),
      }
      const saved = await workspace.save(next)
      return asJson({ profile: saved, configured: Object.keys(saved).length > 0 })
    },
  }))

  register(defineTool({
    name: 'creator_generate_image',
    description:
      '用图像 Provider 生成文章配图或小红书图卡（OpenAI 兼容 /images/generations）。'
      + '必须先配置 image Provider（creator_settings：endpoint/model/credentialEnvs，密钥经环境变量提供）且状态为 configured；'
      + '未配置时本工具直接报错，不会伪造图片。提示词描述画面内容；结果保存为主题目录下的 xhs/cards/ 或 wechat/images/。',
    parameters: {
      id: { type: 'string', required: true, description: '主题 id。' },
      prompt: { type: 'string', required: true, description: '画面提示词（描述内容、风格、构图）。' },
      target: { type: 'string', enum: ['cards', 'article'], description: '保存位置：cards=xhs/cards/（图卡），article=wechat/images/（配图）。默认 cards。' },
      filename: { type: 'string', description: '文件名基名（不含扩展名）。省略用主题 slug。' },
      count: { type: 'integer', description: '生成数量（1–4）。默认 1。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { saved?: string[] }
        return compactText('Image generated', `${record.saved === undefined ? 0 : record.saved.length} files`)
      },
    },
    presentCall: (args) => present('Generate image', args),
    async execute(args, exec) {
      signalOf(exec)
      return asJson(await generateTopicImage(repository, {
        id: String(args.id ?? ''),
        prompt: String(args.prompt ?? ''),
        target: args.target === 'article' ? 'article' : 'cards',
        ...(typeof args.filename === 'string' && args.filename !== '' ? { filename: args.filename } : {}),
        ...(typeof args.count === 'number' ? { count: args.count } : {}),
      }))
    },
  }))

  register(defineTool({
    name: 'creator_review_score',
    description:
      '用 wewrite CLI（公众号写作质量评分，0-100）给主题长文评分（wewrite score --json）。'
      + '需要本机装有 wewrite CLI（默认找 内容库/_工作台/wewrite-cli，或设置 ORIOS_WEWRITE_CLI 环境变量）；'
      + '找不到或评分失败时明确报错，不伪造分数。分数只提示可能的语言节奏问题，编辑判断仍以五维审稿为准。',
    parameters: {
      id: { type: 'string', required: true, description: '主题 id。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { quality_score?: number }
        return compactText('Review score', `quality=${record.quality_score ?? 'n/a'}`)
      },
    },
    presentCall: (args) => present('Review score', args),
    async execute(args, exec) {
      signalOf(exec)
      return asJson(await reviewArticleScore(repository, String(args.id ?? '')))
    },
  }))

  register(defineTool({
    name: 'creator_similarity_check',
    description:
      '用 wewrite CLI 检查多平台版本与长文的相似度（字符 n-gram Jaccard，--json）。'
      + '一稿多发要求「内容级真改」：平台版本只变表达、不变主张。相似度极高提示需要更多改写。'
      + '需要本机装有 wewrite CLI（默认找 内容库/_工作台/wewrite-cli，或设置 ORIOS_WEWRITE_CLI）。',
    parameters: {
      id: { type: 'string', required: true, description: '主题 id。' },
      target: { type: 'string', enum: ['xhs', 'video', 'both'], description: '要对比的平台版本：xhs=xhs/post.md，video=video/script.md，both=两个都查。默认 both。' },
    },
    output: {
      schema: JSON_VALUE,
      render: (_args, value) => {
        const record = value as { pairs?: unknown[] }
        return compactText('Similarity', `${record.pairs === undefined ? 0 : record.pairs.length} pairs`)
      },
    },
    presentCall: (args) => present('Similarity check', args),
    async execute(args, exec) {
      signalOf(exec)
      const target = args.target === 'xhs' || args.target === 'video' ? args.target : 'both'
      return asJson(await checkVariantSimilarity(repository, String(args.id ?? ''), target))
    },
  }))

  return () => { for (const stop of disposers) stop() }
}
