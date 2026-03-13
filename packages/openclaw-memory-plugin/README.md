# YouAreMemory OpenClaw 插件

`@youarememory/openclaw-memory-plugin` 是一个 `kind: "memory"` 的 OpenClaw 插件，负责自动采集对话、构建多级索引、注入记忆上下文，并提供本地只读控制台。

## 能力概览

- 采集完整 session 并写入 `L0`
- heartbeat 构建 `L1`、`L2` 与 `GlobalFactRecord`
- 在 `before_prompt_build` / `before_agent_start` 自动注入记忆上下文
- 提供工具：
  - `memory_recall`
  - `memory_store`
  - `memory_search`
  - `search_l2` / `search_l1` / `search_l0`
- 提供 ChatGPT 风格三栏看板

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
          "captureStrategy": "full_session",
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

配置说明：

- `captureStrategy` 默认推荐 `full_session`，与 L0 “原始对话日志”定义一致
- `last_turn` 仍可保留为轻量模式，但不再是默认
- 动态事实现在写入单例 `global_fact_record`，旧版多行 `global_facts` 不会自动迁移

## UI

启用 `uiEnabled=true` 后可访问：

- `http://127.0.0.1:39393/youarememory/`

看板包含：

- 左侧：导航、总览指标、重建操作
- 中间：检索输入、推理轨迹、当前层级记录流
- 右侧：所选记录详情与关联来源

## 调试命令

```bash
npm run debug:retrieve --workspace @youarememory/openclaw-memory-plugin -- --query "项目进展"
```
