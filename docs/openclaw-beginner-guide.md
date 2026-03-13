# OpenClaw 新手指南：每次改代码如何立刻生效

这份文档只解决一件事：**你每次改完代码后，怎么最快在 OpenClaw 里看到效果**。

项目路径默认使用你的本机目录：

`/Users/meisen/Desktop/youarememory`

---

## 0. 一次性准备（首次）

```bash
cd /Users/meisen/Desktop/youarememory
npm install
npm run build --workspace @youarememory/openclaw-memory-plugin
openclaw plugins install --link ./packages/openclaw-memory-plugin
openclaw gateway restart
openclaw plugins info youarememory-openclaw
```

### 为什么推荐 `--link`

- `--link` 会把 OpenClaw 插件直接链接到你的源码目录。
- 之后你每次改代码，**不需要重复 install 插件**，只要 build + restart 即可。

---

## 1. 先判断你现在是 `link` 还是 `copy`

```bash
openclaw plugins info youarememory-openclaw
```

看输出里的 `Install` 字段：

- `Install: link`：走下面的 **流程 A（最快）**
- `Install: path`：走下面的 **流程 B（需要重装）**

---

## 2. 每次改完代码：流程 A（推荐，link 模式）

直接复制执行：

```bash
cd /Users/meisen/Desktop/youarememory && \
npm run build --workspace @youarememory/openclaw-memory-plugin && \
openclaw gateway restart && \
open "http://127.0.0.1:39393/youarememory/"
```

> 这就是你日常最常用的一条命令。

---

## 3. 每次改完代码：流程 B（path/copy 模式）

如果你当前是 `Install: path`，每次都要重新安装插件。  
注意：`openclaw plugins install` 在插件已存在时会报 `plugin already exists`，所以要先卸载再安装。

```bash
cd /Users/meisen/Desktop/youarememory && \
npm run build --workspace @youarememory/openclaw-memory-plugin && \
openclaw plugins uninstall youarememory-openclaw --force && \
openclaw plugins install ./packages/openclaw-memory-plugin && \
openclaw gateway restart && \
open "http://127.0.0.1:39393/youarememory/"
```

---

## 4. 一次性切换到最快模式（path -> link）

只做一次，之后就能使用“流程 A”：

```bash
cd /Users/meisen/Desktop/youarememory && \
openclaw plugins uninstall youarememory-openclaw --force && \
openclaw plugins install --link ./packages/openclaw-memory-plugin && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw
```

---

## 5. 改不同文件时怎么做

- 改 `packages/openclaw-memory-plugin/ui-source/*`（前端页面）：
  - 先执行流程 A/B 里的 build 命令。
  - 打开页面后如果样式没刷新，浏览器强刷（Mac：`Cmd + Shift + R`）。
- 改 `packages/openclaw-memory-plugin/src/*`（插件逻辑）：
  - 一定要 build + gateway restart（流程 A/B 已包含）。

---

## 6. 30 秒自检（看是否真的生效）

```bash
openclaw plugins info youarememory-openclaw
openclaw gateway status
```

检查点：

- `Status: loaded`
- `Source` 指向你期望的插件位置
- UI 可访问：`http://127.0.0.1:39393/youarememory/`

如果看到 `Error: memory slot set to "memory-core"`，说明记忆槽位被别的插件占用了，执行下面“故障恢复”。

---

## 7. 常用补充命令

```bash
# 仅构建插件（最快）
npm run build --workspace @youarememory/openclaw-memory-plugin

# 全项目类型检查
npm run typecheck

# 调试检索结果
npm run debug:retrieve --workspace @youarememory/openclaw-memory-plugin -- --query "项目进展"
```

---

## 8. 故障恢复（直接复制）

### 情况 A：出现 `plugin already exists`

```bash
cd /Users/meisen/Desktop/youarememory && \
openclaw plugins uninstall youarememory-openclaw --force && \
openclaw plugins install --link ./packages/openclaw-memory-plugin && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw
```

### 情况 B：出现 `Error: memory slot set to "memory-core"`

```bash
openclaw config set plugins.slots.memory '"youarememory-openclaw"' && \
openclaw plugins enable youarememory-openclaw && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw
```

---

如果你想再省一步，我可以下一步帮你加一个根目录脚本（例如 `npm run apply:openclaw`），以后你只敲一条 npm 命令就能完成 build + restart + 打开页面。  
