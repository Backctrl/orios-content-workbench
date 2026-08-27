import type { CreatorProject } from './types.js'

export const CREATOR_WORKFLOW_PROMPT = `
你正在 OriOS 内容工作台中处理一个主题。主题目录是唯一真源；先读取主题目录中的 project.yaml、brief.md、claims.yaml、sources/ 和已有产物，再开始本阶段工作。

目录契约：
- brief.md：选题、目标读者、核心问题、边界与待验证问题。
- claims.yaml + sources/：每个事实主张及其来源；没有来源的事实不能写成确定结论。
- wechat/article.md：公众号长文，是所有平台改写的表达锚点。
- xhs/post.md + xhs/cards/：小红书图文文案与图卡提示/素材。
- video/script.md + video/scenes.json + video/captions.json：抖音和视频号共用的无真人解说视频资产。
- publish/package.json：平台发布包，只能在发布包审批通过后生成或更新。
- approvals.json：四级人工闸门：brief_sources → approved_article → platform_variants → publish_package。

阶段纪律：
1. 先报告当前目录、已存在产物、缺失产物和来源风险，再执行任务。
2. 一次只推进当前阶段；不要跳过人工审批，不要把未核验推断写成事实。
3. 公众号长文先完成，再从长文拆小红书和视频；平台版本必须能追溯回同一组主张。
4. 生成图片、配音或视频时保存可复现的提示词、场景和字幕文件；Provider 不可用时只写待执行清单，不伪造已完成文件。
5. 不调用私有 DSH Agent API，不自动点击任何平台的最终发布按钮；平台草稿写入也必须在用户明确批准后进行。
6. 完成本阶段后停在下一个审批闸门，向用户报告改动文件、来源缺口、下一步和是否需要人工确认。
`.trim()

export interface WorkflowRuntimeFacts {
  repositoryMode: 'mock' | 'file'
  contentRootConfigured: boolean
  contentRoot?: string
  settingsStorage?: string
}

export function buildWorkflowPrompt(runtime: WorkflowRuntimeFacts): string {
  const lines = [CREATOR_WORKFLOW_PROMPT, '', '工作台工具（通过对话直接调用）：']
  lines.push('- creator_workflow_guide：自引导指南与实时能力状态；creator_setup：只读检查环境。')
  lines.push('- creator_list / creator_get：列出主题、查看阶段/闸门/产物链与主题目录。')
  lines.push('- creator_create：按约定建主题文件夹；creator_update_artifact：保存内容字段（与 UI 一致）。')
  lines.push('- creator_run_stage：运行阶段生成（video 派生 scenes/captions、publish 生成发布包、variants 写图卡待执行清单）。')
  lines.push('- creator_approve：批准闸门（必须用户已审阅对应产物）；creator_settings：配置 Provider。')
  lines.push('正文内容用系统文件工具读写；工作台工具只做文件做不到的事。')
  lines.push('')
  lines.push(`当前仓库：${runtime.repositoryMode === 'file' ? '文件真源' : 'mock 原型'}；contentRoot：${runtime.contentRootConfigured ? (runtime.contentRoot || '已配置') : '未配置（需在插件配置中设置 contentRoot 或置 ORIOS_CREATOR_CONTENT_ROOT 环境变量）'}。`)
  return lines.join('\n')
}

export function buildHandoffPrompt(project: CreatorProject, stageLabel: string, directory?: string): string {
  const location = directory ? `主题目录：${directory}\n` : ''
  return `${location}请处理内容主题「${project.title}」。使用 @当前内容，先读取主题文件夹及 claims.yaml/sources/，当前阶段是「${stageLabel}」。遵守 OriOS 内容工作台的四级审批闸门：只推进当前阶段，完成后停在下一闸门，不要写入外部平台草稿或执行最终发布。`
}

