let libraryPanelOpen = false
const listeners = new Set<() => void>()

export function getLibraryPanelOpen(): boolean {
  return libraryPanelOpen
}

export function setLibraryPanelOpen(next: boolean): void {
  if (libraryPanelOpen === next) return
  libraryPanelOpen = next
  for (const listener of listeners) listener()
}

export function openLibraryPanel(): void {
  setLibraryPanelOpen(true)
}

export function closeLibraryPanel(): void {
  setLibraryPanelOpen(false)
}

export function subscribeLibraryPanel(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
