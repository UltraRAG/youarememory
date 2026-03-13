# YouAreMemory（OpenClaw 插件优先版）

这个仓库当前以 OpenClaw `memory` plugin 为主入口，目标是提供可即插即用的多级记忆能力与本地可视化控制台。

## 当前能力

- `L0` 原始对话日志，默认按完整 session 采集
- `L1` 结构化窗口（摘要、事实候选、项目标签、情景时间）
- `L2` 二级索引（时间维、项目维）
- `GlobalFactRecord` 单例全局画像，持续维护动态事实
- 检索链路：`search_l2 -> search_l1 -> search_l0`
- 本地极简数据面板风格看板

## 为什么不是 skills-only

`skills` 在这个项目里主要承担规则配置与 agent 编排，但“即插即用”的关键能力仍依赖 plugin：

- 自动监听 OpenClaw 生命周期并采集会话
- 在 `before_prompt_build` / `before_agent_start` 自动注入记忆上下文
- 注册 `memory_recall`、`search_l2`、`search_l1`、`search_l0` 等工具
- 启动本地只读 UI 服务

所以当前推荐形态是“插件优先 + skills 配置化”。

## 快速开始

在仓库根目录执行：

```bash
npm install
npm run relink:memory-plugin
```

## 目录结构

```text
youarememory/
├── packages/
│   ├── memory-core/                     # 共享核心类型与索引/检索实现
│   └── openclaw-memory-plugin/          # OpenClaw 插件 + 本地 UI
└── docs/
    ├── memory-design.md                 # 中文设计与数据结构说明
    ├── openclaw-beginner-guide.md       # 安装、开发、重建与看板使用说明
    └── code-review-guide.md             # 代码审查入口
```

## 常用命令

```bash
npm run build
npm run typecheck
npm run dev:plugin
npm run reload:memory-plugin
```

调试检索：

```bash
npm run debug:retrieve --workspace @youarememory/youarememory-openclaw -- --query "项目进展"
```
