interface SkillsContext {
  skills: {
    register: (skill: {
      name: string
      description: string
      source: 'runtime'
      content: string
      invocation: { modelInvocable: boolean; userInvocable: boolean }
    }) => () => void
  }
}

export const CREATOR_WORKFLOW_SKILL = {
  name: 'orios-content-workflow',
  description:
    '在 OriOS 内容主题文件夹中，按来源、公众号长文、平台变体和发布包四级闸门连续生产公众号、小红书、抖音与视频号内容。',
  source: 'runtime' as const,
  invocation: { modelInvocable: true, userInvocable: true },
  content: `# OriOS 内容连续生产

仅当用户明确处理 OriOS 内容主题、主题文件夹或四个平台产物时使用本 Skill。它是文件型 Agent 的工作流契约，不是平台发布授权。

## 开始前

1. 不确定工作台状态时先调用 \`creator_workflow_guide\` 或 \`creator_setup\`，不要先向用户询问工具能查出的信息。
2. 首次部署引导：先调用 \`creator_profile\` 询问并记录账号定位/目标读者/语气/常用选题方向，据此生成简易选题筛选标准（selectionCriteria），长期使用沉淀优化。
3. 用 \`creator_list\` 列出主题，用 \`creator_get\` 查看单个主题的阶段、闸门、产物链与主题目录；完整正文用系统文件工具读取。
4. 主题目录是唯一真源。先读取 \`project.yaml\`、\`brief.md\`、\`claims.yaml\`、\`sources/\` 与已有产物，报告缺失项、来源风险和当前闸门。

## 目录契约

- brief.md：顶部是**选题卡**（目标读者/核心问题/边界/待验证问题/来源），下方自由正文。选题从素材库提取（见《选题管道工作流说明》：素材 → \`_工作台/candidates.yaml\` 候选选题池 → 用户选中 → 转正建主题回填选题卡）。
- claims.yaml + sources/：每个事实主张及其来源；没有来源的事实不能写成确定结论。
- wechat/article.md：公众号长文，是所有平台改写的表达锚点。
- xhs/post.md + xhs/cards/：小红书图文文案与图卡提示/素材。
- video/script.md + video/scenes.json + video/captions.json：抖音和视频号共用的无真人解说视频资产。
- publish/package.json：平台发布包，只能在发布包审批通过后生成或更新。
- approvals.json：四级人工闸门：brief_sources → approved_article → platform_variants → publish_package。

## 阶段路由与工具

- 正文内容（brief/长文/文案/脚本/claims）用系统文件工具写入主题目录；写完后审批状态按内容哈希自动联动失效。
- 工作台工具只做文件做不到的事：
  - \`creator_create\` 按约定建主题文件夹；
  - \`creator_update_artifact\` 与 UI 一致地保存内容字段；
  - \`creator_run_stage\` 运行阶段生成（video 派生 scenes/captions、publish 生成发布包、variants 写图卡待执行清单）；
  - \`creator_approve\` 批准闸门（人工确认后调用）；
  - \`creator_settings\` 配置 Provider；\`creator_list\`/\`creator_get\`/\`creator_workflow_guide\`/\`creator_setup\` 查询；
  - \`creator_candidates\`/\`creator_candidate_add\`/\`creator_candidate_select\`/\`creator_candidate_convert\` 选题库；
  - \`creator_profile\` 账号画像（首次部署引导）；\`creator_generate_image\` 配图/图卡生成（需图像 Provider 已配置）。

## 质量与失败处理

1. 一次只推进当前阶段，完成后停在下一个人工闸门：\`brief_sources\` → \`approved_article\` → \`platform_variants\` → \`publish_package\`。
2. 公众号写作执行标准（融合 WeWrite 方法论）：选题三维评分（热度 30%/相关度 40%/切入价值 30%，命中黑名单直接淘汰）、文章任务书（读者/交付/核心判断/边界/反方）、主张清单（fact 必须有来源，user_experience 只来自用户明确提供的材料）、编辑五维质量标准（准确/观点/有用/合声/好读，平均≥4 单项≥3 无阻断红线，revise 必须改稿复审，最多两轮）、内容增强策略（观点找新角度/痛点补行动/故事只用真实材料/对比给决策条件）。详见技能 references/wewrite-standard.md。
3. 来源不足时阻断当前阶段，列出需要补充的来源，不用常识或模型记忆填空。
4. Provider 不可用时保存提示词、场景、字幕和待执行清单，不伪造 PNG、音频或 MP4 已生成。
5. 不调用私有 DSH Agent API，不自动点击任何平台的最终发布按钮；平台草稿写入必须在用户明确批准后进行。
6. 修改长文后，平台变体和发布包审批必须重新确认；重复使用已有文件前检查其更新时间是否对应当前主张。
7. 输出结束时报告：已读文件、改动文件、未解决风险、下一审批闸门和需要用户点击的动作。`,
}

export function registerCreatorWorkflowSkill(ctx: SkillsContext): () => void {
  return ctx.skills.register(CREATOR_WORKFLOW_SKILL)
}
