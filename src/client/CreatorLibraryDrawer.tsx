import { useSyncExternalStore, type CSSProperties } from 'react'
import { CreatorLibraryPanel } from './CreatorLibraryPanel.js'
import { useSidebarWidth } from './layoutGeometry.js'
import { closeLibraryPanel, getLibraryPanelOpen, subscribeLibraryPanel } from './panel.js'
import { setCurrentProjectId } from './selection.js'

export function CreatorLibraryDrawer(): JSX.Element | null {
  const open = useSyncExternalStore(subscribeLibraryPanel, getLibraryPanelOpen, getLibraryPanelOpen)
  const sidebarWidth = useSidebarWidth(open)
  if (!open) return null

  const close = (): void => {
    closeLibraryPanel()
    setCurrentProjectId(null)
  }

  return <div className="creator-library-drawer-slot" style={{ '--creator-sidebar-width': `${sidebarWidth}px` } as CSSProperties} data-plugin="orios-creator" data-surface="content-library-drawer">
    <aside className="creator-library-drawer" role="dialog" aria-label="内容库">
      <header className="creator-library-drawer-header">
        <div>
          <strong>内容库</strong>
          <span>选择主题后在左侧打开内容检查器，对话保持可见</span>
        </div>
        <button type="button" className="creator-library-drawer-close" onClick={close} aria-label="关闭内容库">×</button>
      </header>
      <div className="creator-library-drawer-body"><CreatorLibraryPanel /></div>
    </aside>
  </div>
}
