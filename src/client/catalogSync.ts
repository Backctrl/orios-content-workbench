import { bumpLibrary } from './uiState.js'

export const CREATOR_POLL_MS = 1000

export function startLibraryLiveSync(
  readRevision: () => Promise<string>,
  intervalMs = CREATOR_POLL_MS,
): () => void {
  let last = ''
  let inFlight = false
  let stopped = false

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return
    inFlight = true
    try {
      const revision = await readRevision()
      if (stopped) return
      if (last === '') {
        last = revision
        return
      }
      if (revision !== last) {
        last = revision
        bumpLibrary()
      }
    } catch {
      // 远端可能尚未挂载；下个周期重试。
    } finally {
      inFlight = false
    }
  }

  void tick()
  const timer = globalThis.setInterval(() => {
    void tick()
  }, intervalMs)
  return () => {
    stopped = true
    globalThis.clearInterval(timer)
  }
}
