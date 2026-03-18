# ClawXMemory

**让 OpenClaw 真正记住你。**

ClawXMemory 是一个面向 OpenClaw 的本地优先多层记忆插件。它会自动从对话里沉淀原始对话、记忆片段、项目记忆、时间记忆和个人画像，并在下一次回答前主动召回真正相关的上下文。

- **不是聊天记录搜索**：它会持续聚合项目进展、时间线和个人画像，而不是让你自己翻历史消息。
- **本地优先**：所有记忆都落在本地 SQLite，不依赖云端存储。
- **即插即用**：安装后直接接管 OpenClaw 的动态记忆层，正常对话即可开始积累记忆。

## Quick Start

```bash
npm install
npm run relink:memory-plugin
openclaw plugins info clawxmemory-openclaw
```

打开看板：

```text
http://127.0.0.1:39393/clawxmemory/
```

---

## 为什么不是聊天记录搜索

聊天记录搜索解决的是“我手动去找过去说过什么”，而 ClawXMemory 解决的是“系统自动替我维护长期上下文”。

- 它不会只保留零散摘要，而是把同一主题下的多轮对话持续聚合成**项目记忆**
- 它不会只按会话切片，而是把每天发生的事情整理成**记忆时间线**
- 它不会只记住单条事实，而是会逐步更新你的**个人画像**
- 它不会等你主动搜索，而是在回答前做检索和下钻，只把真正相关的记忆注入当前 prompt

---

## 项目介绍

ClawXMemory 的目标很直接：让 OpenClaw 的记忆从“临时上下文”升级为“长期上下文系统”。

安装完成后，你无需手动整理笔记、维护摘要或标记重要对话。插件会在后台自动完成：

- 记录每轮原始对话
- 在话题自然闭合时生成记忆片段
- 按主题和时间继续聚合成长期记忆
- 在后续提问时自动召回相关上下文

它适合这些场景：

- 长周期项目推进：论文、产品、求职、比赛、旅行、创作
- 持续关系和生活事项：朋友近况、约定、偏好、后续安排
- 需要 AI 跨多轮、多天、多主题保持一致上下文的工作流

---

## 核心能力

| 能力 | 说明 |
|------|------|
| 自动记忆 | 正常对话即可，插件自动采集、聚合、更新记忆 |
| 多层索引 | 从原始对话到项目记忆、时间记忆、个人画像逐层组织 |
| 智能召回 | 回答前自动检索、筛选、下钻相关记忆，而不是盲目拼接历史 |
| 本地优先 | 数据默认存放在本地 SQLite，不经过云端 |
| 可视化看板 | 提供画布视图、列表视图和记忆连线，便于查看与排查 |
| 导入导出 | 支持将记忆打包迁移到另一台设备上的 ClawXMemory |

---

## 快速开始

### 1. 前置条件

- Node.js `>= 24`
- 已安装并可正常使用 OpenClaw

### 2. 安装

如果你是从仓库源码启动：

```bash
git clone <repo-url>
cd <repo-dir>
npm install
npm run relink:memory-plugin
```

`relink` 会自动完成构建、插件链接、配置绑定、网关重启和健康检查。

### 3. 验证安装

```bash
openclaw plugins info clawxmemory-openclaw
openclaw gateway status --json
```

你应确认：

- `clawxmemory-openclaw` 的 `Status: loaded`
- `plugins.slots.memory` 已由 ClawXMemory 接管
- 网关运行正常，且本地 UI 可访问：

```text
http://127.0.0.1:39393/clawxmemory/
```

---

## 安装与验证

### OpenClaw 会被怎样接管

ClawXMemory 会接管 OpenClaw 的动态记忆槽位，但不会修改你的 workspace 文件。

安装后，动态记忆链路由它负责：

- 自动采集对话
- 自动构建记忆索引
- 在 `before_prompt_build` 前注入相关记忆

而这些仍然属于 OpenClaw 宿主：

- `AGENTS.md`、`USER.md` 等静态上下文
- workspace 本地文件系统
- 其他非 memory 类型插件

### 首次启动后会发生什么

一旦插件成功加载：

1. 你继续像平时一样和 OpenClaw 对话
2. 对话会先沉淀为原始对话
3. 话题闭合后自动生成记忆片段
4. 记忆片段进一步更新项目记忆、记忆时间线和个人画像
5. 下次提问时，相关记忆会在回答前自动注入

---

## 日常使用

### 正常对话即可开始记忆

大多数时候你不需要做任何额外操作。ClawXMemory 会在后台自动完成以下工作：

1. 每轮对话自动记录为原始对话
2. 当系统检测到话题自然闭合时，生成记忆片段
3. 新的记忆片段会继续汇总成项目记忆、记忆时间线和个人画像
4. 下一次提问时，系统会只召回真正相关的记忆

### 什么时候会形成不同类型的记忆

- **原始对话**：每轮对话结束后写入
- **记忆片段**：一个话题告一段落时生成
- **项目记忆**：当多个记忆片段持续指向同一主题或项目时更新
- **记忆时间线**：按天聚合同一天的重要活动和进展
- **个人画像**：随着更多对话积累，持续更新偏好、长期特征和稳定背景

### 看板里可以做什么

在本地看板里，你可以：

- 浏览项目记忆、记忆时间线和个人画像
- 切换到列表视图查看底层索引
- 点击记忆节点查看 L2 → L1 → L0 的连线关系
- 搜索已有记忆
- 导出当前全部记忆
- 导入另一台设备上的 ClawXMemory 记忆包

### 常用操作说明

| 操作 | 说明 |
|------|------|
| 刷新 | 重新拉取当前最新数据 |
| 索引同步 | 立即把当前开放话题同步进索引 |
| 导出记忆 | 导出当前所有记忆数据，便于迁移和备份 |
| 导入记忆 | 用导出的记忆包覆盖当前设备上的记忆 |
| 清除记忆 | 清空派生索引，并从现有原始对话重新回放 |

---

## 看板与记忆视图

ClawXMemory 当前提供两种主要视图：

### 画布视图

画布视图更适合从“长期上下文”的角度看记忆系统当前在维护什么。

- **项目记忆**：按主题或持续性事项组织的长期记忆
- **记忆时间线**：按天组织的重要活动和进展
- **个人画像**：用户偏好、长期特征和稳定背景

点击任一节点后，可以进入**记忆连线**视图，查看它和底层记忆片段、原始对话之间的关系。

### 列表视图

列表视图更适合排查和精查具体索引内容。

| 列表层级 | 含义 |
|------|------|
| **项目记忆（L2）** | 按主题聚合后的长期项目记忆 |
| **时间记忆（L2）** | 按日期聚合后的时间记忆 |
| **记忆片段（L1）** | 已闭合话题的结构化摘要 |
| **原始对话（L0）** | 最原始的对话消息记录 |
| **个人画像** | 单例个人画像记录 |

---

## 记忆是如何工作的

对大多数用户来说，只需要知道 ClawXMemory 会把对话逐层组织成更适合长期召回的结构。

```text
对话轮次 ──→ 原始对话
               │
               ▼
          话题闭合检测
               │
               ▼
          记忆片段（L1）
           ┌───┴───┐
           ▼       ▼
  项目记忆（L2）  时间记忆（L2）
           │
           ▼
        个人画像
```

如果你需要技术视角，可以把它理解为四层记忆索引：

| 层级 | 用户视角 | 存储内容 |
|------|------|------|
| `L0` | 原始对话 | 最原始的对话消息 |
| `L1` | 记忆片段 | 一个闭合话题的摘要、事实和标签 |
| `L2` 项目 | 项目记忆 | 同一主题下持续更新的长期聚合记忆 |
| `L2` 时间 | 时间记忆 | 同一天内活动和进展的聚合摘要 |
| 全局记录 | 个人画像 | 偏好、长期特征、稳定背景 |

召回时，系统不是把所有历史对话塞进 prompt，而是执行一个逐层筛选、下钻到具体证据的检索流程。

更完整的数据结构、字段语义和检索链路说明请看：

- [docs/memory-design.md](docs/memory-design.md)

---

## 与 OpenClaw 的关系

ClawXMemory **完全替代 OpenClaw 的动态对话记忆层**，但**不修改 workspace 文件**。

| 职责 | 归属 |
|------|------|
| 动态对话记忆（回答前注入历史上下文） | ClawXMemory |
| Workspace 静态上下文（AGENTS.md、USER.md 等） | OpenClaw |

安装时会自动配置这些关键项，避免原生记忆和插件同时工作：

- `plugins.slots.memory` → `clawxmemory-openclaw`
- `plugins.entries.memory-core.enabled` → `false`
- `hooks.internal.entries.session-memory.enabled` → `false`
- `agents.defaults.memorySearch.enabled` → `false`

---

## 开发与调试

如果你准备二次开发或审查实现，可以从这里开始。

### 项目结构

```text
ClawXMemory/
├── packages/
│   └── openclaw-memory-plugin/
│       ├── src/
│       │   ├── index.ts
│       │   ├── runtime.ts
│       │   ├── hooks.ts
│       │   └── core/
│       │       ├── storage/
│       │       ├── pipeline/
│       │       ├── retrieval/
│       │       └── skills/
│       └── ui-source/
├── docs/
└── scripts/
```

### 关键文件

| 文件 | 说明 |
|------|------|
| `packages/openclaw-memory-plugin/src/index.ts` | 插件入口 |
| `packages/openclaw-memory-plugin/src/runtime.ts` | 运行态、hook 接线、UI server 协调 |
| `packages/openclaw-memory-plugin/src/core/pipeline/heartbeat.ts` | L0 → L1 → L2 的构建管线 |
| `packages/openclaw-memory-plugin/src/core/retrieval/reasoning-loop.ts` | 多跳记忆检索 |
| `packages/openclaw-memory-plugin/src/core/storage/sqlite.ts` | SQLite 数据层 |
| `packages/openclaw-memory-plugin/ui-source/app.js` | 看板前端逻辑 |

### 开发循环

```bash
# 修改 src/ 或 ui-source/
npm run reload:memory-plugin

# 类型检查
npm run typecheck

# 调试检索
npm run debug:retrieve --workspace @clawxmemory/clawxmemory-openclaw -- --query "项目进展"
```

### reload vs relink

| 命令 | 场景 |
|------|------|
| `npm run reload:memory-plugin` | 日常开发、代码更新后重新加载 |
| `npm run relink:memory-plugin` | 首次安装、插件链接损坏、`plugin id mismatch` |

---

## 常见问题

### 1. 插件没有加载成功

先检查：

```bash
openclaw plugins info clawxmemory-openclaw
openclaw gateway status --json
```

如果插件未加载或 memory slot 未接管，优先执行：

```bash
npm run relink:memory-plugin
```

### 2. 页面显示旧内容

先执行：

```bash
npm run reload:memory-plugin
```

然后强刷浏览器：

- macOS: `Cmd + Shift + R`

### 3. 索引看起来不对，怎么重建

在看板设置中点击**清除记忆**，系统会保留原始对话，并从现有原始对话重新回放生成上层索引。

### 4. `reload` 和 `relink` 有什么区别

- `reload`：用于日常改代码后重新加载插件
- `relink`：用于首次安装、插件链接损坏或 OpenClaw 配置未正确绑定插件

### 5. 进入看板后为什么有时会看到“正在加载已有记忆”

启动时插件可能会在后台做一次只读校验或必要修复。当前实现会优先保留已有快照，避免看板短暂空白。

---

## 深入文档

- [docs/memory-design.md](docs/memory-design.md)
- [docs/code-review-guide.md](docs/code-review-guide.md)
- [packages/openclaw-memory-plugin/README.md](packages/openclaw-memory-plugin/README.md)
