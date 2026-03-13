# YouAreMemory（纯 OpenClaw 插件版）

这个仓库现在是纯 OpenClaw 插件实现。

## 项目目标

为 OpenClaw 提供多级记忆能力：

- `L0` 原始对话日志
- `L1` 结构化窗口（摘要/事实/项目标签）
- `L2` 维度索引（时间维、项目维）

检索链路：

- `search_l2` -> `search_l1` -> `search_l0`

## 快速开始

在仓库根目录执行：

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

## 目录结构

```text
youarememory/
├── packages/
│   └── openclaw-memory-plugin/      # OpenClaw 记忆插件（核心实现）
└── docs/
    ├── openclaw-beginner-guide.md   # 安装与使用说明
    └── code-review-guide.md         # 代码审查入口
```

## 常用命令

```bash
npm run build
npm run typecheck
npm run dev:plugin
```

调试检索：

```bash
npm run debug:retrieve --workspace @youarememory/openclaw-memory-plugin -- --query "项目进展"
```
