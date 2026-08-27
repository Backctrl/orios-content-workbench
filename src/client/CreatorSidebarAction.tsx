import { useSyncExternalStore } from 'react'
import { closeLibraryPanel, getLibraryPanelOpen, openLibraryPanel, subscribeLibraryPanel } from './panel.js'
import { setCurrentProjectId } from './selection.js'

export interface CreatorSidebarActionProps {
  wide: boolean
}

export function CreatorSidebarAction({ wide }: CreatorSidebarActionProps): JSX.Element {
  const open = useSyncExternalStore(subscribeLibraryPanel, getLibraryPanelOpen, getLibraryPanelOpen)
  const handleClick = (): void => {
    if (open) {
      closeLibraryPanel()
      setCurrentProjectId(null)
      return
    }
    openLibraryPanel()
  }

  return <button
    type="button"
    className={`orios-creator-sidebar-action${wide ? '' : ' is-rail'}`}
    data-plugin="orios-creator"
    data-surface="content-library-trigger"
    aria-label={open ? '关闭内容库' : '打开内容库'}
    aria-pressed={open}
    title={wide ? undefined : '内容库'}
    onClick={handleClick}
  >
    <span aria-hidden="true">▤</span>
    {wide && <span>内容库</span>}
  </button>
}
