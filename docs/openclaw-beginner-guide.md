# OpenClaw 小白接入教程（YouAreMemory）

这份文档给第一次使用 OpenClaw 插件的同学。你不需要会 TypeScript，照步骤执行即可。

## 1. 推荐流程（Python-first）

先用 Python 版把 memory 功能测通，再安装 OpenClaw 插件：

1) Python UI 做本地验证（注入 L0、跑 heartbeat、跑 retrieve）  
2) 通过 parity 脚本检查 Python 与 TS 结果一致  
3) 再装 OpenClaw 插件并做最终联调

这样你不用先读 TS 代码，也能稳定迭代需求。

## 2. 这次改造后的核心思路

现在是**混合架构**：

- 插件层：负责记忆能力（L0/L1/L2、工具、SQLite、UI）
- Agent Skills 层：负责模型编排（`SKILL.md`）
- Python Lab 层：负责低门槛测试与快速回归（同一份 SQLite + 同一份 rules）

这两层都启用，效果最好。

## 3. 前置检查

```bash
node -v
openclaw --version
python3 --version
```

建议 Node.js >= 24。

## 4. 先跑 Python 测试版（推荐）

```bash
cd apps/memory-lab-py
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run streamlit_app.py
```

启动后你可以直接做四件事：

- 写入 L0
- 执行 heartbeat
- 输入 query 跑 retrieve
- 看 snapshot/l2/l1/l0/facts JSON

## 5. 安装 OpenClaw 插件

在仓库根目录执行：

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

如果你之前遇到 `Installing plugin dependencies... npm install failed`，当前版本已做单包自包含修复；也可额外自检：

```bash
cd packages/openclaw-memory-plugin
npm install --ignore-scripts
```

## 6. 配置 `~/.openclaw/openclaw.json`

把下面配置合并到你现有文件：

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
          "uiPort": 39393
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

- `plugins.entries.youarememory-openclaw.enabled=true` 是 Agent Skills 的门控条件。
- `skills.entries` 控制这两个 skill 是否启用。
- `skills.load.extraDirs` 可选，你要加载自定义 skill 时再填写目录。
- `config.skillsDir` 是插件内部策略配置目录（不是 Agent Skills 目录）。

## 7. 重启与验证

```bash
openclaw gateway restart
openclaw plugins list
openclaw plugins info youarememory-openclaw
```

再做两步验证：

1) 在 OpenClaw 里对话几轮（制造可检索数据）  
2) 打开 `http://127.0.0.1:39393/youarememory/`

能看到时间/项目/事实/会话数据即表示接入成功。

## 8. 做 Python↔TS 一致性校验（强烈建议）

先构建插件（确保 TS debug 入口可用）：

```bash
npm run build --workspace @youarememory/openclaw-memory-plugin
```

再执行：

```bash
python3 apps/memory-lab-py/scripts/parity_check.py \
  --query "我这个项目最近进展到哪里了？" \
  --db ~/.openclaw/youarememory/memory.sqlite
```

默认会对比：

- `intent`
- `enoughAt`
- 每层 top id（L2/L1/L0）

如果你要严格对比完整 ID 列表，加 `--strict`。

## 9. 常见问题

### 9.1 插件找不到

- 重新执行：`openclaw plugins install ./packages/openclaw-memory-plugin`

### 9.2 安装时报 npm install failed

- 重新执行：
  - `npm run build`
  - `openclaw plugins install ./packages/openclaw-memory-plugin`
- 仍失败则执行：
  - `cd packages/openclaw-memory-plugin && npm install --ignore-scripts`
  - 保留完整报错文本用于排查。

### 9.3 插件启用了但技能不触发

检查：

- `plugins.entries.youarememory-openclaw.enabled` 是否为 `true`
- `skills.entries.memory-orchestrator.enabled` 是否为 `true`
- `skills.entries.memory-maintenance.enabled` 是否为 `true`

然后重启 gateway。

### 9.4 UI 打不开

- 换端口（例如 `39400`），并重启 gateway。

### 9.5 回滚到默认 memory

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-core"
    }
  }
}
```

### 9.6 Python parity 脚本报错 `TS debug entry failed`

先确认你在仓库根目录跑过：

- `npm run build --workspace @youarememory/openclaw-memory-plugin`

并确认文件存在：

- `packages/openclaw-memory-plugin/scripts/debug-retrieve.mjs`

## 10. 两类技能如何改（不改 TS 代码）

### A. 改 Agent Skills（编排行为）

- `packages/openclaw-memory-plugin/agent-skills/memory-orchestrator/SKILL.md`
- `packages/openclaw-memory-plugin/agent-skills/memory-maintenance/SKILL.md`

用于改“何时调用工具、何时诊断脚本”。

### B. 改插件策略配置（抽取/检索细节）

- `packages/openclaw-memory-plugin/skills/intent-rules.json`
- `packages/openclaw-memory-plugin/skills/extraction-rules.json`
- `packages/openclaw-memory-plugin/skills/project-status-rules.json`
- `packages/openclaw-memory-plugin/skills/context-template.md`

用于改关键词、正则、状态规则、上下文模板。

改完统一执行：

```bash
npm run build
openclaw gateway restart
```
