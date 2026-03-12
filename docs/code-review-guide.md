# YouAreMemory 代码审查指南（面向不熟悉 TS 的同学）

这份指南用于审查新版 **Python 测试版 + TS 插件 + Agent Skills** 混合架构。

## 1) 架构分层（先看这个）

- **Python Lab 层（开发优先）**：负责低门槛测试与需求验证
- **能力层（TS 插件）**：负责 L0/L1/L2、数据库、工具、UI
- **编排层（Agent Skills）**：负责什么时候调用哪些工具、什么时候跑诊断脚本
- **策略层（规则配置）**：负责关键词、抽取规则、项目状态规则、上下文模板

对应目录：

- Python Lab 层：`apps/memory-lab-py/**`
- 能力层：`packages/openclaw-memory-plugin/src/**`
- 编排层：`packages/openclaw-memory-plugin/agent-skills/**`
- 策略层：`packages/openclaw-memory-plugin/skills/**`

## 2) 功能 -> 文件映射

### A. Python 测试核心（优先看）

- `apps/memory-lab-py/memory_lab_py/repository.py`
- `apps/memory-lab-py/memory_lab_py/indexer.py`
- `apps/memory-lab-py/memory_lab_py/retriever.py`
- `apps/memory-lab-py/memory_lab_py/skills_loader.py`
- `apps/memory-lab-py/streamlit_app.py`
- `apps/memory-lab-py/scripts/parity_check.py`

### B. TS 插件入口与生命周期

- `packages/openclaw-memory-plugin/src/index.ts`
  - `before_prompt_build` / `before_agent_start`：注入记忆上下文
  - `agent_end`：写入 L0 并触发 heartbeat

### C. TS 记忆构建与检索核心

- `packages/openclaw-memory-plugin/src/core/pipeline/heartbeat.ts`
- `packages/openclaw-memory-plugin/src/core/indexers/l1-extractor.ts`
- `packages/openclaw-memory-plugin/src/core/indexers/l2-builder.ts`
- `packages/openclaw-memory-plugin/src/core/retrieval/reasoning-loop.ts`
- `packages/openclaw-memory-plugin/src/core/storage/sqlite.ts`

### D. TS 工具与 UI

- 工具：`packages/openclaw-memory-plugin/src/tools.ts`
- UI/API：`packages/openclaw-memory-plugin/src/ui-server.ts`
- UI 静态资源：`apps/memory-ui/index.html`、`apps/memory-ui/app.js`、`apps/memory-ui/app.css`

### E. Agent Skills（重点）

- `packages/openclaw-memory-plugin/agent-skills/memory-orchestrator/SKILL.md`
- `packages/openclaw-memory-plugin/agent-skills/memory-maintenance/SKILL.md`
- `packages/openclaw-memory-plugin/agent-skills/memory-maintenance/scripts/*.mjs`

### F. 插件策略配置（重点）

- `packages/openclaw-memory-plugin/skills/intent-rules.json`
- `packages/openclaw-memory-plugin/skills/extraction-rules.json`
- `packages/openclaw-memory-plugin/skills/project-status-rules.json`
- `packages/openclaw-memory-plugin/skills/context-template.md`
- 加载器：`packages/openclaw-memory-plugin/src/core/skills/loader.ts`

## 3) 不会 TS 也够用的 4 个概念

- `interface`：数据结构约束
- `type`：类型别名（常见 `A | B`）
- `class`：状态和方法封装
- `import/export`：模块引用

审查时优先看：函数名 -> 入参 -> 返回值 -> 分支逻辑。

## 4) 推荐审查顺序（最快抓主链路）

1. `apps/memory-lab-py/streamlit_app.py`：确认你能用 Python UI 重现问题。
2. `apps/memory-lab-py/memory_lab_py/retriever.py`：先看检索链路，理解输出结构。
3. `apps/memory-lab-py/memory_lab_py/indexer.py`：看 `L0 -> L1 -> L2` 构建逻辑。
4. `packages/openclaw-memory-plugin/src/core/retrieval/reasoning-loop.ts`：对照 Python 实现是否一致。
5. `packages/openclaw-memory-plugin/scripts/debug-retrieve.mjs` + `apps/memory-lab-py/scripts/parity_check.py`：验证 Python↔TS 一致性。
6. `agent-skills/*/SKILL.md`：确认编排策略符合“工具优先、脚本补充”。
7. `skills/*.json|md`：确认规则参数是唯一权威来源。

## 5) 如何审查 SKILL.md 是否规范

每个 `SKILL.md` 至少检查这 5 点：

1. frontmatter 的 `name` 与目录名一致（例如 `memory-orchestrator`）。
2. `description` 包含能触发该 skill 的任务关键词。
3. `metadata` 包含门控：`plugins.entries.youarememory-openclaw.enabled`。
4. 指令明确“工具优先”，脚本仅用于诊断/维护。
5. 脚本路径可执行且是只读诊断（不直接改库）。

## 6) Python↔TS 同步机制怎么审

重点看两点：

- Python 只读取 `packages/openclaw-memory-plugin/skills/`，不复制规则。
- parity 比对脚本覆盖 `intent`、`enoughAt`、每层 top id。

验证命令：

```bash
npm run build --workspace @youarememory/openclaw-memory-plugin
python3 apps/memory-lab-py/scripts/parity_check.py --query "项目进展"
```

需要严格对比完整 ID 列表时，加 `--strict`。

## 7) 如何验证改动真的生效

### A. 改 Python 核心后

1. 跑 Streamlit：`streamlit run apps/memory-lab-py/streamlit_app.py`
2. 写入 L0 -> heartbeat -> retrieve
3. 看输出结构是否符合预期

### B. 改 TS 插件后

1. 执行：

```bash
npm run build
npm run typecheck
```

2. 用 parity 脚本做一致性检查。

### C. 改 Agent Skills 或规则配置后

1. 执行：

```bash
npm run build
openclaw gateway restart
```

2. 检查：
   - `skills.entries.memory-orchestrator.enabled=true`
   - `skills.entries.memory-maintenance.enabled=true`
3. 在 OpenClaw 实际对话验证行为。

## 8) 当前实现状态（对照新方案）

### 已落地

- Python memory core + Streamlit UI 已提供。
- TS debug 检索入口已提供。
- Python↔TS parity 脚本已提供。
- Agent Skills 与插件能力层已解耦。

### 后续可增强

- 为 parity 增加差异白名单配置文件。
- 增加固定样本库做自动化回归。
