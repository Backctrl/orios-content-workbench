import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileCreatorRepository, createWorkspaceStore, registerCreatorTools, registerCreatorWorkflowSkill } from '../lib/index.mjs'

const root = await mkdtemp(join(tmpdir(), 'orios-creator-tools-'))
const projectDirectory = join(root, '2026-08', '2026-08-25_ai-workflow')

const registered = new Map()
const toolsCtx = {
  tools: {
    register: (tool) => {
      registered.set(tool.name, tool)
      return () => { registered.delete(tool.name) }
    },
  },
}
let registeredSkill
const skillsCtx = {
  skills: {
    register: (skill) => {
      registeredSkill = skill
      return () => { registeredSkill = undefined }
    },
  },
}
const exec = () => ({ signal: new AbortController().signal })

function run(name, args) {
  const tool = registered.get(name)
  assert.ok(tool !== undefined, `tool ${name} registered`)
  return tool.execute(args, exec())
}

try {
  await mkdir(join(projectDirectory, 'sources'), { recursive: true })
  await mkdir(join(projectDirectory, 'wechat'), { recursive: true })
  await mkdir(join(projectDirectory, 'xhs', 'cards'), { recursive: true })
  await mkdir(join(projectDirectory, 'video'), { recursive: true })
  await writeFile(join(projectDirectory, 'project.yaml'), [
    'schemaVersion: 1',
    'id: topic-tools-fixture',
    'title: 工具测试主题',
    'slug: ai-workflow',
    'plannedAt: 2026-08-25',
    '',
  ].join('\n'))
  await writeFile(join(projectDirectory, 'brief.md'), '# 工具测试\n\n目标读者：创作者\n')
  await writeFile(join(projectDirectory, 'claims.yaml'), 'claims:\n  - id: claim-1\n    source: sources/one.md\n')
  await writeFile(join(projectDirectory, 'sources', 'one.md'), '一手来源\n')
  await writeFile(join(projectDirectory, 'wechat', 'article.md'), '# 公众号长文\n\n长文内容。\n')
  await writeFile(join(projectDirectory, 'xhs', 'post.md'), '小红书文案\n')
  await writeFile(join(projectDirectory, 'video', 'script.md'), '00:00 开场\n')

  const repository = new FileCreatorRepository(root)
  const workspace = createWorkspaceStore('file', root)
  const stop = registerCreatorTools(toolsCtx, repository, workspace)
  const stopSkill = registerCreatorWorkflowSkill(skillsCtx)
  assert.equal(registeredSkill?.name, 'orios-content-workflow')
  assert.equal(registeredSkill?.invocation.modelInvocable, true)
  assert.match(registeredSkill.content, /creator_run_stage/)

  const expectedTools = [
    'creator_workflow_guide', 'creator_setup', 'creator_settings', 'creator_list', 'creator_get',
    'creator_create', 'creator_update_artifact', 'creator_approve', 'creator_run_stage',
    'creator_candidates', 'creator_candidate_add', 'creator_candidate_select', 'creator_candidate_convert',
    'creator_profile', 'creator_generate_image', 'creator_review_score', 'creator_similarity_check',
  ]
  assert.deepEqual([...registered.keys()].sort(), [...expectedTools].sort())

  const guide = await run('creator_workflow_guide', {})
  assert.match(guide.guide, /四级人工审批闸门/)
  assert.equal(guide.status.repositoryMode, 'file')
  assert.equal(guide.status.contentRootConfigured, true)
  assert.equal(guide.status.profileConfigured, false)
  assert.ok(Array.isArray(guide.status.providers))

  const setup = await run('creator_setup', {})
  assert.equal(setup.status.repositoryMode, 'file')
  assert.match(setup.note, /creator_profile/)

  const listed = await run('creator_list', {})
  assert.equal(listed.items.length, 1)
  assert.equal(listed.items[0].id, 'topic-tools-fixture')

  const detail = await run('creator_get', { id: 'topic-tools-fixture' })
  assert.match(detail.folderPath, /2026-08-25_ai-workflow/)
  assert.equal(detail.content.brief.text.includes('工具测试'), true)
  assert.equal(detail.gates.length, 4)

  const settingsRead = await run('creator_settings', {})
  assert.equal(settingsRead.updated, false)
  assert.ok(Array.isArray(settingsRead.statuses))
  const settingsUpdate = await run('creator_settings', { provider: 'image', endpoint: 'https://example.test/v1', model: 'test-image' })
  assert.equal(settingsUpdate.updated, true)
  assert.equal(settingsUpdate.settings.providers.image.endpoint, 'https://example.test/v1')

  const created = await run('creator_create', { title: '新建工具主题', plannedAt: '2026-08-28' })
  assert.equal(created.id, '2026-08-新建工具主题')
  assert.match(created.folderPath, /2026-08-28_新建工具主题/)
  assert.equal((await run('creator_list', {})).items.length, 2)

  const updated = await run('creator_update_artifact', { id: 'topic-tools-fixture', article: '# 公众号长文（工具更新）\n' })
  assert.equal(updated.title, '工具测试主题')
  assert.match(await readFile(join(projectDirectory, 'wechat', 'article.md'), 'utf8'), /工具更新/)

  const approved = await run('creator_approve', { id: 'topic-tools-fixture', gate: 'brief_sources' })
  assert.equal(approved.gates.find((item) => item.gate === 'brief_sources').approved, true)
  await run('creator_approve', { id: 'topic-tools-fixture', gate: 'approved_article' })

  const staged = await run('creator_run_stage', { id: 'topic-tools-fixture', stage: 'video' })
  assert.equal(staged.stage, 'video')
  assert.ok(JSON.parse(await readFile(join(projectDirectory, 'video', 'scenes.json'), 'utf8')).sceneCount >= 1)
  assert.ok(await readFile(join(projectDirectory, 'video', 'captions.json'), 'utf8'))

  // 读取时哈希失效：直接改文章文件（绕过工具/UI），闸门自动回到未批准
  await writeFile(join(projectDirectory, 'wechat', 'article.md'), '# 公众号长文（外部直改）\n')
  const afterDirectEdit = await repository.getProject('topic-tools-fixture')
  assert.equal(afterDirectEdit?.approvals.find((item) => item.gate === 'approved_article')?.approved, false)

  // —— 账号画像（首次部署引导） ——
  const profileRead = await run('creator_profile', {})
  assert.equal(profileRead.configured, false)
  const profileSaved = await run('creator_profile', { positioning: 'AI 工作流科普，面向独立创作者', targetAudience: '独立创作者', tone: '务实、口语化' })
  assert.equal(profileSaved.configured, true)
  assert.equal(profileSaved.profile.positioning.includes('独立创作者'), true)
  const guideAfter = await run('creator_workflow_guide', {})
  assert.equal(guideAfter.status.profileConfigured, true)

  // —— 候选选题池（选题库） ——
  const candidatesEmpty = await run('creator_candidates', {})
  assert.equal(candidatesEmpty.items.length, 0)
  const added = await run('creator_candidate_add', { title: 'AI 工作流如何持续产出', claim: '一次研究可拆成长文/图卡/视频三份产物', sourceKind: 'lark-base', sourceRef: 'rec_abc123' })
  assert.equal(added.item.status, 'pending')
  const added2 = await run('creator_candidate_add', { title: '独立创作者的内容系统', claim: '内容系统依赖可核验来源', sourceKind: 'orbitos', sourceRef: '40_知识库/内容创作' })
  const candidates = await run('creator_candidates', {})
  assert.equal(candidates.items.length, 2)
  await run('creator_candidate_select', { ids: [added.item.id] })
  const selected = await run('creator_candidates', { status: 'selected' })
  assert.equal(selected.items.length, 1)
  assert.equal(selected.items[0].id, added.item.id)
  const converted = await run('creator_candidate_convert', { id: added.item.id })
  assert.match(converted.topic.id, /^\d{4}-\d{2}-/)
  assert.equal(converted.candidate.status, 'converted')
  assert.equal(converted.candidate.convertedTopic, converted.topic.id)
  assert.match(converted.note, /claims\.yaml/)
  await assert.rejects(() => run('creator_candidate_convert', { id: added.item.id }), /已转正/)
  const pendingLeft = await run('creator_candidates', { status: 'pending' })
  assert.equal(pendingLeft.items.length, 1)
  assert.equal(pendingLeft.items[0].id, added2.item.id)

  // —— 图像生成：未配置时报错，不伪造 ——
  await assert.rejects(() => run('creator_generate_image', { id: 'topic-tools-fixture', prompt: '一张配图' }), /未配置/)

  // —— 图像生成 happy path：本地模拟 Provider ——
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  let imageRequests = 0
  const imageServer = createServer((request, response) => {
    imageRequests += 1
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      const parsed = JSON.parse(body)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ b64_json: tinyPng, model: parsed.model }] }))
    })
  })
  await new Promise((resolve) => imageServer.listen(0, '127.0.0.1', resolve))
  const imagePort = imageServer.address().port
  process.env.CREATOR_TEST_IMG_KEY = 'test-key'
  try {
    await run('creator_settings', { provider: 'image', endpoint: `http://127.0.0.1:${imagePort}`, model: 'test-image', credentialEnvs: ['CREATOR_TEST_IMG_KEY'] })
    const generated = await run('creator_generate_image', { id: 'topic-tools-fixture', prompt: '一张测试配图', target: 'cards' })
    assert.equal(generated.count, 1)
    assert.equal(generated.saved.length, 1)
    assert.ok(generated.saved[0].endsWith('ai-workflow.png'))
    assert.ok(await readFile(join(projectDirectory, 'xhs', 'cards', 'ai-workflow.png'), 'utf8'))
    assert.ok(imageRequests >= 1)
  } finally {
    delete process.env.CREATOR_TEST_IMG_KEY
    await new Promise((resolve) => imageServer.close(resolve))
  }

  // —— 库 revision：写操作后指纹变化 ——
  const rev1 = await repository.getRevision()
  await repository.createProject({ title: 'Revision 主题', slug: 'revision-topic', plannedAt: '2026-08-29' })
  const rev2 = await repository.getRevision()
  assert.notEqual(rev1, rev2)

  // —— wewrite CLI 工具：缺失时明确报错；本机已装则 happy path ——
  const cliFromEnv = process.env.ORIOS_WEWRITE_CLI
  delete process.env.ORIOS_WEWRITE_CLI
  await assert.rejects(() => run('creator_review_score', { id: 'topic-tools-fixture' }), /未找到 wewrite CLI/)
  const wewriteCli = 'F:/Ori-OS/内容创作/_工作台/wewrite-cli/.venv/Scripts/wewrite.exe'
  if (existsSync(wewriteCli)) {
    process.env.ORIOS_WEWRITE_CLI = wewriteCli
    try {
      await writeFile(join(projectDirectory, 'wechat', 'article.md'), [
        '# 测试长文',
        '',
        '持续更新的瓶颈从来不是灵感，而是流程。真正可持续的内容生产，是把一次研究拆成可复用的事实、观点和表达。',
        '我们先把素材整理成可核验的主张清单，再让长文、图卡和视频从同一份主张派生。',
        '每一层都有明确的输入和验收标准，上游变化时下游知道要重新生成什么。',
        '最后按任务难度分配模型成本，让整套流程长期运转。',
        '',
      ].join('\n'))
      const score = await run('creator_review_score', { id: 'topic-tools-fixture' })
      assert.equal(typeof score.quality_score, 'number')
      assert.match(score.source, /wewrite score/)
      const similarity = await run('creator_similarity_check', { id: 'topic-tools-fixture', target: 'xhs' })
      assert.equal(similarity.pairs.length, 1)
    } finally {
      if (cliFromEnv === undefined) delete process.env.ORIOS_WEWRITE_CLI
      else process.env.ORIOS_WEWRITE_CLI = cliFromEnv
    }
  }

  stop()
  stopSkill()
  assert.equal(registered.has('creator_list'), false)
  assert.equal(registeredSkill, undefined)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('creator tools smoke: ok')
