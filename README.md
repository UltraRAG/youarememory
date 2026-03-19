# ClawXMemory

## 关于 ClawXMemory

ClawXMemory 是一个面向 OpenClaw 的本地优先多层记忆插件，用于将对话从“短期上下文”升级为“长期上下文系统”。它会在正常对话中自动采集记忆，先将原始对话按话题整理为记忆片段，再基于这些片段逐步构建项目记忆、时间线记忆和用户画像，形成可持续演化的多层记忆结构。在生成回答前，系统不依赖传统检索，而是由模型沿多层记忆索引主动选择并下钻相关记忆，只注入真正需要的上下文。

在使用 OpenClaw 对话的过程中，ClawXMemory 会持续聚合项目与时间信息，自动维护多层记忆索引。所有数据默认存储于本地 SQLite，保障隐私与可控性，并支持记忆数据的导入和导出。同时提供了看板，可视化地查看和管理自己的记忆。

---

## 安装

### 1. 前置条件

- Node.js `>= 24`
- 已正确安装并可正常运行 OpenClaw

### 2. 安装步骤

如果你是从仓库源码启动：

```bash
git clone <repo-url>
cd <repo-dir>
npm install
npm run relink:memory-plugin
```

`relink` 命令会自动完成以下流程：构建插件、建立插件链接、绑定 OpenClaw 配置、重启网关和健康检查。

### 3. 验证安装

执行以下命令检查插件状态：

```bash
openclaw plugins info clawxmemory-openclaw
openclaw gateway status --json
```

请确认：

- `clawxmemory-openclaw` 显示为 `Status: loaded`
- `plugins.slots.memory` 已由 ClawXMemory 接管
- 网关运行正常

同时，可在浏览器中访问本地 UI：

```text
http://127.0.0.1:39393/clawxmemory/
```

---

## ClawXMemory 是如何工作的

ClawXMemory 通过一个分层记忆构建与模型驱动选择机制，将原始对话逐步转化为可用于长期上下文建模的结构化记忆系统。

在记忆构建阶段，系统以对话为输入流，首先将每轮对话记录为原始对话（L0），并通过话题闭合检测自动将相关对话整理为记忆片段（L1）。这些记忆片段作为中间语义单元，进一步被持续聚合为更高层的长期记忆结构，包括按主题组织的项目记忆（L2）、按时间组织的记忆时间线（L2），以及跨对话持续更新的个人画像。该过程无需用户干预，在后台持续完成记忆抽取与结构化演化。

```text
对话轮次 ──→ 原始对话（L0）
               │
               ▼
          话题闭合检测
               │
               ▼
          记忆片段（L1）
        ┌──────┼──────┐
        ▼      ▼      ▼
 项目记忆（L2） 时间记忆（L2） 个人画像
```

在记忆推理阶段，ClawXMemory 不依赖传统的向量检索器进行相似度匹配，而是由模型基于多层记忆索引进行主动选择：模型首先判断相关的高层记忆节点（如项目或时间节点），再逐层下钻至对应的记忆片段及原始对话，最终仅将必要的上下文注入当前 prompt。这一“选择 + 下钻”的机制避免了无关历史信息的拼接，提高了上下文利用效率与生成稳定性。

| 列表层级         | 含义            |
| ------------ | ------------- |
| **项目记忆（L2）** | 按主题聚合后的长期项目记忆 |
| **时间记忆（L2）** | 按日期聚合后的时间记忆   |
| **记忆片段（L1）** | 已闭合话题的结构化摘要   |
| **原始对话（L0）** | 最原始的对话消息记录    |
| **个人画像**     | 单例个人画像记录      |

在系统层面，ClawXMemory 采用本地优先架构，所有记忆数据存储于本地 SQLite，并提供可视化看板用于展示不同层级记忆及其关联关系（L2 → L1 → L0），支持浏览、排查与调试。同时，系统支持记忆的导入与导出，使长期上下文可以在不同设备之间迁移与复用。

---

## 开发与调试

如果你计划进行二次开发或深入理解实现，可以从本节开始。

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


| 文件                                                                     | 说明                       |
| ---------------------------------------------------------------------- | ------------------------ |
| `packages/openclaw-memory-plugin/src/index.ts`                         | 插件入口，负责注册与初始化 |
| `packages/openclaw-memory-plugin/src/runtime.ts`                       | 运行时协调层，负责 hook 接入与 UI 服务管理 |
| `packages/openclaw-memory-plugin/src/core/pipeline/heartbeat.ts`       | 记忆构建主流程（L0 → L1 → L2）  |
| `packages/openclaw-memory-plugin/src/core/retrieval/reasoning-loop.ts` | 基于模型的多步记忆选择与下钻逻辑  |
| `packages/openclaw-memory-plugin/src/core/storage/sqlite.ts`           | SQLite 存储实现   |
| `packages/openclaw-memory-plugin/ui-source/app.js`                     | 本地看板前端逻辑                   |


### 开发流程

```bash
# 修改 src/ 或 ui-source/ 后重新加载插件
npm run reload:memory-plugin

# 类型检查
npm run typecheck

# 调试记忆召回流程
npm run debug:retrieve --workspace @clawxmemory/clawxmemory-openclaw -- --query "项目进展"
```

---

## 联系我们

TBD。
