import { getCurrentProjectId } from './selection.js'

interface TriggerCandidate {
  name: string
  description?: string
}

export function registerCreatorTriggers(
  inputTriggers: any,
  list: () => Promise<ReadonlyArray<{ id: string; title: string }>>,
): () => void {
  if (!inputTriggers?.registerSource) return () => undefined
  const serialize = async (ref: string): Promise<string> => {
    const id = ref === 'current' ? getCurrentProjectId() : ref
    if (!id) return '当前没有打开的主题，请先在内容工作台选择一个主题。'
    const item = (await list()).find((candidate) => candidate.id === id)
    return `当前主题：${item?.title ?? id}\n主题 ID：${id}\n请读取该主题文件夹中的 Brief、来源和产物后再继续。`
  }
  const insert = (ref: string, label: string) => ({ insert: { source: 'orios-creator', ref, label, clipboardText: ref === 'current' ? '@当前内容' : `@${label}` } })
  const atSource = {
    trigger: '@',
    name: 'orios-creator',
    order: 35,
    async candidates(_session: unknown, req: { query: string }): Promise<TriggerCandidate[]> {
      const query = req.query.trim().toLowerCase()
      const items = await list()
      const current = getCurrentProjectId()
      const output: TriggerCandidate[] = []
      if (current && (query === '' || '当前内容'.includes(query))) output.push({ name: '当前内容', description: current })
      for (const item of items) {
        if (query && !item.title.toLowerCase().includes(query) && !item.id.toLowerCase().includes(query)) continue
        output.push({ name: item.title, description: item.id })
      }
      return output.slice(0, 20)
    },
    onPick({ candidate }: { candidate: TriggerCandidate }) {
      return insert(candidate.name === '当前内容' ? 'current' : candidate.description ?? candidate.name, candidate.name)
    },
    lexicon: () => ['当前内容'],
    codec: { clipboardText: (ref: string) => ref === 'current' ? '@当前内容' : `@${ref}`, serialize },
  }
  const slashSource = {
    trigger: '/',
    name: 'orios-creator',
    order: 45,
    async candidates(_session: unknown, req: { query: string }): Promise<TriggerCandidate[]> {
      const query = req.query.trim().toLowerCase()
      if (query && !'current content 当前内容'.includes(query)) return []
      return [{ name: 'current content', description: '把当前打开的主题交给对话' }]
    },
    onPick() { return insert('current', '当前内容') },
    lexicon: () => ['current content', '当前内容'],
    codec: { clipboardText: () => '/current content', serialize },
  }
  const stopAt = inputTriggers.registerSource(atSource)
  const stopSlash = inputTriggers.registerSource(slashSource)
  return () => { stopAt?.(); stopSlash?.() }
}
