# orios-content-workbench（npm 包：@orios/dsh-creator）

OriOS 面向 DeepSeek Harness 的内容连续生产工作台插件：原生 DSH 工作台入口 + dsh-worktable 多窗口界面（顶栏/总览/编辑/预览 + 右侧对话），四级人工审批闸门（选题 → 长文 → 变体 → 发布）。本仓库含插件源码、单元测试与示例素材（`samples/`）。

功能概览：

## 内容目录约定

```text
contentRoot/
└── 2026-08/
    └── 2026-08-25_ai-workflow/
        ├── project.yaml
        ├── brief.md
        ├── claims.yaml
        ├── sources/
        ├── wechat/article.md
        ├── xhs/post.md
        ├── xhs/cards/
        ├── video/script.md
        ├── video/scenes.json
        ├── video/captions.json
        ├── video/final.mp4
        ├── publish/package.json
        └── approvals.json
```

`project.yaml` 保存 `id`、`title`、`slug`、`plannedAt`、`stage`、`targets` 等元数据。插件不会自动创建 `contentRoot`，也不会跟随根目录、月份目录或主题目录中的符号链接。

Agent 交接遵循固定工作流：先读取 Brief、`claims.yaml` 和 `sources/`，再以公众号长文为表达锚点生成小红书和视频变体；四级审批逐级通过，平台发布包只停在人工确认前。

可复用的 `skills/orios-content-workflow/` 已将这套契约独立保存，借鉴 WeWrite 的来源/审稿闸门与 baoyu-skills 的平台产物拆分，但不直接复制其外部发布器或凭据处理。

### 配置

在 DSH 插件配置中将 `mode` 保持为 `auto`，并把 `contentRoot` 指向上面的根目录；也可以通过环境变量 `ORIOS_CREATOR_CONTENT_ROOT` 提供路径。没有配置时继续使用 mock，方便先验收工作台界面。

插件设置统一出现在 DSH 官方“设置 → 插件”面板中，可配置图像生成、中文配音、Remotion、公众号草稿、小红书、抖音和视频号发布器。配置项保存 Endpoint、模型、本地命令、Profile 路径和**环境变量名**；如果宿主提供 DSH 凭据服务，密钥输入会通过该服务写入，设置文件和页面不会回显密钥。面板中的“重新检测”只检查配置完整性，不调用外部平台接口。

## 本地检查

```bash
npm install
npm run check:all
```

### 在 DSH Web 中验收

```powershell
cd F:\Ori-OS\integrations
dsh plugin --profile web add .\dsh-creator
dsh web
```

打开 `http://localhost:3080` 后，在原生侧栏底部点击“内容库”（收起侧栏时显示为图标）打开二级主题库；点击主题会在当前 DSH 页面打开内容详情，原生会话输入仍保留。插件设置位于“设置 → 插件 → 内容工作台”。如果 Web 进程已经在运行，重新添加插件后需要重启一次 `dsh web` 才会加载新的 client bundle。若 Windows 启动器提示平台不支持，请在 WSL/Linux 中启动 DSH，或使用已经运行的 Web 实例。

该包不包含任何平台凭据，也不会自动点击平台最终发布按钮。图像、配音和平台发布 Provider 需要配置环境变量或会话路径；Remotion 仅记录本地命令，首次运行时仍需实际渲染探测。

## worktable 多窗口工作台（v0.2.0）

插件自带完整的工作台界面：安装后会自动在 dsh-worktable 侧栏注册「内容创作工作台」项目，点击即打开**顶栏 + 三列 + 右侧对话**布局：

| 窗口 | 内容 |
|---|---|
| 顶部栏 | 设置与画像（画像表单 / Provider 状态）+ 发布就绪 |
| 第 1 列 | 总览与选题库（搜索 / 看板 / 四闸门状态 / 待办 / 候选池 / 新建主题） |
| 第 2 列 | 内容编辑与修改（公众号 / 小红书 / 视频，正文自动保存 + 评分查重 + 审批） |
| 第 3 列 | 配图及视频预览（公众号配图 / 小红书图卡 / 视频成片 / 微信排版预览） |
| 右侧 | worktable 原生对话窗（AI 交互） |

### 安装

```powershell
# 本地安装（profile 为 web 时）
dsh plugin --profile web add .\dsh-creator-0.2.0.tgz
# 或直接把包放入 profile node_modules 并加 patch 行
```

重启 `dsh web`（宿主需加载新服务端代码），浏览器刷新后侧栏「工作台」出现「✍️ 内容创作工作台」项目卡片，点击即展开四窗布局。

### 配置（profile patch / cordis.patch.yml）

```yaml
- id: orios-creator
  config:
    mode: 'auto'
    contentRoot: 'F:/Ori-OS/内容创作'          # 内容库根（缺省自动脚手架 <workbenchFolder>/内容创作）
    workbenchFolder: 'F:/Ori-OS'              # worktable 项目文件夹（缺省 $DSH_HOME/projects/orios-content-workbench）
```

插件首次激活会把 `ui/` 里的四窗页面 + `widget-result.json` 物化到 `workbenchFolder`（**只写缺失文件，不覆盖已有文件**），worktable 自愈扫挂自动把窗口挂进项目。修改窗口页面请直接编辑 `workbenchFolder` 下的文件（或编辑 `ui/` 后删除目标文件重新物化）。

### 工作原理

- 宿主：`GET /creator/api/workbench` 返回项目文件夹与内容库路径并执行幂等脚手架；
- 客户端：把项目写入 worktable 的 projects store（folders + views = tb3 布局），注册 `sidebar.worktable.project` 卡片，派发 `dsh:worktable.reload` 事件让工作台即时重载；
- 依赖 dsh-worktable 0.2.0+（含 `ensurePane` 自动扩容与 reload 监听）。
