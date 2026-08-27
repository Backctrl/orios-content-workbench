import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { resolveEnv } from './env.js'

/**
 * 内容创作工作台 · 项目脚手架（worktable 宿主侧）
 * 把插件自带的多窗口 UI 资产（ui/）物化到一个专用项目文件夹，
 * worktable 的 widget-result.json 自愈扫挂据此把四个窗口挂进工作台项目。
 */

/** worktable 项目 id（客户端注册到 sidebar.worktable.project 插槽的同一 id） */
export const WORKBENCH_PROJECT_ID = 'orios-content-workbench'

export interface WorkbenchInfo {
  folder: string
  contentRoot: string
  apiBase: string
  ready: boolean
  projectId: string
}

/** 插件包内 UI 资产目录（构建后 lib/*.mjs → ../ui） */
function uiDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'ui')
}

/** 工作台项目文件夹：config.workbenchFolder 优先，缺省 $DSH_HOME/projects/orios-content-workbench */
export function resolveWorkbenchFolder(configured?: string): string {
  const explicit = configured?.trim()
  if (explicit) return explicit
  const home = resolveEnv('DSH_HOME') || join(homedir(), '.dsh')
  return join(home, 'projects', 'orios-content-workbench')
}

const UI_FILES = [
  'creator-common.js',
  'content-workbench-widget.html',
  'creator-topbar.html',
  'creator-topic-editor.html',
  'creator-preview.html',
  'widget-result.json',
] as const

/**
 * 把工作台 UI 资产物化到项目文件夹（幂等，写缺失不覆盖）：
 * - UI 资产只在目标文件缺失时写入（用户可直接编辑文件夹里的窗口文件，不会被插件覆盖）；
 *   插件升级想更新 UI 时，先删除对应文件（或把改动同步进 ui/ 后由用户决定）。
 * - 内容库模板只在未配置 contentRoot 时创建（_工作台/candidates.yaml 空池）。
 * 绝不删除或改动已有内容库文件。
 */
export async function scaffoldWorkbench(folder: string, configuredContentRoot: string): Promise<WorkbenchInfo> {
  await mkdir(folder, { recursive: true })
  const source = uiDir()
  for (const file of UI_FILES) {
    const target = join(folder, file)
    try {
      await readFile(target)
      continue // 已存在：保留用户版本
    } catch {
      // 缺失 → 从插件 ui/ 复制
    }
    try {
      await copyFile(join(source, file), target)
    } catch {
      // ui 资产缺失时跳过
    }
  }
  let contentRoot = configuredContentRoot.trim()
  if (!contentRoot) {
    contentRoot = join(folder, '内容创作')
    await mkdir(join(contentRoot, '_工作台'), { recursive: true })
    const candidatesPath = join(contentRoot, '_工作台', 'candidates.yaml')
    try {
      await readFile(candidatesPath, 'utf8')
    } catch {
      await writeFile(
        candidatesPath,
        '# 候选选题池（选题在前，主题在后；status: pending | selected | converted）\ncandidates: []\n',
        'utf8',
      )
    }
  }
  return { folder, contentRoot, apiBase: '/creator/api', ready: true, projectId: WORKBENCH_PROJECT_ID }
}
