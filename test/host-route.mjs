import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/index.mjs'

const root = await mkdtemp(join(tmpdir(), 'orios-creator-host-'))
const project = join(root, '2026-08', '2026-08-26_host-route')
let server

try {
  await mkdir(join(project, 'wechat'), { recursive: true })
  await mkdir(join(project, 'sources'), { recursive: true })
  await writeFile(join(project, 'project.yaml'), 'id: host-route\ntitle: Host 路由\nplannedAt: 2026-08-26\n')
  await writeFile(join(project, 'brief.md'), '# Host 路由\n')
  await writeFile(join(project, 'claims.yaml'), 'claims: []\n')
  await writeFile(join(project, 'sources', 'one.md'), 'source\n')
  await writeFile(join(project, 'wechat', 'article.md'), '# Article\n')

  const routes = []
  const ctx = {
    webServer: { register: ({ handler }) => { routes.push(handler); return () => undefined } },
    systemPrompt: { section: () => () => undefined },
    effect: () => undefined,
  }
  apply(ctx, { mode: 'file', contentRoot: root, announceToAgent: false })
  assert.equal(routes.length, 1)
  server = createServer((request, response) => void routes[0](request, response))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  const get = async (path) => (await fetch(`http://127.0.0.1:${port}${path}`)).json()
  const post = async (path, body) => (await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()

  const info = await get('/creator/api/info')
  assert.equal(info.data.repositoryMode, 'file')
  assert.equal(info.data.contentRootConfigured, true)
  const capabilities = await get('/creator/api/capabilities')
  assert.equal(capabilities.data.contentRoot, root)
  const revision = await get('/creator/api/revision')
  assert.equal(typeof revision.data.revision, 'string')
  const settings = await get('/creator/api/settings')
  assert.equal(settings.data.storage, 'file')
  settings.data.settings.providers.douyin.enabled = false
  const savedSettings = await post('/creator/api/settings', { settings: settings.data.settings })
  assert.equal(savedSettings.data.statuses.find((item) => item.id === 'douyin').status, 'disabled')
  const checkedSettings = await post('/creator/api/settings/check', {})
  assert.equal(checkedSettings.data.settings.providers.douyin.enabled, false)
  const projects = await get('/creator/api/projects')
  assert.equal(projects.data.length, 1)
  const created = await post('/creator/api/projects', { title: '新建 Host 主题', slug: 'host-created', plannedAt: '2026-08-27' })
  assert.equal(created.ok, true)
  assert.equal(created.data.id, '2026-08-host-created')
  const saved = await post('/creator/api/projects/host-route/artifacts', { brief: '# Updated\n', article: '# Article\n', xhsCopy: '', videoScript: '' })
  assert.equal(saved.ok, true)
  assert.equal((await get('/creator/api/projects/host-route')).data.brief, '# Updated\n')

  const profileGet = await get('/creator/api/profile')
  assert.equal(profileGet.data.configured, false)
  const profileSaved = await post('/creator/api/profile', { positioning: '测试定位', tone: '务实' })
  assert.equal(profileSaved.data.configured, true)
  assert.equal(profileSaved.data.profile.positioning, '测试定位')
  const candidateAdd = await post('/creator/api/candidates', { title: 'Host 候选', claim: '一句话主张', sourceKind: 'file', sourceRef: 'sources/one.md' })
  assert.equal(candidateAdd.ok, true)
  assert.equal(candidateAdd.data.item.status, 'pending')
  const candidatesGet = await get('/creator/api/candidates')
  assert.equal(candidatesGet.data.items.length, 1)
  const selectResult = await post('/creator/api/candidates/select', { ids: [candidateAdd.data.item.id] })
  assert.equal(selectResult.data.items[0].status, 'selected')
  const convertResult = await post('/creator/api/candidates/convert', { id: candidateAdd.data.item.id })
  assert.equal(convertResult.data.candidate.status, 'converted')
  assert.equal(convertResult.data.candidate.convertedTopic, convertResult.data.topic.id)

  // —— 质量把关端点：CLI 缺失时报错；本机已装则 happy path ——
  const scoreMissing = await post('/creator/api/review-score', { id: 'host-route' })
  assert.equal(scoreMissing.ok, false)
  assert.match(scoreMissing.error.message, /未找到 wewrite CLI/)
  const genMissing = await post('/creator/api/generate-image', { id: 'host-route', prompt: '一张配图' })
  assert.equal(genMissing.ok, false)
  assert.match(genMissing.error.message, /未配置/)
  const cliFromEnv = process.env.ORIOS_WEWRITE_CLI
  const wewriteCli = 'F:/Ori-OS/内容创作/_工作台/wewrite-cli/.venv/Scripts/wewrite.exe'
  if (existsSync(wewriteCli)) {
    process.env.ORIOS_WEWRITE_CLI = wewriteCli
    try {
      await mkdir(join(project, 'xhs'), { recursive: true })
      await writeFile(join(project, 'wechat', 'article.md'), ['# 长文', '', '这是用于评分测试的正文，包含足够的句子来触发语言节奏分析。', '持续更新的瓶颈不是灵感，而是流程。', '我们要把内容生产做成可复验的流水线，让一次研究拆出三份产物。', ''].join('\n'))
      await writeFile(join(project, 'xhs', 'post.md'), '把内容生产做成流水线：先建素材基线，再画依赖图。\n')
      const score = await post('/creator/api/review-score', { id: 'host-route' })
      assert.equal(score.ok, true)
      assert.equal(typeof score.data.quality_score, 'number')
      const sim = await post('/creator/api/similarity-check', { id: 'host-route', target: 'xhs' })
      assert.equal(sim.ok, true)
      assert.equal(sim.data.pairs.length, 1)
    } finally {
      if (cliFromEnv === undefined) delete process.env.ORIOS_WEWRITE_CLI
      else process.env.ORIOS_WEWRITE_CLI = cliFromEnv
    }
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  await rm(root, { recursive: true, force: true })
}

console.log('host file route smoke: ok')
