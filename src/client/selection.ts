let currentProjectId: string | null = null
const listeners = new Set<() => void>()

export function getCurrentProjectId(): string | null {
  return currentProjectId
}

export function setCurrentProjectId(id: string | null): void {
  if (currentProjectId === id) return
  currentProjectId = id
  for (const listener of listeners) listener()
}

export function subscribeCurrentProject(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
