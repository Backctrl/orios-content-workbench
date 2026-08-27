import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createRoot, type Root } from 'react-dom/client'
import { CreatorDockedInspector } from './CreatorDockedInspector.js'
import { CreatorLibraryDrawer } from './CreatorLibraryDrawer.js'
import { CreatorSidebarAction } from './CreatorSidebarAction.js'
import { CreatorSettingsCard } from './CreatorSettingsCard.js'
import { registerCreatorTriggers } from './contentTriggers.js'
import { startLibraryLiveSync } from './catalogSync.js'
import { initHandoffServices } from './handoff.js'
import { MARKDOWN_PREVIEW_STYLES } from './markdownPreview.js'
import { creatorDockedStyles } from './creatorDockedStyles.js'
import { createBrowserRepository } from './remoteRepository.js'
import { creatorStyles } from './styles.js'
import { getCurrentProjectId, setCurrentProjectId, subscribeCurrentProject } from './selection.js'
import { restorePersistedSelection } from './uiState.js'
import { syncWorkbenchProject, WorkbenchCard, WORKBENCH_PROJECT_ID } from './workbenchProject.js'

let applied = false

function installStyles(): HTMLStyleElement {
  const style = document.createElement('style')
  style.dataset.oriosCreatorStyles = ''
  style.textContent = `${creatorStyles}\n${MARKDOWN_PREVIEW_STYLES}\n${creatorDockedStyles}`
  document.head.appendChild(style)
  return style
}

function mountFallback(): () => void {
  const root = document.createElement('div')
  root.dataset.oriosCreatorRoot = ''
  root.style.cssText = 'position:fixed;left:0;top:0;bottom:0;z-index:205;width:340px;background:#17181b;border-right:1px solid rgba(255,255,255,.11);overflow:auto;padding:14px;display:none'
  document.body.appendChild(root)
  const button = document.createElement('button')
  button.dataset.oriosCreatorButton = ''
  button.textContent = '内容工作台'
  button.style.cssText = 'position:fixed;left:18px;bottom:18px;z-index:210;padding:8px 12px;border-radius:9px;border:1px solid rgba(128,128,128,.35);background:#222;color:inherit;cursor:pointer'
  document.body.appendChild(button)
  button.addEventListener('click', () => {
    root.style.display = root.style.display === 'none' ? 'block' : 'none'
  })
  let disposed = false
  const render = async (): Promise<void> => {
    const repository = createBrowserRepository()
    const projects = await repository.listProjects('')
    if (disposed) return
    const mount = createRoot(root)
    mount.render(
      <div style={{ display: 'grid', gap: 6 }}>
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px', borderRadius: 8, border: '1px solid rgba(255,255,255,.11)', background: '#202226', color: 'inherit', cursor: 'pointer', font: 'inherit' }}
            onClick={() => { setCurrentProjectId(project.id) }}
          >
            <strong>{project.title}</strong><br />
            <small style={{ color: '#9da3ad' }}>{project.nextAction}</small>
          </button>
        ))}
      </div>,
    )
  }
  void render().catch(() => undefined)
  return () => { disposed = true; button.remove(); root.remove() }
}

function mountNativeSurface(ctx: ClientContext): (() => void) | null {
  const context = ctx as any
  const slots = context.get?.('slots') ?? context.slots
  if (!slots?.inject || !slots?.register) return null
  const safeInject = (name: string, factory: () => unknown): (() => void) | null => {
    try {
      const stop = slots.inject(name, factory)
      return typeof stop === 'function' ? stop : () => undefined
    } catch {
      return null
    }
  }
  const credentialsOf = (): unknown => {
    try {
      return context.get?.('connection')?.api?.credentials
    } catch {
      return undefined
    }
  }
  const openPath = async (path: string): Promise<void> => {
    try {
      await ctx.workspaces?.openPath?.(path)
    } catch {
      // 目录可能在 mock 模式下不存在；忽略失败。
    }
  }
  const libraryOverlayStop = safeInject('shell.overlay', () => slots.register({
    name: 'shell.overlay',
    id: 'orios-creator-library-drawer',
    order: 10,
  }, CreatorLibraryDrawer))
  const sidebarActionStop = safeInject('sidebar.footer.action', () => slots.register({
    name: 'sidebar.footer.action',
    id: 'orios-creator-library-action',
    order: 30,
    label: '内容库',
  }, CreatorSidebarAction))
  const inspectorStop = safeInject('shell.overlay', () => {
    let disposeOccupant: (() => void) | undefined
    const sync = (): void => {
      disposeOccupant?.()
      disposeOccupant = undefined
      const selectedId = getCurrentProjectId()
      if (!selectedId) return
      disposeOccupant = slots.register({
        name: 'shell.overlay',
        id: 'orios-creator-docked-inspector',
        order: 20,
        inject: () => ({
          selectedId,
          closeDetails: () => setCurrentProjectId(null),
          openPath,
        }),
      }, CreatorDockedInspector)
    }
    const stop = subscribeCurrentProject(sync)
    sync()
    return () => { stop(); disposeOccupant?.(); disposeOccupant = undefined }
  })
  const settingsStop = safeInject('settings.plugin.item', () => slots.register({
    name: 'settings.plugin.item',
    key: 'orios-creator',
    id: 'orios-creator',
    order: 40,
    inject: () => ({ credentials: credentialsOf() }),
  }, CreatorSettingsCard))
  const workbenchProjectStop = safeInject('sidebar.worktable.project', () => slots.register({
    name: 'sidebar.worktable.project',
    id: WORKBENCH_PROJECT_ID,
    order: 10,
  }, WorkbenchCard))
  if (!sidebarActionStop && !libraryOverlayStop && !inspectorStop && !settingsStop && !workbenchProjectStop) return null
  return () => { sidebarActionStop?.(); libraryOverlayStop?.(); inspectorStop?.(); settingsStop?.(); workbenchProjectStop?.() }
}

export const inject = ['slots', 'inputTriggers', 'workspaces', 'layout', 'connection']

export function apply(ctx: ClientContext): void {
  if (applied) return
  applied = true
  const style = installStyles()
  initHandoffServices(ctx)
  restorePersistedSelection()
  const slotCleanup = mountNativeSurface(ctx)
  const fallbackCleanup = slotCleanup ? () => undefined : mountFallback()
  const repository = createBrowserRepository()
  const triggerCleanup = registerCreatorTriggers(ctx.get?.('inputTriggers'), async () => (await repository.listProjects()).map((item) => ({ id: item.id, title: item.title })))
  const syncCleanup = startLibraryLiveSync(() => repository.getRevision())
  void syncWorkbenchProject().catch(() => undefined)
  ctx.effect(() => () => { slotCleanup?.(); fallbackCleanup(); triggerCleanup(); syncCleanup(); style.remove(); applied = false }, 'dsh-creator: client workbench')
}
