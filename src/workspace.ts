import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { parse, stringify } from 'yaml'

/**
 * 工作台工作区存储：_工作台/ 下的非主题文件（候选选题池、账号画像）。
 * 文件即真相；_ 前缀目录不参与主题扫描。
 */

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const WORKSPACE_DIR = '_工作台'

export interface CandidateSource {
  kind: 'lark-base' | 'orbitos' | 'file' | 'web' | string
  ref: string
}

export interface Candidate {
  id: string
  title: string
  claim: string
  source: CandidateSource
  tags: string[]
  status: 'pending' | 'selected' | 'converted'
  convertedTopic?: string
}

export interface CandidateStore {
  list(): Promise<Candidate[]>
  add(input: { title: string; claim: string; source: CandidateSource; tags?: string[] }): Promise<Candidate>
  select(ids: string[]): Promise<Candidate[]>
  convert(id: string, topicId: string): Promise<Candidate[]>
  update(items: Candidate[]): Promise<Candidate[]>
}

export interface CreatorProfile {
  positioning?: string
  targetAudience?: string
  tone?: string
  directions?: string[]
  selectionCriteria?: string
}

export interface ProfileStore {
  get(): Promise<CreatorProfile>
  save(profile: CreatorProfile): Promise<CreatorProfile>
}

function hashFor(value: string): string {
  return `sha256-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function isValidStatus(value: unknown): value is Candidate['status'] {
  return value === 'pending' || value === 'selected' || value === 'converted'
}

function sourceFrom(value: unknown): CandidateSource {
  const record = isRecord(value) ? value : {}
  return {
    kind: textValue(record.kind, 'file') || 'file',
    ref: textValue(record.ref, ''),
  }
}

function candidateFrom(value: unknown): Candidate | null {
  if (!isRecord(value)) return null
  const id = textValue(value.id)
  const title = textValue(value.title)
  if (id === '' || title === '') return null
  return {
    id,
    title,
    claim: textValue(value.claim),
    source: sourceFrom(value.source),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    status: isValidStatus(value.status) ? value.status : 'pending',
    ...(typeof value.convertedTopic === 'string' && value.convertedTopic !== '' ? { convertedTopic: value.convertedTopic } : {}),
  }
}

function parseCandidates(value: unknown): Candidate[] {
  const root = isRecord(value) ? value : {}
  const items = Array.isArray(root.items) ? root.items : []
  return items.map(candidateFrom).filter((item): item is Candidate => item !== null)
}

function normalizeProfile(value: unknown): CreatorProfile {
  const record = isRecord(value) ? value : {}
  return {
    ...(textValue(record.positioning) !== '' ? { positioning: textValue(record.positioning) } : {}),
    ...(textValue(record.targetAudience) !== '' ? { targetAudience: textValue(record.targetAudience) } : {}),
    ...(textValue(record.tone) !== '' ? { tone: textValue(record.tone) } : {}),
    ...(Array.isArray(record.directions) ? { directions: record.directions.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) } : {}),
    ...(textValue(record.selectionCriteria) !== '' ? { selectionCriteria: textValue(record.selectionCriteria) } : {}),
  }
}

function safeResolve(root: string, candidate: string): string {
  const rootPath = resolve(root)
  const target = resolve(candidate)
  if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) throw new Error('文件路径越过内容根目录')
  return target
}

async function atomicWriteText(base: string, relative: string, value: string): Promise<void> {
  const targetPath = safeResolve(base, join(base, relative))
  const parent = dirname(targetPath)
  await mkdir(parent, { recursive: true })
  const temporary = join(parent, `.${targetPath.split(sep).pop() ?? 'content'}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporary, value, { encoding: 'utf8', flag: 'wx' })
  try {
    await rename(temporary, targetPath)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

async function readOptionalText(path: string): Promise<string> {
  try {
    const buffer = await readFile(path)
    if (buffer.byteLength > MAX_TEXT_BYTES) throw new Error(`文件过大（上限 ${MAX_TEXT_BYTES} 字节）：${path}`)
    return buffer.toString('utf8')
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ENOENT') return ''
    throw error
  }
}

function nextCandidateId(items: Candidate[], now: string): string {
  const date = now.replace(/[-:]/g, '').slice(0, 8)
  const count = items.filter((item) => item.id.startsWith(`cand-${date}`)).length + 1
  return `cand-${date}-${String(count).padStart(3, '0')}`
}

export class FileWorkspaceStore implements CandidateStore, ProfileStore {
  readonly root: string
  private readonly dir: string

  constructor(contentRoot: string) {
    this.root = resolve(contentRoot)
    this.dir = join(this.root, WORKSPACE_DIR)
  }

  private candidatesPath(): string {
    return join(WORKSPACE_DIR, 'candidates.yaml')
  }

  private profilePath(): string {
    return join(WORKSPACE_DIR, 'creator-profile.yaml')
  }

  async list(): Promise<Candidate[]> {
    const text = await readOptionalText(safeResolve(this.root, join(this.root, this.candidatesPath())))
    if (text === '') return []
    try {
      return parseCandidates(parse(text))
    } catch {
      return []
    }
  }

  private async writeItems(items: Candidate[]): Promise<void> {
    const payload = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      items: items.map((item) => ({
        ...item,
        ...(item.convertedTopic === undefined ? {} : { convertedTopic: item.convertedTopic }),
      })),
    }
    await atomicWriteText(this.root, this.candidatesPath(), `${stringify(payload)}\n`)
  }

  async add(input: { title: string; claim: string; source: CandidateSource; tags?: string[] }): Promise<Candidate> {
    const title = input.title.trim()
    if (title === '') throw new Error('候选选题标题不能为空')
    const claim = input.claim.trim()
    if (claim === '' || input.source.ref.trim() === '') throw new Error('候选选题需要一句话主张与来源引用')
    const items = await this.list()
    const candidate: Candidate = {
      id: nextCandidateId(items, new Date().toISOString()),
      title,
      claim,
      source: { kind: input.source.kind.trim() || 'file', ref: input.source.ref.trim() },
      tags: input.tags === undefined ? [] : input.tags.filter((tag) => tag.trim() !== '').map((tag) => tag.trim()),
      status: 'pending',
    }
    await this.writeItems([...items, candidate])
    return candidate
  }

  async select(ids: string[]): Promise<Candidate[]> {
    const wanted = new Set(ids)
    if (wanted.size === 0) return this.list()
    const items = await this.list()
    const next = items.map((item) => wanted.has(item.id) ? { ...item, status: 'selected' as const } : item)
    await this.writeItems(next)
    return next
  }

  async convert(id: string, topicId: string): Promise<Candidate[]> {
    const items = await this.list()
    let found = false
    const next = items.map((item) => {
      if (item.id !== id) return item
      found = true
      return { ...item, status: 'converted' as const, convertedTopic: topicId }
    })
    if (!found) throw new Error(`候选选题不存在：${id}`)
    await this.writeItems(next)
    return next
  }

  async update(items: Candidate[]): Promise<Candidate[]> {
    await this.writeItems(items)
    return items
  }

  async get(): Promise<CreatorProfile> {
    const text = await readOptionalText(safeResolve(this.root, join(this.root, this.profilePath())))
    if (text === '') return {}
    try {
      return normalizeProfile(parse(text))
    } catch {
      return {}
    }
  }

  async save(profile: CreatorProfile): Promise<CreatorProfile> {
    const normalized = normalizeProfile(profile)
    await atomicWriteText(this.root, this.profilePath(), `${stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), ...normalized })}\n`)
    return normalized
  }
}

export class MockWorkspaceStore implements CandidateStore, ProfileStore {
  private candidates: Candidate[] = []
  private profile: CreatorProfile = {}

  async list(): Promise<Candidate[]> {
    return this.candidates.map((item) => ({ ...item, tags: [...item.tags] }))
  }

  async add(input: { title: string; claim: string; source: CandidateSource; tags?: string[] }): Promise<Candidate> {
    const title = input.title.trim()
    if (title === '') throw new Error('候选选题标题不能为空')
    const claim = input.claim.trim()
    if (claim === '' || input.source.ref.trim() === '') throw new Error('候选选题需要一句话主张与来源引用')
    const candidate: Candidate = {
      id: `cand-mock-${this.candidates.length + 1}`,
      title,
      claim,
      source: { kind: input.source.kind.trim() || 'file', ref: input.source.ref.trim() },
      tags: input.tags === undefined ? [] : [...input.tags],
      status: 'pending',
    }
    this.candidates = [...this.candidates, candidate]
    return { ...candidate }
  }

  async select(ids: string[]): Promise<Candidate[]> {
    const wanted = new Set(ids)
    if (wanted.size === 0) return this.list()
    this.candidates = this.candidates.map((item) => wanted.has(item.id) ? { ...item, status: 'selected' as const } : item)
    return this.list()
  }

  async convert(id: string, topicId: string): Promise<Candidate[]> {
    let found = false
    this.candidates = this.candidates.map((item) => {
      if (item.id !== id) return item
      found = true
      return { ...item, status: 'converted' as const, convertedTopic: topicId }
    })
    if (!found) throw new Error(`候选选题不存在：${id}`)
    return this.list()
  }

  async update(items: Candidate[]): Promise<Candidate[]> {
    this.candidates = items.map((item) => ({ ...item, tags: [...item.tags] }))
    return this.list()
  }

  async get(): Promise<CreatorProfile> {
    return { ...this.profile }
  }

  async save(profile: CreatorProfile): Promise<CreatorProfile> {
    this.profile = normalizeProfile(profile)
    return { ...this.profile }
  }
}

export function createWorkspaceStore(mode: 'mock' | 'file', contentRoot: string): CandidateStore & ProfileStore {
  return mode === 'file' ? new FileWorkspaceStore(contentRoot) : new MockWorkspaceStore()
}
