# YouAreMemory

基于多级索引（L0 / L1 / L2）的 OpenClaw 记忆插件项目，目标是让 OpenClaw 记忆升级真正做到“即插即用”。

## 你应该先看哪里

- **只想装起来就能用（小白推荐）**：[`packages/openclaw-memory-plugin/README.md`](packages/openclaw-memory-plugin/README.md)
- **一步一步图文式教程**：[`docs/openclaw-beginner-guide.md`](docs/openclaw-beginner-guide.md)
- **我想做代码审查（不会 TS 也能看）**：[`docs/code-review-guide.md`](docs/code-review-guide.md)
- **开发者看架构和源码**：本页 + `packages/openclaw-memory-plugin/src/core` + `packages/openclaw-memory-plugin/agent-skills` + `packages/openclaw-memory-plugin/skills`

## 这个项目解决什么问题

OpenClaw 默认记忆通常偏“单层检索”。YouAreMemory 增加了三层记忆结构：

- `L0`：原始对话日志（完整保存）
- `L1`：会话窗口抽取（摘要、事实、情景、项目标签）
- `L2`：维度索引（时间索引、项目索引）

并且在检索时走推理降级链路：

- `search_l2` -> 不够再 `search_l1` -> 还不够再 `search_l0`

## 当前能力

- `kind: "memory"` 主插件接入 OpenClaw memory 插槽
- Agent Skills（`SKILL.md`）任务编排：工具优先、脚本补充
- 本地 SQLite 持久化（`l0_sessions` / `l1_windows` / `l2_*` / `global_facts`）
- heartbeat 索引流水线：`L0 -> L1 -> L2 + 动态画像`
- 工具集：
  - `memory_recall`
  - `memory_store`
  - `memory_search`（兼容别名）
  - `search_l2` / `search_l1` / `search_l0`
- Memos 风格本地只读 UI（时间线、项目、事实、会话）

## 30 秒快速安装

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

然后把 `~/.openclaw/openclaw.json` 里的 memory slot 切到 `youarememory-openclaw`（完整模板见插件 README）。

## 默认面板地址

- `http://127.0.0.1:39393/youarememory/`

## 项目结构

```text
youarememory/
├── packages/
│   └── openclaw-memory-plugin/      # OpenClaw memory slot 插件（core + agent-skills + strategy-rules）
├── apps/
│   └── memory-ui/                   # Memos 风格静态面板资源
├── docs/
│   └── openclaw-beginner-guide.md   # 小白教程
```

## 开发命令

```bash
npm run build
npm run typecheck
npm run dev:plugin
```