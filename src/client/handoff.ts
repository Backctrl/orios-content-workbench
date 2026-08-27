import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { CreatorProject } from '../types.js'
import { buildHandoffPrompt } from '../workflowPrompt.js'

let clientContext: ClientContext | null = null

export function initHandoffServices(ctx: ClientContext): void {
  clientContext = ctx
}

export interface HandoffOutcome {
  ok: boolean
  sessionId?: string
  message: string
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 通过 DSH 客户端会话服务直接发起任务：新建会话 → 打开 → 以 queue 模式发送交接提示。
 * create 是 SessionRuntime 具体类的方法（ISessions 外向接口未收窄），故经 any 访问并做能力探测。
 */
export async function handoffToNewSession(project: CreatorProject, stageLabel: string, directory?: string): Promise<HandoffOutcome> {
  const ctx = clientContext as unknown as { get?: (name: string) => unknown; sessions?: unknown; workspaces?: unknown }
  const sessions = ctx?.get?.('sessions') ?? ctx?.sessions
  const sessionsAny = sessions as { create?: (opts?: { workspaceId?: string; cwd?: string; sessionId?: string }) => Promise<string>; open?: (id: string) => void; binding?: (id: string) => { session?: { prompt?: (content: Array<{ type: 'text'; text: string }>, mode: 'queue' | 'steer') => Promise<{ ok?: boolean; error?: { message?: string } }> } } | undefined }
  if (!sessionsAny?.create || typeof sessionsAny.open !== 'function' || typeof sessionsAny.binding !== 'function') {
    return { ok: false, message: 'DSH 会话服务不可用；请改用「复制任务」在新会话中粘贴。' }
  }
  const prompt = buildHandoffPrompt(project, stageLabel, directory)
  let workspaceId: string | undefined
  try {
    const workspaces = ctx?.get?.('workspaces') ?? ctx?.workspaces
    const list = workspaces as { list?: { getSnapshot?: () => { recentWorkspaceId?: string } } }
    workspaceId = list?.list?.getSnapshot?.()?.recentWorkspaceId
  } catch {
    workspaceId = undefined
  }
  let sessionId: string
  try {
    sessionId = await sessionsAny.create(workspaceId ? { workspaceId } : {})
  } catch (error) {
    return { ok: false, message: `创建新会话失败：${errorText(error)}` }
  }
  try {
    sessionsAny.open?.(sessionId)
    const binding = sessionsAny.binding?.(sessionId)
    if (!binding?.session?.prompt) {
      return { ok: true, sessionId, message: `已创建并打开新会话 ${sessionId}，请手动粘贴任务。` }
    }
    const result = await binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
    if (!result || result.ok !== true) {
      return { ok: true, sessionId, message: `已打开新会话 ${sessionId}，但发送提示失败：${result?.error?.message ?? '未知错误'}；请在新会话中粘贴任务。` }
    }
    return { ok: true, sessionId, message: `已在新会话 ${sessionId} 中发起「${stageLabel}」任务，Agent 开始处理。` }
  } catch (error) {
    return { ok: true, sessionId, message: `已创建会话 ${sessionId}，但发送提示失败：${errorText(error)}；请在新会话中粘贴任务。` }
  }
}
