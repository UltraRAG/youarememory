# OpenClaw 小白接入教程（YouAreMemory）

这份文档面向第一次接触插件配置的用户。你不需要懂 TypeScript，只需要按步骤复制命令即可。

## 1. 你会得到什么

完成后你将得到：

- 自动记录对话（L0）
- 自动抽取结构化记忆（L1）
- 自动生成时间/项目索引（L2）
- 检索时自动走 `L2 -> L1 -> L0`
- 一个可视化页面查看记忆效果

## 2. 前置条件

执行以下命令确认环境：

```bash
node -v
openclaw --version
```

建议 Node.js 版本 >= 24。

## 3. 一次性安装

在仓库根目录执行：

```bash
npm install
npm run build
openclaw plugins install ./packages/openclaw-memory-plugin
```

## 4. 修改 OpenClaw 配置

编辑文件：

- `~/.openclaw/openclaw.json`

把以下内容加入或合并进去：

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
          "uiEnabled": true,
          "uiPort": 39393
        }
      }
    }
  }
}
```

> 如果你原来已经有 `plugins` 配置，不要整段覆盖，合并键值即可。

## 5. 重启并验证

```bash
openclaw gateway restart
openclaw plugins list
openclaw plugins info youarememory-openclaw
```

然后在 OpenClaw 里聊几轮，打开浏览器：

- `http://127.0.0.1:39393/youarememory/`

如果页面有数据，说明已经成功接入。

## 6. 常见报错处理

### 报错：插件没找到

- 再执行一次安装命令：
  - `openclaw plugins install ./packages/openclaw-memory-plugin`

### 报错：端口被占用

- 在 `openclaw.json` 里把 `uiPort` 换成别的，比如 `39400`
- 重启 gateway

### 报错：没有注入记忆

- 确认配置里 `hooks.allowPromptInjection` 为 `true`
- 确认 `recallEnabled` 为 `true`
- 多对话几轮后再测，首次对话数据较少

## 7. 回滚（恢复默认 memory-core）

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

然后重启：

```bash
openclaw gateway restart
```
