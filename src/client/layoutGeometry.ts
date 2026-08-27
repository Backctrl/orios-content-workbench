import { useSyncExternalStore } from 'react'

export const DEFAULT_SIDEBAR_WIDTH = 280

function sidebarElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const toggles = document.querySelectorAll<HTMLButtonElement>('button[aria-label="打开侧边栏"], button[aria-label="折叠侧边栏"]')
  for (const toggle of toggles) {
    let current: HTMLElement | null = toggle
    while (current) {
      const rect = current.getBoundingClientRect()
      if (rect.left <= 1 && rect.width >= 50 && rect.width <= 500 && rect.height >= window.innerHeight - 100) return current
      current = current.parentElement
    }
  }
  return null
}

function readSidebarWidth(): number {
  const element = sidebarElement()
  if (!element) return DEFAULT_SIDEBAR_WIDTH
  return Math.round(element.getBoundingClientRect().width)
}

let currentWidth = DEFAULT_SIDEBAR_WIDTH
let trackerCleanup: (() => void) | null = null
const listeners = new Set<() => void>()

function notifyWidth(): void {
  const next = readSidebarWidth()
  if (currentWidth === next) return
  currentWidth = next
  for (const listener of listeners) listener()
}

function startTracker(): void {
  if (trackerCleanup || typeof window === 'undefined') return
  const update = (): void => notifyWidth()
  const attachResizeObserver = (): ResizeObserver | null => {
    const element = sidebarElement()
    if (!element || typeof ResizeObserver === 'undefined') return null
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return observer
  }
  let observer = attachResizeObserver()
  const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
    update()
    if (!observer) observer = attachResizeObserver()
  }) : null
  mutationObserver?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-label'] })
  window.addEventListener('resize', update)
  const frame = window.requestAnimationFrame(update)
  const retry = window.setTimeout(update, 120)
  trackerCleanup = () => {
    window.removeEventListener('resize', update)
    observer?.disconnect()
    mutationObserver?.disconnect()
    window.cancelAnimationFrame(frame)
    window.clearTimeout(retry)
    trackerCleanup = null
  }
  update()
}

function subscribeSidebarWidth(listener: () => void): () => void {
  startTracker()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) trackerCleanup?.()
  }
}

function subscribeNothing(): () => void {
  return () => undefined
}

export function useSidebarWidth(active: boolean): number {
  return useSyncExternalStore(active ? subscribeSidebarWidth : subscribeNothing, () => currentWidth, () => DEFAULT_SIDEBAR_WIDTH)
}
