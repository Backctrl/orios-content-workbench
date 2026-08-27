import { useEffect, useState, type ReactNode } from 'react'
import { CreatorLibraryPanel } from './CreatorLibraryPanel.js'

type SidebarTab = 'sessions' | 'content'

interface SidebarProps {
  collapsed?: boolean
  width?: number
  startSession?: (workspaceId?: string) => void
  toggleSidebar?: () => void
  renderSlot?: (name: string, owner: Record<string, unknown>) => ReactNode
}

export function CreatorSidebarRoot({ collapsed = false, width = 272, startSession, toggleSidebar, renderSlot }: SidebarProps): JSX.Element {
  const [tab, setTab] = useState<SidebarTab>('sessions')
  const wide = !collapsed

  useEffect(() => {
    if (collapsed) setTab('sessions')
  }, [collapsed])

  return <aside className={`creator-native-sidebar${collapsed ? ' is-collapsed' : ''}`} style={wide ? { width } : undefined} data-plugin="orios-creator" data-surface="sidebar">
    <div className="creator-native-brand-row">
      {wide && <button type="button" className="creator-native-brand" onClick={() => startSession?.()} aria-label="新建会话"><span className="creator-native-brand-mark">O</span><strong>OriOS</strong></button>}
      <button type="button" className="creator-native-collapse" onClick={() => toggleSidebar?.()} aria-label={collapsed ? '展开侧栏' : '收起侧栏'}>{collapsed ? '›' : '‹'}</button>
    </div>
    {!wide && <button type="button" className="creator-native-rail-action" onClick={() => startSession?.()} aria-label="新建会话">＋</button>}
    {wide && <div className="creator-native-tab-row" role="tablist" aria-label="工作区切换">
      <button type="button" role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'is-active' : ''} onClick={() => setTab('sessions')}><span>＋</span>会话</button>
      <button type="button" role="tab" aria-selected={tab === 'content'} className={tab === 'content' ? 'is-active' : ''} onClick={() => setTab('content')}><span>▤</span>内容</button>
    </div>}
    <div className="creator-native-region">
      {wide && tab === 'sessions' && <div className="creator-native-session-slot">{renderSlot?.('sidebar.workspaces', { wide, expandSidebar: () => { if (collapsed) toggleSidebar?.() } }) ?? <div className="creator-native-empty">会话列表由 DSH 提供</div>}</div>}
      {wide && tab === 'content' && <CreatorLibraryPanel />}
    </div>
    <div className="creator-native-footer">
      {renderSlot?.('sidebar.footer.action', { wide })}
      {renderSlot?.('sidebar.settings', { wide })}
    </div>
  </aside>
}
