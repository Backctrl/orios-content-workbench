# OriOS 内容产物契约

## 主题元数据

`project.yaml` 至少包含：

```yaml
schemaVersion: 1
id: 2026-08-ai-workflow
title: 一个主题
slug: ai-workflow
plannedAt: 2026-08-25
stage: brief
targets: [wechat_article, xhs_graphic, douyin_video, wechat_channels_video]
```

`approvals.json` 只记录四个闸门的 `approved`、`approvedAt` 和 `artifactHash`。任何上游产物变化都要使受影响的下游闸门回到未批准。

## 平台验收

| 平台 | 必备产物 | 检查重点 |
| --- | --- | --- |
| 公众号 | `wechat/article.md` | 标题、导语、正文结构、引用和封面占位可独立预览 |
| 小红书 | `xhs/post.md`、`xhs/cards/` | 首图能独立理解主题，卡片文字可读，文案不虚构长文没有的事实 |
| 抖音 | `video/script.md`、`video/scenes.json`、`video/captions.json`、`video/final.mp4` | 60–90 秒单一记忆点、逐句字幕、首 3 秒交代问题 |
| 视频号 | 与抖音共用视频资产 | 画幅、字幕、封面和标题适合视频号，不自动假设已上传 |

`publish/package.json` 必须包含 `requiresHumanConfirmation: true`，以及每个平台的素材相对路径、Provider 状态和待执行动作。没有平台凭据或可用 Provider 时，状态写 `pending`，不要写成 `published`。

