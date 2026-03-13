# YouAreMemory OpenClaw 插件

`@youarememory/youarememory-openclaw` 是一个 `kind: "memory"` 的 OpenClaw 插件，负责自动采集对话、构建多级索引、注入记忆上下文，并提供本地只读控制台。

## 能力概览

- 采集完整 session 并写入 `L0`
- 按 session-window 聚合多个 `L0` 后，再构建 `L1`、`L2` 与 `GlobalFactRecord`
- 在 `before_prompt_build` / `before_agent_start` 自动注入记忆上下文
- 提供工具：
  - `memory_recall`
  - `memory_store`
  - `memory_search`
  - `search_l2` / `search_l1` / `search_l0`
- 提供极简数据面板风格看板

## 安装

在仓库根目录执行：

```bash
npm install
npm run relink:memory-plugin
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
          "captureStrategy": "full_session",
          "includeAssistant": true,
          "maxMessageChars": 6000,
          "heartbeatBatchSize": 30,
          "autoIndexIntervalMinutes": 60,
          "l1WindowMode": "time",
          "l1WindowMinutes": 120,
          "l1WindowMaxL0": 8,
          "l2TimeGranularity": "day",
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

配置说明：

- `captureStrategy` 仍保留 `full_session` 兜底，但日常索引会把连续的 `L0` 合并成 session-window 再建 `L1`
- `autoIndexIntervalMinutes` 控制定时索引，默认每 60 分钟自动构建一次
- `l1WindowMode` 规定 `L1` 按时间还是按条数切窗，二选一
- `l1WindowMinutes` 仅在 `l1WindowMode = "time"` 时生效
- `l1WindowMaxL0` 仅在 `l1WindowMode = "count"` 时生效
- `l2TimeGranularity` 支持 `day / half_day / hour`
- 动态事实现在写入单例 `global_fact_record`，旧版多行 `global_facts` 不会自动迁移

## UI

启用 `uiEnabled=true` 后可访问：

- `http://127.0.0.1:39393/youarememory/`

看板包含：

- 左侧：层级导航
- 中间：状态、概览指标、记录流
- 右侧抽屉：设置、检索调试、记录详情

## 调试命令

```bash
npm run debug:retrieve --workspace @youarememory/youarememory-openclaw -- --query "项目进展"
```
