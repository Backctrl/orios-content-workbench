import { spawnSync } from 'node:child_process'

/**
 * Windows 用户环境注册表（HKCU\Environment）读取。
 * 背景：本机 dsh 启动链（bin.js → launcher）会剥离/重建子进程环境变量，
 * 导致 setx 写入的用户环境变量在 harness 进程内 process.env 读不到。
 * 此处提供注册表回退：key 已写入用户环境即可被 dsh-creator 检测与执行器读取，
 * 不依赖进程启动方式。非 Windows 或读取失败时返回空映射。
 */

let cache: Record<string, string | undefined> | null = null

function isWindows(): boolean {
  return typeof process !== 'undefined' && process.platform === 'win32'
}

export function userEnvironment(): Record<string, string | undefined> {
  if (cache !== null) return cache
  const out: Record<string, string | undefined> = {}
  if (!isWindows()) {
    cache = out
    return out
  }
  try {
    const result = spawnSync('reg', ['query', 'HKCU\\Environment'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    })
    if (result.status === 0) {
      const stdout = String(result.stdout ?? '')
      for (const line of stdout.split(/\r?\n/)) {
        const match = /^\s*(.+?)\s+REG_[A-Z_0-9]+\s+(.*)$/.exec(line.trim())
        if (match) out[match[1]] = match[2]
      }
    }
  } catch {
    // 读取失败按空处理
  }
  cache = out
  return out
}

/** 解析环境变量：process.env 优先，其次 Windows 用户环境注册表。 */
export function resolveEnv(name: string): string | undefined {
  const direct = process.env[name]
  if (direct !== undefined && direct !== '') return direct
  return userEnvironment()[name]
}

/** 合并后的完整环境视图：process.env + 用户环境注册表（后者仅补缺）。 */
export function environmentWithUserVars(): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...process.env }
  try {
    const user = userEnvironment()
    for (const [key, value] of Object.entries(user)) {
      if (merged[key] === undefined && value !== undefined && value !== '') merged[key] = value
    }
  } catch {
    // 合并失败时退回 process.env
  }
  return merged
}
