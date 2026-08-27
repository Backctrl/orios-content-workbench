import { useEffect, useMemo, useState } from 'react'
import { PROVIDER_DEFINITIONS } from '../settings.js'
import { createBrowserRepository } from './remoteRepository.js'
import { getProfile, saveProfile, type ProfileView } from './workspaceClient.js'
import type { CreatorSettings, CreatorSettingsSnapshot, ProviderId, ProviderSettings } from '../types.js'

interface CredentialView {
  configured: boolean
  writable: boolean
  source?: string
}

interface CredentialsClient {
  describe: (request: { refs: string[] }) => Promise<{ result: { ok: boolean; value?: { credentials: Record<string, CredentialView> } } }>
  set: (request: { ref: string; value: string }) => Promise<{ result: { ok: boolean } }>
}

interface CreatorSettingsCardProps {
  credentials?: CredentialsClient
}

function statusLabel(status: CreatorSettingsSnapshot['statuses'][number]['status']): string {
  if (status === 'configured') return '已配置'
  if (status === 'disabled') return '已停用'
  if (status === 'invalid') return '配置无效'
  return '待配置'
}

function cloneSettings(settings: CreatorSettings): CreatorSettings {
  return JSON.parse(JSON.stringify(settings)) as CreatorSettings
}

export function CreatorSettingsCard({ credentials }: CreatorSettingsCardProps = {}): JSX.Element {
  const repository = useMemo(() => createBrowserRepository(), [])
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<CreatorSettingsSnapshot | null>(null)
  const [draft, setDraft] = useState<CreatorSettings | null>(null)
  const [credentialViews, setCredentialViews] = useState<Record<string, CredentialView>>({})
  const [credentialDrafts, setCredentialDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<ProfileView | null>(null)
  const [profileDraft, setProfileDraft] = useState<ProfileView>({})
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const credentialRefs = useMemo(() => draft ? [...new Set(Object.values(draft.providers).flatMap((provider) => provider.credentialEnvs))] : [], [draft])

  const loadProfile = async (): Promise<void> => {
    setProfileBusy(true)
    try {
      const result = await getProfile()
      setProfile(result.profile)
      setProfileDraft(result.profile)
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setProfileBusy(false)
    }
  }

  const saveProfileDraft = async (): Promise<void> => {
    setProfileBusy(true)
    setProfileMessage('')
    try {
      const result = await saveProfile(profileDraft)
      setProfile(result.profile)
      setProfileDraft(result.profile)
      setProfileMessage('画像已保存；Agent 会据此生成选题筛选标准。')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setProfileBusy(false)
    }
  }

  const patchProfile = (patch: Partial<ProfileView>): void => {
    setProfileDraft((current) => ({ ...current, ...patch }))
  }

  const load = async (check = false): Promise<void> => {
    setBusy(true)
    try {
      const next = check ? await repository.checkSettings() : await repository.getSettings()
      setSnapshot(next)
      setDraft(cloneSettings(next.settings))
      setMessage(check ? '已重新检测，未调用外部平台接口。' : '')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { void loadProfile() }, [])

  useEffect(() => {
    if (!open || !credentials || credentialRefs.length === 0) return
    let cancelled = false
    void credentials.describe({ refs: credentialRefs }).then((response) => {
      if (cancelled) return
      if (!response.result.ok || response.result.value === undefined) {
        setMessage('无法读取 DSH 凭据状态，请稍后重试。')
        return
      }
      setCredentialViews(response.result.value.credentials)
    }).catch(() => {
      if (!cancelled) setMessage('无法读取 DSH 凭据状态，请稍后重试。')
    })
    return () => { cancelled = true }
  }, [open, credentials, credentialRefs])

  const updateProvider = (id: ProviderId, patch: Partial<ProviderSettings>): void => {
    setDraft((current) => current ? { ...current, providers: { ...current.providers, [id]: { ...current.providers[id], ...patch } } } : current)
  }

  const save = async (): Promise<void> => {
    if (!draft) return
    const pendingCredentials = Object.entries(credentialDrafts).filter(([, value]) => value.trim() !== '')
    if (pendingCredentials.length > 0 && !credentials) {
      setMessage('当前宿主没有提供 DSH 凭据服务，密钥不会写入工作台设置文件。')
      return
    }
    setBusy(true)
    try {
      const next = await repository.saveSettings(draft)
      for (const [ref, value] of pendingCredentials) {
        const response = await credentials!.set({ ref, value: value.trim() })
        if (!response.result.ok) throw new Error(`凭据 ${ref} 保存失败`)
      }
      if (credentials && pendingCredentials.length > 0) {
        const described = await credentials.describe({ refs: credentialRefs })
        if (described.result.ok && described.result.value !== undefined) setCredentialViews(described.result.value.credentials)
      }
      setSnapshot(next)
      setDraft(cloneSettings(next.settings))
      setCredentialDrafts({})
      setMessage('设置已保存。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const configuredCount = snapshot?.statuses.filter((item) => item.status === 'configured').length ?? 0
  return <li className={`orios-creator-settings-card${open ? ' is-open' : ''}`} data-plugin="orios-creator" data-surface="settings-card">
    <button type="button" className="orios-creator-settings-header" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span><strong>内容工作台</strong><small>内容目录、Provider 与平台接口</small></span>
      <span className="orios-creator-settings-count">{configuredCount}/{snapshot?.statuses.length ?? 7}</span>
      <span className="orios-creator-settings-chevron">{open ? '⌃' : '⌄'}</span>
    </button>
    {open && <div className="orios-creator-settings-body">
      {snapshot && <div className="orios-creator-settings-summary"><span>存储：{snapshot.storage === 'file' ? '工作台文件' : '当前会话'}</span><span>contentRoot：{snapshot.contentRootConfigured ? '已配置' : '未配置'}</span><button type="button" onClick={() => void load(true)} disabled={busy}>重新检测</button></div>}
      <p className="orios-creator-settings-note">接口配置与密钥入口集中在这里。密钥输入只通过 DSH 凭据服务写入，页面和工作台设置文件都不会回显或保存密钥值。</p>
      <details className="orios-creator-settings-provider" data-surface="profile">
        <summary><span><strong>账号画像</strong><small>定位 / 目标读者 / 语气 / 选题方向 · 首次部署引导，用于生成简易选题筛选标准</small></span><em className={`is-${profile && Object.keys(profile).length > 0 ? 'configured' : 'missing'}`}>{profile && Object.keys(profile).length > 0 ? '已配置' : '未配置'}</em></summary>
        <div className="orios-creator-settings-fields">
          <label>账号定位（做什么内容、给谁看）<input value={profileDraft.positioning ?? ''} placeholder="例如：AI 工作流科普，面向独立创作者" onChange={(event) => patchProfile({ positioning: event.target.value })} /></label>
          <label>目标读者<input value={profileDraft.targetAudience ?? ''} placeholder="例如：希望稳定更新的独立创作者" onChange={(event) => patchProfile({ targetAudience: event.target.value })} /></label>
          <label>语气/风格<input value={profileDraft.tone ?? ''} placeholder="例如：务实、口语化、少术语" onChange={(event) => patchProfile({ tone: event.target.value })} /></label>
          <label>常用选题方向<input value={(profileDraft.directions ?? []).join('、')} placeholder="逗号分隔，例如：AI 工具、创作方法论" onChange={(event) => patchProfile({ directions: event.target.value.split(/[、,]/).map((item) => item.trim()).filter(Boolean) })} /></label>
          <label>选题筛选标准（可选，Agent 据定位生成）<textarea rows={3} value={profileDraft.selectionCriteria ?? ''} placeholder="留空时 Agent 会依据上方字段生成简易模板" onChange={(event) => patchProfile({ selectionCriteria: event.target.value })} style={{ width: '100%', boxSizing: 'border-box' }} /></label>
        </div>
        <div className="orios-creator-settings-actions"><span role="status">{profileMessage}</span><button type="button" disabled={profileBusy} onClick={() => void saveProfileDraft()}>{profileBusy ? '保存中…' : '保存画像'}</button></div>
      </details>
      {draft && PROVIDER_DEFINITIONS.map((definition) => {
        const config = draft.providers[definition.id]
        const status = snapshot?.statuses.find((item) => item.id === definition.id)
        return <details className="orios-creator-settings-provider" key={definition.id}>
          <summary><span><strong>{definition.label}</strong><small>{definition.group === 'platform' ? '平台接口' : '内容 Provider'} · {definition.description}</small></span><em className={`is-${status?.status ?? 'missing'}`}>{statusLabel(status?.status ?? 'missing')}</em></summary>
          <div className="orios-creator-settings-fields">
            <label>启用<select value={config.enabled ? 'enabled' : 'disabled'} onChange={(event) => updateProvider(definition.id, { enabled: event.target.value === 'enabled' })}><option value="enabled">启用</option><option value="disabled">停用</option></select></label>
            <label>Endpoint<input value={config.endpoint} onChange={(event) => updateProvider(definition.id, { endpoint: event.target.value })} placeholder="可留空" /></label>
            <label>模型/版本<input value={config.model} onChange={(event) => updateProvider(definition.id, { model: event.target.value })} placeholder="可留空" /></label>
            {(definition.defaultCredentialEnvs.length > 0 || config.credentialEnvs.length > 0) && <label>{definition.credentialHint}<input value={config.credentialEnvs.join(', ')} onChange={(event) => updateProvider(definition.id, { credentialEnvs: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="例如 OPENAI_API_KEY" /></label>}
            {(definition.requiresCommand || config.command) && <label>本地命令<input value={config.command} onChange={(event) => updateProvider(definition.id, { command: event.target.value })} placeholder="例如 npx remotion" /></label>}
            {definition.group === 'platform' && <label>会话/Profile 路径<input value={config.profilePath} onChange={(event) => updateProvider(definition.id, { profilePath: event.target.value })} placeholder="可选，本地路径" /></label>}
          </div>
          {config.credentialEnvs.length > 0 && <div className="orios-creator-settings-fields">
            {config.credentialEnvs.map((ref) => {
              const view = credentialViews[ref]
              return <label key={ref}>DSH 凭据 · {ref}<input type="password" autoComplete="off" value={credentialDrafts[ref] ?? ''} disabled={view?.writable === false || !credentials} onChange={(event) => setCredentialDrafts((current) => ({ ...current, [ref]: event.target.value }))} placeholder={view?.configured ? '已配置；留空保持不变' : credentials ? '输入后点击保存设置' : '由宿主环境变量提供'} /></label>
            })}
          </div>}
          <p className="orios-creator-settings-detail">{status?.detail ?? '尚未检测'} · {credentials ? config.credentialEnvs.map((ref) => credentialViews[ref]?.configured ? `${ref} 已配置${credentialViews[ref]?.source ? `（${credentialViews[ref]?.source}）` : ''}` : `${ref} 未配置`).join('；') || '无需凭据' : '当前宿主未提供凭据服务，检测只检查环境变量名'} · 不会在检测时调用外部平台</p>
        </details>
      })}
      <div className="orios-creator-settings-actions"><span role="status">{message}</span><button type="button" onClick={() => void save()} disabled={busy || !draft}>保存设置</button></div>
    </div>}
  </li>
}
