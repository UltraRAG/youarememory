# YouAreMemory 代码审查指南（面向不熟悉 TS 的同学）

这份文档的目标是：你不需要熟悉 TypeScript，也能快速看懂这个项目每个功能在哪里实现，以及改动时该看哪些文件。

## 1) 先看“功能 -> 文件”总览

### L0 对话日志层

- 插件捕获入口：`packages/openclaw-memory-plugin/src/index.ts`
  - `api.on("agent_end", ...)`
- 消息标准化：`packages/openclaw-memory-plugin/src/message-utils.ts`
  - `normalizeMessages()`
- 落库：`packages/memory-core/src/pipeline/heartbeat.ts`
  - `captureL0Session()`
- SQLite 写入：`packages/memory-core/src/storage/sqlite.ts`
  - `insertL0Session()`

### L1 结构化会话抽取层

- heartbeat 主流程：`packages/memory-core/src/pipeline/heartbeat.ts`
  - `runHeartbeat()`
- L1 抽取：`packages/memory-core/src/indexers/l1-extractor.ts`
  - `extractL1FromL0()`
- 摘要/事实/项目标签提取：`packages/memory-core/src/skills/extraction-skill.ts`
  - `buildSessionSummary()`
  - `extractFactCandidates()`
  - `extractProjectTags()`

### L2 维度索引层（时间 / 项目）

- L2 构建：`packages/memory-core/src/indexers/l2-builder.ts`
  - `buildL2TimeFromL1()`
  - `buildL2ProjectsFromL1()`
- L2 写库：`packages/memory-core/src/storage/sqlite.ts`
  - `upsertL2TimeIndex()`
  - `upsertL2ProjectIndex()`

### 全局事实画像

- 从 L1 更新画像：`packages/memory-core/src/pipeline/heartbeat.ts`
  - `upsertGlobalFacts(...)`
- 事实表：`packages/memory-core/src/storage/sqlite.ts`
  - `global_facts` 表
  - `upsertGlobalFacts()`

### 推理检索闭环（L2 -> L1 -> L0）

- 主逻辑：`packages/memory-core/src/retrieval/reasoning-loop.ts`
  - `retrieve()`
  - `searchL2()` / `searchL1()` / `searchL0()`
  - `isEnoughAtL2()` / `isEnoughAtL1()`
- 意图识别：`packages/memory-core/src/skills/intent-skill.ts`
  - `classifyIntent()`

### OpenClaw 工具注册

- 工具定义：`packages/openclaw-memory-plugin/src/tools.ts`
  - `memory_recall`
  - `memory_store`
  - `memory_search`（兼容别名）
  - `search_l2` / `search_l1` / `search_l0`
- 注册位置：`packages/openclaw-memory-plugin/src/index.ts`
  - `api.registerTool(...)`

### UI（Memos 风格）

- 本地 API 与静态服务：`packages/openclaw-memory-plugin/src/ui-server.ts`
- 前端页面：`apps/memory-ui/`
  - `index.html`
  - `app.js`
  - `app.css`

---

## 2) 不懂 TypeScript 也能看的最少知识

- `interface`：可以理解为“数据结构定义”，类似 JSON 的字段说明。
- `type`：类型别名，常用于联合类型（例如 `A | B`）。
- `class`：带状态和方法的对象封装。
- `export`：对外暴露；`import`：从别处引入。

你可以先忽略类型声明，先看函数名和注释，再看函数入参/返回值。

---

## 3) 推荐 code review 顺序（最快）

1. `packages/openclaw-memory-plugin/src/index.ts`
   - 先确认插件生命周期钩子接了哪些事件。
2. `packages/memory-core/src/pipeline/heartbeat.ts`
   - 看写入和索引构建顺序是否符合规划。
3. `packages/memory-core/src/indexers/*.ts` + `skills/*.ts`
   - 看 L1/L2 生成规则是否符合你的业务预期。
4. `packages/memory-core/src/retrieval/reasoning-loop.ts`
   - 看“enough 判定”和降级检索逻辑。
5. `packages/memory-core/src/storage/sqlite.ts`
   - 对照表结构是否满足 L0/L1/L2/事实画像需求。
6. `packages/openclaw-memory-plugin/src/tools.ts`
   - 验证对外工具名、入参、返回格式。
7. `packages/openclaw-memory-plugin/src/ui-server.ts` + `apps/memory-ui`
   - 看 UI 接口和页面字段是否一致。

---

## 4) 规划书功能对照（当前实现状态）

### 已完成

- L0/L1/L2（时间、项目）三层主链路已实现并落库。
- heartbeat 驱动的索引更新已实现（在每次 `agent_end` 后触发）。
- 意图识别 + `search_l2 -> search_l1 -> search_l0` 降级检索已实现。
- 全局事实画像（动态事实表）已实现并参与上下文注入。
- memory slot 插件化接入、工具暴露、UI 可视化已实现。

### 当前为 MVP 的部分（可继续增强）

- L1 抽取目前是规则/正则驱动（`skills/extraction-skill.ts`），不是 LLM 抽取链路。
- heartbeat 当前是“每轮结束触发”，不是严格“session 结束后单次触发”。
- 事实维度使用 `global_facts` 画像表，而不是独立 `l2_fact_indexes` 表。
- `search_l2` 目前以模糊检索为主，未单独提供“按 ID 精确拉取”的独立接口。

---

## 5) 你要改某个需求时，应该改哪里

- **改摘要质量**：`packages/memory-core/src/skills/extraction-skill.ts`
- **改时间窗口规则**：`packages/memory-core/src/indexers/l1-extractor.ts`
- **改项目状态判定**：`packages/memory-core/src/indexers/l2-builder.ts`
- **改 enough 阈值**：`packages/memory-core/src/retrieval/reasoning-loop.ts`
- **改检索打分**：`packages/memory-core/src/utils/text.ts` + `storage/sqlite.ts`
- **改工具入参/返回**：`packages/openclaw-memory-plugin/src/tools.ts`
- **改 UI 页面显示**：`apps/memory-ui/app.js` + `app.css`

---

## 6) 每次 review 后建议跑的命令

```bash
npm run build
npm run typecheck
```

如果你改了索引或检索逻辑，再做一次最小验证：

1. 在 OpenClaw 里聊 2-3 轮。
2. 打开 `http://127.0.0.1:39393/youarememory/` 看是否有新增索引。
3. 用 `memory_recall` 或 UI 的 `/api/retrieve` 验证是否走了 L2/L1/L0 降级。
