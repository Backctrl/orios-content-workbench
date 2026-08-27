import type { CreatorRepository } from './types.js'
import { generateImages } from './imageGenerate.js'
import { folderPathOf } from './reviewService.js'
import { resolveEnv } from './env.js'

/**
 * 图像生成服务（图卡/配图）：逻辑同时供 Agent 工具（creator_generate_image）与
 * 客户端 HTTP 端点（/creator/api/generate-image）复用。图像 Provider 未配置时明确报错，不伪造图片。
 */

export interface GenerateTopicImageOptions {
  id: string
  prompt: string
  target?: 'cards' | 'article'
  filename?: string
  count?: number
}

export interface GenerateTopicImageResult {
  saved: string[]
  count: number
}

export async function generateTopicImage(repository: CreatorRepository, options: GenerateTopicImageOptions): Promise<GenerateTopicImageResult> {
  if (options.id === '') throw new Error('id is required')
  if (typeof options.prompt !== 'string' || options.prompt.trim() === '') throw new Error('prompt is required')
  const settings = await repository.getSettings()
  const imageStatus = settings.statuses.find((status) => status.id === 'image')
  if (imageStatus === undefined || imageStatus.status !== 'configured') {
    throw new Error(
      '图像 Provider 未配置：请先在 DSH 设置页「内容工作台」卡片配置 image（endpoint/model/credentialEnvs），'
      + `并确保凭据环境变量存在（${imageStatus?.detail ?? '当前未配置'}）。未配置时不生成图片。`,
    )
  }
  const imageConfig = settings.settings.providers.image
  const keyEnv = imageConfig.credentialEnvs.find((name) => resolveEnv(name) !== undefined)
  if (keyEnv === undefined) {
    throw new Error(`图像 Provider 缺少可用密钥：${imageConfig.credentialEnvs.join('、')} 均未设置（环境变量或 Windows 用户环境）`)
  }
  const apiKey = resolveEnv(keyEnv) as string
  const project = await repository.getProject(options.id)
  if (project === null) throw new Error(`content not found: ${options.id}`)
  const folderPath = await folderPathOf(repository, project)
  if (folderPath === undefined) throw new Error('mock 模式没有真实主题目录，无法保存图片')
  const target = options.target === 'article' ? 'wechat/images' : 'xhs/cards'
  const baseName = typeof options.filename === 'string' && options.filename.trim() !== '' ? options.filename.trim() : project.slug
  const result = await generateImages({
    endpoint: imageConfig.endpoint,
    model: imageConfig.model,
    apiKey,
    prompt: options.prompt.trim(),
    count: typeof options.count === 'number' ? options.count : 1,
    outputDir: `${folderPath}/${target}`,
    baseName,
  })
  return { saved: result.saved, count: result.count }
}
