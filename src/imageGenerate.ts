import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * OpenAI 兼容图像生成执行器：POST {endpoint}/images/generations，把返回的
 * b64_json（或 url）保存为 PNG。仅当 image Provider 已配置（状态 configured）
 * 时调用；未配置时工具层会直接报错，不会伪造图片。
 */

export interface GenerateImagesOptions {
  endpoint: string
  model: string
  apiKey: string
  prompt: string
  count?: number
  size?: string
  outputDir: string
  baseName: string
}

export interface GenerateImagesResult {
  saved: string[]
  count: number
}

export async function generateImages(options: GenerateImagesOptions): Promise<GenerateImagesResult> {
  const { endpoint, model, apiKey, prompt, outputDir, baseName } = options
  if (apiKey === '') throw new Error('图像 Provider 缺少 API Key')
  if (prompt.trim() === '') throw new Error('生成图片需要提示词（prompt）')
  const count = options.count === undefined ? 1 : Math.min(4, Math.max(1, Math.round(options.count)))
  const size = options.size ?? '1024x1024'
  const url = `${endpoint.replace(/\/+$/, '')}/images/generations`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, prompt, n: count, size }),
    signal: AbortSignal.timeout(120000),
  })
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500)
    throw new Error(`图像 Provider 返回 ${response.status}：${body || '无响应体'}`)
  }
  const payload = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const items = payload.data ?? []
  if (items.length === 0) throw new Error('图像 Provider 未返回任何图片')
  await mkdir(outputDir, { recursive: true })
  const saved: string[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    let bytes: Buffer
    if (typeof item.b64_json === 'string' && item.b64_json !== '') {
      bytes = Buffer.from(item.b64_json, 'base64')
    } else if (typeof item.url === 'string' && item.url !== '') {
      const imageResponse = await fetch(item.url, { signal: AbortSignal.timeout(60000) })
      if (!imageResponse.ok) throw new Error(`下载生成图片失败：${imageResponse.status}`)
      bytes = Buffer.from(await imageResponse.arrayBuffer())
    } else {
      throw new Error('图像 Provider 返回项缺少图片数据')
    }
    if (bytes.byteLength === 0) throw new Error('图像 Provider 返回了空图片')
    const filename = `${baseName}${items.length > 1 ? `-${index + 1}` : ''}.png`
    await writeFile(join(outputDir, filename), bytes)
    saved.push(join(outputDir, filename))
  }
  return { saved, count: saved.length }
}
