import type { CreatorRepository } from './types.js'
import { parseWewriteJson, resolveWewriteCli, runWewrite } from './wewriteCli.js'

/**
 * wewrite 质量把关服务：评分（score）与查重（similarity）。
 * 逻辑同时供 Agent 工具（creator_review_score / creator_similarity_check）与
 * 客户端 HTTP 端点（/creator/api/review-score、/creator/api/similarity-check）复用。
 */

export async function folderPathOf(repository: CreatorRepository, project: { month: string; plannedAt: string; slug: string }): Promise<string | undefined> {
  try {
    const capabilities = await repository.getCapabilities()
    if (capabilities.repositoryMode !== 'file' || !capabilities.contentRoot) return undefined
    return `${capabilities.contentRoot}/${project.month}/${project.plannedAt}_${project.slug}`
  } catch {
    return undefined
  }
}

export interface ScoreResult {
  quality_score: number
  composite_score: number
  tier1?: unknown
  tier2?: unknown
  source: string
  note: string
}

export interface SimilarityResult {
  pairs: Array<{ source: string; result: unknown }>
  note: string
}

export async function reviewArticleScore(repository: CreatorRepository, id: string): Promise<ScoreResult> {
  if (id === '') throw new Error('id is required')
  const project = await repository.getProject(id)
  if (project === null) throw new Error(`content not found: ${id}`)
  const folderPath = await folderPathOf(repository, project)
  if (folderPath === undefined) throw new Error('mock 模式没有真实主题目录')
  const caps = await repository.getCapabilities()
  const cli = resolveWewriteCli(caps.contentRoot)
  if (cli === null) {
    throw new Error('未找到 wewrite CLI：请安装到 内容库/_工作台/wewrite-cli（.venv/Scripts/wewrite.exe）或设置 ORIOS_WEWRITE_CLI 环境变量')
  }
  const articlePath = `${folderPath}/wechat/article.md`
  const result = runWewrite(cli, ['score', articlePath, '--json'])
  const parsed = parseWewriteJson<{ quality_score?: number; composite_score?: number; tier1?: unknown; tier2?: unknown }>(result)
  if (parsed === null) {
    throw new Error(`wewrite score 失败（${result.status ?? 'error'}）：${result.stderr.trim().slice(0, 400) || result.stdout.trim().slice(0, 400)}`)
  }
  return {
    quality_score: parsed.quality_score ?? 0,
    composite_score: parsed.composite_score ?? 0,
    tier1: parsed.tier1,
    tier2: parsed.tier2,
    source: 'wewrite score --json',
    note: '分数只提示语言节奏可能的问题；五维审稿（准确/观点/有用/合声/好读）仍是编辑判断依据。',
  }
}

export async function checkVariantSimilarity(repository: CreatorRepository, id: string, target: 'xhs' | 'video' | 'both' = 'both'): Promise<SimilarityResult> {
  if (id === '') throw new Error('id is required')
  const project = await repository.getProject(id)
  if (project === null) throw new Error(`content not found: ${id}`)
  const folderPath = await folderPathOf(repository, project)
  if (folderPath === undefined) throw new Error('mock 模式没有真实主题目录')
  const caps = await repository.getCapabilities()
  const cli = resolveWewriteCli(caps.contentRoot)
  if (cli === null) {
    throw new Error('未找到 wewrite CLI：请安装到 内容库/_工作台/wewrite-cli（.venv/Scripts/wewrite.exe）或设置 ORIOS_WEWRITE_CLI 环境变量')
  }
  const articlePath = `${folderPath}/wechat/article.md`
  const targets = target === 'xhs' ? ['xhs/post.md'] : target === 'video' ? ['video/script.md'] : ['xhs/post.md', 'video/script.md']
  const pairs: Array<{ source: string; result: unknown }> = []
  for (const relative of targets) {
    const other = `${folderPath}/${relative}`
    const result = runWewrite(cli, ['similarity', articlePath, other, '--json'])
    const parsed = parseWewriteJson<unknown>(result)
    if (parsed === null) {
      throw new Error(`wewrite similarity 失败（${relative}）：${result.stderr.trim().slice(0, 400) || result.stdout.trim().slice(0, 400)}`)
    }
    pairs.push({ source: relative, result: parsed })
  }
  return {
    pairs,
    note: '相似度是改写程度的提示信号；平台版本仍须内容级真改并追溯回同一组主张（五维审稿中的「合声/准确」把关）。',
  }
}
