import assert from 'node:assert/strict'
import { defaultSettings, detectProviderStatuses, normalizeSettings } from '../lib/index.mjs'

const defaults = defaultSettings()
const missing = detectProviderStatuses(defaults, {})
assert.equal(missing.find((status) => status.id === 'image')?.status, 'missing')
assert.equal(missing.find((status) => status.id === 'remotion')?.status, 'configured')

const configured = detectProviderStatuses(defaults, { OPENAI_API_KEY: 'available' })
assert.equal(configured.find((status) => status.id === 'image')?.status, 'configured')
assert.equal(configured.find((status) => status.id === 'speech')?.status, 'configured')

const invalid = normalizeSettings({ providers: { image: { endpoint: 'not-a-url', credentialEnvs: [] } } })
assert.equal(detectProviderStatuses(invalid, {}).find((status) => status.id === 'image')?.status, 'invalid')

const disabled = normalizeSettings({ providers: { wechat: { enabled: false } } })
assert.equal(detectProviderStatuses(disabled, {}).find((status) => status.id === 'wechat')?.status, 'disabled')
assert.equal(JSON.stringify(normalizeSettings({ providers: { image: { secret: 'ignored' } } })).includes('ignored'), false)

console.log('settings status smoke: ok')

