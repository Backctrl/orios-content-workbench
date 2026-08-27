import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { IconCloseOutline16, IconFolderOpenOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { createBrowserRepository } from './remoteRepository.js'
import { checkSimilarity, reviewScore, type ScoreView, type SimilarityView } from './workspaceClient.js'
import { buildHandoffPrompt } from '../workflowPrompt.js'
import { handoffToNewSession } from './handoff.js'
import { markdownPreview } from './markdownPreview.js'
import { ActionBar, ActionButton, StatusPill, Surface, type StatusTone } from './primitives.js'
import { setCurrentProjectId } from './selection.js'
import { getLibraryPanelOpen, subscribeLibraryPanel } from './panel.js'
import {
  applyConversationInset,
  clearConversationInset,
  getInspectorWidth,
  setInspectorWidth,
  useInspectorWidth,
  useLibraryEpoch,
  bumpLibrary,
} from './uiState.js'
import { useSidebarWidth } from './layoutGeometry.js'
import type { ApprovalGate, CreatorCapabilities, CreatorProject, CreatorStage, CreatorTab } from '../types.js'

const stageLabels: Record<CreatorStage, string> = { brief: 'Brief 与来源', article: '公众号长文', variants: '平台变体', video: '视频成片', publish: '发布准备' }
const tabLabels: Record<CreatorTab, string> = { overview: '总览', brief: '资料', wechat: '公众号', xhs: '小红书', video: '视频', publish: '发布' }
const gateLabels: Record<ApprovalGate, { title: string; hint: string }> = {
  brief_sources: { title: 'Brief 与来源', hint: '主题、事实和引用来源' },
  approved_article: { title: '公众号长文', hint: '长文作为表达锚点' },
  platform_variants: { title: '平台变体', hint: '图卡、脚本和视频预览' },
  publish_package: { title: '发布包', hint: '允许写入外部草稿' },
}
const GATES: ApprovalGate[] = ['brief_sources', 'approved_article', 'platform_variants', 'publish_package']

type EditorField = 'brief' | 'article' | 'xhsCopy' | 'videoScript'

const TAB_FIELD: Partial<Record<CreatorTab, EditorField>> = {
  brief: 'brief',
  wechat: 'article',
  xhs: 'xhsCopy',
  video: 'videoScript',
}

const FIELD_LABEL: Record<EditorField, string> = {
  brief: 'Brief 选题卡（目标读者 / 核心问题 / 边界 / 待验证问题 / 来源）',
  article: '公众号长文（所有平台改写的表达锚点）',
  xhsCopy: '小红书文案（xhs/post.md）',
  videoScript: '视频脚本（video/script.md，MM:SS 文本行）',
}

const FIELD_PLACEHOLDER: Partial<Record<EditorField, string>> = {
  brief: '从素材库提取的选题卡：\n- 目标读者：\n- 核心问题：\n- 边界：\n- 待验证问题：\n- 来源：\n  - ',
  videoScript: '00:00 开场：…',
}

export interface BriefCardFields {
  targetReaders?: string
  coreQuestion?: string
  boundaries?: string
  openQuestions?: string
  sources: string[]
}

function parseBriefCard(brief: string): BriefCardFields {
  const card: BriefCardFields = { sources: [] }
  const fieldRe = /^\s*-\s*(目标读者|核心问题|边界|待验证问题|来源)\s*[:：]\s*(.*)$/
  let inSources = false
  for (const raw of brief.split(/\r?\n/)) {
    const match = fieldRe.exec(raw)
    if (match !== null) {
      const key = match[1]
      const value = match[2].trim()
      inSources = key === '来源'
      if (key === '目标读者') card.targetReaders = value
      else if (key === '核心问题') card.coreQuestion = value
      else if (key === '边界') card.boundaries = value
      else if (key === '待验证问题') card.openQuestions = value
      else if (value !== '') card.sources.push(value)
      continue
    }
    if (inSources) {
      const item = raw.replace(/^\s*[-•*]\s*/, '').trim()
      if (item !== '') card.sources.push(item)
    }
  }
  return card
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function artifactReady(project: CreatorProject, path: string): boolean {
  return project.artifacts.some((artifact) => artifact.path === path && artifact.ready)
}

function gateTone(approved: boolean): StatusTone {
  return approved ? 'success' : 'neutral'
}

export interface CreatorDockedInspectorProps {
  selectedId: string
  closeDetails: () => void
  openPath: (path: string) => void
}

export function CreatorDockedInspector({ selectedId, closeDetails, openPath }: CreatorDockedInspectorProps): JSX.Element {
  const repository = useMemo(() => createBrowserRepository(), [])
  const libraryEpoch = useLibraryEpoch()
  const [detail, setDetail] = useState<CreatorProject | undefined>(undefined)
  const [capabilities, setCapabilities] = useState<CreatorCapabilities | null>(null)
  const [tab, setTab] = useState<CreatorTab>('overview')
  const [error, setError] = useState<string | undefined>(undefined)
  const [actionError, setActionError] = useState<string | undefined>(undefined)
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [panelWidth, setPanelWidth] = useState(getInspectorWidth)
  const [drafts, setDrafts] = useState<Partial<Record<EditorField, string>>>({})
  const [saved, setSaved] = useState<Partial<Record<EditorField, boolean>>>({})
  const [scoreResult, setScoreResult] = useState<ScoreView | null>(null)
  const [scoreBusy, setScoreBusy] = useState(false)
  const [scoreError, setScoreError] = useState<string | undefined>(undefined)
  const [similarityResult, setSimilarityResult] = useState<SimilarityView | null>(null)
  const [similarityBusy, setSimilarityBusy] = useState(false)
  const [similarityError, setSimilarityError] = useState<string | undefined>(undefined)
  const drag = useRef<{ startX: number; startWidth: number } | null>(null)
  const loadedId = useRef<string | null>(null)
  const failedRef = useRef<Set<EditorField>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(getLibraryPanelOpen)
  useEffect(() => subscribeLibraryPanel(() => setDrawerOpen(getLibraryPanelOpen())), [])
  const sidebarWidth = useSidebarWidth(selectedId !== '')
  const savedRef = useRef(saved)
  savedRef.current = saved

  const shownWidth = expanded ? panelWidth : 0
  const wide = panelWidth >= 560
  const drawerOffset = drawerOpen ? 348 : 0

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setExpanded(true))
    return () => { window.cancelAnimationFrame(frame) }
  }, [])

  const refresh = async (): Promise<void> => {
    try {
      const [project, caps] = await Promise.all([repository.getProject(selectedId), repository.getCapabilities()])
      setCapabilities(caps)
      if (project === null) {
        setDetail(undefined)
        setError('主题不存在或已被移除')
        return
      }
      setError(undefined)
      const switched = loadedId.current !== selectedId
      loadedId.current = selectedId
      setDetail(project)
      setDrafts((current) => {
        const next: Partial<Record<EditorField, string>> = {}
        for (const field of Object.keys(TAB_FIELD) as CreatorTab[]) {
          const key = TAB_FIELD[field]
          if (key === undefined) continue
          if (switched || savedRef.current[key] !== false) next[key] = project[key]
        }
        return { ...current, ...next }
      })
    } catch (cause) {
      setDetail(undefined)
      setError(errorText(cause))
    }
  }

  useEffect(() => {
    setTab('overview')
    setActionError(undefined)
    setDrafts({})
    setSaved({})
    setError(undefined)
    void refresh()
  }, [selectedId, libraryEpoch])

  useEffect(() => {
    if (selectedId === '') {
      clearConversationInset()
      return
    }
    applyConversationInset(shownWidth + drawerOffset, !dragging)
  }, [selectedId, shownWidth, dragging, drawerOffset])

  useEffect(() => () => { clearConversationInset() }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      if (drag.current === null) return
      setInspectorWidth(drag.current.startWidth + (event.clientX - drag.current.startX))
      setPanelWidth(getInspectorWidth())
    }
    const onUp = (): void => {
      if (drag.current === null) return
      drag.current = null
      setDragging(false)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [])

  const saveField = async (field: EditorField, value: string): Promise<void> => {
    if (detail === undefined) return
    try {
      const updated = await repository.updateArtifact(detail.id, {
        brief: field === 'brief' ? value : detail.brief,
        article: field === 'article' ? value : detail.article,
        xhsCopy: field === 'xhsCopy' ? value : detail.xhsCopy,
        videoScript: field === 'videoScript' ? value : detail.videoScript,
      })
      failedRef.current.delete(field)
      setDetail(updated)
      setSaved((current) => ({ ...current, [field]: value === updated[field] }))
      bumpLibrary()
    } catch (cause) {
      failedRef.current.add(field)
      setActionError(errorText(cause))
      setSaved((current) => ({ ...current, [field]: false }))
    }
  }

  useEffect(() => {
    if (detail === undefined) return
    for (const field of Object.keys(TAB_FIELD) as CreatorTab[]) {
      const key = TAB_FIELD[field]
      if (key === undefined) continue
      const value = drafts[key]
      if (value === undefined || value === detail[key] || failedRef.current.has(key)) continue
      const timer = window.setTimeout(() => { void saveField(key, value) }, 700)
      return () => { window.clearTimeout(timer) }
    }
    return undefined
  }, [drafts, saved, detail])

  const approve = async (gate: ApprovalGate): Promise<void> => {
    if (detail === undefined) return
    setActionError(undefined)
    try {
      const updated = await repository.approveGate(detail.id, gate)
      setDetail(updated)
      bumpLibrary()
    } catch (cause) {
      setActionError(errorText(cause))
    }
  }

  const runStage = async (stage?: CreatorStage): Promise<void> => {
    if (detail === undefined) return
    const target = stage ?? detail.stage
    setActionError(undefined)
    try {
      const updated = await repository.runStage(detail.id, target)
      setDetail(updated)
      bumpLibrary()
      setActionError(undefined)
    } catch (cause) {
      setActionError(errorText(cause))
    }
  }

  const topicDirectory = (): string | undefined => {
    if (detail === undefined || capabilities?.repositoryMode !== 'file' || !capabilities.contentRoot) return undefined
    return `${capabilities.contentRoot}/${detail.month}/${detail.plannedAt}_${detail.slug}`
  }

  const copyHandoff = async (): Promise<void> => {
    if (detail === undefined) return
    const prompt = buildHandoffPrompt(detail, stageLabels[detail.stage], topicDirectory())
    try {
      await navigator.clipboard.writeText(prompt)
      setActionError('任务提示已复制，可在新会话中粘贴发送。')
    } catch {
      setActionError(`请复制这段任务：${prompt}`)
    }
  }

  const handoffNewSession = async (): Promise<void> => {
    if (detail === undefined) return
    const outcome = await handoffToNewSession(detail, stageLabels[detail.stage], topicDirectory())
    setActionError(outcome.message)
  }

  const runScore = async (): Promise<void> => {
    if (detail === undefined) return
    setScoreBusy(true)
    setScoreError(undefined)
    try {
      setScoreResult(await reviewScore(detail.id))
    } catch (cause) {
      setScoreResult(null)
      setScoreError(errorText(cause))
    } finally {
      setScoreBusy(false)
    }
  }

  const runSimilarity = async (target: 'xhs' | 'video' | 'both' = 'both'): Promise<void> => {
    if (detail === undefined) return
    setSimilarityBusy(true)
    setSimilarityError(undefined)
    try {
      setSimilarityResult(await checkSimilarity(detail.id, target))
    } catch (cause) {
      setSimilarityResult(null)
      setSimilarityError(errorText(cause))
    } finally {
      setSimilarityBusy(false)
    }
  }

  const openPreview = (): void => {
    const directory = topicDirectory()
    if (directory !== undefined) void openPath(`${directory}/publish/preview.html`)
  }

  const close = (): void => {
    setCurrentProjectId(null)
    closeDetails()
  }

  const openFolder = (): void => {
    const directory = topicDirectory()
    if (directory !== undefined) void openPath(directory)
  }

  const renderOverview = (): JSX.Element => {
    if (detail === undefined) return <div className="empty">{error ?? '正在加载…'}</div>
    const stageIndex = GATES.findIndex((gate) => !detail.approvals.find((item) => item.gate === gate)?.approved)
    const currentStep = stageIndex < 0 ? GATES.length - 1 : Math.max(0, stageIndex - 1)
    const summary = detail.brief.split('\n').find((line) => line.trim() && !line.startsWith('#'))?.trim()
    return (
      <>
        <div className="lede">
          <div className="ledeCopy">
            <StatusPill tone={gateTone(detail.approvals.every((item) => item.approved))}>
              {detail.approvals.every((item) => item.approved) ? '全部闸门已通过' : `${detail.progress}% 进度`}
            </StatusPill>
            <p className="ledeSummary">{summary ?? detail.nextAction}</p>
          </div>
          <div className="ledeMeta">
            <StatusPill tone={detail.status === 'blocked' ? 'error' : detail.status === 'running' ? 'active' : 'success'}>
              {detail.status === 'blocked' ? '受阻' : detail.status === 'running' ? '处理中' : stageLabels[detail.stage]}
            </StatusPill>
            <div className="time">{detail.nextAction}</div>
          </div>
        </div>

        <div className="stepper" aria-hidden="true">
          {GATES.map((gate, index) => {
            const approved = Boolean(detail.approvals.find((item) => item.gate === gate)?.approved)
            const current = index === currentStep && !approved
            return (
              <div key={gate} className={`step ${approved ? 'done' : current ? 'current' : ''}`}>
                <span className="stepDot" />
                <span className="stepLabel">{gateLabels[gate].title}</span>
              </div>
            )
          })}
        </div>

        {detail.blockedReason !== undefined && <div className="jobNote error">{detail.blockedReason}</div>}

        <Surface title="审批闸门" hint="必须逐级通过；上游产物变化会自动使下游失效">
          <div className="workList">
            {detail.approvals.map((record) => (
              <div className="workRow" key={record.gate}>
                <div className="workMain">
                  <span className="workName">{gateLabels[record.gate].title}</span>
                  <StatusPill tone={record.approved ? 'success' : 'pending'}>
                    {record.approved ? '已批准' : '待批准'}
                  </StatusPill>
                </div>
                {!record.approved && <ActionButton tone="primary" onClick={() => void approve(record.gate)}>批准</ActionButton>}
              </div>
            ))}
          </div>
        </Surface>

        <Surface title="产物链" hint="文件即真相">
          <div className="workList">
            {detail.artifacts.map((artifact) => (
              <div className="workRow" key={artifact.path}>
                <div className="workMain">
                  <span className="workName">{artifact.label}</span>
                  <span className="workMeta">{artifact.path}</span>
                </div>
                <StatusPill tone={artifact.ready ? 'success' : 'neutral'}>
                  {artifact.ready ? '就绪' : '缺失'}
                </StatusPill>
              </div>
            ))}
          </div>
        </Surface>

        <Surface title="下一动作" hint={detail.nextAction}>
          <ActionBar>
            <ActionButton tone="primary" onClick={() => void runStage()}>
              {capabilities?.repositoryMode === 'file' ? '运行当前阶段' : '运行 mock 阶段'}
            </ActionButton>
            {capabilities?.repositoryMode === 'file' && (
              <ActionButton onClick={() => void handoffNewSession()}>新会话处理</ActionButton>
            )}
            <ActionButton onClick={() => void copyHandoff()}>复制任务</ActionButton>
          </ActionBar>
        </Surface>
      </>
    )
  }

  const renderEditor = (): JSX.Element => {
    if (detail === undefined) return <div className="empty">{error ?? '正在加载…'}</div>
    const field = TAB_FIELD[tab]
    if (field === undefined) return renderOverview()
    const draft = drafts[field] ?? detail[field]
    const dirty = draft !== detail[field]
    const failed = failedRef.current.has(field)
    const briefCard = field === 'brief' ? parseBriefCard(draft) : undefined
    const briefEmpty = briefCard !== undefined
      && briefCard.targetReaders === undefined
      && briefCard.coreQuestion === undefined
      && briefCard.boundaries === undefined
      && briefCard.openQuestions === undefined
      && briefCard.sources.length === 0
    return (
      <div className="editorPane">
        <div className="editorStatus">
          <StatusPill tone={failed ? 'error' : dirty ? 'pending' : 'success'}>{failed ? '保存失败' : dirty ? '保存中…' : '已保存'}</StatusPill>
          <span>{FIELD_LABEL[field]}</span>
          {field === 'article' && (
            <>
              <ActionButton tone="secondary" onClick={() => void runScore()} disabled={scoreBusy}>{scoreBusy ? '评分中…' : 'wewrite 评分'}</ActionButton>
              {scoreResult !== null && (
                <StatusPill tone={scoreResult.quality_score >= 80 ? 'success' : scoreResult.quality_score >= 60 ? 'pending' : 'error'}>
                  质量 {Math.round(scoreResult.quality_score)}
                </StatusPill>
              )}
              {scoreError !== undefined && <span className="workMeta">{scoreError}</span>}
            </>
          )}
        </div>
        {field === 'article' && scoreResult !== null && (
          <div className="jobNote">{scoreResult.note}（composite {Math.round(scoreResult.composite_score)}）</div>
        )}
        {briefCard !== undefined && (
          <Surface title="选题卡" hint="本主题从哪个选题转正而来。长文、小红书与视频脚本都从这里派生；写清楚后才能批准第一道闸门。">
            <div className="workList">
              {[
                ['目标读者', briefCard.targetReaders],
                ['核心问题', briefCard.coreQuestion],
                ['边界', briefCard.boundaries],
                ['待验证问题', briefCard.openQuestions],
              ].map(([label, value]) => (
                <div className="workRow" key={label}>
                  <div className="workMain"><span className="workName">{label}</span><span className="workMeta">{value === undefined || value === '' ? '待填写' : value}</span></div>
                </div>
              ))}
              <div className="workRow">
                <div className="workMain"><span className="workName">来源</span><span className="workMeta">{briefCard.sources.length > 0 ? briefCard.sources.join('；') : '待填写（素材位置或链接）'}</span></div>
              </div>
            </div>
            {briefEmpty && <div className="jobNote">选题卡的字段也可以在下面的编辑器中直接填写（- 目标读者：…）。若还没有选题，先在你的素材库（飞书表格 / OrbitOS 知识库 / 本地目录）里提取候选，选中的选题转正后回填到这里。</div>}
          </Surface>
        )}
        <div className="editorGrid">
          <textarea
            className="editorTextarea"
            aria-label={`${tabLabels[tab]} Markdown 编辑器`}
            value={draft}
            placeholder={FIELD_PLACEHOLDER[field]}
            onChange={(event) => {
              failedRef.current.delete(field)
              setDrafts((current) => ({ ...current, [field]: event.target.value }))
              setSaved((current) => ({ ...current, [field]: false }))
            }}
            onBlur={() => { if (draft !== detail[field] && !failedRef.current.has(field)) void saveField(field, draft) }}
          />
          <div className="editorPreview creatorMdPreview">{markdownPreview(draft || '尚未生成内容')}</div>
        </div>
        {actionError !== undefined && <div className="jobNote error">{actionError}</div>}
      </div>
    )
  }

  const renderXhs = (): JSX.Element => {
    if (detail === undefined) return <div className="empty">{error ?? '正在加载…'}</div>
    const cardsReady = artifactReady(detail, 'xhs/cards/')
    const field = 'xhsCopy'
    const draft = drafts[field] ?? detail[field]
    const previewTitles = draft.trim() ? draft.split('\n').map((line) => line.replace(/^#+\s*/, '').trim()).filter(Boolean).slice(0, 8) : []
    return (
      <div className="editorPane">
        <div className="editorStatus">
          <StatusPill tone={cardsReady ? 'success' : 'neutral'}>{cardsReady ? '图卡就绪' : '图卡待生成'}</StatusPill>
          <span>{FIELD_LABEL.xhsCopy} · 运行「平台变体」阶段写入 xhs/cards/PENDING.md</span>
          <ActionButton tone="secondary" onClick={() => void runSimilarity('xhs')} disabled={similarityBusy}>{similarityBusy ? '查重中…' : '与长文查重'}</ActionButton>
          {similarityResult !== null && similarityResult.pairs[0] !== undefined && (() => {
            const similarity = similarityResult.pairs[0].result.max_similarity ?? 0
            return <StatusPill tone={similarity < 0.3 ? 'success' : similarity < 0.6 ? 'pending' : 'error'}>相似度 {Math.round(similarity * 100)}%</StatusPill>
          })()}
          {similarityError !== undefined && <span className="workMeta">{similarityError}</span>}
        </div>
        {similarityResult !== null && <div className="jobNote">{similarityResult.note}</div>}
        <div className="editorGrid">
          <textarea className="editorTextarea" aria-label="小红书文案编辑器" value={draft} onChange={(event) => {
            failedRef.current.delete(field)
            setDrafts((current) => ({ ...current, [field]: event.target.value }))
            setSaved((current) => ({ ...current, [field]: false }))
          }} onBlur={() => { if (draft !== detail[field] && !failedRef.current.has(field)) void saveField(field, draft) }} />
          <div className="editorPreview">
            {previewTitles.length > 0
              ? <div className="cardGrid">{previewTitles.map((title) => <div className="cardTile" key={title}><strong>{title}</strong><small>3:4 · 结构预览</small></div>)}</div>
              : <div className="empty">尚未生成小红书文案</div>}
          </div>
        </div>
        {actionError !== undefined && <div className="jobNote error">{actionError}</div>}
      </div>
    )
  }

  const renderVideo = (): JSX.Element => {
    if (detail === undefined) return <div className="empty">{error ?? '正在加载…'}</div>
    const field = 'videoScript'
    const draft = drafts[field] ?? detail[field]
    const sceneReady = artifactReady(detail, 'video/scenes.json')
    const captionsReady = artifactReady(detail, 'video/captions.json')
    const finalReady = artifactReady(detail, 'video/final.mp4')
    return (
      <div className="editorPane">
        <div className="editorStatus">
          <StatusPill tone={sceneReady ? 'success' : 'neutral'}>场景 {sceneReady ? '就绪' : '缺失'}</StatusPill>
          <StatusPill tone={captionsReady ? 'success' : 'neutral'}>字幕 {captionsReady ? '就绪' : '缺失'}</StatusPill>
          <StatusPill tone={finalReady ? 'success' : 'neutral'}>成片 {finalReady ? '就绪' : '待渲染'}</StatusPill>
          <ActionButton tone="secondary" onClick={() => void runSimilarity('video')} disabled={similarityBusy}>{similarityBusy ? '查重中…' : '与长文查重'}</ActionButton>
          {similarityResult !== null && similarityResult.pairs[0] !== undefined && (() => {
            const similarity = similarityResult.pairs[0].result.max_similarity ?? 0
            return <StatusPill tone={similarity < 0.3 ? 'success' : similarity < 0.6 ? 'pending' : 'error'}>相似度 {Math.round(similarity * 100)}%</StatusPill>
          })()}
          {similarityError !== undefined && <span className="workMeta">{similarityError}</span>}
        </div>
        {similarityResult !== null && <div className="jobNote">{similarityResult.note}</div>}
        <div className="editorGrid">
          <textarea className="editorTextarea" aria-label="视频脚本编辑器" value={draft} placeholder="00:00 开场：…" onChange={(event) => {
            failedRef.current.delete(field)
            setDrafts((current) => ({ ...current, [field]: event.target.value }))
            setSaved((current) => ({ ...current, [field]: false }))
          }} onBlur={() => { if (draft !== detail[field] && !failedRef.current.has(field)) void saveField(field, draft) }} />
          <div className="editorPreview">
            <div className="videoPane"><div className="videoFrame"><strong>{detail.title}</strong><span>{finalReady ? '成片已就绪' : 'Provider 可用后渲染成片'}</span></div></div>
          </div>
        </div>
        <ActionBar>
          <ActionButton tone="primary" onClick={() => void runStage('video')}>生成场景与字幕</ActionButton>
        </ActionBar>
        {actionError !== undefined && <div className="jobNote error">{actionError}</div>}
      </div>
    )
  }

  const renderPublish = (): JSX.Element => {
    if (detail === undefined) return <div className="empty">{error ?? '正在加载…'}</div>
    const rows = [
      { key: '公众号', mark: 'W', ready: artifactReady(detail, 'wechat/article.md'), status: '发布包就绪' },
      { key: '小红书', mark: 'X', ready: artifactReady(detail, 'xhs/cards/'), status: '发布包就绪' },
      { key: '抖音', mark: 'D', ready: artifactReady(detail, 'video/final.mp4'), status: '待 Provider' },
      { key: '视频号', mark: 'V', ready: artifactReady(detail, 'video/final.mp4'), status: '待 Provider' },
    ] as const
    const packageReady = artifactReady(detail, 'publish/package.json')
    const variantsApproved = Boolean(detail.approvals.find((item) => item.gate === 'platform_variants')?.approved)
    const previewReady = artifactReady(detail, 'publish/preview.html')
    return (
      <>
        <div className="editorStatus">
          <StatusPill tone={packageReady ? 'success' : 'neutral'}>发布包 {packageReady ? '已生成' : '未生成'}</StatusPill>
          <StatusPill tone={variantsApproved ? 'success' : 'pending'}>平台变体 {variantsApproved ? '已批准' : '待批准'}</StatusPill>
        </div>
        <Surface title="微信排版预览" hint="wewrite gallery 生成的微信兼容 HTML（18 主题），可浏览器打开预览">
          <div className="workRow">
            <div className="workMain"><span className="workName">publish/preview.html</span></div>
            <StatusPill tone={previewReady ? 'success' : 'neutral'}>{previewReady ? '已生成' : '未生成'}</StatusPill>
            {previewReady && <ActionButton tone="secondary" onClick={openPreview}>打开预览</ActionButton>}
          </div>
        </Surface>
        <Surface title="发布准备" hint="发布包可本地生成，最终发布始终人工确认">
          <div className="publishGrid">
            {rows.map((row) => (
              <div className="publishCard" key={row.key}>
                <div className="publishRow">
                  <span className="publishName">{row.mark} {row.key}</span>
                  <StatusPill tone={row.ready ? 'success' : 'neutral'}>{row.ready ? row.status : '缺少素材'}</StatusPill>
                </div>
                <div className="publishMeta">{row.ready ? '素材就绪；平台草稿写入需人工确认' : '先完成对应阶段的产物'}</div>
              </div>
            ))}
          </div>
          <ActionBar>
            <ActionButton tone="primary" onClick={() => void runStage('publish')} disabled={!variantsApproved}>生成发布包</ActionButton>
            <ActionButton tone={packageReady ? 'secondary' : 'primary'} onClick={() => void approve('publish_package')} disabled={!packageReady}>批准发布包</ActionButton>
          </ActionBar>
          {!variantsApproved && <div className="jobNote">请先在总览批准「平台变体」闸门，再生成发布包。</div>}
        </Surface>
        {actionError !== undefined && <div className="jobNote error">{actionError}</div>}
      </>
    )
  }

  return (
    <div
      data-plugin="orios-creator"
      data-surface="docked-inspector"
      className={['docked', expanded ? 'open' : '', dragging ? 'dragging' : '', wide ? 'wide' : ''].filter((part) => part !== '').join(' ')}
      style={{ width: shownWidth, '--creator-inspector-left': `${sidebarWidth + drawerOffset}px` } as CSSProperties}
    >
      <header className="header">
        <div className="titleRow">
          <div className="title">{detail?.title ?? (error === undefined ? '正在加载…' : '')}</div>
          <div className="titleActions">
            {detail !== undefined && capabilities?.repositoryMode === 'file' && (
              <button type="button" className="close" aria-label="打开主题文件夹" onClick={openFolder}>
                <IconFolderOpenOutline16 size={14} />
              </button>
            )}
            <button type="button" className="close" aria-label="关闭" onClick={close}>
              <IconCloseOutline16 size={14} />
            </button>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {(Object.keys(tabLabels) as CreatorTab[]).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
              {tabLabels[id]}
            </button>
          ))}
        </div>
      </header>
      <div className="body">
        {tab === 'overview' && renderOverview()}
        {tab === 'brief' && renderEditor()}
        {tab === 'wechat' && renderEditor()}
        {tab === 'xhs' && renderXhs()}
        {tab === 'video' && renderVideo()}
        {tab === 'publish' && renderPublish()}
      </div>
      <div className="resize" onPointerDown={(event) => {
        event.preventDefault()
        drag.current = { startX: event.clientX, startWidth: panelWidth }
        setDragging(true)
      }} />
    </div>
  )
}
