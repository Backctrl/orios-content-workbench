# vendor/ —— 第三方参考资产

本目录存放从外部项目**原样复制**的参考资产，仅作离线查阅，不参与构建与发布。

## creator-buddy

- 来源：https://github.com/SpaceZephyr/creator-buddy（MIT）
- 复制自提交：`edf46c567ff54b72ee2157d06f3a02dbd67aaa9c`
- 用途：内容创作方法论离线参考（公众号 / 小红书 / 视频三平台共 31 个子技能）。
  工作台运行时不加载这些技能；执行标准已提炼为
  `skills/orios-content-workflow/references/creator-buddy-standard.md`，
  需要完整打法时按对应子技能的 `SKILL.md` 取用。
- 更新方式：上游有更新时重新克隆并替换本目录（保留本说明中的提交号）。
- 注意：这些技能依赖的外部数据源（REDFOX / GUAIKEI / bili-cli 等）不在本仓库提供；
  本工作台统一走「真实数据优先，拿不到标注『未经数据验证』」的降级路径。
