# ADR-0005：用 GitHub Pages 发布纯前端 Mock

- 决策状态：已接受
- 实施状态：已上线
- 验证状态：既有交付已核对线上与本地文件；不是持续可用性监控
- 建档日期：2026-09-12（历史回填）
- 决策日期：2026-08-12
- 类型：技术 / 发布
- 路线关联：[已发布里程碑](../../ROADMAP.md)

## 问题与依据

用户需要把可交互页面发送给其他环境的朋友体验，已授权创建 Vibe 仓库并发布。当前页面是无需编译的 HTML / CSS / JavaScript，样例图片内嵌，尚无账户或后端。

## 候选与决策

- 仅本地服务：用户电脑能看，但朋友无法通过稳定公网地址体验。
- 自定义 GitHub Actions 发布：曾创建 workflow；对当前无需构建的页面增加配置步骤。
- **采用：GitHub Pages 从 `main` 分支的 `/(root)` 发布 `index.html`。** 修改推送后由 Pages 部署，沿用同一体验地址。

仓库：[bakeyliao-boop/Vibe](https://github.com/bakeyliao-boop/Vibe)

设置：[Settings → Pages](https://github.com/bakeyliao-boop/Vibe/settings/pages)

体验：[Vibe](https://bakeyliao-boop.github.io/Vibe/)

## 结果与取舍

- 降低 Mock 分享与更新成本，保留提交历史；无需自定义构建 workflow。
- 公开 Mock 的静态样例不提供真实共同空间的访问控制、持久化或同步。
- 继续沿用 GitHub Pages 是当前 Mock 的发布决定，不是正式服务的技术选型。
- 同仓库有独立乐高页面，发布时保留其已有内容。
- 推送不等于部署完成；需要核对线上内容或部署结果后再报告已上线。

## 如何验证 / 何时重看

确认分支与目录设置、推送是否成功、线上版本是否匹配目标提交。引入真实用户保存与访问权限后重新评估承载方案，不从当前静态托管推导其具备后端能力。

## 记录

| 日期 | 事件 | 证据 |
| --- | --- | --- |
| 2026-08-12 | 发布初始 HTML | [`c4d1461`](https://github.com/bakeyliao-boop/Vibe/commit/c4d1461) |
| 2026-08-12 | 添加自定义 Pages workflow | [`5190696`](https://github.com/bakeyliao-boop/Vibe/commit/5190696) |
| 2026-08-12 | 删除自定义 workflow，改分支发布 | [`c4db689`](https://github.com/bakeyliao-boop/Vibe/commit/c4db689)；用户确认改为 main |
| 2026-09-12 | 两轮动效更新推送并核对线上文件 | [`dfef05c`](https://github.com/bakeyliao-boop/Vibe/commit/dfef05c)、[`b0c7e41`](https://github.com/bakeyliao-boop/Vibe/commit/b0c7e41)；本会话交付记录 |
