# YouAreMemory OpenClaw Plugin

`@youarememory/openclaw-memory-plugin` 是一个 `kind: "memory"` 的 OpenClaw 主记忆插件。

它实现了：

- `L0` 原始会话日志（SQLite）
- `L1` 结构化会话窗口（摘要、事实、情景、项目标签）
- `L2` 时间/项目索引
- `L2 -> L1 -> L0` 逐级检索推理
- Memos 风格本地只读 UI

---

## 给小白的最快路径（照抄即可）

### 第 0 步：确认环境

```bash
node -v
openclaw --version
```

建议：

- Node.js >= 24
- 已可正常运行 OpenClaw

### 第 1 步：构建插件

在项目根目录执行：

```bash
npm install
npm run build
```

### 第 2 步：安装插件到 OpenClaw

```bash
openclaw plugins install ./packages/openclaw-memory-plugin
```

### 第 3 步：修改 `~/.openclaw/openclaw.json`

把 `memory` 插槽切换到 `youarememory-openclaw`。

可直接使用下面模板（如果你已有其他配置，只合并 `plugins` 相关部分）：

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
          "uiEnabled": true,
          "uiHost": "127.0.0.1",
          "uiPort": 39393,
          "uiPathPrefix": "/youarememory"
        }
      }
    }
  }
}
```

### 第 4 步：重启 OpenClaw gateway

```bash
openclaw gateway restart
```

### 第 5 步：验证是否生效

```bash
openclaw plugins list
openclaw plugins info youarememory-openclaw
```

然后在 OpenClaw 里连续对话几轮，访问：

- `http://127.0.0.1:39393/youarememory/`

如果能看到时间索引、项目索引、事实画像和会话列表，说明已成功。

---

## 插件默认行为

- `agent_end`：写入 L0，并触发 heartbeat 构建 L1/L2 与动态事实画像。
- `before_prompt_build`（兼容 `before_agent_start`）：按意图检索并注入记忆上下文。
- 对外工具：
  - `memory_recall`
  - `memory_store`
  - `memory_search`（兼容别名）
  - `search_l2` / `search_l1` / `search_l0`

---

## UI 与 API

启用 `uiEnabled=true` 后会启动本地只读服务。

- 默认地址：`http://127.0.0.1:39393/youarememory/`

API：

- `/youarememory/api/snapshot`
- `/youarememory/api/l2/time`
- `/youarememory/api/l2/project`
- `/youarememory/api/l1`
- `/youarememory/api/l0`
- `/youarememory/api/facts`
- `/youarememory/api/retrieve`

---

## 配置项（全部可选）

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
| `uiEnabled` | `true` | 是否启用本地 UI |
| `uiHost` | `127.0.0.1` | UI 服务监听地址 |
| `uiPort` | `39393` | UI 服务端口 |
| `uiPathPrefix` | `/youarememory` | UI 路由前缀 |

---

## 常见问题（小白高频）

### 1) `openclaw plugins install` 报路径错误

- 确认你在项目根目录执行命令。
- 路径应是：`./packages/openclaw-memory-plugin`

### 2) 插件装了但没有生效

检查两点：

- `plugins.slots.memory` 是否是 `youarememory-openclaw`
- `plugins.entries.youarememory-openclaw.enabled` 是否是 `true`

改完后重启：

```bash
openclaw gateway restart
```

### 3) UI 打不开

- 检查端口是否占用，换个端口如 `39400`
- 对应修改 `uiPort` 后重启 gateway

### 4) 想回退到 OpenClaw 默认记忆

把 `plugins.slots.memory` 改回：

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-core"
    }
  }
}
```

保存并重启 gateway 即可。
