import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createMockRepository, name, SUPPORTED_DSH_VERSION } from '../lib/index.mjs'

assert.equal(name, 'orios-creator')
assert.equal(SUPPORTED_DSH_VERSION, '0.1.1-rc.2')
const cordisPatch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
assert.doesNotMatch(cordisPatch, /- id: ui-sidebar\s+disabled:\s*true/)
assert.match(cordisPatch, /name:\s*'@orios\/dsh-creator'/)
const clientSource = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
assert.match(clientSource, /name:\s*'sidebar\.footer\.action'/)
assert.match(clientSource, /name:\s*'shell\.overlay'/)
assert.doesNotMatch(clientSource, /id:\s*'orios-creator-sidebar'/)

const repository = createMockRepository()
const projects = await repository.listProjects()
assert.equal(projects.length, 3)
assert.equal(projects[0].title, '独立创作者的内容系统')

const edited = await repository.updateArtifact('topic-ai-workflow', {
  brief: projects.find((project) => project.id === 'topic-ai-workflow').brief,
  article: '# 修改后的文章',
  xhsCopy: '新的图文摘要',
  videoScript: '新的视频脚本',
})
assert.equal(edited.approvals.find((item) => item.gate === 'approved_article').approved, false)
assert.equal((await repository.approveGate('topic-ai-workflow', 'approved_article')).approvals.find((item) => item.gate === 'approved_article').approved, true)
assert.equal((await repository.runStage('topic-ai-workflow', 'video')).status, 'ready')

console.log('DSH 内容工作台冒烟测试通过')
