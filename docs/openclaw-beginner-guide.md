# OpenClaw 插件开发教程（安装 + 开发 + 快速应用）

这份文档覆盖完整流程：

1. 首次安装（从零可用）
2. 日常代码开发
3. 每次改完如何快速应用最新版本
4. 常见报错的一键修复

默认项目目录（按你的机器）：

`/Users/meisen/Desktop/youarememory`

---

## 0) 先复制这个环境变量（后续命令都可直接用）

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory"
```

---

## 1) 首次安装（从零到可用）

> 这段命令可反复执行，适合第一次安装或彻底重装。

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
npm install && \
npm run build --workspace @youarememory/openclaw-memory-plugin && \
(openclaw plugins uninstall youarememory-openclaw --force || true) && \
rm -rf "/Users/meisen/.openclaw/extensions/youarememory-openclaw" && \
openclaw plugins install --link ./packages/openclaw-memory-plugin && \
openclaw config set plugins.slots.memory '"youarememory-openclaw"' && \
openclaw plugins enable youarememory-openclaw && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw && \
open "http://127.0.0.1:39393/youarememory/?v=first-install"
```

安装后你应该看到：

- `openclaw plugins info youarememory-openclaw` 里 `Status: loaded`
- 页面可打开：`http://127.0.0.1:39393/youarememory/`

---

## 2) 日常开发（推荐工作流）

### 2.1 代码位置速览

- 插件逻辑（TS）：`packages/openclaw-memory-plugin/src`
- UI 页面（HTML/JS/CSS）：`packages/openclaw-memory-plugin/ui-source`
- 构建产物：`packages/openclaw-memory-plugin/dist`

### 2.2 日常改代码推荐流程

1. 改代码（`src` 或 `ui-source`）
2. 执行“快速应用命令”（下一节）
3. 浏览器打开带版本参数的 URL（防缓存）

---

## 3) 每次改完后快速应用最新版本（最常用）

> 这是你最常用的一条命令，直接复制即可。

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
npm run build --workspace @youarememory/openclaw-memory-plugin && \
openclaw config set plugins.slots.memory '"youarememory-openclaw"' && \
openclaw plugins enable youarememory-openclaw && \
openclaw gateway restart && \
open "http://127.0.0.1:39393/youarememory/?v=$(date +%s)"
```

说明：

- `npm run build --workspace ...` 会同时做 TS 构建 + 把 `ui-source` 复制到 `dist/ui`
- 带 `?v=时间戳` 是为了强制浏览器拉取最新页面，避免你看到旧缓存

---

## 4) 开发时的两个实用模式

### 模式 A：稳妥模式（推荐）

- 每次改完就执行第 3 节的一条命令
- 好处：最稳定，不会漏步骤

### 模式 B：TS 监听模式（仅加速 TS 编译）

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
npm run dev:plugin
```

注意：

- 这个监听只负责 TS 编译
- 如果你改的是 `ui-source/*`，仍然需要再执行一次 `npm run build --workspace @youarememory/openclaw-memory-plugin`（因为要复制 UI 资源）

---

## 5) 30 秒验证（确认真的生效）

```bash
openclaw plugins info youarememory-openclaw
openclaw gateway status
python - <<'PY'
import urllib.request
html = urllib.request.urlopen("http://127.0.0.1:39393/youarememory/?v=check", timeout=5).read().decode("utf-8", "ignore")
print("new-ui-marker:", "索引浏览" in html)
PY
```

检查点：

- `Status: loaded`
- `new-ui-marker: True`

---

## 6) 常见问题一键修复

### 6.1 报错：`plugin already exists`

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
(openclaw plugins uninstall youarememory-openclaw --force || true) && \
rm -rf "/Users/meisen/.openclaw/extensions/youarememory-openclaw" && \
openclaw plugins install --link ./packages/openclaw-memory-plugin && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw
```

### 6.2 报错：`Error: memory slot set to "memory-core"`

```bash
openclaw config set plugins.slots.memory '"youarememory-openclaw"' && \
openclaw plugins enable youarememory-openclaw && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw
```

### 6.3 页面还是旧版（明明你改了 UI）

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
npm run build --workspace @youarememory/openclaw-memory-plugin && \
openclaw gateway restart && \
open "http://127.0.0.1:39393/youarememory/?v=$(date +%s)"
```

如果还不对，再手动强刷浏览器（Mac）：`Cmd + Shift + R`。

---

## 7) 复制即用命令清单（速查）

```bash
# A. 从零安装
export YAM_HOME="/Users/meisen/Desktop/youarememory" && cd "$YAM_HOME" && npm install && npm run build --workspace @youarememory/openclaw-memory-plugin && (openclaw plugins uninstall youarememory-openclaw --force || true) && rm -rf "/Users/meisen/.openclaw/extensions/youarememory-openclaw" && openclaw plugins install --link ./packages/openclaw-memory-plugin && openclaw config set plugins.slots.memory '"youarememory-openclaw"' && openclaw plugins enable youarememory-openclaw && openclaw gateway restart && openclaw plugins info youarememory-openclaw && open "http://127.0.0.1:39393/youarememory/?v=first-install"

# B. 每次改完快速应用（日常）
export YAM_HOME="/Users/meisen/Desktop/youarememory" && cd "$YAM_HOME" && npm run build --workspace @youarememory/openclaw-memory-plugin && openclaw config set plugins.slots.memory '"youarememory-openclaw"' && openclaw plugins enable youarememory-openclaw && openclaw gateway restart && open "http://127.0.0.1:39393/youarememory/?v=$(date +%s)"

# C. 查看当前插件状态
openclaw plugins info youarememory-openclaw
```
