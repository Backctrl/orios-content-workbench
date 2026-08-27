import { useEffect } from 'react'

/**
 * 内容创作工作台 · worktable 项目注册
 * 1) 把项目写进 dsh-worktable 的 projects store（localStorage，幂等合并）：
 *    folders[id] = 项目文件夹（widget-result.json 自愈扫挂据此挂载四窗）；
 *    views[id]   = 顶栏 + 三列 + 右侧对话 布局（点击卡片由工作台引擎打开）。
 * 2) 注册 sidebar.worktable.project 插槽卡片，让项目出现在工作台侧栏。
 * 3) 写入后派发 dsh:worktable.reload 事件，让工作台即时重载 projects store。
 */

export const WORKBENCH_PROJECT_ID = 'orios-content-workbench'
const PROJECTS_KEY = 'dsh.worktable.projects.v1'
const PROJECT_NAME = '内容创作工作台'
const PROJECT_ICON = '✍️'

/** worktable 传给注册卡片的 ownerProps（协议 v2 子集） */
export interface WorktableOwnerProps {
  wide?: boolean
  openSplit?: (spec: unknown) => void
  reportMeta?: (meta: { id: string; name: string; icon?: string }) => void
  activeSplitId?: string | null
  [key: string]: unknown
}

/** 顶栏 + 三列 + 右侧对话 布局（与 dsh-worktable tb3 预设同构；窗口编号与 widget-result.json 对应） */
function tb3Spec(): unknown {
  return {
    id: WORKBENCH_PROJECT_ID,
    title: PROJECT_NAME,
    left: null,
    top: [{ id: 'p-top', title: '顶部栏 · 设置与发布', min: 120, content: null }],
    main: [
      { id: 'p-overview', title: '总览与选题库', min: 200, content: null },
      { id: 'p-editor', title: '内容编辑与修改', min: 200, content: null },
      { id: 'p-preview', title: '配图及视频预览', min: 200, content: null },
    ],
    leftWidth: { default: 260, min: 160, max: 480 },
    chatWidth: { default: 360, min: 240, max: 600 },
    topHeight: { default: 120, min: 120, max: 320 },
    topHeightRatio: 0.2,
    chatSide: 'right',
    chatFullHeight: true,
  }
}

function readProjects(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY)
    return raw ? JSON.parse(raw) as Record<string, unknown> : null
  } catch {
    return null
  }
}

function writeProjects(next: Record<string, unknown>): void {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(next))
  } catch {
    // 配额/隐私模式异常时忽略
  }
}

/** 幂等合并：只补缺，绝不覆盖用户已有条目 */
export function seedWorktableProject(folder: string): void {
  const prev = readProjects() ?? {}
  const order = Array.isArray(prev.order) ? prev.order as string[] : []
  const folders = (prev.folders ?? {}) as Record<string, string>
  const views = (prev.views ?? {}) as Record<string, unknown>
  const hidden = Array.isArray(prev.hidden) ? (prev.hidden as string[]).filter((id) => id !== WORKBENCH_PROJECT_ID) : []
  const removed = Array.isArray(prev.removed) ? (prev.removed as string[]).filter((id) => id !== WORKBENCH_PROJECT_ID) : []
  const next: Record<string, unknown> = {
    ...prev,
    order: order.includes(WORKBENCH_PROJECT_ID) ? order : [...order, WORKBENCH_PROJECT_ID],
    hidden,
    removed,
    folders: folders[WORKBENCH_PROJECT_ID] ? folders : { ...folders, [WORKBENCH_PROJECT_ID]: folder },
    views: views[WORKBENCH_PROJECT_ID] ? views : { ...views, [WORKBENCH_PROJECT_ID]: tb3Spec() },
  }
  writeProjects(next)
}

/** 通知 worktable 重载 projects store（自愈扫挂随后把四窗挂进项目） */
export function notifyWorktableReload(): void {
  try {
    window.dispatchEvent(new CustomEvent('dsh:worktable.reload'))
    window.dispatchEvent(new StorageEvent('storage', { key: PROJECTS_KEY, newValue: localStorage.getItem(PROJECTS_KEY) }))
  } catch {
    // 事件派发失败不影响种子写入
  }
}

/** 拉取宿主脚手架信息并写入 worktable projects store（幂等；宿主路由未就绪时重试） */
export async function syncWorkbenchProject(retries = 3): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('/creator/api/workbench', { cache: 'no-store' })
      const body = await response.json().catch(() => null)
      const info = body?.ok ? body.data : null
      if (!info || typeof info.folder !== 'string' || info.folder === '') return
      seedWorktableProject(info.folder)
      notifyWorktableReload()
      return
    } catch {
      // 宿主路由未就绪（如重启后首次加载）：短暂等待后重试
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 1200))
    }
  }
}

/** 工作台侧栏项目卡片（结构遵循 worktable 入驻卡片约定：图标 / 名称+描述 / ›） */
export function WorkbenchCard(props: WorktableOwnerProps): JSX.Element {
  const { openSplit, reportMeta } = props
  useEffect(() => {
    try {
      reportMeta?.({ id: WORKBENCH_PROJECT_ID, name: PROJECT_NAME, icon: PROJECT_ICON })
    } catch {
      // 协议回调缺席时忽略
    }
    // 兜底：本卡片挂载时再同步一次（worktable 可能已先行加载 projects store）
    void syncWorkbenchProject().catch(() => undefined)
  }, [])
  return (
    <button
      type="button"
      data-orios-workbench-card="true"
      title={PROJECT_NAME}
      onClick={() => {
        // 启动期同步失败的兜底：点击时重新拉取脚手架并打开布局，
        // 种子写入 + reload 事件会让 worktable 把四窗挂进刚打开的窗格。
        void syncWorkbenchProject().catch(() => undefined)
        try {
          openSplit?.(tb3Spec())
        } catch {
          // 视图覆盖接管点击时此分支不会执行
        }
      }}
    >
      <span aria-hidden="true">{PROJECT_ICON}</span>
      <span>
        <span>{PROJECT_NAME}</span>
        <span>选题 → 长文 → 变体 → 发布</span>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  )
}
