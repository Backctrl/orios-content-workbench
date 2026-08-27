import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * wewrite CLI（公众号内容全流程 Skill）封装：确定性命令（score/similarity 等）。
 * CLI 定位优先级：环境变量 ORIOS_WEWRITE_CLI → contentRoot/_工作台/wewrite-cli/.venv/Scripts/wewrite.exe。
 * 找不到时工具层应明确报错，不伪造评分。
 */

export function resolveWewriteCli(contentRoot?: string): string | null {
  const fromEnv = process.env.ORIOS_WEWRITE_CLI
  if (fromEnv !== undefined && fromEnv.trim() !== '' && existsSync(fromEnv.trim())) return fromEnv.trim()
  if (contentRoot !== undefined && contentRoot !== '') {
    const candidates = [
      join(contentRoot, '_工作台', 'wewrite-cli', '.venv', 'Scripts', 'wewrite.exe'),
      join(contentRoot, '_工作台', 'wewrite-cli', '.venv', 'bin', 'wewrite'),
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

export interface WewriteCliResult {
  ok: boolean
  stdout: string
  stderr: string
  status: number | null
}

export function runWewrite(cliPath: string, args: readonly string[]): WewriteCliResult {
  const result = spawnSync(cliPath, [...args], {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  })
  return {
    ok: result.status === 0 && result.error === undefined,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
    status: result.status,
  }
}

export function parseWewriteJson<T>(result: WewriteCliResult): T | null {
  if (!result.ok) return null
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    return null
  }
}
