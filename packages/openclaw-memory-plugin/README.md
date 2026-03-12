# YouAreMemory OpenClaw Plugin

`@youarememory/openclaw-memory-plugin` 是一个 `kind: "memory"` 的 OpenClaw 插件，采用**混合架构**：

- 插件提供能力：`L0/L1/L2` 持久化、检索工具、UI API
- Agent Skills 提供编排：`SKILL.md` 决定何时调用工具、何时走诊断脚本

当前包为**单包自包含**，`openclaw plugins install` 不依赖私有 workspace 运行时包。

---

## 0. 两类 skills（先分清）

这个项目里有两种“skills”，职责不同：

1) **Agent Skills（给大模型）**
- 目录：`agent-skills/*/SKILL.md`
- 作用：任务编排（例如先 `memory_recall`，不足再 `search_l2/l1/l0`）
- 示例：
  - `agent-skills/memory-orchestrator/SKILL.md`
  - `agent-skills/memory-maintenance/SKILL.md`

2) **插件内部策略配置（给插件逻辑）**
- 目录：`skills/*.json|md`
- 作用：规则驱动（意图关键词、抽取规则、项目状态规则、上下文模板）
- 示例：
  - `skills/intent-rules.json`
  - `skills/extraction-rules.json`
  - `skills/project-status-rules.json`
  - `skills/context-template.md`

---

## 1. 快速安装（小白照抄）

### 1.1 环境检查

```bash
node -v
openclaw --version
```

建议 Node.js >= 24。

### 1.2 构建与安装

在仓库根目录执行：

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

### 1.3 配置 `~/.openclaw/openclaw.json`

至少合并以下字段（按你现有配置做 merge）：

```json
{
  "plugins": {
    "slots": {
      "memory": "youarememory-openclaw"
    },
    "entries": {
      "youarememory-openclaw": {
        "enabled": true,
        "hooks": {
          "allowPromptInjection": true
        },
        "config": {
          "captureStrategy": "last_turn",
          "includeAssistant": true,
          "maxMessageChars": 6000,
          "heartbeatBatchSize": 30,
          "recallEnabled": true,
          "addEnabled": true,
          "skillsDir": "",
          "uiEnabled": true,
          "uiHost": "127.0.0.1",
          "uiPort": 39393,
          "uiPathPrefix": "/youarememory"
        }
      }
    }
  },
  "skills": {
    "entries": {
      "memory-orchestrator": {
        "enabled": true
      },
      "memory-maintenance": {
        "enabled": true
      }
    },
    "load": {
      "extraDirs": []
    }
  }
}
```

说明：

- `plugins.entries.youarememory-openclaw.enabled=true` 是这两个 Agent Skill 的门控条件。
- `skills.entries` 用于显式开关 skill。
- `skills.load.extraDirs` 可选，用来加载你自己的外部 skill 目录。

### 1.4 重启与验证

```bash
openclaw gateway restart
openclaw plugins list
openclaw plugins info youarememory-openclaw
```

然后对话几轮，访问：

- `http://127.0.0.1:39393/youarememory/`

---

## 2. 默认行为（插件能力层）

- `agent_end`：写入 `L0`，触发 heartbeat 构建 `L1/L2 + global facts`
- `before_prompt_build`（兼容 `before_agent_start`）：检索并注入记忆上下文
- 工具集合：
  - `memory_recall`
  - `memory_store`
  - `memory_search`（兼容别名）
  - `search_l2` / `search_l1` / `search_l0`

---

## 3. Agent Skills（编排层）

### `memory-orchestrator`

- 目标：用户问历史、时间线、项目进展、画像事实时，优先走工具
- 主路径：`memory_recall` -> 不足时回退 `search_l2/l1/l0`

### `memory-maintenance`

- 目标：安装异常、索引异常、质量排查
- mixed mode：先工具验证，再脚本诊断
- 诊断脚本：
  - `agent-skills/memory-maintenance/scripts/inspect-indexes.mjs`
  - `agent-skills/memory-maintenance/scripts/recent-sessions.mjs`

---

## 4. UI 与 API

启用 `uiEnabled=true` 后会启动本地只读服务。

- 默认地址：`http://127.0.0.1:39393/youarememory/`
- API：
  - `/youarememory/api/snapshot`
  - `/youarememory/api/l2/time`
  - `/youarememory/api/l2/project`
  - `/youarememory/api/l1`
  - `/youarememory/api/l0`
  - `/youarememory/api/facts`
  - `/youarememory/api/retrieve`

---

## 5. 插件配置项（全部可选）

| Key | 默认值 | 说明 |
| --- | --- | --- |
| `dataDir` | `~/.openclaw/youarememory` | 数据目录 |
| `dbPath` | `<dataDir>/memory.sqlite` | SQLite 路径（优先级高于 `dataDir`） |
| `captureStrategy` | `last_turn` | `last_turn` 或 `full_session` |
| `includeAssistant` | `true` | 是否写入 assistant 消息 |
| `maxMessageChars` | `6000` | 单条消息最大字符数 |
| `heartbeatBatchSize` | `30` | 每次 heartbeat 处理的 L0 批大小 |
| `recallEnabled` | `true` | 是否注入检索上下文 |
| `addEnabled` | `true` | 是否采集会话并构建索引 |
| `skillsDir` | 空（使用插件内置策略配置） | 覆盖 `skills/*.json|md` 的绝对路径 |
| `uiEnabled` | `true` | 是否启用本地 UI |
| `uiHost` | `127.0.0.1` | UI 服务监听地址 |
| `uiPort` | `39393` | UI 服务端口 |
| `uiPathPrefix` | `/youarememory` | UI 路由前缀 |

---

## 6. 常见问题

### 6.1 安装时报 `Installing plugin dependencies... npm install failed`

- 先拉最新代码后执行：
  - `npm run build`
  - `openclaw plugins install ./packages/openclaw-memory-plugin`
- 如需自检：
  - `cd packages/openclaw-memory-plugin`
  - `npm install --ignore-scripts`

### 6.2 插件装了但技能不触发

检查三项：

- `plugins.entries.youarememory-openclaw.enabled` 是否为 `true`
- `skills.entries.memory-orchestrator.enabled` 是否为 `true`
- `skills.entries.memory-maintenance.enabled` 是否为 `true`

然后重启 gateway。

### 6.3 UI 打不开

- 调整 `uiPort`（例如 `39400`）并重启 gateway

### 6.4 回退到 OpenClaw 默认 memory

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-core"
    }
  }
}
```

---

## 7. 不改 TS 代码也可调策略

只改以下文件即可调整抽取/检索策略：

- `skills/intent-rules.json`
- `skills/extraction-rules.json`
- `skills/project-status-rules.json`
- `skills/context-template.md`

改完后：

```bash
npm run build
openclaw gateway restart
```
