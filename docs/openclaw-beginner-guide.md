# OpenClaw 插件开发教程（安装 + 开发 + ChatGPT 风格看板）

这份文档覆盖完整流程：

1. 首次安装（从零可用）
2. 日常代码开发
3. 每次改完如何快速应用最新版本
4. 如何处理新版 `GlobalFactRecord` 的重建
5. 常见报错的一键修复

默认项目目录：

`/Users/meisen/Desktop/youarememory`

---

## 0) 先复制这个环境变量

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory"
```

---

## 1) 首次安装（从零到可用）

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
- 看板左侧出现 `L1 窗口 / L2 项目 / L2 时间 / L0 会话 / 全局画像`

---

## 2) 日常开发（推荐工作流）

### 2.1 代码位置速览

- 插件逻辑（TS）：`packages/openclaw-memory-plugin/src`
- UI 页面（HTML/JS/CSS）：`packages/openclaw-memory-plugin/ui-source`
- 构建产物：`packages/openclaw-memory-plugin/dist`
- 中文设计文档：`docs/memory-design.md`

### 2.2 日常改代码推荐流程

1. 改代码（`src` 或 `ui-source`）
2. 执行“快速应用命令”
3. 浏览器打开带版本参数的 URL（防缓存）
4. 如果改动涉及事实结构或旧数据，使用看板里的“清空并重建”

---

## 3) 每次改完后快速应用最新版本

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
- `?v=时间戳` 用来强制浏览器拉取最新页面

---

## 4) 新版数据结构的使用注意

当前版本已经切换到：

- `captureStrategy = full_session` 默认
- `GlobalFactRecord` 单例模型
- `L1` 改为 session-window 聚合，不再对每条 `L0` 直接生成一个 `L1`
- 索引触发支持：定时、切换到新 session、看板“立即构建”

这意味着：

- L0 默认保存完整 session，而不是只保存最后一轮
- 动态事实不再是一条 fact 一行，而是写入单例 `global_fact_record`
- 旧版 `global_facts` 不会自动迁移到新单例
- 看板里可以直接设置自动构建间隔、`L1` 切窗模式（时间或条数二选一）和 `L2` 时间粒度

### 推荐重建流程

如果你本地已经跑过旧版插件，升级后建议：

1. 打开看板
2. 点击左侧 `清空并重建`
3. 继续正常对话，让新的 L0/L1/L2/GlobalFact 重新建立

---

## 5) 开发时的两个实用模式

### 模式 A：稳妥模式（推荐）

- 每次改完都执行第 3 节的命令
- 最稳定，不容易漏步骤

### 模式 B：TS 监听模式（仅加速 TS 编译）

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
npm run dev:plugin
```

注意：

- 这个监听只负责 TS 编译
- 如果你改的是 `ui-source/*`，仍然需要再执行一次 `npm run build --workspace @youarememory/openclaw-memory-plugin`

---

## 6) 30 秒验证（确认真的生效）

```bash
openclaw plugins info youarememory-openclaw
openclaw gateway status
python - <<'PY'
import urllib.request
html = urllib.request.urlopen("http://127.0.0.1:39393/youarememory/?v=check", timeout=5).read().decode("utf-8", "ignore")
markers = [
    "Memory Console",
    "Record Inspector",
    "全局画像",
]
print("ui-markers:", all(marker in html for marker in markers))
PY
```

检查点：

- `Status: loaded`
- `ui-markers: True`

---

## 7) 常见问题一键修复

### 7.1 报错：`plugin already exists`

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
(openclaw plugins uninstall youarememory-openclaw --force || true) && \
rm -rf "/Users/meisen/.openclaw/extensions/youarememory-openclaw" && \
openclaw plugins install --link ./packages/openclaw-memory-plugin && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw
```

### 7.2 报错：`Error: memory slot set to "memory-core"`

```bash
openclaw config set plugins.slots.memory '"youarememory-openclaw"' && \
openclaw plugins enable youarememory-openclaw && \
openclaw gateway restart && \
openclaw plugins info youarememory-openclaw
```

### 7.3 页面还是旧版

```bash
export YAM_HOME="/Users/meisen/Desktop/youarememory" && \
cd "$YAM_HOME" && \
npm run build --workspace @youarememory/openclaw-memory-plugin && \
openclaw gateway restart && \
open "http://127.0.0.1:39393/youarememory/?v=$(date +%s)"
```

如果还不对，再手动强刷浏览器：`Cmd + Shift + R`

### 7.4 升级后事实为空

这是预期行为之一，通常表示你本地还是旧版 `global_facts` 数据。

处理方式：

1. 打开看板
2. 点击 `清空并重建`
3. 继续让 OpenClaw 正常对话，等待新的事实重新进入 `global_fact_record`

---

## 8) 复制即用命令清单

```bash
# A. 从零安装
export YAM_HOME="/Users/meisen/Desktop/youarememory" && cd "$YAM_HOME" && npm install && npm run build --workspace @youarememory/openclaw-memory-plugin && (openclaw plugins uninstall youarememory-openclaw --force || true) && rm -rf "/Users/meisen/.openclaw/extensions/youarememory-openclaw" && openclaw plugins install --link ./packages/openclaw-memory-plugin && openclaw config set plugins.slots.memory '"youarememory-openclaw"' && openclaw plugins enable youarememory-openclaw && openclaw gateway restart && openclaw plugins info youarememory-openclaw && open "http://127.0.0.1:39393/youarememory/?v=first-install"

# B. 每次改完快速应用
export YAM_HOME="/Users/meisen/Desktop/youarememory" && cd "$YAM_HOME" && npm run build --workspace @youarememory/openclaw-memory-plugin && openclaw config set plugins.slots.memory '"youarememory-openclaw"' && openclaw plugins enable youarememory-openclaw && openclaw gateway restart && open "http://127.0.0.1:39393/youarememory/?v=$(date +%s)"

# C. 查看当前插件状态
openclaw plugins info youarememory-openclaw
```
