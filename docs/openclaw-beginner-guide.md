# OpenClaw 新手接入指南（纯插件版）

本文档只覆盖 OpenClaw 插件接入流程。

## 1. 准备环境

```bash
node -v
openclaw --version
```

建议 Node.js >= 24。

## 2. 安装插件

在仓库根目录执行：

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

## 3. 配置 OpenClaw

编辑 `~/.openclaw/openclaw.json`，至少保证如下内容：

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

## 4. 重启验证

```bash
openclaw gateway restart
openclaw plugins list
openclaw plugins info youarememory-openclaw
```

## 5. 使用与调试

- 对话几轮后访问 UI：
  - `http://127.0.0.1:39393/youarememory/`
- 命令行调试检索：

```bash
npm run debug:retrieve --workspace @youarememory/openclaw-memory-plugin -- --query "项目进展"
```
