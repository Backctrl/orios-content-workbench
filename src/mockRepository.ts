import type {
  ApprovalGate,
  ArtifactRef,
  CreatorCapabilities,
  CreatorProject,
  CreatorProjectDraft,
  CreatorRepository,
  CreatorStage,
  CreatorSettings,
  CreatorSettingsSnapshot,
} from './types.js'
import { defaultSettings, normalizeSettings, settingsSnapshot } from './settings.js'

const now = '2026-08-23T09:00:00+08:00'

function artifact(path: string, kind: ArtifactRef['kind'], label: string, ready: boolean, hash: string): ArtifactRef {
  return { path, kind, label, ready, hash, updatedAt: now }
}

function initialProjects(): CreatorProject[] {
  return [
    {
      id: 'topic-ai-workflow',
      title: 'AI 工作流如何持续产出',
      slug: 'ai-workflow-continuous-output',
      month: '2026-08',
      plannedAt: '2026-08-25',
      stage: 'variants',
      status: 'ready',
      progress: 62,
      nextAction: '检查小红书图卡与视频首屏',
      targets: ['wechat_article', 'xhs_graphic', 'douyin_video', 'wechat_channels_video'],
      approvals: [
        { gate: 'brief_sources', approved: true, approvedAt: '2026-08-23T09:10:00+08:00', artifactHash: 'brief-a1' },
        { gate: 'approved_article', approved: true, approvedAt: '2026-08-23T10:20:00+08:00', artifactHash: 'article-b2' },
        { gate: 'platform_variants', approved: false, artifactHash: 'variants-c3' },
        { gate: 'publish_package', approved: false, artifactHash: 'publish-d4' },
      ],
      artifacts: [
        artifact('brief.md', 'markdown', 'Brief', true, 'brief-a1'),
        artifact('claims.yaml', 'source', 'Claims 与来源', true, 'claims-a2'),
        artifact('wechat/article.md', 'markdown', '公众号长文', true, 'article-b2'),
        artifact('xhs/cards/', 'image', '小红书图卡 6 张', true, 'xhs-c3'),
        artifact('video/scenes.json', 'json', '视频场景', true, 'video-c4'),
        artifact('video/final.mp4', 'video', '视频预览', false, 'video-d5'),
      ],
      brief: '# AI 工作流如何持续产出\n\n核心问题：如何把一次研究拆成可复用的长文、图卡和视频。\n\n目标读者：希望稳定更新、但没有专职编辑团队的独立创作者。',
      article: '# 让一次研究变成一周的内容\n\n真正可持续的内容生产，不是每天临时寻找灵感，而是把一个主题拆成可复用的事实、观点和表达。\n\n本文将从资料整理、长文写作、图卡拆分和视频脚本四个阶段说明这条链路。',
      xhsCopy: '一份研究，如何拆成一篇长文、6 张图卡和一条视频？\n\n关键不是多开几个平台，而是先建立一份可追溯的内容真源。',
      videoScript: '00:00 开场：为什么持续更新会变成体力活\n00:08 先把主题拆成事实与观点\n00:22 长文作为表达锚点\n00:38 图卡负责降低理解门槛\n00:54 视频负责建立记忆点\n01:08 结尾：一次研究，连续产出一周内容',
    },
    {
      id: 'topic-creator-system',
      title: '独立创作者的内容系统',
      slug: 'creator-content-system',
      month: '2026-08',
      plannedAt: '2026-08-27',
      stage: 'brief',
      status: 'blocked',
      progress: 18,
      nextAction: '补充 3 个一手来源，再确认选题',
      blockedReason: '来源不足：当前只有 1 个可核验来源',
      targets: ['wechat_article', 'xhs_graphic', 'douyin_video', 'wechat_channels_video'],
      approvals: [
        { gate: 'brief_sources', approved: false, artifactHash: 'brief-e1' },
        { gate: 'approved_article', approved: false, artifactHash: 'article-e2' },
        { gate: 'platform_variants', approved: false, artifactHash: 'variants-e3' },
        { gate: 'publish_package', approved: false, artifactHash: 'publish-e4' },
      ],
      artifacts: [
        artifact('brief.md', 'markdown', 'Brief', true, 'brief-e1'),
        artifact('claims.yaml', 'source', 'Claims 与来源', false, 'claims-e2'),
        artifact('wechat/article.md', 'markdown', '公众号长文', false, 'article-e3'),
      ],
      brief: '# 独立创作者的内容系统\n\n待补充：读者画像、真实案例和来源列表。',
      article: '',
      xhsCopy: '',
      videoScript: '',
    },
    {
      id: 'topic-long-to-video',
      title: '从一篇长文到短视频',
      slug: 'long-article-to-short-video',
      month: '2026-07',
      plannedAt: '2026-07-31',
      stage: 'publish',
      status: 'ready',
      progress: 92,
      nextAction: '确认公众号草稿并记录平台链接',
      targets: ['wechat_article', 'xhs_graphic', 'douyin_video', 'wechat_channels_video'],
      approvals: [
        { gate: 'brief_sources', approved: true, approvedAt: '2026-07-28T09:10:00+08:00', artifactHash: 'brief-f1' },
        { gate: 'approved_article', approved: true, approvedAt: '2026-07-29T11:20:00+08:00', artifactHash: 'article-f2' },
        { gate: 'platform_variants', approved: true, approvedAt: '2026-07-30T14:00:00+08:00', artifactHash: 'variants-f3' },
        { gate: 'publish_package', approved: false, artifactHash: 'publish-f4' },
      ],
      artifacts: [
        artifact('brief.md', 'markdown', 'Brief', true, 'brief-f1'),
        artifact('claims.yaml', 'source', 'Claims 与来源', true, 'claims-f2'),
        artifact('wechat/article.md', 'markdown', '公众号长文', true, 'article-f2'),
        artifact('xhs/cards/', 'image', '小红书图卡 8 张', true, 'xhs-f3'),
        artifact('video/final.mp4', 'video', '视频预览', true, 'video-f4'),
        artifact('publish/package.json', 'json', '发布包', true, 'publish-f5'),
      ],
      brief: '# 从一篇长文到短视频\n\n以一篇已经完成审校的长文为锚点，拆出适合短视频的单一观点。',
      article: '# 从一篇长文到短视频\n\n长文和短视频不是两套选题，而是同一份事实材料的两种表达。',
      xhsCopy: '长文不是视频脚本的废稿，而是最稳定的内容锚点。',
      videoScript: '00:00 一个主题，为什么要有两种表达\n00:12 长文负责完整解释\n00:30 视频负责单点记忆\n00:52 用同一份事实校验两种版本',
    },
  ]
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function hashFor(text: string): string {
  let hash = 2166136261
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return `mock-${(hash >>> 0).toString(16)}`
}

export class MockCreatorRepository implements CreatorRepository {
  private readonly projects = new Map(initialProjects().map((project) => [project.id, project]))
  private settings: CreatorSettings = defaultSettings()

  async listProjects(query = ''): Promise<CreatorProject[]> {
    const needle = query.trim().toLowerCase()
    return [...this.projects.values()]
      .filter((project) => needle === '' || `${project.title} ${project.slug}`.toLowerCase().includes(needle))
      .sort((a, b) => b.plannedAt.localeCompare(a.plannedAt))
      .map(clone)
  }

  async createProject(draft: CreatorProjectDraft): Promise<CreatorProject> {
    if (!draft.title.trim() || !draft.slug || !/^[\p{L}\p{N}][\p{L}\p{N}_-]{1,80}$/u.test(draft.slug) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.plannedAt)) throw new Error('主题标题、slug 或计划日期无效')
    const id = `${draft.plannedAt.slice(0, 7)}-${draft.slug}`
    if (this.projects.has(id)) throw new Error('同一日期和 slug 的主题已存在')
    const project: CreatorProject = {
      id,
      title: draft.title,
      slug: draft.slug,
      month: draft.plannedAt.slice(0, 7),
      plannedAt: draft.plannedAt,
      stage: 'brief',
      status: 'blocked',
      progress: 0,
      nextAction: '填写 Brief 并补充可核验来源',
      blockedReason: 'Brief 尚未填写',
      targets: draft.targets?.length ? [...draft.targets] : ['wechat_article', 'xhs_graphic', 'douyin_video', 'wechat_channels_video'],
      approvals: [
        { gate: 'brief_sources', approved: false, artifactHash: '' },
        { gate: 'approved_article', approved: false, artifactHash: '' },
        { gate: 'platform_variants', approved: false, artifactHash: '' },
        { gate: 'publish_package', approved: false, artifactHash: '' },
      ],
      artifacts: [
        artifact('brief.md', 'markdown', 'Brief', false, ''),
        artifact('claims.yaml', 'source', 'Claims 与来源', false, ''),
        artifact('wechat/article.md', 'markdown', '公众号长文', false, ''),
        artifact('xhs/cards/', 'image', '小红书图卡', false, ''),
        artifact('video/scenes.json', 'json', '视频场景', false, ''),
        artifact('video/captions.json', 'json', '视频字幕', false, ''),
        artifact('video/final.mp4', 'video', '视频预览', false, ''),
        artifact('publish/package.json', 'json', '发布包', false, ''),
        artifact('publish/preview.html', 'json', '微信排版预览', false, ''),
      ],
      brief: `# ${draft.title}\n\n> 选题卡：本主题从哪个选题转正而来，服务谁、解决什么问题。\n\n- 目标读者：\n- 核心问题：\n- 边界：\n- 待验证问题：\n- 来源：\n  - \n`,
      article: '',
      xhsCopy: '',
      videoScript: '',
    }
    this.projects.set(id, project)
    this.bumpRevision()
    return clone(project)
  }

  async getProject(id: string): Promise<CreatorProject | null> {
    const project = this.projects.get(id)
    return project ? clone(project) : null
  }

  async updateArtifact(id: string, content: Pick<CreatorProject, 'brief' | 'article' | 'xhsCopy' | 'videoScript'>): Promise<CreatorProject> {
    const project = this.projects.get(id)
    if (!project) throw new Error('主题不存在')
    Object.assign(project, content)
    const edited = content.article || content.brief || content.xhsCopy || content.videoScript
    const hash = hashFor(edited)
    project.artifacts = project.artifacts.map((item) => item.label === '公众号长文' ? { ...item, ready: Boolean(content.article), hash, updatedAt: now } : item)
    project.approvals = project.approvals.map((item) => item.gate === 'approved_article' || item.gate === 'platform_variants' || item.gate === 'publish_package'
      ? { ...item, approved: false, approvedAt: undefined, artifactHash: hash }
      : item)
    project.nextAction = '重新审阅已修改的产物'
    project.status = 'ready'
    this.bumpRevision()
    return clone(project)
  }

  async approveGate(id: string, gate: ApprovalGate): Promise<CreatorProject> {
    const project = this.projects.get(id)
    if (!project) throw new Error('主题不存在')
    const index = project.approvals.findIndex((item) => item.gate === gate)
    if (index < 0) throw new Error('审批闸门不存在')
    project.approvals[index] = { ...project.approvals[index], approved: true, approvedAt: now }
    project.progress = Math.min(100, project.progress + 9)
    project.nextAction = gate === 'publish_package' ? '打开各平台草稿并人工确认最终发布' : '继续准备下一个阶段'
    this.bumpRevision()
    return clone(project)
  }

  async runStage(id: string, stage: CreatorStage): Promise<CreatorProject> {
    const project = this.projects.get(id)
    if (!project) throw new Error('主题不存在')
    if (stage === 'article' && (!project.brief.trim() || !project.artifacts.find((item) => item.path === 'claims.yaml')?.ready)) {
      throw new Error('请先完成 Brief 与可核验来源（brief.md、claims.yaml 或 sources/）')
    }
    if (stage === 'variants' && !project.xhsCopy.trim()) throw new Error('请先完成小红书文案（xhs/post.md）')
    if (stage === 'video' && !project.videoScript.trim()) throw new Error('请先完成视频脚本（video/script.md）')
    if (stage === 'publish' && !project.approvals.find((item) => item.gate === 'platform_variants')?.approved) {
      throw new Error('请先批准平台变体（platform_variants）再生成发布包')
    }
    project.stage = stage
    project.status = 'running'
    project.nextAction = `正在运行${stage}阶段`
    await new Promise((resolve) => setTimeout(resolve, 350))
    project.artifacts = project.artifacts.map((item) => {
      if (stage === 'variants' && item.path === 'xhs/cards/') return { ...item, ready: project.xhsCopy.trim().length > 0, updatedAt: now }
      if (stage === 'video' && (item.path === 'video/scenes.json' || item.path === 'video/captions.json')) return { ...item, ready: project.videoScript.trim().length > 0, updatedAt: now }
      if (stage === 'publish' && item.path === 'publish/package.json') return { ...item, ready: true, updatedAt: now }
      return item
    })
    project.status = 'ready'
    project.progress = Math.min(100, Math.max(project.progress, stage === 'publish' ? 92 : project.progress + 7))
    project.nextAction = stage === 'publish' ? '检查草稿并人工点击最终发布' : '等待人工审阅并批准当前产物'
    this.bumpRevision()
    return clone(project)
  }

  async getCapabilities(): Promise<CreatorCapabilities> {
    return {
      dshVersion: '0.1.1-rc.2',
      repositoryMode: 'mock',
      contentRootConfigured: false,
      contentRoot: '',
      imageProvider: 'mock',
      speechProvider: 'mock',
      remotion: 'mock',
      wechatDraft: 'mock',
      browserDraft: 'unavailable',
      settingsStorage: 'memory',
    }
  }

  private revision = 0

  async getRevision(): Promise<string> {
    return `mock-${this.revision}`
  }

  private bumpRevision(): void {
    this.revision += 1
  }

  async getSettings(): Promise<CreatorSettingsSnapshot> {
    return settingsSnapshot(this.settings, 'memory', false, {})
  }

  async saveSettings(settings: CreatorSettings): Promise<CreatorSettingsSnapshot> {
    this.settings = normalizeSettings(settings)
    this.bumpRevision()
    return this.getSettings()
  }

  async checkSettings(): Promise<CreatorSettingsSnapshot> {
    return this.getSettings()
  }
}

export function createMockRepository(): MockCreatorRepository {
  return new MockCreatorRepository()
}
