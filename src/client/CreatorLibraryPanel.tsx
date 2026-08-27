import { useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { createBrowserRepository } from './remoteRepository.js'
import { addCandidate, convertCandidate, listCandidates, selectCandidates, type CandidateView } from './workspaceClient.js'
import { getCurrentProjectId, setCurrentProjectId, subscribeCurrentProject } from './selection.js'
import { bumpLibrary, useLibraryEpoch } from './uiState.js'
import { StatusPill, type StatusTone } from './primitives.js'
import type { CreatorProject, CreatorStage } from '../types.js'

const STAGE_TONE: Record<CreatorStage, StatusTone> = {
  brief: 'pending',
  article: 'pending',
  variants: 'pending',
  video: 'pending',
  publish: 'success',
}

const stageLabels: Record<CreatorStage, string> = { brief: 'Brief', article: '长文', variants: '变体', video: '视频', publish: '发布' }
const BOARD_STAGES: CreatorStage[] = ['brief', 'article', 'variants', 'video', 'publish']

type LibraryView = 'list' | 'board' | 'candidates'

function relativeTime(plannedAt: string): string {
  const target = new Date(`${plannedAt}T00:00:00+08:00`).getTime()
  const delta = Date.now() - target
  const days = Math.round(delta / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days === -1) return '昨天'
  if (days > 1 && days < 30) return `${days} 天后`
  if (days < -1 && days > -30) return `${-days} 天前`
  return plannedAt.slice(0, 7)
}

function statusTone(project: CreatorProject): StatusTone {
  if (project.status === 'blocked') return 'error'
  if (project.status === 'running') return 'active'
  return STAGE_TONE[project.stage]
}

function statusLabel(project: CreatorProject): string {
  if (project.status === 'blocked') return '受阻'
  if (project.status === 'running') return '处理中'
  return `${stageLabels[project.stage]} · ${project.progress}%`
}

const CANDIDATE_TONE: Record<CandidateView['status'], StatusTone> = {
  pending: 'neutral',
  selected: 'pending',
  converted: 'success',
}

const CANDIDATE_LABEL: Record<CandidateView['status'], string> = {
  pending: '候选',
  selected: '已挑选',
  converted: '已转正',
}

export function CreatorLibraryPanel(): JSX.Element {
  const repository = useMemo(() => createBrowserRepository(), [])
  const libraryEpoch = useLibraryEpoch()
  const [projects, setProjects] = useState<CreatorProject[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [view, setView] = useState<LibraryView>('list')
  const [selectedId, setSelectedId] = useState<string | null>(getCurrentProjectId())
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createError, setCreateError] = useState<string | undefined>(undefined)
  const [creating, setCreating] = useState(false)
  const [candidates, setCandidates] = useState<CandidateView[]>([])
  const [candidateError, setCandidateError] = useState<string | undefined>(undefined)
  const [candidateAddOpen, setCandidateAddOpen] = useState(false)
  const [candidateForm, setCandidateForm] = useState({ title: '', claim: '', sourceKind: 'lark-base', sourceRef: '' })
  const [convertingId, setConvertingId] = useState<string | null>(null)

  const loadList = async (nextQuery = query): Promise<void> => {
    setLoading(true)
    setError(undefined)
    try {
      setProjects(await repository.listProjects(nextQuery))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }

  const loadCandidates = async (): Promise<void> => {
    setCandidateError(undefined)
    try {
      setCandidates((await listCandidates()).items)
    } catch (cause) {
      setCandidateError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadList(query) }, 150)
    return () => { window.clearTimeout(timer) }
  }, [query, libraryEpoch])

  useEffect(() => {
    if (view === 'candidates') void loadCandidates()
  }, [view, libraryEpoch])

  useEffect(() => {
    const stop = subscribeCurrentProject(() => setSelectedId(getCurrentProjectId()))
    return stop
  }, [])

  const closeCreate = (): void => {
    if (creating) return
    setCreateOpen(false)
    setCreateTitle('')
    setCreateError(undefined)
  }

  const onCreate = async (): Promise<void> => {
    const title = createTitle.trim()
    if (title === '' || creating) return
    setCreating(true)
    setCreateError(undefined)
    try {
      const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'new-topic'
      const plannedAt = new Date().toISOString().slice(0, 10)
      const created = await repository.createProject({ title, slug, plannedAt })
      setCreateOpen(false)
      setCreateTitle('')
      setCurrentProjectId(created.id)
      bumpLibrary()
      await loadList('')
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCreating(false)
    }
  }

  const closeCandidateAdd = (): void => {
    setCandidateAddOpen(false)
    setCandidateForm({ title: '', claim: '', sourceKind: 'lark-base', sourceRef: '' })
    setCandidateError(undefined)
  }

  const onAddCandidate = async (): Promise<void> => {
    const title = candidateForm.title.trim()
    const claim = candidateForm.claim.trim()
    const sourceRef = candidateForm.sourceRef.trim()
    if (title === '' || claim === '' || sourceRef === '') return
    setCandidateError(undefined)
    try {
      await addCandidate({ title, claim, sourceKind: candidateForm.sourceKind, sourceRef })
      closeCandidateAdd()
      await loadCandidates()
    } catch (cause) {
      setCandidateError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const toggleCandidate = async (candidate: CandidateView): Promise<void> => {
    if (candidate.status === 'converted') return
    const next = (candidate.status === 'selected' ? 'pending' : 'selected') as CandidateView['status']
    const all = candidates.map((item) => item.id === candidate.id ? { ...item, status: next } : item)
    setCandidates(all)
    try {
      const ids = all.filter((item) => item.status === 'selected').map((item) => item.id)
      setCandidates((await selectCandidates(ids)).items)
    } catch (cause) {
      setCandidateError(cause instanceof Error ? cause.message : String(cause))
      await loadCandidates()
    }
  }

  const convertCandidateToTopic = async (candidate: CandidateView): Promise<void> => {
    if (candidate.status === 'converted' || convertingId !== null) return
    setConvertingId(candidate.id)
    setCandidateError(undefined)
    try {
      const result = await convertCandidate(candidate.id)
      setCurrentProjectId(result.topic.id)
      bumpLibrary()
      await loadCandidates()
      await loadList('')
    } catch (cause) {
      setCandidateError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setConvertingId(null)
    }
  }

  const select = (id: string): void => {
    setCurrentProjectId(selectedId === id ? null : id)
  }

  const months = [...new Set(projects.map((project) => project.month))].sort((a, b) => b.localeCompare(a))
  const groups: Array<[CandidateView['status'], CandidateView[]]> = (['pending', 'selected', 'converted'] as const)
    .map((status): [CandidateView['status'], CandidateView[]] => [status, candidates.filter((item) => item.status === status)])
    .filter((group) => group[1].length > 0)

  return (
    <div data-plugin="orios-creator" data-surface="content-library">
      <div className="creator-native-content-tools">
        <div className="creator-native-search" data-surface="content-library-search">
          <span className="creator-native-search-icon">⌕</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value) }} placeholder="搜索内容" aria-label="搜索内容" />
          {query !== '' && <button type="button" className="creator-native-icon-button" aria-label="清除搜索" onClick={() => { setQuery('') }}>×</button>}
        </div>
        <Tooltip label="刷新" delayMs={500}>
          <button type="button" className="creator-native-icon-button" aria-label="刷新内容" onClick={() => {
            void (view === 'candidates' ? loadCandidates() : loadList(query))
          }}>↻</button>
        </Tooltip>
        <Tooltip label={view === 'candidates' ? '添加候选选题' : '新建内容'} delayMs={500}>
          <button type="button" className="creator-native-icon-button" aria-label="新建" onClick={() => {
            if (view === 'candidates') setCandidateAddOpen(true)
            else setCreateOpen(true)
          }}>＋</button>
        </Tooltip>
        <div className="libViewSwitch" role="tablist" aria-label="视图切换">
          <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'is-active' : ''} onClick={() => { setView('list') }}>列表</button>
          <button type="button" role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'is-active' : ''} onClick={() => { setView('board') }}>看板</button>
          <button type="button" role="tab" aria-selected={view === 'candidates'} className={view === 'candidates' ? 'is-active' : ''} onClick={() => { setView('candidates') }}>选题</button>
        </div>
      </div>
      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="新建内容主题"
        closeLabel="取消"
        footer={(
          <>
            <Button variant="outline" disabled={creating} onClick={closeCreate}>取消</Button>
            <Button variant="primary" disabled={creating || createTitle.trim() === ''} onClick={() => { void onCreate() }}>创建</Button>
          </>
        )}
      >
        <div data-plugin="orios-creator" data-surface="create-dialog">
          <div className="createField">
            <label className="createLabel" htmlFor="creator-create-title">主题标题</label>
            <Input id="creator-create-title" className="createInput" value={createTitle} placeholder="例如：AI 工作流如何持续产出" autoFocus={true} disabled={creating} onChange={(event) => { setCreateTitle(event.target.value) }} onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              void onCreate()
            }} />
          </div>
          {createError !== undefined && <div className="createError">{createError}</div>}
        </div>
      </Modal>
      <Modal
        open={candidateAddOpen}
        onClose={closeCandidateAdd}
        title="添加候选选题"
        closeLabel="取消"
        footer={(
          <>
            <Button variant="outline" onClick={closeCandidateAdd}>取消</Button>
            <Button variant="primary" disabled={candidateForm.title.trim() === '' || candidateForm.claim.trim() === '' || candidateForm.sourceRef.trim() === ''} onClick={() => { void onAddCandidate() }}>添加</Button>
          </>
        )}
      >
        <div data-plugin="orios-creator" data-surface="candidate-dialog">
          <div className="createField">
            <label className="createLabel" htmlFor="creator-candidate-title">选题标题</label>
            <Input id="creator-candidate-title" className="createInput" value={candidateForm.title} autoFocus={true} onChange={(event) => { setCandidateForm((form) => ({ ...form, title: event.target.value })) }} />
          </div>
          <div className="createField">
            <label className="createLabel" htmlFor="creator-candidate-claim">一句话核心主张（可核验）</label>
            <Input id="creator-candidate-claim" className="createInput" value={candidateForm.claim} onChange={(event) => { setCandidateForm((form) => ({ ...form, claim: event.target.value })) }} />
          </div>
          <div className="createField">
            <label className="createLabel" htmlFor="creator-candidate-source-kind">来源类型</label>
            <select id="creator-candidate-source-kind" className="createInput" value={candidateForm.sourceKind} onChange={(event) => { setCandidateForm((form) => ({ ...form, sourceKind: event.target.value })) }} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid rgba(255,255,255,.16)', background: 'transparent', color: 'inherit' }}>
              <option value="lark-base">飞书多维表格</option>
              <option value="orbitos">OrbitOS 知识库</option>
              <option value="file">本地文件</option>
              <option value="web">网页链接</option>
            </select>
          </div>
          <div className="createField">
            <label className="createLabel" htmlFor="creator-candidate-source-ref">来源引用（记录 id / 页面 / 路径 / 链接）</label>
            <Input id="creator-candidate-source-ref" className="createInput" value={candidateForm.sourceRef} onChange={(event) => { setCandidateForm((form) => ({ ...form, sourceRef: event.target.value })) }} />
          </div>
          {candidateError !== undefined && <div className="createError">{candidateError}</div>}
        </div>
      </Modal>
      {loading && projects.length === 0 && view !== 'candidates' && <div className="creator-native-empty">正在读取内容…</div>}
      {error !== undefined && view !== 'candidates' && <div className="creator-native-error">{error}</div>}
      {!error && !loading && view === 'list' && (
        months.length === 0
          ? <div className="creator-native-empty">还没有内容，点击 ＋ 新建第一个主题。</div>
          : months.map((month) => (
            <section className="creator-native-month" key={month}>
              <h3>{month.replace('-', ' 年 ')} 月</h3>
              <div className="creator-native-projects">
                {projects.filter((project) => project.month === month).map((project) => (
                  <button type="button" className={`libRow${selectedId === project.id ? ' is-selected' : ''}`} key={project.id} onClick={() => { select(project.id) }}>
                    <span className={`libThumb${project.status === 'blocked' ? ' is-blocked' : project.status === 'ready' && project.progress >= 100 ? ' is-ready' : ''}`}>{project.title.slice(0, 1)}</span>
                    <span className="libBody">
                      <span className="libTitle">{project.title}</span>
                      <span className="libMeta">
                        <StatusPill tone={statusTone(project)}>{statusLabel(project)}</StatusPill>
                        <span>{relativeTime(project.plannedAt)}</span>
                        <span className="libAction">{project.nextAction}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))
      )}
      {!error && !loading && view === 'board' && (
        <div className="libBoard">
          {BOARD_STAGES.map((stage) => (
            <div className="libBoardColumn" key={stage}>
              <h4>{stageLabels[stage]}</h4>
              {projects.filter((project) => project.stage === stage).map((project) => (
                <button type="button" className={`libBoardCard${project.status === 'blocked' ? ' is-blocked' : ''}`} key={project.id} onClick={() => { select(project.id) }}>
                  <strong>{project.title}</strong><br />
                  <span className="creator-caption">{project.status === 'blocked' ? `受阻：${project.blockedReason}` : project.nextAction}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {view === 'candidates' && (
        <div className="libBoard">
          {candidateError !== undefined && <div className="creator-native-error">{candidateError}</div>}
          {candidates.length === 0 && <div className="creator-native-empty">选题库为空：从素材库（飞书表格 / 知识库 / 本地）提取候选，点 ＋ 添加；或直接让 Agent 用 creator_candidate_add 整理。</div>}
          {groups.map(([status, items]) => (
            <div className="libBoardColumn" key={status}>
              <h4>{CANDIDATE_LABEL[status]}（{items.length}）</h4>
              {items.map((candidate) => (
                <div key={candidate.id} className="libBoardCard" style={{ cursor: 'default' }}>
                  <div className="publishRow">
                    <strong className="libTitle" style={{ maxWidth: '60%' }}>{candidate.title}</strong>
                    <StatusPill tone={CANDIDATE_TONE[candidate.status]}>{CANDIDATE_LABEL[candidate.status]}</StatusPill>
                  </div>
                  <div className="publishMeta">{candidate.claim}</div>
                  <div className="publishMeta">{candidate.source.kind} · {candidate.source.ref}</div>
                  <div className="creatorActionBar" style={{ marginTop: 8 }}>
                    {candidate.status !== 'converted' && (
                      <Button size="sm" variant={candidate.status === 'selected' ? 'primary' : 'outline'} onClick={() => { void toggleCandidate(candidate) }}>
                        {candidate.status === 'selected' ? '取消挑选' : '挑选'}
                      </Button>
                    )}
                    {candidate.status === 'selected' && (
                      <Button size="sm" variant="primary" disabled={convertingId !== null} onClick={() => { void convertCandidateToTopic(candidate) }}>
                        {convertingId === candidate.id ? '转正中…' : '转正为主题'}
                      </Button>
                    )}
                    {candidate.status === 'converted' && candidate.convertedTopic !== undefined && (
                      <Button size="sm" variant="outline" onClick={() => { select(candidate.convertedTopic as string) }}>打开主题</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
