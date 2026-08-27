# 示例素材（samples）

本目录是内容创作工作台的**测试素材**：把 `samples/内容创作` 作为插件的 `contentRoot` 即可直接体验完整流程（选题候选池 + 一个已完成到发布包的示例主题）。

## 内容

```
samples/内容创作/
├── _工作台/
│   └── candidates.yaml          # 候选选题池（选题在前、主题在后）
└── 2026-08/
    └── 2026-08-23_示例-ai-工作流如何持续产出/   # 示例主题（四级闸门已走完）
        ├── project.yaml         # 主题元数据
        ├── brief.md             # 选题卡
        ├── claims.yaml          # 主张清单（22 条，均带来源引用）
        ├── sources/             # 来源（演示占位）
        ├── wechat/article.md    # 公众号长文（表达锚点）
        ├── xhs/post.md          # 小红书文案
        ├── xhs/cards/           # 图卡（含 1 张已生成 PNG 与 PENDING 清单）
        ├── video/script.md      # 视频脚本
        └── publish/preview.html # 微信排版预览（wewrite gallery）
```

## 使用

1. 克隆本仓库后，把 `contentRoot` 指向 `samples/内容创作`（或复制到任意位置）：
   ```yaml
   # cordis.patch.yml（profile）
   - id: orios-creator
     config:
       mode: 'auto'
       contentRoot: '<仓库路径>/samples/内容创作'
   ```
2. 重启 `dsh web`，在 dsh-worktable 侧栏打开「内容创作工作台」：
   - 「选题库」页可见候选池，可挑选 → 转正为主题；
   - 主题列表可见示例主题，四窗口分别展示总览/编辑/预览。

> 注意：`candidates.yaml` 与主题文件均为演示内容，可随意删除重建；图卡 PNG 由图像 Provider 生成，Provider 未配置时只显示 PENDING 待执行清单。
