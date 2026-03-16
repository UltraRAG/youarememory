# YouAreMemory 设计说明（中文）

这份文档回答四个核心问题：

1. 项目为什么采用“plugin 优先 + skills 配置化”
2. `indexed`、`createdAt`、`updatedAt`、`source` 分别做什么
3. L0、L1、L2 与 `GlobalProfileRecord` 的最终数据结构长什么样
4. 索引构建与推理链路如何工作

---

## 1. 项目简介

YouAreMemory 通过多级索引升级 OpenClaw 的记忆机制，目标是保持 OpenClaw 即插即用：

- 自动采集对话
- 自动构建多层索引
- 自动注入检索上下文
- 可视化查看当前记忆状态

技术路线：

- `TypeScript`
- `skills` 作为规则与编排层
- 独立开源项目
- UI 采用极简数据面板风格看板

---

## 2. 为什么不是 skills-only

这个项目不能只靠 `skills` 达到“即插即用”。

原因：

- `skills` 不能稳定接管 OpenClaw 生命周期事件
- 自动采集 L0 需要监听 `agent_end`
- 自动注入记忆上下文需要挂在 `before_prompt_build`
- 工具注册和本地 UI 服务也依赖 plugin runtime

因此当前推荐形态是：

- `plugin`：负责生命周期 hook、数据存储、检索工具、本地 UI
- `skills`：负责抽取规则、意图规则、项目状态规则、agent 编排

---

## 3. 字段语义说明

### `indexed`

只出现在 `L0SessionRecord`。

作用：

- 标记这条 L0 是否已经被 heartbeat 消费过
- `false` 表示还没生成 L1/L2/GlobalProfile
- `true` 表示已经完成上层索引构建

为什么需要：

- 避免 heartbeat 重复处理同一条原始会话
- 便于排查“为什么这条会话还没进入检索层”

### `createdAt`

表示“这条记录首次进入存储”的时间。

适用场景：

- L0：原始会话首次落库
- L1：结构化窗口首次生成
- L2：某个时间/项目聚合索引首次出现
- GlobalProfile：单例画像首次创建

### `updatedAt`

只用于会持续被覆盖聚合的数据。

适用场景：

- `L2TimeIndexRecord`
- `L2ProjectIndexRecord`
- `FactCandidate`
- `GlobalProfileRecord`

含义：

- 最近一次被新的 L1 / fact 合并更新的时间

### `source`

只保留在 `L0SessionRecord`。

作用：

- 标记这条原始会话来自哪里
- 便于区分自动采集、脚本导入、未来外部接入

典型值：

- `openclaw`
- `skill`
- `import`

为什么 L0 需要 `source: string`

- L0 是所有上层索引的根数据
- 一旦抽取结果异常，排障时需要先知道原始数据来源
- 后续如果接入历史导入、人工补录、外部同步，也能复用同一套 L0 结构

---

## 4. 数据结构总览

约束：

- `L0`、`L1`、`L2` 都是列表型结构
- `GlobalProfileRecord` 是单例，全局只维护一份，会被不断覆盖更新

### 4.1 L0SessionRecord

```jsonc
{
  // L0 唯一索引 ID
  // 例：session_5f8a9b2c_raw
  "l0IndexId": "session_5f8a9b2c_raw",

  // OpenClaw 会话键，用于把同一 session 的多次采集串起来
  // 例：session-1741673212
  "sessionKey": "session-1741673212",

  // 会话时间戳
  // 例：2026-03-11T16:54:17+09:00
  "timestamp": "2026-03-11T16:54:17+09:00",

  // 原始消息列表
  "messages": [
    {
      // 上游消息 ID，可选
      "msgId": "m1",
      // 角色
      "role": "user",
      // 消息正文
      "content": "这个记忆系统最近进展到哪一步了？"
    },
    {
      "msgId": "m2",
      "role": "assistant",
      "content": "我先从 L2 项目索引开始帮你看。"
    }
  ],

  // 数据来源
  // 例：openclaw / skill / import
  "source": "openclaw",

  // 是否已经被 heartbeat 消费
  "indexed": true,

  // 首次落库时间
  "createdAt": "2026-03-11T07:54:18.121Z"
}
```

### 4.2 L1WindowRecord

```jsonc
{
  // L1 唯一索引 ID
  "l1IndexId": "l1_g325gsa",

  // 该窗口属于哪个 session
  "sessionKey": "session-1741673212",

  // 时间窗口
  "timePeriod": "2026-03-11 16:00-17:42",

  // 窗口起止时间
  "startedAt": "2026-03-11T16:00:00+08:00",
  "endedAt": "2026-03-11T17:42:00+08:00",

  // 窗口摘要
  "summary": "用户在调整 OpenClaw 记忆分层设计，并讨论 UI 改版。",

  // 从窗口中抽取出的事实候选
  "facts": [
    {
      "factKey": "project:openclaw",
      "factValue": "OpenClaw",
      "confidence": 0.78
    }
  ],

  // 用户所处情景和时间信息
  "situationTimeInfo": "2026-03-11 16:54 用户正在推进：改造记忆系统。",

  // 推测出的项目标签
  "projectTags": ["OpenClaw", "UltraRAG"],

  // 组成该窗口的 L0 来源
  "l0Source": ["session_5f8a9b2c_raw", "session_8cb23ca_raw"],

  // 首次落库时间
  "createdAt": "2026-03-11T07:54:18.456Z"
}
```

### 4.3 L2TimeIndexRecord

```jsonc
{
  // L2 唯一索引 ID
  "l2IndexId": "time_afs32r2r",

  // 日期键
  "dateKey": "2026-03-11",

  // 当天聚合摘要
  "summary": "这一天用户主要在改造 OpenClaw 记忆检索链路和可视化看板。",

  // 组成该日期索引的 L1 ID 列表
  "l1Source": ["l1_g325gsa", "l1_b91ced2"],

  // 首次创建时间
  "createdAt": "2026-03-11T07:54:18.700Z",

  // 最近一次聚合更新时间
  "updatedAt": "2026-03-11T09:10:41.003Z"
}
```

### 4.4 L2ProjectIndexRecord

```jsonc
{
  // L2 唯一索引 ID
  "l2IndexId": "project_afs32r2r",

  // 项目名称
  "projectName": "UltraRAG",

  // 项目简介或聚合摘要
  "summary": "UltraRAG：用户正在推进多级记忆接入。",

  // 当前状态
  "currentStatus": "in_progress",

  // 最新进展
  "latestProgress": "2026-03-11 16:54 用户正在推进：改造记忆系统。",

  // 组成该项目索引的 L1 ID 列表
  "l1Source": ["l1_g325gsa"],

  // 首次创建时间
  "createdAt": "2026-03-11T07:54:18.902Z",

  // 最近一次更新时间
  "updatedAt": "2026-03-11T09:10:41.003Z"
}
```

### 4.5 GlobalProfileRecord（单例）

```jsonc
{
  // 固定单例 ID，永远只有一条
  "recordId": "global_profile_record",

  // 当前全局画像摘要
  "profileText": "用户正在推进 OpenClaw 记忆插件开发，偏好中文交流，长期关注论文写作和产品化落地。",

  // 这份画像主要由哪些 L1 窗口重写出来
  "sourceL1Ids": ["l1_g325gsa", "l1_8ad31c"],

  // 单例画像首次创建时间
  "createdAt": "2026-03-11T07:54:18.990Z",

  // 单例画像最近一次更新时间
  "updatedAt": "2026-03-11T09:10:41.003Z"
}
```

注意：

- `profileText` 是一段会持续被重写的稳定画像摘要
- `sourceL1Ids` 表示这份画像主要参考了哪些 `L1`
- 现在只维护一份单例画像

---

## 5. 索引构建过程

当前实现不是按时间窗切 `L1`，而是按话题闭合来构建：

1. 每轮对话先落一条 `L0`
2. 同一 session 的新增 `L0` 会进入空闲队列，而不是立刻同步建索引
3. 当用户空闲达到 debounce 时间、切到新 session、手动点击“立即构建”或定时任务触发时，开始消费待处理 `L0`
4. 先读取当前 session 的 `active_topic_buffers`
5. 只基于当前区间内的用户消息做话题转变判断
6. 如果话题未变，就把新的 `L0` 并入当前开放话题
7. 如果话题已闭合，就基于上一个话题窗口内的全部 `L0` 构建一个正式 `L1`
8. 每次新 `L1` 生成后：
   - 更新当日 `L2Time`
   - 更新或归并 `L2Project`
   - 重写单例 `GlobalProfileRecord`
9. 被消费过的 `L0` 会标记为 `indexed = true`

当前支持三种触发索引构建的方式：

- 定时触发：`autoIndexIntervalMinutes`
- 新 session 边界触发：用户切到新对话后，旧 session 的开放话题会被立即消费
- 看板手动触发：点击“立即构建”
- reset 边界触发：`before_reset` 会对当前 session 做 best-effort flush

当前默认采集策略：

- `captureStrategy = "full_session"`
- `autoIndexIntervalMinutes = 60`
- `indexIdleDebounceMs = 2500`
- `recallBudgetMs = 700`
- `fastRecallFallbackEnabled = true`

原因：

- 更符合 L0“原始对话日志”的设计定义
- 话题闭合比时间窗更接近真实记忆单元
- 空闲后再索引可以减少回答路径阻塞

`last_turn` 仍保留，但仅作为轻量模式。

---

## 6. 推理过程

典型伪代码：

```text
while true:
  1. 识别用户问题意图
  2. 调用 search_l2
  3. 如果 L2 足够回答，则结束
  4. 否则调用 search_l1
  5. 如果 L1 足够回答，则结束
  6. 否则调用 search_l0
  7. 输出最终上下文
```

当前实现里：

- 时间问题优先命中 `L2Time`
- 项目问题优先命中 `L2Project`
- 检索阶段会额外参考 `GlobalProfileRecord` 中的稳定画像

---

## 7. 升级说明

新版已经把全局画像切换到单例 `global_profile_record`：

- 旧版 `global_facts` 不再作为主读取来源
- 当前版本不提供自动迁移脚本
- 如果你本地已经有旧数据，建议清空后重新建立索引

推荐做法：

1. 升级插件
2. 打开本地看板
3. 使用“清空并重建”
4. 让后续对话重新生成新的 L0/L1/L2/GlobalProfile
