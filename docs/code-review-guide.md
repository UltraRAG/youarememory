# YouAreMemory 代码审查指南（面向不熟悉 TS 的同学）

这份指南用于审查新版 **Agent Skills + Memory 插件混合架构**。

## 1) 架构分层（先看这个）

- **能力层（插件）**：负责 L0/L1/L2、数据库、工具、UI
- **编排层（Agent Skills）**：负责什么时候调用哪些工具、什么时候跑诊断脚本
- **策略层（规则配置）**：负责关键词、抽取规则、项目状态规则、上下文模板

对应目录：

- 能力层：`packages/openclaw-memory-plugin/src/**`
- 编排层：`packages/openclaw-memory-plugin/agent-skills/**`
- 策略层：`packages/openclaw-memory-plugin/skills/**`

## 2) 功能 -> 文件映射

### A. 插件入口与生命周期

- `packages/openclaw-memory-plugin/src/index.ts`
  - `before_prompt_build` / `before_agent_start`：注入记忆上下文
  - `agent_end`：写入 L0 并触发 heartbeat

### B. 记忆构建与检索核心

- `packages/openclaw-memory-plugin/src/core/pipeline/heartbeat.ts`
- `packages/openclaw-memory-plugin/src/core/indexers/l1-extractor.ts`
- `packages/openclaw-memory-plugin/src/core/indexers/l2-builder.ts`
- `packages/openclaw-memory-plugin/src/core/retrieval/reasoning-loop.ts`
- `packages/openclaw-memory-plugin/src/core/storage/sqlite.ts`

### C. 工具与 UI

- 工具：`packages/openclaw-memory-plugin/src/tools.ts`
- UI/API：`packages/openclaw-memory-plugin/src/ui-server.ts`
- UI 静态资源：`apps/memory-ui/index.html`、`apps/memory-ui/app.js`、`apps/memory-ui/app.css`

### D. Agent Skills（重点）

- `packages/openclaw-memory-plugin/agent-skills/memory-orchestrator/SKILL.md`
- `packages/openclaw-memory-plugin/agent-skills/memory-maintenance/SKILL.md`
- `packages/openclaw-memory-plugin/agent-skills/memory-maintenance/scripts/*.mjs`

### E. 插件策略配置（重点）

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

1. `src/index.ts`：事件钩子与总流程是否符合规划。
2. `src/core/pipeline/heartbeat.ts`：`L0 -> L1 -> L2` 构建是否完整。
3. `src/core/retrieval/reasoning-loop.ts`：`L2 -> L1 -> L0` 降级检索是否符合预期。
4. `src/tools.ts`：工具契约是否稳定（名称、入参、输出）。
5. `agent-skills/*/SKILL.md`：编排策略是否“工具优先、脚本补充”。
6. `skills/*.json|md`：策略参数是否与业务一致。
7. `src/core/storage/sqlite.ts` + `src/ui-server.ts`：表结构/API 字段是否一致。

## 5) 如何审查 SKILL.md 是否规范

每个 `SKILL.md` 至少检查这 5 点：

1. frontmatter 的 `name` 与目录名一致（例如 `memory-orchestrator`）。
2. `description` 包含能触发该 skill 的任务关键词。
3. `metadata` 包含门控：`plugins.entries.youarememory-openclaw.enabled`。
4. 指令明确“工具优先”，脚本仅用于诊断/维护。
5. 脚本路径可执行且是只读诊断（不直接改库）。

## 6) 如何验证改动真的生效

### A. 改 Agent Skills 后

1. 改 `agent-skills/*/SKILL.md` 或诊断脚本。
2. 执行：

```bash
npm run build
openclaw gateway restart
```

3. 检查 `~/.openclaw/openclaw.json`：
   - `skills.entries.memory-orchestrator.enabled=true`
   - `skills.entries.memory-maintenance.enabled=true`
4. 用真实任务验证是否按预期走工具/脚本路径。

### B. 改策略配置后

1. 改 `skills/*.json|md`。
2. 执行：

```bash
npm run build
openclaw gateway restart
```

3. 用 `memory_recall` 或 `/youarememory/api/retrieve` 对比结果是否变化。

## 7) 规划书对照（当前实现）

### 已落地

- 插件 manifest 已声明 `agent-skills` 目录。
- 已提供 `memory-orchestrator` 与 `memory-maintenance` 两个 SKILL 包。
- 已提供 mixed mode 诊断脚本（索引统计、最近会话快照）。
- 保留并复用原有 `L0/L1/L2` 与工具链路。

### 仍可继续增强

- 将 SKILL 行为验证自动化（回归测试脚本）。
- 增加更细粒度的诊断脚本（如异常事实聚类、索引一致性 diff）。
