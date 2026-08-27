---
name: orios-content-workflow
description: 在 OriOS 内容主题文件夹中，按来源、公众号长文、平台变体和发布包四级闸门连续生产公众号、小红书、抖音与视频号内容。
---

# OriOS 内容连续生产

仅当用户明确处理 OriOS 内容主题、主题文件夹或四个平台产物时使用本 Skill。它是文件型 Agent 的工作流契约，不是平台发布授权。

## 入口与停点

1. 读取 `project.yaml`、`brief.md`、`claims.yaml`、`sources/`、`approvals.json` 和已有产物，先报告缺失项、来源风险和当前闸门。
2. 每次只推进一个阶段，完成后停在下一个人工闸门：`brief_sources` → `approved_article` → `platform_variants` → `publish_package`。
3. 用户没有明确批准时，不写入微信、小红书、抖音或视频号草稿，也不点击最终发布；不要调用私有 DSH Agent API。

## 阶段路由

- `brief_sources`：`brief.md` 顶部是**选题卡**（目标读者/核心问题/边界/待验证问题/来源）。若用户还没有选题，先按《选题管道工作流说明》从素材库提取候选选题（写入 `_工作台/candidates.yaml`），用户选中后转正为本主题并回填选题卡；每个外部事实写入 `claims.yaml` 并关联 `sources/` 中的来源。
- `approved_article`：以已核验主张为依据完成 `wechat/article.md`；不要把平台标题或未经核验的扩展观点混进事实段落。
- `platform_variants`：从已批准长文改写 `xhs/post.md` 和 `video/script.md`，同时生成可复现的图卡/视频场景提示；平台变化只能改变表达，不改变主张。
- `publish_package`：检查 `xhs/cards/`、`video/scenes.json`、`video/captions.json` 和 `video/final.mp4`，生成 `publish/package.json`；发布包只描述可执行动作和素材，不代表已经发布。

## 质量与失败处理

- 来源不足时阻断当前阶段，列出需要补充的来源，不用常识或模型记忆填空。
- Provider 不可用时保存提示词、场景、字幕和待执行清单，不伪造 PNG、音频或 MP4 已生成。
- 复用已有文件前检查其 `updatedAt`/内容是否对应当前主张；修改长文后，平台变体和发布包审批必须重新确认。
- 输出结束时报告：已读文件、改动文件、未解决风险、下一审批闸门和需要用户点击的动作。

详细文件字段和平台验收要求见 [references/output-contract.md](references/output-contract.md)；选题阶段流程（素材库 → 选题库 → 主题）见 [references/topic-pipeline.md](references/topic-pipeline.md)；公众号写作执行标准（选题三维评分 / 文章任务书 / 主张清单来源规则 / 编辑五维质量 / 内容增强策略）见 [references/wewrite-standard.md](references/wewrite-standard.md)。

