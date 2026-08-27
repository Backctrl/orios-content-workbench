import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileCreatorRepository } from '../lib/index.mjs'
import { buildHandoffPrompt } from '../lib/index.mjs'

const root = await mkdtemp(join(tmpdir(), 'orios-creator-'))
const projectDirectory = join(root, '2026-08', '2026-08-25_ai-workflow')

try {
  await mkdir(join(projectDirectory, 'sources'), { recursive: true })
  await mkdir(join(projectDirectory, 'wechat'), { recursive: true })
  await mkdir(join(projectDirectory, 'xhs', 'cards'), { recursive: true })
  await mkdir(join(projectDirectory, 'video'), { recursive: true })
  await mkdir(join(projectDirectory, 'publish'), { recursive: true })
  await writeFile(join(projectDirectory, 'project.yaml'), [
    'schemaVersion: 1',
    'id: topic-file-fixture',
    'title: 文件真源测试主题',
    'slug: ai-workflow',
    'plannedAt: 2026-08-25',
    'stage: brief',
    'targets:',
    '  - wechat_article',
    '  - xhs_graphic',
    '  - douyin_video',
    '  - wechat_channels_video',
    '',
  ].join('\n'))
  await writeFile(join(projectDirectory, 'brief.md'), '# 文件真源\n\n这是一个可重启读取的 Brief。\n')
  await writeFile(join(projectDirectory, 'claims.yaml'), 'claims:\n  - id: claim-1\n    source: sources/one.md\n')
  await writeFile(join(projectDirectory, 'sources', 'one.md'), '一手来源\n')
  await writeFile(join(projectDirectory, 'wechat', 'article.md'), '# 公众号长文\n\n长文内容。\n')
  await writeFile(join(projectDirectory, 'xhs', 'post.md'), '小红书文案\n')
  await writeFile(join(projectDirectory, 'xhs', 'cards', '01.png'), 'fixture image')
  await writeFile(join(projectDirectory, 'video', 'script.md'), '00:00 开场\n')
  await writeFile(join(projectDirectory, 'video', 'scenes.json'), '{"scenes":[]}\n')
  await writeFile(join(projectDirectory, 'publish', 'package.json'), '{"platforms":[]}\n')

  const repository = new FileCreatorRepository(root)
  const capabilities = await repository.getCapabilities()
  assert.equal(capabilities.repositoryMode, 'file')
  assert.equal(capabilities.contentRootConfigured, true)
  assert.equal(capabilities.contentRoot, root)
  const settings = await repository.getSettings()
  const changedSettings = JSON.parse(JSON.stringify(settings.settings))
  changedSettings.providers.wechat.enabled = false
  await repository.saveSettings(changedSettings)
  const restartedSettings = await new FileCreatorRepository(root).getSettings()
  assert.equal(restartedSettings.storage, 'file')
  assert.equal(restartedSettings.settings.providers.wechat.enabled, false)
  assert.equal(restartedSettings.statuses.find((item) => item.id === 'wechat')?.status, 'disabled')

  const initial = await repository.listProjects()
  assert.equal(initial.length, 1)
  assert.equal(initial[0].id, 'topic-file-fixture')
  assert.equal(initial[0].artifacts.find((item) => item.path === 'xhs/cards/')?.ready, true)
  assert.equal(initial[0].progress, 0)
  const promptWithDirectory = buildHandoffPrompt(initial[0], '平台变体', '/data/content/2026-08/2026-08-25_ai-workflow')
  assert.match(promptWithDirectory, /主题目录：\/data\/content\/2026-08\/2026-08-25_ai-workflow/)
  assert.match(promptWithDirectory, /平台变体/)

  const created = await repository.createProject({ title: '新建主题', slug: 'new-topic', plannedAt: '2026-08-28' })
  assert.equal(created.id, '2026-08-new-topic')
  assert.equal(created.status, 'blocked')
  assert.match(await readFile(join(root, '2026-08', '2026-08-28_new-topic', 'brief.md'), 'utf8'), /新建主题/)
  await assert.rejects(() => repository.createProject({ title: '越界主题', slug: '../escape', plannedAt: '2026-08-28' }), /slug/)

  assert.equal(await repository.getProject('../escape'), null)
  await assert.rejects(() => repository.updateArtifact('../escape', { brief: '', article: '', xhsCopy: '', videoScript: '' }), /主题不存在/)
  await assert.rejects(() => repository.approveGate('topic-file-fixture', 'approved_article'), /先批准 Brief/)

  await repository.approveGate('topic-file-fixture', 'brief_sources')
  await repository.approveGate('topic-file-fixture', 'approved_article')
  await repository.approveGate('topic-file-fixture', 'platform_variants')
  await repository.approveGate('topic-file-fixture', 'publish_package')
  const approved = await repository.getProject('topic-file-fixture')
  assert.equal(approved?.progress, 100)
  assert.equal(approved?.approvals.every((item) => item.approved), true)

  await repository.updateArtifact('topic-file-fixture', {
    brief: approved.brief,
    article: approved.article,
    xhsCopy: `${approved.xhsCopy}\n新增一条图卡说明。`,
    videoScript: approved.videoScript,
  })
  const invalidated = await new FileCreatorRepository(root).getProject('topic-file-fixture')
  assert.equal(invalidated?.approvals.find((item) => item.gate === 'approved_article')?.approved, true)
  assert.equal(invalidated?.approvals.find((item) => item.gate === 'platform_variants')?.approved, false)
  assert.equal(invalidated?.approvals.find((item) => item.gate === 'publish_package')?.approved, false)
  assert.match(await readFile(join(projectDirectory, 'xhs', 'post.md'), 'utf8'), /新增一条图卡说明/)

  await repository.approveGate('topic-file-fixture', 'platform_variants')
  await repository.runStage('topic-file-fixture', 'video')
  const restarted = await new FileCreatorRepository(root).getProject('topic-file-fixture')
  assert.equal(restarted?.stage, 'video')
  const fixtureScenes = JSON.parse(await readFile(join(projectDirectory, 'video', 'scenes.json'), 'utf8'))
  assert.equal(fixtureScenes.sceneCount, 1)
  assert.equal(fixtureScenes.scenes[0].start, '00:00')
  assert.equal(fixtureScenes.scenes[0].text, '开场')
  assert.match(await readFile(join(projectDirectory, 'video', 'captions.json'), 'utf8'), /开场/)
  assert.match(await readFile(join(projectDirectory, 'video', 'narration', 'PENDING.md'), 'utf8'), /待执行清单/)

  await repository.runStage('topic-file-fixture', 'publish')
  const publishPackage = JSON.parse(await readFile(join(projectDirectory, 'publish', 'package.json'), 'utf8'))
  assert.equal(publishPackage.requiresHumanConfirmation, true)
  assert.equal(publishPackage.platforms.length, 4)
  assert.equal(publishPackage.platforms.every((platform) => platform.status === 'pending'), true)
  assert.equal(publishPackage.platforms.every((platform) => Array.isArray(platform.pendingActions) && platform.pendingActions.length > 0), true)
  assert.equal(publishPackage.platforms.every((platform) => platform.provider && typeof platform.provider.status === 'string'), true)
  assert.match(await readFile(join(projectDirectory, 'publish', 'PENDING.md'), 'utf8'), /待执行清单/)
  const afterPublish = await repository.getProject('topic-file-fixture')
  assert.equal(afterPublish?.approvals.find((item) => item.gate === 'publish_package')?.approved, false)

  const freshId = '2026-08-new-topic'
  const freshDir = join(root, '2026-08', '2026-08-28_new-topic')
  await assert.rejects(() => repository.runStage(freshId, 'article'), /Brief/)
  await assert.rejects(() => repository.runStage(freshId, 'variants'), /小红书文案/)
  await assert.rejects(() => repository.runStage(freshId, 'video'), /视频脚本/)
  await assert.rejects(() => repository.runStage(freshId, 'publish'), /平台变体/)

  await repository.updateArtifact(freshId, {
    brief: '# 新建主题\n\n目标读者：独立创作者\n',
    article: '',
    xhsCopy: '一份研究如何变成一周内容\n',
    videoScript: '00:00 开场：为什么持续更新会变成体力活\n00:08 先把主题拆成事实与观点\n00:22 长文作为表达锚点\n',
  })
  await repository.runStage(freshId, 'variants')
  assert.match(await readFile(join(freshDir, 'xhs', 'cards', 'PENDING.md'), 'utf8'), /待执行清单/)
  const afterVariants = await repository.getProject(freshId)
  assert.equal(afterVariants?.artifacts.find((item) => item.path === 'xhs/cards/')?.ready, false)

  await repository.runStage(freshId, 'video')
  const scenes = JSON.parse(await readFile(join(freshDir, 'video', 'scenes.json'), 'utf8'))
  assert.equal(scenes.sceneCount, 3)
  assert.equal(scenes.scenes[0].start, '00:00')
  assert.equal(scenes.scenes[2].text, '长文作为表达锚点')
  assert.ok(scenes.scenes[1].durationSec >= 1)
  const captions = JSON.parse(await readFile(join(freshDir, 'video', 'captions.json'), 'utf8'))
  assert.equal(captions.captionCount, 3)

  const fallbackProject = await repository.getProject(freshId)
  await repository.updateArtifact(freshId, { brief: fallbackProject.brief, article: fallbackProject.article, xhsCopy: fallbackProject.xhsCopy, videoScript: '没有时间戳的脚本正文，只描述主题。\n' })
  await repository.runStage(freshId, 'video')
  const fallbackScenes = JSON.parse(await readFile(join(freshDir, 'video', 'scenes.json'), 'utf8'))
  assert.equal(fallbackScenes.sceneCount, 1)
  assert.equal(fallbackScenes.scenes[0].start, '00:00')
  assert.equal(fallbackScenes.scenes[0].text, '没有时间戳的脚本正文，只描述主题。')

  // 读取时哈希失效联动：直接改文件（绕过 updateArtifact）后，受影响闸门自动回到未批准
  await writeFile(join(projectDirectory, 'wechat', 'article.md'), '# 公众号长文（外部直改）\n')
  const directEdit = await new FileCreatorRepository(root).getProject('topic-file-fixture')
  assert.equal(directEdit?.approvals.find((item) => item.gate === 'approved_article')?.approved, false)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('file repository smoke: ok')
