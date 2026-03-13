# YouAreMemory OpenClaw 插件

`@youarememory/openclaw-memory-plugin` 是 `kind: "memory"` 的 OpenClaw 插件。

## 能力概览

- 采集会话并写入 `L0`
- heartbeat 构建 `L1/L2 + global facts`
- 在 `before_prompt_build` 注入记忆上下文
- 提供工具：
  - `memory_recall`
  - `memory_store`
  - `memory_search`
  - `search_l2` / `search_l1` / `search_l0`

## 安装

在仓库根目录执行：

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

## OpenClaw 配置

在 `~/.openclaw/openclaw.json` 中启用本插件：

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
    }
  }
}
```

重启并验证：

```bash
openclaw gateway restart
openclaw plugins list
```

## UI

启用 `uiEnabled=true` 后可访问：

- `http://127.0.0.1:39393/youarememory/`

## 调试命令

```bash
npm run debug:retrieve --workspace @youarememory/openclaw-memory-plugin -- --query "项目进展"
```
