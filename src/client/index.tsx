import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { CreatorSettingsCard } from './CreatorSettingsCard.js'
import { initHandoffServices } from './handoff.js'
import { creatorStyles } from './styles.js'
import { syncWorkbenchProject, WorkbenchCard, WORKBENCH_PROJECT_ID } from './workbenchProject.js'

let applied = false

function installStyles(): HTMLStyleElement {
  const style = document.createElement('style')
  style.dataset.oriosCreatorStyles = ''
  style.textContent = creatorStyles
  document.head.appendChild(style)
  return style
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
  if (!settingsStop && !workbenchProjectStop) return null
  return () => { settingsStop?.(); workbenchProjectStop?.() }
}

export const inject = ['slots', 'inputTriggers', 'workspaces', 'layout', 'connection']

export function apply(ctx: ClientContext): void {
  if (applied) return
  applied = true
  const style = installStyles()
  initHandoffServices(ctx)
  const slotCleanup = mountNativeSurface(ctx)
  void syncWorkbenchProject().catch(() => undefined)
  ctx.effect(() => () => { slotCleanup?.(); style.remove(); applied = false }, 'dsh-creator: client workbench')
}
