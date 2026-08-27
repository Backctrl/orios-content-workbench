import { useEffect, useState } from 'react'
import { getCurrentProjectId, setCurrentProjectId, subscribeCurrentProject } from './selection.js'

const CREATOR_STORAGE_KEY = 'orios-creator/ui/v1'

interface CreatorUiState {
  schemaVersion: 1
  selectedId: string | null
  inspectorWidth?: number
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function loadUiState(): CreatorUiState {
  const storage = browserStorage()
  if (storage === undefined) return { schemaVersion: 1, selectedId: null }
  try {
    const raw = storage.getItem(CREATOR_STORAGE_KEY)
    if (raw === null) return { schemaVersion: 1, selectedId: null }
    const parsed = JSON.parse(raw) as Partial<CreatorUiState>
    return {
      schemaVersion: 1,
      selectedId: typeof parsed.selectedId === 'string' ? parsed.selectedId : null,
      ...(typeof parsed.inspectorWidth === 'number' && Number.isFinite(parsed.inspectorWidth)
        ? { inspectorWidth: parsed.inspectorWidth }
        : {}),
    }
  } catch {
    return { schemaVersion: 1, selectedId: null }
  }
}

function saveUiState(patch: Partial<CreatorUiState>): void {
  const storage = browserStorage()
  if (storage === undefined) return
  try {
    const current = loadUiState()
    storage.setItem(CREATOR_STORAGE_KEY, JSON.stringify({ ...current, ...patch, schemaVersion: 1 }))
  } catch {
    // Persistence is best-effort.
  }
}

export function restorePersistedSelection(): void {
  const persisted = loadUiState().selectedId
  if (persisted !== null && getCurrentProjectId() === null) setCurrentProjectId(persisted)
}

export const INSPECTOR_MIN = 360
export const INSPECTOR_MAX = 860
export const INSPECTOR_DEFAULT = 640

function clampInspectorWidth(px: number): number {
  return Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, Math.round(px)))
}

const initialWidth = clampInspectorWidth(loadUiState().inspectorWidth ?? INSPECTOR_DEFAULT)
let inspectorWidthPx = initialWidth

export function getInspectorWidth(): number {
  return inspectorWidthPx
}

export function setInspectorWidth(px: number): void {
  const next = clampInspectorWidth(px)
  if (inspectorWidthPx === next) return
  inspectorWidthPx = next
  saveUiState({ inspectorWidth: next })
}

export function useInspectorWidth(): number {
  const [width, setWidth] = useState(getInspectorWidth)
  return width
}

// —— 片库 epoch：任何写操作后 bump，面板/检查器重新拉取 ——
const libraryListeners = new Set<() => void>()
let libraryEpoch = 0

export function bumpLibrary(): void {
  libraryEpoch += 1
  for (const listener of libraryListeners) listener()
}

export function getLibraryEpoch(): number {
  return libraryEpoch
}

export function subscribeLibrary(listener: () => void): () => void {
  libraryListeners.add(listener)
  return () => { libraryListeners.delete(listener) }
}

export function useLibraryEpoch(): number {
  const [epoch, setEpoch] = useState(getLibraryEpoch)
  useEffect(() => subscribeLibrary(() => setEpoch(getLibraryEpoch())), [])
  return epoch
}

// —— 选择持久化：selection 变化时写入 localStorage ——
export function persistSelectionChange(listener: () => void): () => void {
  return subscribeCurrentProject(() => {
    saveUiState({ selectedId: getCurrentProjectId() })
    listener()
  })
}

// —— 对话列 inset：检查器打开时给对话容器留出左侧空间 ——
interface InlineStyleSnapshot {
  paddingLeft: string
  paddingLeftPriority: string
  transition: string
  transitionPriority: string
}

let insetHost: HTMLElement | null = null
let insetStyleSnapshot: InlineStyleSnapshot | null = null

function conversationHost(): HTMLElement | null {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return null
  const scrollport = document.querySelector('[data-conversation-scroll]')
  const host = scrollport?.parentElement
  return host instanceof HTMLElement ? host : null
}

function restoreInsetHost(): void {
  if (insetHost === null || insetStyleSnapshot === null) return
  const host = insetHost
  if (insetStyleSnapshot.paddingLeft === '') host.style.removeProperty('padding-left')
  else host.style.setProperty('padding-left', insetStyleSnapshot.paddingLeft, insetStyleSnapshot.paddingLeftPriority)
  if (insetStyleSnapshot.transition === '') host.style.removeProperty('transition')
  else host.style.setProperty('transition', insetStyleSnapshot.transition, insetStyleSnapshot.transitionPriority)
  insetHost = null
  insetStyleSnapshot = null
}

function captureInsetHost(host: HTMLElement): void {
  if (insetHost === host && insetStyleSnapshot !== null) return
  restoreInsetHost()
  insetHost = host
  insetStyleSnapshot = {
    paddingLeft: host.style.getPropertyValue('padding-left'),
    paddingLeftPriority: host.style.getPropertyPriority('padding-left'),
    transition: host.style.getPropertyValue('transition'),
    transitionPriority: host.style.getPropertyPriority('transition'),
  }
}

export function clearConversationInset(): void {
  restoreInsetHost()
}

export function applyConversationInset(width: number, animate = true): void {
  const host = conversationHost()
  if (host === null) return
  captureInsetHost(host)
  if (width <= 0) {
    restoreInsetHost()
    return
  }
  host.style.setProperty('transition', animate ? 'padding-left 240ms var(--ds-ease-in-out, ease)' : 'none')
  host.style.setProperty('padding-left', `${width}px`)
}
